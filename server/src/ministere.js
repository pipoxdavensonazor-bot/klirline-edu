'use strict';
// Bloc 6 : portail du ministère de l'Éducation nationale (PROTOTYPE). Désactivé par défaut : tant que
// NORIA_MINISTERE ne vaut pas « 1 », toutes ses routes répondent 404 (vérifié dans app.js avant toute autre chose) et
// rien n'apparaît dans l'interface.
//
// Garanties :
//   * comptes « ministere » hors école, créés par le super-admin seulement ; connexion par code à 6 chiffres (même
//     mécanisme que les écoles : HMAC salé, 10 min, 5 essais, usage unique, renvoi limité) ; session séparée
//     (cookie noria_ministere, chemin /api/ministere, 4 h) ;
//   * lecture seule sur les écoles. En PostgreSQL chaque requête passe par db.asMinistry : rôle noria_ministere,
//     colonnes choisies et politiques « ministere_lecture » dédiées (jamais de contournement global de la RLS) ;
//   * agrégats par défaut ; la liste nominative d'une classe ou la fiche d'un élève exigent un motif, sont inscrites
//     au journal du ministère ET au journal de l'école consultée, et alimentent la règle « ministere_consultations »
//     de l'assistant sécurité ;
//   * chaque consultation est journalisée (ministry_audit, ajout seul) ;
//   * seules écritures : accusé de réception ou demande de correction d'une déclaration annuelle, décision signée sur
//     un transfert (quand NORIA_TRANSFERT_MINISTERE=1).
const crypto = require('node:crypto');
const auth = require('./auth');
const otp = require('./otp');
const P = require('./policy');
const K = require('./cles');
const { HttpError, notFound, refuse, audit } = require('./common');
const I = require('./identite');
const portail = require('./portail');
const T = require('./transferts');
const { declarationPdf, DEPTS } = require('./pdf-declaration');

const COOKIE = 'noria_ministere';
const SESSION_HOURS = 4;
const STAFF = ['direction', 'secretariat', 'enseignant', 'comptabilite', 'bibliotheque'];
const DECL_STATUS = ['envoyee', 'recue', 'correction_demandee', 'remplacee'];
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const enabled = (ctx) => String(((ctx && ctx.env) || process.env).NORIA_MINISTERE || '0') === '1';
// Adresses du bloc 6 : 404 tant que le portail est désactivé (pages, scripts et API).
const GATED = /^\/api\/(ministere|declarations)(\/|$)|^\/api\/admin\/ministere(\/|$)|^\/ministere\/?$|^\/src\/(ministere[a-z-]*|declaration|admin-ministere)\.(js|css)$/;
const int = (v, label = 'identifiant') => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, `${label} invalide`); return x; };
const motifOf = (b) => { const r = String((b && b.motif) || '').trim(); if (r.length < 5 || r.length > 300) throw new HttpError(400, 'motif obligatoire (5 à 300 caractères)'); return r; };
const noteOf = (b, required) => {
  const r = String((b && b.note) || '').trim();
  if (required && r.length < 5) throw new HttpError(400, 'précisez la correction demandée (5 caractères au moins)');
  if (r.length > 500) throw new HttpError(400, 'note : 500 caractères au plus');
  return r || null;
};
const rate = (admis, total) => (total ? admis / total : null);

function normalizePhone(v) {
  const s = String(v || '').replace(/[\s.\-()]/g, '');
  if (/^\d{8}$/.test(s)) return `+509${s}`;
  return /^\+?\d{9,15}$/.test(s) ? s.replace(/^(?!\+)/, '+') : null;
}
function identOf(v) {
  const s = String(v || '').trim();
  if (s.includes('@')) return { field: 'email', value: s.toLowerCase().slice(0, 160) };
  const p = normalizePhone(s);
  return p ? { field: 'phone', value: p } : { field: 'email', value: s.toLowerCase().slice(0, 160) };
}

/* ---------- Agrégats d'une école pour une année (partagés : déclaration côté école, fiche côté ministère) ---------- */
// db : transaction de l'école (noria_app) ou du ministère (noria_ministere) ; seules des colonnes autorisées aux deux.
async function classStats(db, schoolId, yearId) {
  const classes = await db.all(`SELECT c.id, c.name, l.name AS level FROM class c LEFT JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id
    WHERE c.school_id = ? AND c.school_year_id = ? ORDER BY c.level_id, c.name`, schoolId, yearId);
  const eff = await db.all(`SELECT e.class_id, COUNT(DISTINCT st.id) AS n, COUNT(DISTINCT CASE WHEN st.sex = 'F' THEN st.id END) AS f, COUNT(DISTINCT CASE WHEN st.sex = 'M' THEN st.id END) AS m
    FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id
    WHERE e.school_id = ? AND c.school_year_id = ? AND e.status = 'actif' GROUP BY e.class_id`, schoolId, yearId);
  const dec = await db.all(`SELECT e.class_id, d.decision, COUNT(DISTINCT d.student_id) AS n FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
    JOIN year_decision d ON d.student_id = e.student_id AND d.school_id = e.school_id AND d.school_year_id = c.school_year_id
    WHERE e.school_id = ? AND c.school_year_id = ? AND e.status = 'actif' GROUP BY e.class_id, d.decision`, schoolId, yearId);
  const E = new Map(eff.map((r) => [Number(r.class_id), r]));
  return classes.map((c) => {
    const e = E.get(Number(c.id)) || { n: 0, f: 0, m: 0 };
    const d = { admis: 0, redouble: 0, echec: 0 };
    for (const r of dec) if (Number(r.class_id) === Number(c.id)) d[r.decision] = Number(r.n);
    const total = Number(e.n), decided = d.admis + d.redouble + d.echec;
    return { id: Number(c.id), classe: c.name, niveau: c.level, total, filles: Number(e.f), garcons: Number(e.m), non_renseigne: total - Number(e.f) - Number(e.m),
      admis: d.admis, redouble: d.redouble, echec: d.echec, sans_decision: Math.max(0, total - decided), taux: rate(d.admis, decided) };
  });
}
function totals(cls) {
  const t = { total: 0, filles: 0, garcons: 0, non_renseigne: 0, admis: 0, redouble: 0, echec: 0, sans_decision: 0 };
  for (const c of cls) for (const k of Object.keys(t)) t[k] += c[k];
  t.taux = rate(t.admis, t.admis + t.redouble + t.echec);
  return t;
}
async function staffOf(db, schoolId) {
  const rows = await db.all(`SELECT u.id, r.role FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
    WHERE u.school_id = ? AND u.state = 'actif' AND r.role IN (${STAFF.map(() => '?').join(',')}) ORDER BY u.id`, schoolId, ...STAFF);
  const par = {}; const people = new Set();
  for (const r of rows) { par[r.role] = (par[r.role] || 0) + 1; people.add(Number(r.id)); }
  return { total: people.size, par_role: par };
}
const yearsOf = (label) => String(label || '').split(/[^0-9]+/).filter((x) => /^\d{4}$/.test(x)).map(Number);
async function laureates(db, schoolId, label, statuses) {
  const ys = yearsOf(label); if (!ys.length) return [];
  const rows = await db.all(`SELECT person_name, year, exam, exam_type, mention, minor, consent_school, consent_parent FROM portal_item
    WHERE school_id = ? AND kind = 'laureat' AND status IN (${statuses.map(() => '?').join(',')}) AND year IN (${ys.map(() => '?').join(',')}) ORDER BY year, person_name`, schoolId, ...statuses, ...ys);
  return rows.map((r) => ({ nom: portail.consented(r) ? r.person_name : portail.initials(r.person_name), examen: r.exam, annee: r.year, mention: r.mention || null, masque: !portail.consented(r) }));
}

