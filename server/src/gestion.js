'use strict';
// Bibliothèque (catalogue, prêts, retours, retards) et finances (frais, paiements, reçus PDF vérifiables, annulation).
// Toutes les routes passent par db.asSchool (RLS en PostgreSQL) et par les périmètres de policy.js.
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse, isUnique } = require('./common');
const { receiptPdf } = require('./pdf');
const { schoolProfile } = require('./identite');
const { adapterFor } = require('./paiement-adaptateurs');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ['especes', 'moncash', 'natcash', 'virement'];
const LOAN_DAYS = 14; // durée de prêt par défaut
const MAX_OPEN_LOANS = 3; // prêts en cours par élève
const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const str = (v, max, required = true) => {
  const s = String(v ?? '').trim();
  if (!s) { if (required) throw new HttpError(400, `texte obligatoire (${max} caractères au plus)`); return null; }
  if (s.length > max) throw new HttpError(400, `texte trop long (${max} caractères au plus)`);
  return s;
};
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const day = (v, fallback) => { const s = v == null || v === '' ? fallback : String(v); if (!DAY.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, 'date invalide (AAAA-MM-JJ)'); return s; };
// Montant en gourdes (HTG), 2 décimales au plus → centimes entiers.
function cents(v) {
  const x = Number(String(v ?? '').replace(',', '.'));
  const c = Math.round(x * 100);
  if (!Number.isFinite(x) || x <= 0 || Math.abs(c - x * 100) > 1e-6 || c > 100000000) throw new HttpError(400, 'montant invalide (HTG, nombre positif, 2 décimales au plus)');
  return c;
}
// ISBN facultatif : 10 ou 13 caractères (tirets et espaces ignorés), clé de contrôle vérifiée.
function isbn(v) {
  const s = String(v ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!s) return null;
  let ok = false;
  if (/^\d{9}[\dX]$/.test(s)) ok = [...s].reduce((a, c, i) => a + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
  else if (/^\d{13}$/.test(s)) ok = [...s].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
  if (!ok) throw new HttpError(400, 'ISBN invalide (10 ou 13 chiffres, clé de contrôle)');
  return s;
}

const manageLibrary = (u) => P.has(u, 'direction', 'secretariat', 'bibliotheque');
const manageFinance = (u) => P.has(u, 'direction', 'comptabilite');
const cancelPayment = (u) => P.has(u, 'direction');

// Élèves dont on peut voir les prêts : gestionnaires = toute l'école ; parent = ses enfants ; élève = lui-même.
function loanScope(u, alias = 'st') {
  if (manageLibrary(u)) return { sql: `${alias}.school_id = ?`, params: [u.school_id] };
  const parts = []; const params = [];
  if (P.has(u, 'parent')) { parts.push(`${alias}.id IN (SELECT student_id FROM parent_link WHERE parent_user_id = ? AND school_id = ?)`); params.push(u.id, u.school_id); }
  if (P.has(u, 'eleve')) { parts.push(`${alias}.user_id = ?`); params.push(u.id); }
  if (!parts.length) return P.NONE;
  return { sql: `${alias}.school_id = ? AND (${parts.join(' OR ')})`, params: [u.school_id, ...params] };
}
async function studentIn(db, scope, id) {
  return db.get(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st WHERE st.id = ? AND ${scope.sql}`, int(id), ...scope.params);
}

/* ---------- bibliothèque ---------- */
const BOOK_COLS = `b.id, b.title, b.author, b.isbn, b.copies,
  (SELECT COUNT(*) FROM loan l WHERE l.book_id = b.id AND l.school_id = b.school_id AND l.returned_on IS NULL) AS out`;
const withAvail = (b) => b && ({ ...b, out: Number(b.out), available: Math.max(0, b.copies - Number(b.out)) });
const loanRow = (today) => (l) => ({ ...l, late: !l.returned_on && l.due_on < today, returned_late: !!l.returned_on && l.returned_on > l.due_on,
  days_late: !l.returned_on && l.due_on < today ? Math.round((Date.parse(today) - Date.parse(l.due_on)) / 864e5) : 0 });

const libraryRoutes = [
  // Catalogue : lisible par tout compte de l'école (titres seulement, aucune donnée d'élève).
  ['GET', /^\/api\/books$/, async (db, req, u) => {
    const q = String(req.query.get('q') || '').trim().slice(0, 80);
    const rows = q
      ? await db.all(`SELECT ${BOOK_COLS} FROM book b WHERE b.school_id = ? AND (lower(b.title) LIKE ? OR lower(b.author) LIKE ? OR b.isbn = ?) ORDER BY b.title LIMIT 200`,
        u.school_id, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, q.replace(/[\s-]/g, ''))
      : await db.all(`SELECT ${BOOK_COLS} FROM book b WHERE b.school_id = ? ORDER BY b.title LIMIT 200`, u.school_id);
    return rows.map(withAvail);
  }],
  ['POST', /^\/api\/books$/, async (db, req, u, _m, ctx) => {
    if (!manageLibrary(u)) await refuse(ctx, u, 'book.create', 'book', null, null);
    const b = req.body || {};
    const copies = Number(b.copies ?? 1);
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) throw new HttpError(400, "nombre d'exemplaires invalide (1 à 1000)");
    const id = await db.insert('INSERT INTO book (school_id, title, author, isbn, copies, created_by) VALUES (?,?,?,?,?,?)',
      u.school_id, str(b.title, 200), str(b.author, 140), isbn(b.isbn), copies, u.id);
    await audit(db, u, 'book.create', 'book', id, `${copies} ex.`);
    return { id };
  }],
  ['PATCH', /^\/api\/books\/(\d+)$/, async (db, req, u, [id], ctx) => {
    if (!manageLibrary(u)) await refuse(ctx, u, 'book.update', 'book', id, null);
    const cur = withAvail(await db.get(`SELECT ${BOOK_COLS} FROM book b WHERE b.id = ? AND b.school_id = ?`, int(id), u.school_id)); if (!cur) notFound();
    const b = req.body || {};
    const copies = b.copies == null ? cur.copies : Number(b.copies);
    if (!Number.isInteger(copies) || copies < 0 || copies > 1000) throw new HttpError(400, "nombre d'exemplaires invalide (0 à 1000)");
    if (copies < cur.out) throw new HttpError(409, `${cur.out} exemplaire(s) en prêt : impossible de descendre à ${copies}`);
    await db.run('UPDATE book SET title = ?, author = ?, isbn = ?, copies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?',
      b.title == null ? cur.title : str(b.title, 200), b.author == null ? cur.author : str(b.author, 140), b.isbn === undefined ? cur.isbn : isbn(b.isbn), copies, cur.id, u.school_id);
    await audit(db, u, 'book.update', 'book', cur.id, copies !== cur.copies ? `exemplaires ${cur.copies} → ${copies}` : null);
    return { ok: true };
  }],
  // Emprunteurs : identité minimale (code, prénom, nom) pour le guichet ; ni date de naissance, ni famille, ni notes.
  ['GET', /^\/api\/library\/borrowers$/, async (db, req, u) => {
    if (!manageLibrary(u)) forbid();
    return db.all(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st WHERE st.school_id = ? ORDER BY st.last_name, st.first_name`, u.school_id);
  }],
  // Prêts : gestionnaires (filtre élève/état), parent (ses enfants), élève (les siens).
  ['GET', /^\/api\/loans$/, async (db, req, u) => {
    const sc = loanScope(u); if (sc === P.NONE) forbid();
    const today = localDay();
    const status = String(req.query.get('status') || 'en_cours');
    const where = [sc.sql]; const params = [...sc.params];
    if (req.query.get('student_id')) { where.push('st.id = ?'); params.push(int(req.query.get('student_id'))); }
    if (status === 'en_cours') where.push('l.returned_on IS NULL');
    else if (status === 'retard') { where.push('l.returned_on IS NULL AND l.due_on < ?'); params.push(today); }
    else if (status !== 'tous') throw new HttpError(400, 'état inconnu (en_cours, retard, tous)');
    const rows = await db.all(`SELECT l.id, l.book_id, b.title, b.author, l.student_id, st.code, st.first_name, st.last_name, l.loaned_on, l.due_on, l.returned_on
      FROM loan l JOIN student st ON st.id = l.student_id AND st.school_id = l.school_id JOIN book b ON b.id = l.book_id AND b.school_id = l.school_id
      WHERE l.school_id = ? AND ${where.join(' AND ')} ORDER BY l.returned_on IS NOT NULL, l.due_on, l.id LIMIT 500`, u.school_id, ...params);
    return rows.map(loanRow(today));
  }],
  ['POST', /^\/api\/loans$/, async (db, req, u, _m, ctx) => {
    if (!manageLibrary(u)) await refuse(ctx, u, 'loan.create', 'book', req.body && req.body.book_id, null);
    const b = req.body || {}; const today = localDay();
    const st = await studentIn(db, loanScope(u), b.student_id); if (!st) notFound();
    const loanedOn = day(b.loaned_on, today);
    if (loanedOn > today) throw new HttpError(400, 'date de prêt dans le futur');
    const dueOn = day(b.due_on, addDays(loanedOn, LOAN_DAYS));
    if (dueOn < loanedOn) throw new HttpError(400, "échéance avant la date de prêt");
    return db.tx(async (t) => {
      const book = withAvail(await t.get(`SELECT ${BOOK_COLS} FROM book b WHERE b.id = ? AND b.school_id = ?`, int(b.book_id), u.school_id));
      if (!book) notFound();
      if (book.available <= 0) throw new HttpError(409, 'aucun exemplaire disponible');
      const open = await t.get('SELECT COUNT(*) AS n FROM loan WHERE school_id = ? AND student_id = ? AND returned_on IS NULL', u.school_id, st.id);
      if (Number(open.n) >= MAX_OPEN_LOANS) throw new HttpError(409, `limite de ${MAX_OPEN_LOANS} prêts en cours atteinte`);
      const id = await t.insert('INSERT INTO loan (school_id, book_id, student_id, loaned_on, due_on, loaned_by) VALUES (?,?,?,?,?,?)',
        u.school_id, book.id, st.id, loanedOn, dueOn, u.id);
      await audit(t, u, 'loan.create', 'loan', id, `livre ${book.id} → élève ${st.code}, échéance ${dueOn}`);
      return { id, due_on: dueOn };
    });
  }],
  ['POST', /^\/api\/loans\/(\d+)\/retour$/, async (db, req, u, [id], ctx) => {
    if (!manageLibrary(u)) await refuse(ctx, u, 'loan.return', 'loan', id, null);
    const today = localDay();
    const l = await db.get('SELECT * FROM loan WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!l) notFound();
    if (l.returned_on) throw new HttpError(409, 'prêt déjà rendu');
    const on = day(req.body && req.body.returned_on, today);
    if (on < l.loaned_on || on > today) throw new HttpError(400, 'date de retour invalide');
    await db.run('UPDATE loan SET returned_on = ?, returned_by = ? WHERE id = ? AND school_id = ? AND returned_on IS NULL', on, u.id, l.id, u.school_id);
    await audit(db, u, 'loan.return', 'loan', l.id, on > l.due_on ? `rendu en retard (${on}, échéance ${l.due_on})` : null);
    return { ok: true, late: on > l.due_on };
  }],
];

