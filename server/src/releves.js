'use strict';
// Bloc 2 : relevés de notes officiels. L'élève (ou le parent pour son enfant) demande ; la direction approuve ou refuse
// avec un motif ; à l'approbation, le PDF est produit (en-tête de l'école, notes publiées, moyennes, barème, signature
// du directeur, sceau) puis signé en Ed25519 par la clé de l'école (empreinte SHA-256 du fichier). Le relevé est déposé
// dans le portail de l'élève et des parents, avec une notification. Statuts : demande, approuve, refuse, emis, annule.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const { jpegSize } = require('./pdf');
const { transcriptPdf } = require('./pdf-bloc2');
const K = require('./cles');
const S = require('./scolaire');

const IMG_MAX = 48 * 1024;
const RE_CODE = /^R[A-Z2-9]{12}$/;
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const text = (v, max, label, required) => {
  const s = String(v ?? '').trim();
  if (!s && required) throw new HttpError(400, `${label} obligatoire`);
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`);
  return s || null;
};
const fmt = (code) => `R-${S.fmtCode(code.slice(1))}`;
const STATUTS = ['demande', 'approuve', 'refuse', 'emis', 'annule'];

function checkImage(b64, label) {
  const s = String(b64 || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { error: `${label} : JPEG en base64 attendu` };
  const buf = Buffer.from(s, 'base64');
  if (buf.length > IMG_MAX) return { error: `${label} trop lourd(e) (${Math.ceil(buf.length / 1024)} Ko, 48 Ko au plus)` };
  const d = jpegSize(buf);
  if (!d || d.width < 32 || d.height < 16 || d.width > 900 || d.height > 900 || ![1, 3].includes(d.components)) return { error: `${label} : image JPEG de 32 à 900 pixels attendue` };
  return { buf, ...d };
}

// Demande visible : direction et secrétariat (toute l'école) ; parent et élève (leurs enfants / eux-mêmes).
function scope(u) {
  if (P.has(u, 'direction', 'secretariat')) return { sql: 't.school_id = ?', params: [u.school_id] };
  if (!P.has(u, 'parent', 'eleve')) return P.NONE;
  const sc = P.studentScope(u, 'st');
  return { sql: `t.school_id = ? AND ${sc.sql}`, params: [u.school_id, ...sc.params] };
}
const LIST = `SELECT t.id, t.student_id, t.scope, t.term_id, t.school_year_id, t.motive, t.status, t.decision_reason, t.decided_at, t.code, t.issued_at,
  t.cancel_reason, t.cancelled_at, t.created_at, st.code AS student_code, st.first_name, st.last_name, tm.name AS term, y.label AS year, ty.label AS term_year,
  ru.display_name AS requested_by, t.requested_by AS requested_by_id
  FROM transcript t JOIN student st ON st.id = t.student_id AND st.school_id = t.school_id
  LEFT JOIN term tm ON tm.id = t.term_id AND tm.school_id = t.school_id
  LEFT JOIN school_year ty ON ty.id = tm.school_year_id AND ty.school_id = tm.school_id
  LEFT JOIN school_year y ON y.id = t.school_year_id AND y.school_id = t.school_id
  JOIN app_user ru ON ru.id = t.requested_by AND ru.school_id = t.school_id`;
const label = (r) => (r.scope === 'periode' ? `${r.term} ${r.term_year}` : `Année scolaire / Ane lekòl ${r.year}`);
const row = (r) => ({ id: r.id, student_id: r.student_id, student: `${r.first_name} ${r.last_name}`, student_code: r.student_code, scope: r.scope, label: label(r),
  motive: r.motive, status: r.status, decision_reason: r.decision_reason, decided_at: r.decided_at, requested_by: r.requested_by, created_at: String(r.created_at).slice(0, 16),
  issued_at: r.issued_at, code: r.code ? fmt(r.code) : null, cancel_reason: r.cancel_reason });

// Notes publiées par matière (liste « 14/20 ») pour une période.
async function publishedNotes(db, schoolId, studentId, termId) {
  const rows = await db.all(`SELECT s.name, ev.max_score, g.score, g.mention FROM evaluation ev JOIN subject s ON s.id = ev.subject_id AND s.school_id = ev.school_id
    JOIN grade g ON g.evaluation_id = ev.id AND g.school_id = ev.school_id WHERE ev.school_id = ? AND ev.term_id = ? AND ev.status = 'publiee' AND g.student_id = ?
    ORDER BY s.name, ev.day, ev.id`, schoolId, termId, studentId);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.name)) by.set(r.name, []);
    by.get(r.name).push(r.score == null ? (r.mention === 'dispense' ? 'disp.' : 'abs.') : `${+Number(r.score).toFixed(2)}/${+Number(r.max_score)}`);
  }
  return by;
}
async function content(db, schoolId, t) {
  const terms = t.scope === 'periode'
    ? await db.all(`SELECT tm.id, tm.name, y.label AS year FROM term tm JOIN school_year y ON y.id = tm.school_year_id AND y.school_id = tm.school_id WHERE tm.id = ? AND tm.school_id = ?`, t.term_id, schoolId)
    : await db.all(`SELECT tm.id, tm.name, y.label AS year FROM term tm JOIN school_year y ON y.id = tm.school_year_id AND y.school_id = tm.school_id
        WHERE tm.school_year_id = ? AND tm.school_id = ? ORDER BY tm.position`, t.school_year_id, schoolId);
  if (!terms.length) notFound();
  let scale = 100;
  const out = [];
  for (const tm of terms) {
    const avg = await S.computeAverages(db, schoolId, t.student_id, tm.id); scale = avg.scale;
    const notes = await publishedNotes(db, schoolId, t.student_id, tm.id);
    out.push({ id: tm.id, name: tm.name, year: tm.year, general: avg.general, subjects: avg.subjects.map((s) => ({ ...s, notes: notes.get(s.name) || [] })) });
  }
  if (!out.some((x) => x.subjects.some((s) => s.average != null))) throw new HttpError(409, 'aucune note publiée pour cette demande');
  // Année : moyenne annuelle d'une matière = moyenne des périodes notées ; générale = pondérée par le coefficient.
  const names = [...new Set(out.flatMap((x) => x.subjects.map((s) => s.name)))].sort((a, b) => a.localeCompare(b, 'fr'));
  const subjects = names.map((nm) => {
    const byTerm = out.map((x) => { const s = x.subjects.find((y) => y.name === nm); return s ? s.average : null; });
    const coef = (out.flatMap((x) => x.subjects).find((s) => s.name === nm) || {}).coefficient || 1;
    const vals = byTerm.filter((v) => v != null);
    return { name: nm, coefficient: coef, byTerm, average: vals.length ? Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 100) / 100 : null };
  });
  const counted = subjects.filter((s) => s.average != null); const tw = counted.reduce((a, s) => a + s.coefficient, 0);
  const general = tw ? Math.round((counted.reduce((a, s) => a + s.average * s.coefficient, 0) / tw) * 100) / 100 : null;
  return { terms: out, annual: { subjects, general }, scale, scopeLabel: t.scope === 'periode' ? `${out[0].name} - ${out[0].year}` : `Année scolaire / Ane lekòl ${out[0].year}` };
}

// Destinataires des notifications : compte de l'élève, parents liés, auteur de la demande.
async function recipients(db, schoolId, t) {
  const ids = new Set([t.requested_by]);
  const st = await db.get('SELECT user_id FROM student WHERE id = ? AND school_id = ?', t.student_id, schoolId);
  if (st && st.user_id) ids.add(st.user_id);
  for (const r of await db.all('SELECT parent_user_id FROM parent_link WHERE student_id = ? AND school_id = ?', t.student_id, schoolId)) ids.add(r.parent_user_id);
  return [...ids];
}
const NOTE = {
  emis: ['Relevé de notes disponible', 'Relve nòt la disponib'],
  refuse: ['Demande de relevé refusée', 'Demann relve a refize'],
  annule: ['Relevé de notes annulé', 'Relve nòt la anile'],
};

function createRoutes({ outbox, reqLang }) {
  async function notify(db, ctx, req, u, t, kind) {
    const [fr, ht] = NOTE[kind];
    for (const uid of await recipients(db, u.school_id, t)) {
      await db.insert('INSERT INTO notification (school_id, user_id, kind, ref, title_fr, title_ht) VALUES (?,?,?,?,?,?)', u.school_id, uid, `releve.${kind}`, String(t.id), fr, ht);
    }
    // Message (SMS ou e-mail) à l'auteur de la demande : texte court, sans note.
    const who = await db.get('SELECT email, phone, display_name FROM app_user WHERE id = ? AND school_id = ?', t.requested_by, u.school_id);
    const school = await db.get('SELECT name, initials FROM school WHERE id = ?', u.school_id);
    const to = who && (who.phone || (who.email && !who.email.endsWith('@telephone.invalid') ? who.email : null));
    if (to) await outbox(db, ctx, u.school_id, to, 'releve', reqLang(req, 'fr'), { school: school.name, initials: school.initials, status: kind });
  }

  const routes = [
    // Signature du directeur (une image, téléversée une fois par la direction ; remplacement journalisé) et sceau.
    ['GET', /^\/api\/ecole\/signature$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'school.signature.read', 'school', u.school_id, null);
      const s = await db.get('SELECT (signature IS NOT NULL) AS sig, signature_name, signature_at, (seal IS NOT NULL) AS seal FROM school WHERE id = ?', u.school_id);
      const k = await K.publicKey(ctx.db, u.school_id);
      return { signature: !!Number(s.sig), signature_name: s.signature_name, signature_at: s.signature_at, seal: !!Number(s.seal), key_id: k ? k.keyId : null };
    }],
    ['GET', /^\/api\/ecole\/(signature|sceau)\/image$/, async (db, req, u, [kind], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'school.signature.read', 'school', u.school_id, null);
      const s = await db.get(`SELECT ${kind === 'signature' ? 'signature' : 'seal'} AS img FROM school WHERE id = ?`, u.school_id);
      if (!s || !s.img) notFound();
      return { __file: Buffer.from(s.img, 'base64'), type: 'image/jpeg', inline: true, cache: 'private, no-store' };
    }],
    ['PUT', /^\/api\/ecole\/signature$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'school.signature', 'school', u.school_id, null);
      const b = req.body || {};
      const name = text(b.name, 120, 'nom du signataire', true);
      const img = checkImage(b.image, 'signature'); if (img.error) throw new HttpError(400, img.error);
      const prev = await db.get('SELECT signature IS NOT NULL AS had FROM school WHERE id = ?', u.school_id);
      await db.run('UPDATE school SET signature = ?, signature_name = ?, signature_at = ? WHERE id = ?', img.buf.toString('base64'), name, new Date().toISOString(), u.school_id);
      await audit(db, u, 'school.signature', 'school', u.school_id, `${Number(prev.had) ? 'remplacée' : 'téléversée'} : ${name}, ${img.width}x${img.height}`);
      return { ok: true };
    }],
    ['PUT', /^\/api\/ecole\/sceau$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'school.seal', 'school', u.school_id, null);
      const b = req.body || {};
      if (b.image === null || b.image === '') {
        await db.run('UPDATE school SET seal = NULL WHERE id = ?', u.school_id);
        await audit(db, u, 'school.seal', 'school', u.school_id, 'retiré'); return { ok: true };
      }
      const img = checkImage(b.image, 'sceau'); if (img.error) throw new HttpError(400, img.error);
      await db.run('UPDATE school SET seal = ? WHERE id = ?', img.buf.toString('base64'), u.school_id);
      await audit(db, u, 'school.seal', 'school', u.school_id, `${img.width}x${img.height}`);
      return { ok: true };
    }],

    // Demande (élève ou parent) : période ou année, motif facultatif.
    ['POST', /^\/api\/releves$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'parent', 'eleve')) await refuse(ctx, u, 'transcript.request', 'student', req.body && req.body.student_id, null);
      const b = req.body || {};
      const sc = P.studentScope(u);
      const st = await db.get(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`, int(b.student_id), ...sc.params); if (!st) notFound();
      let scopeKind, termId = null, yearId = null;
      if (b.term_id) {
        scopeKind = 'periode';
        const tm = await db.get('SELECT id FROM term WHERE id = ? AND school_id = ?', int(b.term_id), u.school_id); if (!tm) notFound(); termId = tm.id;
      } else {
        scopeKind = 'annee';
        const y = await db.get('SELECT id FROM school_year WHERE id = ? AND school_id = ?', int(b.school_year_id), u.school_id); if (!y) notFound(); yearId = y.id;
      }
      const motive = text(b.motif, 300, 'motif', false);
      const dup = await db.get(`SELECT id FROM transcript WHERE school_id = ? AND student_id = ? AND status IN ('demande','approuve') AND scope = ?
        AND ${termId ? 'term_id = ?' : 'school_year_id = ?'}`, u.school_id, st.id, scopeKind, termId || yearId);
      if (dup) throw new HttpError(409, 'une demande identique est déjà en cours');
      const id = await db.insert('INSERT INTO transcript (school_id, student_id, requested_by, scope, term_id, school_year_id, motive) VALUES (?,?,?,?,?,?,?)',
        u.school_id, st.id, u.id, scopeKind, termId, yearId, motive);
      await audit(db, u, 'transcript.request', 'transcript', id, `${scopeKind} ${termId || yearId}${motive ? ` : ${motive}` : ''}`);
      return { id, status: 'demande' };
    }],
    ['GET', /^\/api\/releves$/, async (db, req, u) => {
      const sc = scope(u); if (sc === P.NONE) forbid();
      const where = [sc.sql]; const params = [...sc.params];
      const st = req.query.get('statut');
      if (st) { if (!STATUTS.includes(st)) throw new HttpError(400, 'statut inconnu'); where.push('t.status = ?'); params.push(st); }
      if (req.query.get('student_id')) { where.push('t.student_id = ?'); params.push(int(req.query.get('student_id'))); }
      return (await db.all(`${LIST} WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT 300`, ...params)).map((r) => ({ ...row(r), mine: r.requested_by_id === u.id }));
    }],
    ['POST', /^\/api\/releves\/(\d+)\/approuver$/, async (db, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'transcript.approve', 'transcript', id, null);
      const t = await db.get('SELECT * FROM transcript WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!t) notFound();
      if (t.status !== 'demande') throw new HttpError(409, `demande déjà traitée (${t.status})`);
      const sch = await db.get('SELECT * FROM school WHERE id = ?', u.school_id);
      if (!sch.signature) throw new HttpError(409, 'signature du directeur absente : téléversez-la d’abord');
      const c = await content(db, u.school_id, t);
      const st = await db.get(`SELECT st.code, st.first_name, st.last_name, st.birth_date, c.name AS class_name FROM student st
        LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
        LEFT JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id WHERE st.id = ? AND st.school_id = ?`, t.student_id, u.school_id);
      const keys = await K.schoolKeys(ctx.db, u.school_id);
      const code = `R${S.verifyCode()}`;
      const issuedAt = new Date().toISOString();
      const img = (v) => (v ? Buffer.from(v, 'base64') : null);
      const pdf = transcriptPdf({
        school: { name: sch.name, initials: sch.initials, address: sch.address, email: sch.email, phone: sch.phone, motto: sch.motto, logo: img(sch.logo), seal: img(sch.seal), signature: img(sch.signature), signature_name: sch.signature_name },
        student: `${st.first_name} ${st.last_name}`, studentCode: st.code, className: st.class_name, birthDate: st.birth_date, scope: t.scope, ...c,
        code: fmt(code), verifyUrl: `${S.publicUrl(req, ctx)}/#verifier=${code}`, keyId: keys.keyId, issuedAt, issuer: u.display_name,
      });
      const hash = crypto.createHash('sha256').update(pdf).digest('hex');
      const signature = K.sign(keys.privateKey(), K.transcriptMessage(code, hash));
      return db.tx(async (tx) => {
        const r = await tx.run("UPDATE transcript SET status = 'approuve', decided_by = ?, decided_at = ? WHERE id = ? AND school_id = ? AND status = 'demande'", u.id, issuedAt, t.id, u.school_id);
        if (!r.changes) throw new HttpError(409, 'demande déjà traitée');
        await audit(tx, u, 'transcript.approve', 'transcript', t.id, null);
        await tx.run("UPDATE transcript SET status = 'emis', code = ?, pdf = ?, sha256 = ?, signature = ?, key_id = ?, issued_at = ? WHERE id = ? AND school_id = ?",
          code, pdf.toString('base64'), hash, signature, keys.keyId, issuedAt, t.id, u.school_id);
        await audit(tx, u, 'transcript.issue', 'transcript', t.id, `${c.scopeLabel}, SHA-256 ${hash.slice(0, 16)}…, clé ${keys.keyId}`);
        await notify(tx, ctx, req, u, t, 'emis');
        return { id: t.id, status: 'emis', code: fmt(code), sha256: hash, verifyUrl: `${S.publicUrl(req, ctx)}/#verifier=${code}` };
      });
    }],
    ['POST', /^\/api\/releves\/(\d+)\/refuser$/, async (db, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'transcript.refuse', 'transcript', id, null);
      const reason = text(req.body && req.body.motif, 300, 'motif du refus', true);
      const t = await db.get('SELECT * FROM transcript WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!t) notFound();
      const r = await db.run("UPDATE transcript SET status = 'refuse', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ? AND school_id = ? AND status = 'demande'",
        u.id, new Date().toISOString(), reason, t.id, u.school_id);
      if (!r.changes) throw new HttpError(409, `demande déjà traitée (${t.status})`);
      await audit(db, u, 'transcript.refuse', 'transcript', t.id, reason);
      await notify(db, ctx, req, u, t, 'refuse');
      return { id: t.id, status: 'refuse' };
    }],
    // Annulation : direction (relevé émis ou demande), ou l'auteur de sa propre demande non traitée.
    ['POST', /^\/api\/releves\/(\d+)\/annuler$/, async (db, req, u, [id], ctx) => {
      const t = await db.get('SELECT * FROM transcript WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!t) notFound();
      const own = t.requested_by === u.id && t.status === 'demande';
      if (!P.has(u, 'direction') && !own) await refuse(ctx, u, 'transcript.cancel', 'transcript', id, null);
      const reason = text(req.body && req.body.motif, 300, 'motif', !own);
      const r = await db.run("UPDATE transcript SET status = 'annule', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ? AND school_id = ? AND status IN ('demande','emis')",
        new Date().toISOString(), u.id, reason || 'demande retirée', t.id, u.school_id);
      if (!r.changes) throw new HttpError(409, `relevé non annulable (${t.status})`);
      await audit(db, u, 'transcript.cancel', 'transcript', t.id, reason || 'demande retirée');
      if (t.status === 'emis') await notify(db, ctx, req, u, t, 'annule');
      return { id: t.id, status: 'annule' };
    }],
    ['GET', /^\/api\/releves\/(\d+)\/pdf$/, async (db, req, u, [id]) => {
      const sc = scope(u); if (sc === P.NONE) forbid();
      const t = await db.get(`SELECT t.id, t.status, t.pdf, t.code, st.code AS student_code FROM transcript t JOIN student st ON st.id = t.student_id AND st.school_id = t.school_id
        WHERE t.id = ? AND ${sc.sql}`, int(id), ...sc.params);
      if (!t) notFound();
      if (t.status === 'annule') throw new HttpError(410, 'relevé annulé');
      if (t.status !== 'emis') throw new HttpError(409, 'relevé non émis');
      await audit(db, u, 'transcript.download', 'transcript', t.id, null);
      return { __pdf: Buffer.from(t.pdf, 'base64'), filename: `releve-${t.student_code}-${t.id}.pdf` };
    }],

    // Notifications du portail.
    ['GET', /^\/api\/notifications$/, async (db, req, u) => db.all(`SELECT id, kind, ref, title_fr, title_ht, read_at, created_at FROM notification
      WHERE school_id = ? AND user_id = ? ORDER BY id DESC LIMIT 50`, u.school_id, u.id)],
    ['POST', /^\/api\/notifications\/lues$/, async (db, req, u) => {
      const r = await db.run('UPDATE notification SET read_at = ? WHERE school_id = ? AND user_id = ? AND read_at IS NULL', new Date().toISOString(), u.school_id, u.id);
      return { ok: true, count: r.changes };
    }],
  ];

  const publicRoutes = [
    // Contrôle d'un fichier : empreinte SHA-256 (calculée dans le navigateur) ou fichier entier (base64).
    ['POST', /^\/api\/verifier\/(R[A-Za-z0-9-]{12,20})\/fichier$/, async (db, req, _u, [raw], ctx) => {
      const code = raw.toUpperCase().replace(/-/g, '');
      const keys = [`verif:${req.ip}`];
      if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de vérifications, réessayez plus tard');
      const b = req.body || {};
      let hash = String(b.sha256 || '').toLowerCase();
      if (b.pdf) { const buf = Buffer.from(String(b.pdf), 'base64'); hash = crypto.createHash('sha256').update(buf).digest('hex'); }
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, 'empreinte SHA-256 ou fichier attendu');
      const r = await checkFile(db, code, hash);
      if (!r) { await ctx.limiter.fail(keys); throw new HttpError(404, 'aucun relevé ne correspond à ce code'); }
      return r;
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

// Vérification publique : école, nom abrégé, type de document, date, statut ; signature contrôlée. Aucune note.
async function verifyTranscriptPublic(db, code) {
  if (!RE_CODE.test(code)) return null;
  const t = await db.get(`SELECT t.school_id, t.status, t.issued_at, t.code, t.sha256, t.signature, t.key_id, t.cancel_reason, s.name AS school, st.first_name, st.last_name
    FROM transcript t JOIN school s ON s.id = t.school_id JOIN student st ON st.id = t.student_id AND st.school_id = t.school_id
    WHERE t.code = ? AND t.status IN ('emis','annule') AND t.issued_at IS NOT NULL`, code);
  if (!t) return null;
  const k = await K.publicKey(db, t.school_id);
  const sigOk = !!k && k.keyId === t.key_id && K.verify(k.publicKey, K.transcriptMessage(t.code, t.sha256), t.signature);
  return { authentique: sigOk, type: 'releve', document: 'Relevé de notes officiel', statut: t.status === 'annule' ? 'annule' : (sigOk ? 'valide' : 'modifie'),
    motif: t.status === 'annule' ? t.cancel_reason : undefined, ecole: t.school, eleve: `${t.first_name} ${t.last_name.slice(0, 1)}.`,
    emis_le: String(t.issued_at).slice(0, 10), signature: { algo: 'Ed25519', cle: t.key_id, valide: sigOk } };
}
// Fichier présenté : authentique si son empreinte est celle qui a été signée ET si la signature Ed25519 est valide.
async function checkFile(db, code, hash) {
  if (!RE_CODE.test(code)) return null;
  const t = await db.get("SELECT school_id, code, sha256, signature, key_id, status FROM transcript WHERE code = ? AND status IN ('emis','annule')", code);
  if (!t) return null;
  const k = await K.publicKey(db, t.school_id);
  const ok = !!k && k.keyId === t.key_id && K.verify(k.publicKey, K.transcriptMessage(t.code, hash), t.signature);
  return { resultat: ok ? 'authentique' : 'modifie', statut: t.status === 'annule' ? 'annule' : 'valide' };
}

module.exports = { createRoutes, verifyTranscriptPublic, checkFile, checkImage, content };