/* ---------- Déclaration annuelle (côté école) ---------- */
async function buildPayload(t, schoolId, year, u) {
  const s = await t.get('SELECT id, slug, name, address, department, commune FROM school WHERE id = ?', schoolId);
  const cls = await classStats(t, schoolId, year.id);
  const tot = totals(cls);
  const st = await t.all(`SELECT u.id, u.display_name, r.role FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
    WHERE u.school_id = ? AND u.state = 'actif' AND r.role IN (${STAFF.map(() => '?').join(',')}) ORDER BY u.display_name, u.id`, schoolId, ...STAFF);
  const people = new Map(); const par = {};
  for (const r of st) {
    par[r.role] = (par[r.role] || 0) + 1;
    if (!people.has(r.id)) people.set(r.id, { nom: r.display_name, roles: [] });
    people.get(r.id).roles.push(r.role);
  }
  return {
    v: 1, ecole: { id: Number(s.id), nom: s.name, slug: s.slug, adresse: s.address || null, departement: s.department || null, commune: s.commune || null },
    annee: year.label, school_year_id: Number(year.id), version: null, genere_le: null, signataire: u ? u.display_name : null,
    effectifs: { total: tot.total, filles: tot.filles, garcons: tot.garcons, non_renseigne: tot.non_renseigne,
      classes: cls.map((c) => ({ classe: c.classe, niveau: c.niveau, total: c.total, filles: c.filles, garcons: c.garcons, non_renseigne: c.non_renseigne })) },
    resultats: { admis: tot.admis, redouble: tot.redouble, echec: tot.echec, sans_decision: tot.sans_decision, taux_reussite: tot.taux,
      classes: cls.map((c) => ({ classe: c.classe, admis: c.admis, redouble: c.redouble, echec: c.echec, sans_decision: c.sans_decision, taux: c.taux })) },
    personnel: { total: people.size, par_role: par, liste: [...people.values()] },
    laureats: await laureates(t, schoolId, year.label, ['publie', 'en_attente']),
  };
}
const declMessage = (d) => Buffer.from(['NORIA-DECLARATION', 'v1', d.school_id, d.year_label, d.version, d.payload_sha256, d.pdf_sha256].join('|'), 'utf8');
async function verifyDeclaration(sys, d) {
  const k = await K.publicKey(sys, d.school_id);
  const pdfOk = sha256(Buffer.from(d.pdf || '', 'base64')) === d.pdf_sha256;
  const payloadOk = sha256(d.payload) === d.payload_sha256;
  const sigOk = !!k && k.keyId === d.key_id && K.verify(k.publicKey, declMessage(d), d.signature);
  return { algo: 'Ed25519', cle: d.key_id, valide: pdfOk && payloadOk && sigOk, empreinte: d.payload_sha256 };
}
async function events(db, id) {
  return db.all('SELECT kind, actor, note, created_at FROM declaration_event WHERE declaration_id = ? ORDER BY id', id);
}
const declOut = (d) => ({ id: Number(d.id), annee: d.year_label, version: Number(d.version), statut: d.status, envoyee_le: d.sent_at, signataire: d.signer_name,
  ministere_le: d.ministry_at || null, note_ministere: d.ministry_note || null, cle: d.key_id });

async function notifyDirection(sys, schoolId, kind, ref, fr, ht) {
  const ids = await sys.all(`SELECT u.id FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id WHERE u.school_id = ? AND u.state = 'actif' AND r.role = 'direction'`, schoolId);
  for (const { id } of ids) await sys.insert('INSERT INTO notification (school_id, user_id, kind, ref, title_fr, title_ht) VALUES (?,?,?,?,?,?)', schoolId, id, kind, String(ref), fr, ht);
}