/* ---------- finances ---------- */
const PAY_COLS = `p.id, p.student_id, p.amount_cents, p.currency, p.method, p.reference, p.paid_on, p.label, p.receipt_no, p.provider, p.provider_status,
  p.created_at, p.cancelled_at, p.cancel_reason`;
const htg = (c) => Math.round(Number(c)) / 100;
const fmtReceiptNo = (n) => `R-${String(n).padStart(6, '0')}`; // numéro séquentiel par école, jamais réutilisé
async function account(db, u, st) {
  const fees = await db.all('SELECT id, label, amount_cents, currency, due_on, created_at FROM finance_entry WHERE school_id = ? AND student_id = ? ORDER BY id', u.school_id, st.id);
  const payments = await db.all(`SELECT ${PAY_COLS} FROM payment p WHERE p.school_id = ? AND p.student_id = ? ORDER BY p.receipt_no DESC`, u.school_id, st.id);
  const due = fees.reduce((a, f) => a + Number(f.amount_cents), 0);
  const paid = payments.filter((p) => !p.cancelled_at).reduce((a, p) => a + Number(p.amount_cents), 0);
  return {
    student: { id: st.id, code: st.code, first_name: st.first_name, last_name: st.last_name },
    due_htg: htg(due), paid_htg: htg(paid), balance_htg: htg(due - paid),
    fees: fees.map((f) => ({ ...f, amount_htg: htg(f.amount_cents) })),
    payments: payments.map((p) => ({ ...p, amount_htg: htg(p.amount_cents), number: fmtReceiptNo(p.receipt_no, String(p.created_at).slice(0, 4)) })),
  };
}

