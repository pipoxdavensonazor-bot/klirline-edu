'use strict';
// Facturation des écoles par la plateforme : formules (par élève et par an, ou forfait ; HTG ou USD), factures numérotées
// (NOR-AAAA-0001) avec PDF, paiements manuels avec référence (MonCash, NatCash, virement, espèces), statuts
// (à payer, payée, en retard — calculé —, annulée), rappels par e-mail et dans l'application, essai gratuit, délai de
// grâce puis LECTURE SEULE douce. Rien n'est jamais supprimé (déclencheurs en base) : une école en retard garde toutes
// ses données et peut tout consulter et exporter. Aucune passerelle de paiement : voir docs/facturation.md (MonCash API).
const { HttpError, forbid } = require('./common');
const P = require('./policy');
const { Page, buildDoc } = require('./pdf');

const KINDS = ['par_eleve', 'forfait'];
const CURRENCIES = ['HTG', 'USD'];
const METHODS = { moncash: 'MonCash', natcash: 'NatCash', virement: 'Virement bancaire', especes: 'Espèces' };
const LABEL = { a_payer: 'À payer', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Jour civil en Haïti (America/Port-au-Prince) ; clock injectable pour les tests (ctx.now).
const today = (ctx) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Port-au-Prince' }).format(ctx && ctx.now ? ctx.now() : new Date());
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
// Montant saisi en unités (« 1500 », « 12,50 ») → centimes entiers.
function cents(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) throw new HttpError(400, 'montant invalide');
  return Math.round(Number(s) * 100);
}
function money(c, cur) {
  const v = (Number(c) / 100).toFixed(2).split('.');
  return `${v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${v[1]} ${cur}`;
}
const day = (v, what) => { const s = str(v, 10); if (!DAY_RE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${what} : date AAAA-MM-JJ attendue`); return s; };

// Statut affiché : « en retard » est calculé (à payer et échéance dépassée), jamais stocké.
const shownStatus = (inv, t) => (inv.status === 'a_payer' && inv.due_on < t ? 'en_retard' : inv.status);
async function invoiceOut(db, inv, t) {
  const paid = await db.all('SELECT id, method, reference, amount_cents, paid_on, note, created_at FROM billing_payment WHERE invoice_id = ? ORDER BY id', inv.id);
  const paidCents = paid.reduce((a, p) => a + Number(p.amount_cents), 0);
  const st = shownStatus(inv, t);
  return { ...inv, id: Number(inv.id), amount_cents: Number(inv.amount_cents), unit_cents: Number(inv.unit_cents), students: inv.students == null ? null : Number(inv.students),
    statut: st, statut_label: LABEL[st], paid_cents: paidCents, reste_cents: Math.max(0, Number(inv.amount_cents) - paidCents),
    montant: money(inv.amount_cents, inv.currency), payments: paid.map((p) => ({ ...p, amount_cents: Number(p.amount_cents), method_label: METHODS[p.method] })) };
}

// État d'abonnement d'une école (connexion système). read_only : écritures refusées (423), lecture et exports permis.
async function state(db, schoolId, ctx) {
  const t = today(ctx);
  const sb = await db.get('SELECT b.*, p.name AS plan_name, p.kind AS plan_kind, p.currency AS plan_currency, p.amount_cents AS plan_amount FROM school_billing b LEFT JOIN billing_plan p ON p.id = b.plan_id WHERE b.school_id = ?', schoolId);
  if (!sb) return { configured: false, read_only: false, today: t };
  const grace = Number(sb.grace_days);
  const late = await db.get("SELECT id, number, due_on, amount_cents, currency FROM billing_invoice WHERE school_id = ? AND status = 'a_payer' AND due_on < ? ORDER BY due_on, id LIMIT 1", schoolId, t);
  const anyInvoice = await db.get("SELECT 1 AS x FROM billing_invoice WHERE school_id = ? AND status IN ('a_payer','payee') LIMIT 1", schoolId);
  let reason = null, readOnlyOn = null;
  if (late) { readOnlyOn = addDays(late.due_on, grace); reason = 'facture_en_retard'; }
  else if (sb.trial_ends_on && !anyInvoice) { readOnlyOn = addDays(sb.trial_ends_on, grace); reason = sb.trial_ends_on < t ? 'essai_termine' : 'essai'; }
  let ro = !!readOnlyOn && t > readOnlyOn;
  if (sb.read_only_mode === 'jamais') ro = false;
  if (sb.read_only_mode === 'force') { ro = true; reason = reason || 'decision_plateforme'; }
  return { configured: true, today: t, read_only: ro, reason, read_only_on: readOnlyOn, grace_days: grace, read_only_mode: sb.read_only_mode,
    trial_ends_on: sb.trial_ends_on, in_trial: !!sb.trial_ends_on && sb.trial_ends_on >= t && !anyInvoice, billing_email: sb.billing_email,
    plan: sb.plan_id ? { id: Number(sb.plan_id), name: sb.plan_name, kind: sb.plan_kind, currency: sb.plan_currency, amount_cents: Number(sb.plan_amount), montant: money(sb.plan_amount, sb.plan_currency) } : null,
    late_invoice: late ? { id: Number(late.id), number: late.number, due_on: late.due_on, montant: money(late.amount_cents, late.currency) } : null };
}

// Écritures toujours permises en lecture seule : se déconnecter, lire ses notifications, consulter l'abonnement.
const RO_ALLOWED = /^\/api\/(logout|notifications(\/.*)?|abonnement(\/.*)?|me\/password)$/;
async function guardWrite(db, req, url, user, ctx) {
  if (!user || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || RO_ALLOWED.test(url.pathname)) return;
  const sb = await db.get('SELECT 1 AS x FROM school_billing WHERE school_id = ?', user.school_id);
  if (!sb) return; // école sans abonnement configuré : aucune restriction
  const st = await state(db, user.school_id, ctx);
  if (st.read_only) throw new HttpError(423, 'abonnement : espace en lecture seule (facture en retard). Vos données sont conservées ; consultez la page Abonnement.');
}

async function activeStudents(db, schoolId) {
  return Number((await db.get("SELECT COUNT(DISTINCT student_id) AS n FROM enrollment WHERE school_id = ? AND status = 'actif'", schoolId)).n);
}
async function nextNumber(t, year) {
  const last = await t.get('SELECT number FROM billing_invoice WHERE number LIKE ? ORDER BY number DESC LIMIT 1', `NOR-${year}-%`);
  const n = last ? Number(last.number.slice(9)) + 1 : 1;
  return `NOR-${year}-${String(n).padStart(4, '0')}`;
}

function invoicePdf(inv, school) {
  const p = new Page();
  p.text(50, 790, 'NORIA', { size: 20, bold: true }).text(50, 772, 'Plateforme de gestion scolaire — noriaedu.com', { size: 9, gray: 0.35 });
  p.text(400, 790, `FACTURE ${inv.number}`, { size: 13, bold: true });
  p.text(400, 774, `Émise le ${inv.issued_on}`, { size: 9 }).text(400, 762, `Échéance ${inv.due_on}`, { size: 9 });
  p.text(400, 748, `Statut : ${inv.statut_label}`, { size: 10, bold: true });
  p.line(50, 735, 545, 735);
  p.text(50, 712, 'Facturé à', { size: 9, gray: 0.35 }).text(50, 698, school.name, { size: 12, bold: true });
  if (school.address) p.text(50, 684, String(school.address).slice(0, 90), { size: 9 });
  if (school.city) p.text(50, 672, String(school.city).slice(0, 90), { size: 9 });
  let y = 630;
  p.rect(50, y - 4, 495, 18, 0.92);
  p.text(56, y, 'Désignation', { size: 9, bold: true }).text(330, y, 'Quantité', { size: 9, bold: true }).text(400, y, 'Prix unitaire', { size: 9, bold: true }).text(480, y, 'Montant', { size: 9, bold: true });
  y -= 22;
  p.text(56, y, inv.label.slice(0, 60), { size: 9 });
  p.text(330, y, inv.kind === 'par_eleve' ? `${inv.students} élève(s)` : '1', { size: 9 });
  p.text(400, y, money(inv.unit_cents, inv.currency), { size: 9 }).text(480, y, money(inv.amount_cents, inv.currency), { size: 9 });
  y -= 14; p.line(50, y, 545, y);
  y -= 18; p.text(400, y, 'Total', { size: 10, bold: true }).text(480, y, money(inv.amount_cents, inv.currency), { size: 10, bold: true });
  y -= 14; p.text(400, y, 'Déjà payé', { size: 9 }).text(480, y, money(inv.paid_cents, inv.currency), { size: 9 });
  y -= 14; p.text(400, y, 'Reste dû', { size: 10, bold: true }).text(480, y, money(inv.reste_cents, inv.currency), { size: 10, bold: true });
  y -= 36;
  p.text(50, y, 'Règlement', { size: 11, bold: true }); y -= 16;
  for (const l of [`Modes acceptés : MonCash, NatCash, virement bancaire ou espèces. Référence à indiquer : ${inv.number}.`,
    'Transmettez la référence de la transaction (n° MonCash / NatCash, avis de virement ou reçu) : le paiement est',
    'enregistré manuellement par NORIA. Aucun paiement en ligne automatique pour le moment.']) { p.text(50, y, l, { size: 9 }); y -= 13; }
  if (inv.payments.length) {
    y -= 10; p.text(50, y, 'Paiements reçus', { size: 11, bold: true }); y -= 16;
    for (const x of inv.payments) { p.text(50, y, `${x.paid_on} — ${x.method_label} — réf. ${x.reference} — ${money(x.amount_cents, inv.currency)}`, { size: 9 }); y -= 13; }
  }
  if (inv.status === 'annulee') { y -= 10; p.text(50, y, `Facture annulée : ${inv.cancel_reason || ''}`.slice(0, 100), { size: 10, bold: true }); }
  p.text(50, 60, "En cas de retard, l'espace de l'école passe en lecture seule après le délai de grâce : aucune donnée n'est supprimée.", { size: 8, gray: 0.35 });
  return buildDoc([p], { title: `Facture ${inv.number}` });
}

async function remind(db, ctx, req, inv, a) {
  const A = require('./app'); // chargement différé (dépendance circulaire)
  const t = today(ctx);
  const out = await invoiceOut(db, inv, t);
  const st = await state(db, inv.school_id, ctx);
  const school = await db.get('SELECT id, name, default_lang FROM school WHERE id = ?', inv.school_id);
  const dirs = await db.all(`SELECT u.id, u.email FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
    WHERE u.school_id = ? AND u.state = 'actif' AND r.role = 'direction'`, inv.school_id);
  const emails = [...new Set([st.billing_email, ...dirs.map((d) => d.email)].filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).map((e) => e.toLowerCase()))];
  const late = out.statut === 'en_retard';
  const vars = { number: inv.number, school: school.name, label: inv.label, amount: money(out.reste_cents, inv.currency), due: inv.due_on, late,
    readOnlyOn: late ? st.read_only_on : null, link: `${A.linkBase(req, ctx) || 'https://noriaedu.com'}/app#abonnement` };
  let sentN = 0;
  for (const e of emails) { const r = await A.outbox(db, ctx, school.id, e, 'facturation_rappel', school.default_lang || 'fr', vars); if (r.envoi !== 'échec') sentN++; }
  const fr = `Facture ${inv.number} ${late ? 'en retard' : 'à payer'} : ${vars.amount}, échéance ${inv.due_on}`;
  const ht = `Fakti ${inv.number} ${late ? 'an reta' : 'pou peye'} : ${vars.amount}, dat limit ${inv.due_on}`;
  for (const d of dirs) await db.insert('INSERT INTO notification (school_id, user_id, kind, ref, title_fr, title_ht) VALUES (?,?,?,?,?,?)', school.id, d.id, 'facturation.rappel', String(inv.id), fr, ht);
  await db.insert('INSERT INTO billing_reminder (invoice_id, channel, recipients, sent_by) VALUES (?,?,?,?)', inv.id, 'email', sentN, a ? a.id : null);
  await db.insert('INSERT INTO billing_reminder (invoice_id, channel, recipients, sent_by) VALUES (?,?,?,?)', inv.id, 'app', dirs.length, a ? a.id : null);
  return { invoice: inv.number, emails: sentN, notifications: dirs.length };
}

function adminRoutes({ log }) {
  const getInv = async (db, id) => { const r = await db.get('SELECT * FROM billing_invoice WHERE id = ?', int(id)); if (!r) throw new HttpError(404, 'introuvable'); return r; };
  const planIn = (b, partial) => {
    const o = {};
    if (!partial || b.name !== undefined) { o.name = str(b.name, 80); if (o.name.length < 2) throw new HttpError(400, 'nom de formule obligatoire'); }
    if (!partial || b.kind !== undefined) { if (!KINDS.includes(b.kind)) throw new HttpError(400, 'type : par_eleve ou forfait'); o.kind = b.kind; }
    if (!partial || b.currency !== undefined) { if (!CURRENCIES.includes(b.currency)) throw new HttpError(400, 'devise : HTG ou USD'); o.currency = b.currency; }
    if (!partial || b.amount !== undefined) o.amount_cents = cents(b.amount);
    if (b.active !== undefined) o.active = b.active ? 1 : 0;
    return o;
  };
  return [
    ['GET', /^\/api\/admin\/facturation\/formules$/, async (db) => ({ plans: (await db.all('SELECT * FROM billing_plan ORDER BY active DESC, name')).map((p) => ({ ...p, id: Number(p.id), amount_cents: Number(p.amount_cents), active: !!Number(p.active), montant: money(p.amount_cents, p.currency) })) }), { auth: true }],
    ['POST', /^\/api\/admin\/facturation\/formules$/, async (db, req, a) => {
      const o = planIn(req.body || {}, false);
      const id = await db.insert('INSERT INTO billing_plan (name, kind, currency, amount_cents) VALUES (?,?,?,?)', o.name, o.kind, o.currency, o.amount_cents);
      await log(db, a, 'admin.facturation.formule.creer', id, `${o.name} ${o.kind} ${money(o.amount_cents, o.currency)}`, 'ok', req.ip);
      return { id };
    }, { auth: true, write: true }],
    ['PATCH', /^\/api\/admin\/facturation\/formules\/(\d+)$/, async (db, req, a, [id]) => {
      const o = planIn(req.body || {}, true); const keys = Object.keys(o);
      if (!keys.length) throw new HttpError(400, 'rien à modifier');
      const r = await db.run(`UPDATE billing_plan SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...keys.map((k) => o[k]), int(id));
      if (!r.changes) throw new HttpError(404, 'introuvable');
      await log(db, a, 'admin.facturation.formule.modifier', id, keys.join(','), 'ok', req.ip);
      return { id: Number(id) };
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/facturation\/ecoles$/, async (db, _req, _a, _m, ctx) => {
      const schools = await db.all("SELECT id, name, slug, status FROM school ORDER BY name");
      const t = today(ctx); const out = [];
      for (const s of schools) {
        const st = await state(db, s.id, ctx);
        const open = await db.all("SELECT * FROM billing_invoice WHERE school_id = ? AND status = 'a_payer'", s.id);
        out.push({ ...s, id: Number(s.id), eleves: await activeStudents(db, s.id), abonnement: st,
          factures_ouvertes: open.length, en_retard: open.filter((i) => i.due_on < t).length,
          du: Object.entries(open.reduce((m, i) => ({ ...m, [i.currency]: (m[i.currency] || 0) + Number(i.amount_cents) }), {})).map(([c, v]) => money(v, c)).join(' + ') || null });
      }
      return { today: t, schools: out };
    }, { auth: true }],
    // Abonnement d'une école : formule, essai gratuit (jours), délai de grâce, mode lecture seule, e-mail de facturation.
    ['PUT', /^\/api\/admin\/facturation\/ecoles\/(\d+)$/, async (db, req, a, [id], ctx) => {
      const sid = int(id); const b = req.body || {};
      if (!(await db.get('SELECT 1 AS x FROM school WHERE id = ?', sid))) throw new HttpError(404, 'école introuvable');
      const cur = (await db.get('SELECT * FROM school_billing WHERE school_id = ?', sid)) || { plan_id: null, trial_ends_on: null, grace_days: 15, read_only_mode: 'auto', billing_email: null, notes: null };
      const n = { ...cur };
      if (b.plan_id !== undefined) { n.plan_id = b.plan_id == null || b.plan_id === '' ? null : int(b.plan_id); if (n.plan_id && !(await db.get('SELECT 1 AS x FROM billing_plan WHERE id = ?', n.plan_id))) throw new HttpError(400, 'formule inconnue'); }
      if (b.trial_days !== undefined && b.trial_days !== null && b.trial_days !== '') { const d = Number(b.trial_days); if (!Number.isInteger(d) || d < 0 || d > 365) throw new HttpError(400, 'essai : 0 à 365 jours'); n.trial_ends_on = d ? addDays(today(ctx), d) : null; }
      if (b.trial_ends_on !== undefined) n.trial_ends_on = b.trial_ends_on ? day(b.trial_ends_on, 'fin d’essai') : null;
      if (b.grace_days !== undefined) { const g = Number(b.grace_days); if (!Number.isInteger(g) || g < 0 || g > 365) throw new HttpError(400, 'délai de grâce : 0 à 365 jours'); n.grace_days = g; }
      if (b.read_only_mode !== undefined) { if (!['auto', 'jamais', 'force'].includes(b.read_only_mode)) throw new HttpError(400, 'mode : auto, jamais ou force'); n.read_only_mode = b.read_only_mode; }
      if (b.billing_email !== undefined) { const e = str(b.billing_email, 254).toLowerCase(); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'e-mail invalide'); n.billing_email = e || null; }
      if (b.notes !== undefined) n.notes = str(b.notes, 500) || null;
      if (await db.get('SELECT 1 AS x FROM school_billing WHERE school_id = ?', sid)) {
        await db.run('UPDATE school_billing SET plan_id = ?, trial_ends_on = ?, grace_days = ?, read_only_mode = ?, billing_email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = ?',
          n.plan_id, n.trial_ends_on, n.grace_days, n.read_only_mode, n.billing_email, n.notes, sid);
      } else {
        await db.run('INSERT INTO school_billing (school_id, plan_id, trial_ends_on, grace_days, read_only_mode, billing_email, notes) VALUES (?,?,?,?,?,?,?)',
          sid, n.plan_id, n.trial_ends_on, n.grace_days, n.read_only_mode, n.billing_email, n.notes);
      }
      await log(db, a, 'admin.facturation.abonnement', sid, `formule ${n.plan_id || '—'}, essai ${n.trial_ends_on || '—'}, grâce ${n.grace_days} j, mode ${n.read_only_mode}`, 'ok', req.ip);
      return state(db, sid, ctx);
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/facturation\/factures$/, async (db, req, _a, _m, ctx) => {
      const t = today(ctx); const sid = req.query.get('ecole'); const want = req.query.get('statut');
      const rows = await db.all(`SELECT i.*, s.name AS school FROM billing_invoice i JOIN school s ON s.id = i.school_id ${sid ? 'WHERE i.school_id = ?' : ''} ORDER BY i.issued_on DESC, i.id DESC LIMIT 500`, ...(sid ? [int(sid)] : []));
      const out = []; for (const r of rows) { const o = await invoiceOut(db, r, t); if (!want || o.statut === want) out.push(o); }
      return { today: t, invoices: out };
    }, { auth: true }],
    // Émission : montant = élèves actifs × prix (par élève) ou forfait ; numéro séquentiel par année dans une transaction.
    ['POST', /^\/api\/admin\/facturation\/factures$/, async (db, req, a, _m, ctx) => {
      const b = req.body || {}; const sid = int(b.school_id);
      const sb = await db.get('SELECT plan_id FROM school_billing WHERE school_id = ?', sid);
      const planId = b.plan_id ? int(b.plan_id) : sb && sb.plan_id;
      if (!planId) throw new HttpError(400, 'aucune formule : choisissez-en une pour cette école');
      const plan = await db.get('SELECT * FROM billing_plan WHERE id = ?', planId);
      if (!plan) throw new HttpError(400, 'formule inconnue');
      const school = await db.get('SELECT id, name FROM school WHERE id = ?', sid);
      if (!school) throw new HttpError(404, 'école introuvable');
      const t = today(ctx);
      const students = plan.kind === 'par_eleve' ? (b.students != null && b.students !== '' ? Number(b.students) : await activeStudents(db, sid)) : null;
      if (students != null && (!Number.isInteger(students) || students < 0 || students > 100000)) throw new HttpError(400, 'nombre d’élèves invalide');
      const amount = plan.kind === 'par_eleve' ? Number(plan.amount_cents) * students : Number(plan.amount_cents);
      const due = b.due_on ? day(b.due_on, 'échéance') : addDays(t, 30);
      if (due < t) throw new HttpError(400, 'échéance dans le passé');
      const label = str(b.label, 160) || `Abonnement NORIA — ${plan.name}${b.periode ? ` — ${str(b.periode, 40)}` : ''}`;
      const inv = await db.tx(async (x) => {
        const number = await nextNumber(x, t.slice(0, 4));
        const id = await x.insert(`INSERT INTO billing_invoice (number, school_id, plan_id, label, kind, currency, students, unit_cents, amount_cents, issued_on, due_on, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, number, sid, plan.id, label, plan.kind, plan.currency, students, plan.amount_cents, amount, t, due, a.id);
        return x.get('SELECT * FROM billing_invoice WHERE id = ?', id);
      });
      await log(db, a, 'admin.facturation.facture.emettre', inv.id, `${inv.number} ${school.name} ${money(amount, plan.currency)}`, 'ok', req.ip);
      return invoiceOut(db, inv, t);
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/facturation\/factures\/(\d+)$/, async (db, _req, _a, [id], ctx) => invoiceOut(db, await getInv(db, id), today(ctx)), { auth: true }],
    ['GET', /^\/api\/admin\/facturation\/factures\/(\d+)\/pdf$/, async (db, _req, _a, [id], ctx) => {
      const inv = await invoiceOut(db, await getInv(db, id), today(ctx));
      const school = await db.get('SELECT name, address, commune AS city FROM school WHERE id = ?', inv.school_id);
      return { __pdf: invoicePdf(inv, school), filename: `facture-${inv.number}.pdf` };
    }, { auth: true }],
    // Paiement manuel : méthode + référence obligatoire (unique par méthode). Facture soldée → « payée ».
    ['POST', /^\/api\/admin\/facturation\/factures\/(\d+)\/paiements$/, async (db, req, a, [id], ctx) => {
      const inv = await getInv(db, id); const b = req.body || {};
      if (inv.status !== 'a_payer') throw new HttpError(409, `facture ${LABEL[inv.status].toLowerCase()} : paiement impossible`);
      if (!METHODS[b.method]) throw new HttpError(400, 'mode de paiement : moncash, natcash, virement ou especes');
      const ref = str(b.reference, 80); if (ref.length < 3) throw new HttpError(400, 'référence du paiement obligatoire');
      const amount = b.amount == null || b.amount === '' ? null : cents(b.amount);
      const t = today(ctx);
      const before = await invoiceOut(db, inv, t);
      const amt = amount == null ? before.reste_cents : amount;
      if (amt <= 0) throw new HttpError(400, 'montant invalide');
      const paidOn = b.paid_on ? day(b.paid_on, 'date du paiement') : t;
      if (paidOn > t) throw new HttpError(400, 'date de paiement dans le futur');
      await db.tx(async (x) => {
        await x.insert('INSERT INTO billing_payment (invoice_id, method, reference, amount_cents, paid_on, note, recorded_by) VALUES (?,?,?,?,?,?,?)', inv.id, b.method, ref, amt, paidOn, str(b.note, 300) || null, a.id);
        if (before.paid_cents + amt >= Number(inv.amount_cents)) await x.run("UPDATE billing_invoice SET status = 'payee', paid_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", paidOn, inv.id);
      });
      await log(db, a, 'admin.facturation.paiement', inv.id, `${inv.number} ${METHODS[b.method]} réf. ${ref} ${money(amt, inv.currency)}`, 'ok', req.ip);
      return invoiceOut(db, await getInv(db, id), t);
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/facturation\/factures\/(\d+)\/annuler$/, async (db, req, a, [id], ctx) => {
      const inv = await getInv(db, id); const why = str(req.body && req.body.reason, 300);
      if (why.length < 3) throw new HttpError(400, 'motif obligatoire');
      if (inv.status !== 'a_payer') throw new HttpError(409, 'seule une facture à payer peut être annulée');
      if (await db.get('SELECT 1 AS x FROM billing_payment WHERE invoice_id = ?', inv.id)) throw new HttpError(409, 'paiement déjà enregistré : annulation impossible');
      await db.run("UPDATE billing_invoice SET status = 'annulee', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", why, inv.id);
      await log(db, a, 'admin.facturation.facture.annuler', inv.id, `${inv.number} — ${why}`, 'ok', req.ip);
      return invoiceOut(db, await getInv(db, id), today(ctx));
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/facturation\/factures\/(\d+)\/rappel$/, async (db, req, a, [id], ctx) => {
      const inv = await getInv(db, id);
      if (inv.status !== 'a_payer') throw new HttpError(409, 'facture déjà réglée ou annulée');
      const r = await remind(db, ctx, req, inv, a);
      await log(db, a, 'admin.facturation.rappel', inv.id, `${inv.number} : ${r.emails} e-mail(s), ${r.notifications} notification(s)`, 'ok', req.ip);
      return r;
    }, { auth: true, write: true }],
    // Rappel groupé : toutes les factures en retard (au plus un rappel par facture et par jour).
    ['POST', /^\/api\/admin\/facturation\/rappels$/, async (db, req, a, _m, ctx) => {
      const t = today(ctx);
      const late = await db.all("SELECT * FROM billing_invoice WHERE status = 'a_payer' AND due_on < ? ORDER BY due_on", t);
      const out = [];
      for (const inv of late) {
        const recent = await db.get("SELECT created_at FROM billing_reminder WHERE invoice_id = ? AND channel = 'email' ORDER BY id DESC LIMIT 1", inv.id);
        if (recent && String(recent.created_at).slice(0, 10) >= new Date(Date.now() - 20 * 3600e3).toISOString().slice(0, 10) && !(req.body && req.body.force)) continue;
        out.push(await remind(db, ctx, req, inv, a));
      }
      await log(db, a, 'admin.facturation.rappels', null, `${out.length} facture(s) en retard relancée(s)`, 'ok', req.ip);
      return { relances: out };
    }, { auth: true, write: true }],
  ];
}

// Côté école : page « Abonnement » (direction, secrétariat, comptabilité). Connexion système, filtrée sur l'école.
const schoolRoutes = [
  ['GET', /^\/api\/abonnement$/, async (db, _req, u, _m, ctx) => {
    if (!P.has(u, 'direction', 'secretariat', 'comptabilite')) forbid();
    const t = today(ctx);
    const st = await state(db, u.school_id, ctx);
    const rows = await db.all('SELECT * FROM billing_invoice WHERE school_id = ? ORDER BY issued_on DESC, id DESC LIMIT 100', u.school_id);
    const invoices = []; for (const r of rows) { const o = await invoiceOut(db, r, t); delete o.created_by; invoices.push(o); }
    return { ...st, students: await activeStudents(db, u.school_id), invoices, methods: METHODS,
      payment_help: "Payez par MonCash, NatCash, virement ou espèces en indiquant le numéro de facture, puis envoyez la référence de la transaction à NORIA. Le paiement est enregistré manuellement." };
  }, { system: true }],
  ['GET', /^\/api\/abonnement\/factures\/(\d+)\/pdf$/, async (db, _req, u, [id], ctx) => {
    if (!P.has(u, 'direction', 'secretariat', 'comptabilite')) forbid();
    const r = await db.get('SELECT * FROM billing_invoice WHERE id = ? AND school_id = ?', int(id), u.school_id);
    if (!r) throw new HttpError(404, 'introuvable');
    const inv = await invoiceOut(db, r, today(ctx));
    const school = await db.get('SELECT name, address, commune AS city FROM school WHERE id = ?', u.school_id);
    return { __pdf: invoicePdf(inv, school), filename: `facture-${inv.number}.pdf` };
  }, { system: true }],
];

module.exports = { adminRoutes, schoolRoutes, state, guardWrite, cents, money, today, addDays, METHODS };