// Envoi d'une déclaration (route de la direction ; données de démonstration). db : transaction de l'école ;
// sys : connexion système (clé de l'école) ; u : compte de la direction ; y : année scolaire.
async function sendDeclaration(db, sys, u, y) {
  const prev = await db.get("SELECT * FROM annual_declaration WHERE school_id = ? AND school_year_id = ? AND status <> 'remplacee'", u.school_id, y.id);
  if (prev && prev.status !== 'correction_demandee') throw new HttpError(409, prev.status === 'recue' ? 'déclaration déjà reçue par le ministère' : 'déclaration déjà envoyée : attendez la réponse du ministère');
  const last = await db.get('SELECT MAX(version) AS v FROM annual_declaration WHERE school_id = ? AND school_year_id = ?', u.school_id, y.id);
  const payload = await buildPayload(db, u.school_id, y, u);
  payload.version = Number((last && last.v) || 0) + 1;
  payload.genere_le = iso();
  const json = JSON.stringify(payload); const psha = sha256(json);
  const keys = await K.schoolKeys(sys, u.school_id);
  const s = await db.get('SELECT id, name, initials, address, email, phone, motto, logo, signature, signature_name FROM school WHERE id = ?', u.school_id);
  const img = (v) => (v ? Buffer.from(v, 'base64') : null);
  const pdf = declarationPdf(payload, { ...s, initials: s.initials || I.deriveInitials(s.name), logo: img(s.logo), signature: img(s.signature) }, { keyId: keys.keyId, payloadSha: psha });
  const row = { school_id: u.school_id, year_label: y.label, version: payload.version, payload_sha256: psha, pdf_sha256: sha256(pdf) };
  const signature = K.sign(keys.privateKey(), declMessage(row));
  if (prev) {
    const r = await db.run("UPDATE annual_declaration SET status = 'remplacee' WHERE id = ? AND school_id = ? AND status = 'correction_demandee'", prev.id, u.school_id);
    if (!r.changes) throw new HttpError(409, 'déclaration modifiée entre-temps : rechargez la page');
    await db.run('INSERT INTO declaration_event (declaration_id, school_id, kind, actor, user_id, note) VALUES (?,?,?,?,?,?)', prev.id, u.school_id, 'remplacement', 'direction', u.id, `remplacée par la version ${payload.version}`);
  }
  const id = await db.insert(`INSERT INTO annual_declaration (school_id, school_year_id, year_label, version, status, payload, payload_sha256, pdf, pdf_sha256, signature, key_id, sent_by, signer_name, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, y.id, y.label, payload.version, 'envoyee', json, psha, pdf.toString('base64'), row.pdf_sha256, signature, keys.keyId, u.id, u.display_name, payload.genere_le);
  await db.run('INSERT INTO declaration_event (declaration_id, school_id, kind, actor, user_id, note) VALUES (?,?,?,?,?,?)', id, u.school_id, 'envoi', 'direction', u.id, null);
  await audit(db, u, 'declaration.envoyer', 'annual_declaration', id, `${y.label}, version ${payload.version} (Ed25519, clé ${keys.keyId})`);
  return { id, version: payload.version, statut: 'envoyee', cle: keys.keyId, empreinte: psha };
}

function schoolRoutes() {
  const lecteur = async (ctx, u, action) => { if (!P.has(u, 'direction') && !P.has(u, 'secretariat')) await refuse(ctx, u, action, 'annual_declaration', null, 'réservé à la direction et au secrétariat'); };
  const yearOf = async (db, u, id) => {
    const y = id ? await db.get('SELECT id, label, is_current FROM school_year WHERE id = ? AND school_id = ?', int(id, 'année'), u.school_id)
      : await db.get('SELECT id, label, is_current FROM school_year WHERE school_id = ? AND is_current = 1', u.school_id);
    if (!y) throw new HttpError(404, 'année scolaire introuvable');
    return y;
  };
  return [
    ['GET', /^\/api\/declarations$/, async (db, req, u, _m, ctx) => {
      await lecteur(ctx, u, 'declaration.lire');
      const y = await yearOf(db, u, req.query.get('annee'));
      const all = await db.all('SELECT * FROM annual_declaration WHERE school_id = ? ORDER BY year_label DESC, version DESC', u.school_id);
      const hist = [];
      for (const d of all) hist.push({ ...declOut(d), evenements: await events(db, d.id) });
      const active = all.find((d) => Number(d.school_year_id) === Number(y.id) && d.status !== 'remplacee');
      const peut = P.has(u, 'direction') && (!active || active.status === 'correction_demandee');
      return {
        annees: await db.all('SELECT id, label, is_current FROM school_year WHERE school_id = ? ORDER BY label DESC', u.school_id),
        annee: { id: Number(y.id), label: y.label }, apercu: await buildPayload(db, u.school_id, y, u), active: active ? declOut(active) : null,
        peut_envoyer: peut, raison: peut ? null : !P.has(u, 'direction') ? 'réservé à la direction' : active.status === 'recue' ? 'déclaration déjà reçue par le ministère' : 'déclaration déjà envoyée, en attente du ministère',
        historique: hist,
      };
    }],
    // Envoi : dossier figé, PDF à l'en-tête de l'école, signature Ed25519 de l'école. Nouvel envoi seulement après une
    // demande de correction (la version précédente devient « remplacee »).
    ['POST', /^\/api\/declarations$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'declaration.envoyer', 'annual_declaration', null, 'réservé à la direction');
      const b = req.body || {};
      if (b.confirmer !== true) throw new HttpError(400, 'confirmation explicite requise');
      const y = await yearOf(db, u, b.school_year_id);
      return sendDeclaration(db, ctx.db, u, y);
    }],
    ['GET', /^\/api\/declarations\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
      await lecteur(ctx, u, 'declaration.pdf');
      const d = await db.get('SELECT id, year_label, version, pdf FROM annual_declaration WHERE id = ? AND school_id = ?', int(id), u.school_id);
      if (!d) notFound();
      return { __pdf: Buffer.from(d.pdf, 'base64'), filename: `declaration-${d.year_label}-v${d.version}.pdf` };
    }],
  ];
}

/* ---------- Portail du ministère ---------- */
async function loadAccount(sys, token) {
  if (!token) return null;
  const a = await sys.get(`SELECT a.id, a.email, a.display_name, a.title, a.state, s.expires_at FROM ministry_session s JOIN ministry_account a ON a.id = s.account_id
    WHERE s.token_hash = ?`, auth.sha256(String(token)));
  if (!a || a.state !== 'actif' || a.expires_at < iso()) return null;
  return a;
}
function mlog(t, acc, req, action, { school_id = null, type = null, id = null, detail = null, outcome = 'ok' } = {}) {
  return t.run('INSERT INTO ministry_audit (account_id, action, school_id, record_type, record_id, detail, outcome, ip) VALUES (?,?,?,?,?,?,?,?)',
    acc.id, action, school_id, type, id == null ? null : String(id), detail ? String(detail).slice(0, 500) : null, outcome, req.ip || null);
}
// Trace dans le journal de l'école consultée (la direction voit qui, quand, pourquoi).
function schoolTrace(t, acc, schoolId, action, type, id, reason) {
  return t.run('INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, outcome) VALUES (?,?,?,?,?,?,?)',
    schoolId, null, action, type, id == null ? null : String(id), `[par le ministère : ${acc.display_name}, compte n° ${acc.id}] ${reason || ''}`.slice(0, 500), 'ok');
}
function secEvent(ctx, req, acc, schoolId, detail) {
  if (!ctx.sec) return;
  ctx.sec.record({ kind: 'ministere', ip: req.ip, ua: req.headers['user-agent'] || '', account: `min:${acc.id}`, role: 'ministere', school_id: schoolId || null, path: req.url.split('?')[0], detail });
}
async function defaultYear(t) {
  const r = await t.get('SELECT label FROM school_year WHERE is_current = 1 GROUP BY label ORDER BY COUNT(*) DESC, label DESC LIMIT 1');
  return r ? r.label : null;
}
const generic = { ok: true, message: 'Si ce compte existe, un code vient d’être envoyé.', minutes: otp.TTL_MIN, resendIn: otp.RESEND_SECONDS };

const ROUTES = [
  // Étape 1 : code à 6 chiffres par SMS (téléphone du compte) ou e-mail. Réponse identique que le compte existe ou non.
  ['POST', /^\/api\/ministere\/login\/code$/, async (sys, req, _a, _m, ctx) => {
    const ident = identOf((req.body || {}).identifier);
    const keys = [`min-code-ip:${req.ip}`, `min-code:${ident.value}`];
    const wait = await ctx.limiter.blocked(keys);
    if (wait) throw new HttpError(429, 'trop de demandes de code, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    await ctx.limiter.fail(keys);
    const a = await sys.get(`SELECT * FROM ministry_account WHERE ${ident.field === 'phone' ? 'phone' : 'email'} = ? AND state = 'actif'`, ident.value);
    if (!a) return generic;
    const last = await sys.get('SELECT created_at FROM ministry_login WHERE account_id = ? ORDER BY id DESC LIMIT 1', a.id);
    if (last && Date.now() - Date.parse(last.created_at) < otp.RESEND_SECONDS * 1000) return generic;
    const hour = Number((await sys.get('SELECT COUNT(*) AS n FROM ministry_login WHERE account_id = ? AND created_at > ?', a.id, iso(-3600e3))).n);
    if (hour >= otp.MAX_PER_HOUR) return generic;
    const code = otp.newCode();
    await sys.run('UPDATE ministry_login SET used_at = ? WHERE account_id = ? AND used_at IS NULL', iso(), a.id);
    await sys.run('INSERT INTO ministry_login (account_id, code_hash, expires_at, created_at) VALUES (?,?,?,?)', a.id, otp.hashCode(code, `min${a.id}`), iso(otp.TTL_MIN * 60e3), iso());
    const channel = a.phone ? 'sms' : 'email';
    const ht = (req.body || {}).lang === 'ht';
    const text = ht ? `NORIA ministè : kòd ${code}. Li bon pou ${otp.TTL_MIN} minit. Pa bay pèsonn li.` : `NORIA ministère : code ${code}. Valable ${otp.TTL_MIN} min. Ne le donnez à personne.`;
    try {
      await ctx.notifier.adapter(channel).send({ to: a.phone || a.email, subject: 'NORIA ministère : code de connexion', text });
      await mlog(sys, a, req, 'ministere.login.code', { detail: `code envoyé (${channel})` });
    } catch (e) { await mlog(sys, a, req, 'ministere.login.code', { detail: `envoi ${channel} en échec`, outcome: 'echec' }); }
    return generic;
  }],
  // Étape 2 : vérification du code, ouverture de la session.
  ['POST', /^\/api\/ministere\/login$/, async (sys, req, _a, _m, ctx) => {
    const b = req.body || {};
    const ident = identOf(b.identifier);
    const keys = [`min-login-ip:${req.ip}`, `min-login:${ident.value}`];
    const wait = await ctx.limiter.blocked(keys);
    if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    const a = await sys.get(`SELECT * FROM ministry_account WHERE ${ident.field === 'phone' ? 'phone' : 'email'} = ? AND state = 'actif'`, ident.value);
    const row = a ? await sys.get('SELECT * FROM ministry_login WHERE account_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', a.id, iso()) : null;
    const bad = async (why) => {
      await ctx.limiter.fail(keys);
      if (a) await mlog(sys, a, req, 'ministere.login', { detail: `code ${why}`, outcome: 'refuse' });
      throw new HttpError(401, 'code invalide ou expiré');
    };
    const c = String(b.code || '').replace(/\s/g, '');
    if (!row) { otp.checkCode(c, 0, null); return bad('absent ou expiré'); }
    const take = await sys.run('UPDATE ministry_login SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?', row.id, otp.MAX_ATTEMPTS);
    if (!take.changes) return bad('essais épuisés');
    if (!(/^\d{6}$/.test(c) & otp.checkCode(c, `min${a.id}`, row.code_hash))) return bad('erroné');
    if (!(await sys.run('UPDATE ministry_login SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id)).changes) return bad('déjà utilisé');
    const token = crypto.randomBytes(32).toString('base64url');
    await sys.run('DELETE FROM ministry_session WHERE expires_at < ?', iso());
    await sys.run('INSERT INTO ministry_session (token_hash, account_id, expires_at) VALUES (?,?,?)', auth.sha256(token), a.id, iso(SESSION_HOURS * 3600e3));
    req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/ministere; Max-Age=${SESSION_HOURS * 3600}${ctx.secureCookie ? '; Secure' : ''}`);
    await ctx.limiter.reset([`min-login:${ident.value}`]);
    await mlog(sys, a, req, 'ministere.login', { detail: 'code à 6 chiffres' });
    if (ctx.sec) await ctx.sec.loginOk(req, { account: `min:${a.id}`, role: 'ministere' }).catch(() => {});
    return { ok: true, token, nom: a.display_name };
  }],
  ['POST', /^\/api\/ministere\/logout$/, async (t, req, a, _m, ctx) => {
    await ctx.db.run('DELETE FROM ministry_session WHERE token_hash = ?', auth.sha256(String(req.minToken || '')));
    req.setCookie(`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/ministere; Max-Age=0`);
    await mlog(t, a, req, 'ministere.logout');
    return { ok: true };
  }, { auth: true }],
  ['GET', /^\/api\/ministere\/me$/, async (t, req, a, _m, ctx) => ({ id: a.id, nom: a.display_name, titre: a.title, email: a.email, expire_le: a.expires_at,
    transferts: T.ministereActive(ctx) }), { auth: true }],

  // Vue d'ensemble : toutes les écoles actives, agrégats seulement.
  ['GET', /^\/api\/ministere\/ecoles$/, async (t, req, a, _m, ctx) => {
    const q = req.query;
    const annee = String(q.get('annee') || '').slice(0, 20) || await defaultYear(t);
    const dep = String(q.get('departement') || ''); const com = String(q.get('commune') || '').trim().slice(0, 80);
    const txt = String(q.get('q') || '').trim().toLowerCase().slice(0, 80); const statut = String(q.get('statut') || '');
    const all = await t.all("SELECT id, slug, name, initials, department, commune, logo_updated_at FROM school WHERE status = 'active' ORDER BY name");
    const eff = new Map((await t.all(`SELECT c.school_id, COUNT(DISTINCT e.student_id) AS n, COUNT(DISTINCT CASE WHEN st.sex = 'F' THEN st.id END) AS f, COUNT(DISTINCT CASE WHEN st.sex = 'M' THEN st.id END) AS m
      FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id
      JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE y.label = ? AND e.status = 'actif' GROUP BY c.school_id`, annee)).map((r) => [Number(r.school_id), r]));
    const ncl = new Map((await t.all(`SELECT c.school_id, COUNT(*) AS n FROM class c JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id
      WHERE y.label = ? GROUP BY c.school_id`, annee)).map((r) => [Number(r.school_id), Number(r.n)]));
    const dec = new Map((await t.all(`SELECT d.school_id, SUM(CASE WHEN d.decision = 'admis' THEN 1 ELSE 0 END) AS admis, SUM(CASE WHEN d.decision = 'redouble' THEN 1 ELSE 0 END) AS redouble,
      SUM(CASE WHEN d.decision = 'echec' THEN 1 ELSE 0 END) AS echec FROM year_decision d JOIN school_year y ON y.id = d.school_year_id AND y.school_id = d.school_id
      WHERE y.label = ? GROUP BY d.school_id`, annee)).map((r) => [Number(r.school_id), r]));
    const decl = new Map((await t.all("SELECT id, school_id, status, version, sent_at FROM annual_declaration WHERE year_label = ? AND status <> 'remplacee'", annee)).map((r) => [Number(r.school_id), r]));
    const rows = all.map((s) => {
      const e = eff.get(Number(s.id)) || { n: 0, f: 0, m: 0 }; const d = dec.get(Number(s.id)) || { admis: 0, redouble: 0, echec: 0 };
      const ad = Number(d.admis || 0), re = Number(d.redouble || 0), ec = Number(d.echec || 0); const dl = decl.get(Number(s.id));
      return { id: Number(s.id), slug: s.slug, nom: s.name, initiales: I.schoolInitials ? I.schoolInitials(s) : s.initials, logo: s.logo_updated_at ? `/api/ecoles/${s.slug}/logo` : null,
        departement: s.department, commune: s.commune, effectif: Number(e.n), filles: Number(e.f), garcons: Number(e.m), classes: ncl.get(Number(s.id)) || 0,
        admis: ad, redouble: re, echec: ec, taux: rate(ad, ad + re + ec), declaration: dl ? { id: Number(dl.id), statut: dl.status, version: Number(dl.version), le: dl.sent_at } : null };
    });
    const list = rows.filter((r) => (!dep || r.departement === dep) && (!com || String(r.commune || '').toLowerCase() === com.toLowerCase())
      && (!txt || r.nom.toLowerCase().includes(txt)) && (!statut || (statut === 'aucune' ? !r.declaration : r.declaration && r.declaration.statut === statut)));
    const tot = { ecoles: list.length, effectif: 0, filles: 0, garcons: 0, classes: 0, admis: 0, redouble: 0, echec: 0, declarations: 0, recues: 0 };
    for (const r of list) {
      for (const k of ['effectif', 'filles', 'garcons', 'classes', 'admis', 'redouble', 'echec']) tot[k] += r[k];
      if (r.declaration) { tot.declarations++; if (r.declaration.statut === 'recue') tot.recues++; }
    }
    tot.taux = rate(tot.admis, tot.admis + tot.redouble + tot.echec);
    const communes = [...new Set(rows.filter((r) => !dep || r.departement === dep).map((r) => r.commune).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
    const annees = (await t.all('SELECT DISTINCT label FROM school_year ORDER BY label DESC')).map((r) => r.label);
    await mlog(t, a, req, 'ministere.vue_ensemble', { detail: `année ${annee || '-'}${dep ? `, ${dep}` : ''}${com ? `, ${com}` : ''}${txt ? `, « ${txt} »` : ''}${statut ? `, ${statut}` : ''}` });
    secEvent(ctx, req, a, null, 'ecoles');
    return { annee, annees, departements: Object.entries(DEPTS).map(([id, nom]) => ({ id, nom })), communes, filtres: { departement: dep || null, commune: com || null, q: txt || null, statut: statut || null },
      totaux: tot, ecoles: list };
  }, { auth: true }],

  // Fiche d'une école : profil public, agrégats par classe, personnel (effectifs par fonction), lauréats publiés,
  // historique des déclarations. Aucun nom d'élève.
  ['GET', /^\/api\/ministere\/ecoles\/(\d+)$/, async (t, req, a, [id], ctx) => {
    const sid = int(id);
    const s = await t.get('SELECT id, slug, name, initials, address, email, phone, motto, status, department, commune, logo_updated_at FROM school WHERE id = ?', sid);
    if (!s) notFound();
    const years = await t.all('SELECT id, label, is_current FROM school_year WHERE school_id = ? ORDER BY label DESC', sid);
    const want = String(req.query.get('annee') || '');
    const y = years.find((x) => x.label === want) || years.find((x) => Number(x.is_current) === 1) || years[0] || null;
    const cls = y ? await classStats(t, sid, y.id) : [];
    const hist = await t.all('SELECT * FROM annual_declaration WHERE school_id = ? ORDER BY year_label DESC, version DESC', sid);
    await mlog(t, a, req, 'ministere.fiche_ecole', { school_id: sid, type: 'school', id: sid, detail: y ? `année ${y.label}` : null });
    secEvent(ctx, req, a, sid, 'ecole');
    return {
      ecole: { id: Number(s.id), slug: s.slug, nom: s.name, initiales: I.schoolInitials ? I.schoolInitials(s) : s.initials, adresse: s.address, email: s.email, telephone: s.phone, devise: s.motto,
        statut: s.status, departement: s.department, departement_nom: DEPTS[s.department] || null, commune: s.commune, logo: s.logo_updated_at ? `/api/ecoles/${s.slug}/logo` : null },
      annees: years.map((x) => x.label), annee: y ? y.label : null, classes: cls, totaux: totals(cls), personnel: await staffOf(t, sid),
      laureats: y ? await laureates(t, sid, y.label, ['publie']) : [], declarations: hist.map(declOut),
    };
  }, { auth: true }],

  // Liste nominative d'une classe : action explicite avec motif, journalisée des deux côtés.
  ['POST', /^\/api\/ministere\/ecoles\/(\d+)\/classes\/(\d+)\/eleves$/, async (t, req, a, [id, cid], ctx) => {
    const sid = int(id), classId = int(cid); const why = motifOf(req.body);
    const c = await t.get('SELECT c.id, c.name, c.school_year_id, y.label FROM class c JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id WHERE c.id = ? AND c.school_id = ?', classId, sid);
    if (!c) notFound();
    const rows = await t.all(`SELECT st.id, st.code, st.first_name, st.last_name, st.birth_date, st.sex, d.decision FROM enrollment e
      JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id
      LEFT JOIN year_decision d ON d.student_id = st.id AND d.school_id = st.school_id AND d.school_year_id = ?
      WHERE e.class_id = ? AND e.school_id = ? AND e.status = 'actif' ORDER BY st.last_name, st.first_name`, c.school_year_id, classId, sid);
    await mlog(t, a, req, 'ministere.liste_nominative', { school_id: sid, type: 'class', id: classId, detail: `${c.name} (${c.label}), ${rows.length} élève(s) : ${why}` });
    await schoolTrace(t, a, sid, 'ministere.consultation', 'class', classId, `liste nominative ${c.name} (${rows.length} élève(s)) : ${why}`);
    secEvent(ctx, req, a, sid, `nominatif:classe:${rows.length}`);
    return { classe: c.name, annee: c.label, motif: why, eleves: rows.map((r) => ({ id: Number(r.id), code: r.code, nom: r.last_name, prenom: r.first_name, naissance: r.birth_date, sexe: r.sex, decision: r.decision || null })) };
  }, { auth: true }],
  // Fiche d'un élève : identité, classes, décisions de fin d'année. Jamais de notes, santé, famille ni contacts.
  ['POST', /^\/api\/ministere\/eleves\/(\d+)$/, async (t, req, a, [id], ctx) => {
    const why = motifOf(req.body);
    const st = await t.get('SELECT s.id, s.school_id, s.code, s.first_name, s.last_name, s.birth_date, s.sex, s.status, s.transferred_at, sc.name AS ecole FROM student s JOIN school sc ON sc.id = s.school_id WHERE s.id = ?', int(id));
    if (!st) notFound();
    const classes = await t.all(`SELECT c.name AS classe, y.label AS annee, e.status FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
      JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id WHERE e.student_id = ? AND e.school_id = ? ORDER BY y.label DESC`, st.id, st.school_id);
    const decisions = await t.all(`SELECT y.label AS annee, d.decision FROM year_decision d JOIN school_year y ON y.id = d.school_year_id AND y.school_id = d.school_id
      WHERE d.student_id = ? AND d.school_id = ? ORDER BY y.label DESC`, st.id, st.school_id);
    await mlog(t, a, req, 'ministere.fiche_eleve', { school_id: st.school_id, type: 'student', id: st.id, detail: why });
    await schoolTrace(t, a, st.school_id, 'ministere.consultation', 'student', st.id, `fiche élève ${st.code} : ${why}`);
    secEvent(ctx, req, a, st.school_id, 'nominatif:eleve');
    return { eleve: { id: Number(st.id), code: st.code, nom: st.last_name, prenom: st.first_name, naissance: st.birth_date, sexe: st.sex, statut: st.status, transfere_le: st.transferred_at, ecole: st.ecole },
      classes, decisions, motif: why, non_transmis: 'notes, santé, famille, contacts, finances, présences' };
  }, { auth: true }],

  // Déclarations reçues.
  ['GET', /^\/api\/ministere\/declarations$/, async (t, req, a, _m, ctx) => {
    const annee = String(req.query.get('annee') || '').slice(0, 20); const statut = String(req.query.get('statut') || '');
    const where = []; const p = [];
    if (annee) { where.push('d.year_label = ?'); p.push(annee); }
    if (DECL_STATUS.includes(statut)) { where.push('d.status = ?'); p.push(statut); } else where.push("d.status <> 'remplacee'");
    const rows = await t.all(`SELECT d.id, d.school_id, d.year_label, d.version, d.status, d.sent_at, d.signer_name, d.ministry_at, d.ministry_note, d.key_id, s.name AS ecole, s.department, s.commune
      FROM annual_declaration d JOIN school s ON s.id = d.school_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.sent_at DESC LIMIT 500`, ...p);
    await mlog(t, a, req, 'ministere.declarations', { detail: `${annee || 'toutes années'}${statut ? `, ${statut}` : ''}` });
    secEvent(ctx, req, a, null, 'declarations');
    return { declarations: rows.map((d) => ({ ...declOut(d), ecole: d.ecole, ecole_id: Number(d.school_id), departement: d.department, commune: d.commune })) };
  }, { auth: true }],
  ['GET', /^\/api\/ministere\/declarations\/(\d+)$/, async (t, req, a, [id], ctx) => {
    const d = await t.get('SELECT d.*, s.name AS ecole, s.slug FROM annual_declaration d JOIN school s ON s.id = d.school_id WHERE d.id = ?', int(id));
    if (!d) notFound();
    const versions = await t.all('SELECT id, version, status, sent_at FROM annual_declaration WHERE school_id = ? AND school_year_id = ? ORDER BY version DESC', d.school_id, d.school_year_id);
    await mlog(t, a, req, 'ministere.declaration', { school_id: d.school_id, type: 'annual_declaration', id: d.id, detail: `${d.year_label} v${d.version}` });
    secEvent(ctx, req, a, d.school_id, 'declaration');
    return { ...declOut(d), ecole: d.ecole, ecole_id: Number(d.school_id), dossier: JSON.parse(d.payload), signature: await verifyDeclaration(ctx.db, d),
      evenements: await events(t, d.id), versions: versions.map((v) => ({ id: Number(v.id), version: Number(v.version), statut: v.status, le: v.sent_at })) };
  }, { auth: true }],
  ['GET', /^\/api\/ministere\/declarations\/(\d+)\/pdf$/, async (t, req, a, [id], ctx) => {
    const d = await t.get('SELECT id, school_id, year_label, version, pdf FROM annual_declaration WHERE id = ?', int(id));
    if (!d) notFound();
    await mlog(t, a, req, 'ministere.declaration.pdf', { school_id: d.school_id, type: 'annual_declaration', id: d.id });
    secEvent(ctx, req, a, d.school_id, 'declaration.pdf');
    return { __pdf: Buffer.from(d.pdf, 'base64'), filename: `declaration-${d.year_label}-v${d.version}.pdf` };
  }, { auth: true }],
  ['POST', /^\/api\/ministere\/declarations\/(\d+)\/(accuser|correction)$/, async (t, req, a, [id, op], ctx) => {
    const note = noteOf(req.body, op === 'correction');
    const d = await t.get('SELECT id, school_id, year_label, version, status FROM annual_declaration WHERE id = ?', int(id));
    if (!d) notFound();
    if (d.status !== 'envoyee') throw new HttpError(409, 'déclaration déjà traitée');
    const status = op === 'accuser' ? 'recue' : 'correction_demandee';
    const r = await t.run('UPDATE annual_declaration SET status = ?, ministry_by = ?, ministry_at = ?, ministry_note = ? WHERE id = ? AND status = ?', status, a.id, iso(), note, d.id, 'envoyee');
    if (!r.changes) throw new HttpError(409, 'déclaration déjà traitée');
    await t.run('INSERT INTO declaration_event (declaration_id, school_id, kind, actor, ministry_account_id, note) VALUES (?,?,?,?,?,?)', d.id, d.school_id, op === 'accuser' ? 'accuse' : 'correction', 'ministere', a.id, note);
    await mlog(t, a, req, `ministere.declaration.${op}`, { school_id: d.school_id, type: 'annual_declaration', id: d.id, detail: note });
    await schoolTrace(t, a, d.school_id, `ministere.declaration.${op}`, 'annual_declaration', d.id, `${d.year_label} v${d.version}${note ? ` : ${note}` : ''}`);
    const [fr, ht] = op === 'accuser' ? [`Déclaration ${d.year_label} reçue par le ministère`, `Ministè a resevwa deklarasyon ${d.year_label} la`]
      : [`Le ministère demande une correction de la déclaration ${d.year_label}`, `Ministè a mande korije deklarasyon ${d.year_label} la`];
    await notifyDirection(ctx.db, d.school_id, `declaration.${status}`, d.id, fr, ht);
    secEvent(ctx, req, a, d.school_id, `declaration.${op}`);
    return { id: Number(d.id), statut: status };
  }, { auth: true }],

  // Transferts en attente de l'autorisation du ministère (NORIA_TRANSFERT_MINISTERE=1).
  ['GET', /^\/api\/ministere\/transferts$/, async (t, req, a, _m, ctx) => {
    if (!T.ministereActive(ctx)) return { actif: false, transferts: [] };
    const list = await T.pendingMinistry(ctx.db, ctx);
    await mlog(t, a, req, 'ministere.transferts', { detail: `${list.length} en attente` });
    secEvent(ctx, req, a, null, 'transferts');
    return { actif: true, transferts: list };
  }, { auth: true }],
  ['POST', /^\/api\/ministere\/transferts\/(\d+)$/, async (t, req, a, [id], ctx) => {
    if (!T.ministereActive(ctx)) throw new HttpError(404, 'étape ministère désactivée (NORIA_TRANSFERT_MINISTERE=0)');
    const b = req.body || {};
    const next = await T.ministryDecision(ctx.db, ctx, req, id, b, { who: `ministère (${a.display_name}, compte n° ${a.id})`, account: a });
    await mlog(t, a, req, 'ministere.transfert', { school_id: next.from_school_id, type: 'transfer', id: next.id, detail: `${b.decision}${b.motif ? ` : ${String(b.motif).slice(0, 300)}` : ''} (Ed25519, clé ${next.ministry_key_id})` });
    secEvent(ctx, req, a, next.from_school_id, `transfert.${b.decision}`);
    return { id: Number(next.id), statut: next.status, cle: next.ministry_key_id };
  }, { auth: true }],

  // Vérification d'un document (relevé, badge, certificat de transfert, bulletin, reçu) par code ou lien du QR.
  ['POST', /^\/api\/ministere\/verifier$/, async (t, req, a, _m, ctx) => {
    let v = String((req.body || {}).valeur || '').trim().slice(0, 300);
    const h = v.match(/#verifier=([A-Za-z0-9-]{1,40})/) || v.match(/\/verifier\/([A-Za-z0-9-]{1,40})/);
    if (h) v = h[1];
    v = v.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(v)) throw new HttpError(400, 'code de vérification invalide');
    const keys = [`min-verif:${a.id}`];
    if (await ctx.ministryVerifyLimit.blocked(keys)) throw new HttpError(429, 'trop de vérifications, réessayez plus tard');
    const r = await require('./scolaire').verifyDocument(ctx.db, v);
    if (!r) await ctx.ministryVerifyLimit.fail(keys);
    await mlog(t, a, req, 'ministere.verification', { type: r ? r.type : null, id: v.slice(0, 4), detail: r ? `${r.type} : ${r.statut || (r.authentique ? 'authentique' : 'invalide')}` : 'aucun document', outcome: r ? 'ok' : 'introuvable' });
    secEvent(ctx, req, a, null, 'verification');
    return r ? { trouve: true, ...r } : { trouve: false };
  }, { auth: true }],
  ['GET', /^\/api\/ministere\/journal$/, async (t, req, a) => ({
    journal: await t.all('SELECT action, school_id, record_type, record_id, detail, outcome, created_at FROM ministry_audit WHERE account_id = ? ORDER BY id DESC LIMIT 200', a.id),
  }), { auth: true }],
];

function parseToken(req, parseCookies) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return { token: h.slice(7), cookie: false };
  const c = parseCookies(req.headers.cookie)[COOKIE];
  return { token: c || null, cookie: !!c };
}
async function dispatch(db, req, url, ctx, parseCookies) {
  const { token, cookie } = parseToken(req, parseCookies);
  if (cookie && !['GET', 'HEAD'].includes(req.method) && req.headers['x-noria'] !== '1') throw new HttpError(403, 'en-tête x-noria manquant');
  req.minToken = token;
  for (const [method, re, handler, opts = {}] of ROUTES) {
    const m = url.pathname.match(re);
    if (!m || method !== req.method) continue;
    if (!opts.auth) return handler(db, req, null, m.slice(1), ctx);
    const acc = await loadAccount(db, token);
    if (!acc) throw new HttpError(401, 'connexion du ministère requise');
    req.ministry = acc;
    return db.asMinistry(acc.id, (t) => handler(t, req, acc, m.slice(1), ctx));
  }
  throw new HttpError(404, 'introuvable');
}