const financeRoutes = [
  // Vue d'ensemble (gestionnaires) : solde de chaque élève.
  ['GET', /^\/api\/finance\/overview$/, async (db, req, u) => {
    if (!manageFinance(u)) forbid();
    const rows = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name,
      COALESCE((SELECT SUM(f.amount_cents) FROM finance_entry f WHERE f.student_id = st.id AND f.school_id = st.school_id), 0) AS due,
      COALESCE((SELECT SUM(p.amount_cents) FROM payment p WHERE p.student_id = st.id AND p.school_id = st.school_id AND p.cancelled_at IS NULL), 0) AS paid
      FROM student st WHERE st.school_id = ? ORDER BY st.code`, u.school_id);
    const students = rows.map((r) => ({ id: r.id, code: r.code, first_name: r.first_name, last_name: r.last_name, due_htg: htg(r.due), paid_htg: htg(r.paid), balance_htg: htg(r.due - r.paid) }));
    const recent = await db.all(`SELECT ${PAY_COLS}, st.code, st.first_name, st.last_name FROM payment p JOIN student st ON st.id = p.student_id AND st.school_id = p.school_id
      WHERE p.school_id = ? ORDER BY p.receipt_no DESC LIMIT 20`, u.school_id);
    return { students, recent: recent.map((p) => ({ ...p, amount_htg: htg(p.amount_cents), number: fmtReceiptNo(p.receipt_no, String(p.created_at).slice(0, 4)) })),
      totals: { due_htg: htg(rows.reduce((a, r) => a + Number(r.due), 0)), paid_htg: htg(rows.reduce((a, r) => a + Number(r.paid), 0)) } };
  }],
  // Compte d'un élève : frais, paiements (reçus), solde. Gestionnaires et parents de l'élève.
  ['GET', /^\/api\/students\/(\d+)\/account$/, async (db, req, u, [id]) => {
    if (!P.can.readFinance(u)) forbid();
    const st = await studentIn(db, P.financeScope(u), id); if (!st) notFound();
    return account(db, u, st);
  }],
  ['POST', /^\/api\/fees$/, async (db, req, u, _m, ctx) => {
    if (!manageFinance(u)) await refuse(ctx, u, 'fee.create', 'student', req.body && req.body.student_id, null);
    const b = req.body || {};
    const st = await studentIn(db, P.financeScope(u), b.student_id); if (!st) notFound();
    const amount = cents(b.amount_htg);
    const dueOn = b.due_on ? day(b.due_on) : null;
    const id = await db.insert('INSERT INTO finance_entry (school_id, student_id, label, amount_cents, currency, due_on, created_by) VALUES (?,?,?,?,?,?,?)',
      u.school_id, st.id, str(b.label, 120), amount, 'HTG', dueOn, u.id);
    await audit(db, u, 'fee.create', 'finance_entry', id, `${htg(amount)} HTG`);
    return { id };
  }],
  ['POST', /^\/api\/payments$/, async (db, req, u, _m, ctx) => {
    if (!manageFinance(u)) await refuse(ctx, u, 'payment.create', 'student', req.body && req.body.student_id, null);
    const b = req.body || {}; const today = localDay();
    const st = await studentIn(db, P.financeScope(u), b.student_id); if (!st) notFound();
    const method = String(b.method || '');
    if (!METHODS.includes(method)) throw new HttpError(400, `mode de paiement invalide (${METHODS.join(', ')})`);
    const amount = cents(b.amount_htg);
    let reference = str(b.reference, 64, method !== 'especes');
    if (reference) { reference = reference.replace(/\s+/g, '').toUpperCase(); if (!/^[A-Z0-9._:/-]{4,64}$/.test(reference)) throw new HttpError(400, 'référence de transaction invalide (lettres, chiffres, 4 à 64 caractères)'); }
    const paidOn = day(b.paid_on, today);
    if (paidOn > today) throw new HttpError(400, 'date de paiement dans le futur');
    // Vérification par l'adaptateur hors transaction (manuel : rien n'est vérifié en ligne).
    const adapter = adapterFor(method);
    const check = await adapter.verify({ method, reference, amountCents: amount, currency: 'HTG', schoolId: u.school_id });
    if (check.status === 'refuse') throw new HttpError(422, `paiement refusé par ${adapter.id}${check.detail ? ` : ${check.detail}` : ''}`);
    const { verifyCode, fmtCode } = require('./scolaire');
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.tx(async (t) => {
          // Numéro séquentiel par école : le plus grand + 1 ; la contrainte UNIQUE (school_id, receipt_no) tranche en cas de course.
          const last = await t.get('SELECT MAX(receipt_no) AS n FROM payment WHERE school_id = ?', u.school_id);
          const no = Number(last && last.n || 0) + 1; const code = verifyCode();
          const id = await t.insert(`INSERT INTO payment (school_id, student_id, amount_cents, method, reference, paid_on, label, receipt_no, receipt_code, provider, provider_status, recorded_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, st.id, amount, method, reference, paidOn, str(b.label, 120, false), no, code, adapter.id, check.status, u.id);
          await audit(t, u, 'payment.create', 'payment', id, `reçu n° ${no}, ${htg(amount)} HTG, ${method}${reference ? ` ${reference}` : ''}`);
          return { id, receipt_no: no, number: fmtReceiptNo(no, new Date().getFullYear()), code: fmtCode(code) };
        });
      } catch (e) {
        if (!isUnique(e)) throw e;
        if (/payment\.reference|payment_reference/.test(`${e.message} ${e.constraint || ''}`)) {
          throw new HttpError(409, 'cette référence de transaction est déjà enregistrée');
        }
        if (attempt >= 4) throw e;
      }
    }
  }],
  ['POST', /^\/api\/payments\/(\d+)\/annuler$/, async (db, req, u, [id], ctx) => {
    if (!cancelPayment(u)) await refuse(ctx, u, 'payment.cancel', 'payment', id, null);
    const reason = str(req.body && req.body.reason, 300);
    const r = await db.run('UPDATE payment SET cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?, cancel_reason = ? WHERE id = ? AND school_id = ? AND cancelled_at IS NULL',
      u.id, reason, int(id), u.school_id);
    if (!r.changes) notFound();
    await audit(db, u, 'payment.cancel', 'payment', id, reason);
    return { ok: true };
  }],
  // Reçu PDF : gestionnaires et parents de l'élève. Un reçu annulé reste téléchargeable, marqué ANNULÉ.
  ['GET', /^\/api\/payments\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
    if (!P.can.readFinance(u)) forbid();
    const p = await db.get('SELECT * FROM payment WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!p) notFound();
    const st = await studentIn(db, P.financeScope(u), p.student_id); if (!st) notFound();
    const acc = await account(db, u, st);
    const school = await db.get('SELECT name FROM school WHERE id = ?', u.school_id);
    const by = await db.get('SELECT display_name FROM app_user WHERE id = ? AND school_id = ?', p.recorded_by, u.school_id);
    const { publicUrl, fmtCode } = require('./scolaire');
    const number = fmtReceiptNo(p.receipt_no, String(p.created_at).slice(0, 4));
    await audit(db, u, 'payment.receipt', 'payment', p.id, null);
    return { __pdf: receiptPdf({ school: school.name, schoolProfile: await schoolProfile(db, u.school_id), number, student: `${st.first_name} ${st.last_name}`, studentCode: st.code,
      amount: htg(p.amount_cents), method: p.method, reference: p.reference, paidOn: p.paid_on, label: p.label, providerStatus: p.provider_status,
      balance: acc.balance_htg, paidTotal: acc.paid_htg, due: acc.due_htg, issuer: by ? by.display_name : '-', issuedAt: String(p.created_at),
      code: fmtCode(p.receipt_code), cancelledAt: p.cancelled_at, cancelReason: p.cancel_reason }, `${publicUrl(req, ctx)}/#verifier=${p.receipt_code}`),
    filename: `recu-${number}.pdf` };
  }],
];

// Vérification publique d'un reçu (même page que les bulletins) : école, numéro, élève (prénom + initiale), montant, date, état.
async function verifyReceipt(db, code) {
  const r = await db.get(`SELECT p.receipt_no, p.amount_cents, p.paid_on, p.method, p.created_at, p.cancelled_at, p.cancel_reason, s.name AS school, st.first_name, st.last_name
    FROM payment p JOIN school s ON s.id = p.school_id JOIN student st ON st.id = p.student_id AND st.school_id = p.school_id WHERE p.receipt_code = ?`, code);
  if (!r) return null;
  return { authentique: true, type: 'recu', statut: r.cancelled_at ? 'annule' : 'valide', motif: r.cancelled_at ? r.cancel_reason : undefined,
    ecole: r.school, eleve: `${r.first_name} ${r.last_name.slice(0, 1)}.`, numero: fmtReceiptNo(r.receipt_no, String(r.created_at).slice(0, 4)),
    montant: `${htg(r.amount_cents).toFixed(2)} HTG`, mode: r.method, emis_le: r.paid_on };
}

module.exports = { routes: [...libraryRoutes, ...financeRoutes], verifyReceipt, isbn, cents, loanScope, METHODS, fmtReceiptNo };