/* ---------- Super-admin : comptes du ministère ---------- */
function adminRoutes({ log }) {
  const gate = (ctx) => { if (!enabled(ctx)) throw new HttpError(404, 'introuvable'); };
  const reason = (b) => { const r = String((b && b.reason) || '').trim(); if (r.length < 3 || r.length > 300) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)'); return r; };
  return [
    ['GET', /^\/api\/admin\/ministere\/comptes$/, async (db, req, a, _m, ctx) => {
      gate(ctx);
      const rows = await db.all(`SELECT m.id, m.email, m.phone, m.display_name, m.title, m.state, m.state_reason, m.created_at,
        (SELECT MAX(created_at) FROM ministry_audit x WHERE x.account_id = m.id AND x.action = 'ministere.login' AND x.outcome = 'ok') AS derniere_connexion,
        (SELECT COUNT(*) FROM ministry_audit x WHERE x.account_id = m.id) AS consultations FROM ministry_account m ORDER BY m.id`);
      return { comptes: rows, transferts: T.ministereActive(ctx) };
    }, { auth: true }],
    ['POST', /^\/api\/admin\/ministere\/comptes$/, async (db, req, a, _m, ctx) => {
      gate(ctx);
      const b = req.body || {}; const why = reason(b);
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new HttpError(400, 'e-mail invalide');
      const name = String(b.name || '').trim();
      if (name.length < 2 || name.length > 120) throw new HttpError(400, 'nom obligatoire (120 caractères au plus)');
      const phone = b.phone ? normalizePhone(b.phone) : null;
      if (b.phone && !phone) throw new HttpError(400, 'téléphone invalide');
      const title = String(b.title || '').trim().slice(0, 120) || null;
      const id = await db.tx(async (t) => {
        const mid = await t.insert('INSERT INTO ministry_account (email, phone, display_name, title, created_by_admin) VALUES (?,?,?,?,?)', email, phone, name, title, a.id);
        await log(t, a, 'admin.ministere.compte.creer', `min:${mid}`, `${name} — ${why}`, 'ok', req.ip);
        return mid;
      });
      return { id, email, display_name: name, state: 'actif' };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/ministere\/comptes\/(\d+)\/(desactiver|reactiver)$/, async (db, req, a, [id, op], ctx) => {
      gate(ctx);
      const why = reason(req.body);
      const r = await db.run('UPDATE ministry_account SET state = ?, state_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', op === 'desactiver' ? 'desactive' : 'actif', why, Number(id));
      if (!r.changes) throw new HttpError(404, 'introuvable');
      if (op === 'desactiver') await db.run('DELETE FROM ministry_session WHERE account_id = ?', Number(id));
      await log(db, a, `admin.ministere.compte.${op}`, `min:${id}`, why, 'ok', req.ip);
      return { id: Number(id), state: op === 'desactiver' ? 'desactive' : 'actif' };
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/ministere\/journal$/, async (db, req, a, _m, ctx) => {
      gate(ctx);
      return { journal: await db.all(`SELECT x.id, x.account_id, m.display_name, x.action, x.school_id, s.name AS ecole, x.record_type, x.record_id, x.detail, x.outcome, x.ip, x.created_at
        FROM ministry_audit x JOIN ministry_account m ON m.id = x.account_id LEFT JOIN school s ON s.id = x.school_id ORDER BY x.id DESC LIMIT 300`) };
    }, { auth: true }],
  ];
}

module.exports = { sendDeclaration, enabled, GATED, dispatch, schoolRoutes, adminRoutes, classStats, totals, buildPayload, verifyDeclaration, declMessage, COOKIE, loadAccount };
