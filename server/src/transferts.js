'use strict';
// Bloc 4 : lien entre écoles.
//   1. Vérification d'un élève qui s'inscrit (direction, secrétariat de l'école d'accueil) : code élève ET date de
//      naissance obligatoires, résultat minimal sans aucune note, limite de débit dédiée, tout au journal.
//   2. Signalements posés et levés par l'école (catégorie visible des autres écoles, texte court réservé aux directions)
//      et décision de fin d'année par élève (direction).
//   3. Transfert de dossier : demande (avec consentement du parent : case et nom, ou code envoyé au parent rattaché),
//      examen et approbation signée (image de signature + Ed25519 de la demande) ou refus motivé par l'école d'origine,
//      étape « ministère » prévue (NORIA_TRANSFERT_MINISTERE=0 par défaut), copie du dossier vers l'école d'accueil,
//      archive en lecture seule et élève « transféré » à l'origine, certificat PDF vérifiable.
// Cloisonnement : les tables transfer et transfer_event sont refusées au rôle applicatif (PostgreSQL) ; toute lecture
// d'une autre école passe par les fonctions de ce fichier (connexion système), qui ne renvoient que le strict minimum.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse, isUnique } = require('./common');
const K = require('./cles');
const S = require('./scolaire');
const otp = require('./otp');
const { maskAccount } = require('./securite');
const { certificatePdf, day } = require('./pdf-transfert');
const emailsEleves = require('./emails-eleves');

const ACTIFS = ['demande', 'consentement', 'approuve_origine', 'approuve_ministere'];
const CLOS = ['transfere', 'refuse', 'annule'];
const CATEGORIES = ['disciplinaire', 'dette', 'document_manquant', 'autre'];
const DECISIONS = ['admis', 'redouble', 'echec'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,30}$/;
const OTP_MIN = 15, OTP_MAX_SENT = 3;
const D = 86400e3;
// Délais d'expiration par statut, en jours (NORIA_TRANSFERT_DELAIS='{"demande":3,…}').
const DEFAULT_DELAIS = { demande: 3, consentement: 14, approuve_origine: 30 };

// Machine à états : statut → statut suivant → acteurs autorisés. ministere : étape exigée pour CE transfert.
const MACHINE = {
  demande: { consentement: ['accueil'], annule: ['accueil', 'systeme'] },
  consentement: { approuve_origine: ['origine'], refuse: ['origine'], annule: ['accueil', 'systeme'] },
  approuve_origine: { approuve_ministere: ['ministere'], transfere: ['systeme'], refuse: ['ministere'], annule: ['accueil', 'systeme'] },
  approuve_ministere: { transfere: ['systeme'] },
  transfere: {}, refuse: {}, annule: {},
};
function canTransition(from, to, actor, { ministere = false } = {}) {
  const who = (MACHINE[from] || {})[to];
  if (!who || !who.includes(actor)) return false;
  if (from === 'approuve_origine' && to === 'transfere' && ministere) return false; // le ministère doit d'abord valider
  if (from === 'approuve_origine' && (to === 'approuve_ministere' || to === 'refuse') && !ministere) return false; // étape désactivée
  return true;
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const text = (v, max, label, required) => {
  const s = String(v ?? '').trim();
  if (!s && required) throw new HttpError(400, `${label} obligatoire`);
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`);
  if (/[\u0000-\u001f<>]/.test(s)) throw new HttpError(400, `${label} : caractères interdits`);
  return s || null;
};
const normCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const envOf = (ctx) => (ctx && ctx.env) || process.env;
const ministereActive = (ctx) => String(envOf(ctx).NORIA_TRANSFERT_MINISTERE || '0') === '1';
// Bloc 6 : portail du ministère actif (NORIA_MINISTERE=1) → l'étape ministère est jouée par un compte « ministere »
// (signée par la clé du ministère) et non plus par le super-admin.
const portailMinistere = (ctx) => String(envOf(ctx).NORIA_MINISTERE || '0') === '1';
function delais(ctx) {
  let o = {};
  try { o = envOf(ctx).NORIA_TRANSFERT_DELAIS ? JSON.parse(envOf(ctx).NORIA_TRANSFERT_DELAIS) : {}; } catch { o = {}; }
  const out = { ...DEFAULT_DELAIS };
  for (const k of Object.keys(DEFAULT_DELAIS)) if (Number(o[k]) > 0) out[k] = Number(o[k]);
  return out;
}
function birthOf(b) {
  const s = String((b && (b.birth_date ?? b.date_naissance)) || '').trim();
  if (!s) throw new HttpError(400, 'date de naissance obligatoire');
  if (!DAY.test(s)) throw new HttpError(400, 'date de naissance invalide (AAAA-MM-JJ)');
  return s;
}
function codeOf(b) {
  const c = normCode(b && b.code);
  if (!CODE_RE.test(c)) throw new HttpError(400, 'code élève invalide');
  return c;
}

// Message signé par l'école d'origine : identifie la demande, l'élève, les deux écoles, le consentement et la date.
const requestPayload = (t) => ['NORIA-TRANSFERT', 'v1', t.id, t.student_code, t.from_school_id, t.from_student_id, t.to_school_id,
  t.consent_mode, t.consent_parent || '', t.consent_to || '', t.consent_at || '', t.created_at, t.origin_at].join('|');
const certMessage = (code, sha) => Buffer.from(`NORIA-CERT-TRANSFERT|v1|${code}|${sha}`, 'utf8');
// Décision du ministère signée (bloc 6) : demande (empreinte signée par l'origine), décision, compte, date.
const ministryMessage = (t, decision, accountId, at) => Buffer.from(['NORIA-TRANSFERT-MINISTERE', 'v1', t.id, t.payload_sha256, decision, accountId, at].join('|'), 'utf8');
async function verifyMinistry(sys, t) {
  if (!t.ministry_signature) return null; // décision non signée (super-admin, avant le bloc 6) ou étape non requise
  const k = await K.ministryPublicKey(sys, t.ministry_key_id);
  const decision = t.status === 'refuse' ? 'refuser' : 'approuver';
  return !!k && t.ministry_payload_sha256 === t.payload_sha256
    && K.verify(k.publicKey, ministryMessage(t, decision, t.ministry_account_id, t.ministry_at), t.ministry_signature);
}
async function verifyRequest(sys, t) {
  if (!t.signature) return false;
  const k = await K.publicKey(sys, t.from_school_id);
  const payload = requestPayload(t);
  return !!k && k.keyId === t.key_id && sha256(payload) === t.payload_sha256 && K.verify(k.publicKey, Buffer.from(payload, 'utf8'), t.signature);
}

/* ---------- Vérification d'un élève (lecture minimale entre écoles) ---------- */
// Élève désigné par le code ET la date de naissance de sa fiche dans l'école qui détient le code. Sinon : null
// (même réponse que pour un code inconnu : la base ne se parcourt pas).
async function lookup(sys, code, birth) {
  const owner = await sys.get('SELECT school_id FROM student_code WHERE code = ?', code);
  if (!owner) return null;
  const rows = await sys.all(`SELECT st.id, st.school_id, st.first_name, st.last_name, st.birth_date, st.sex, st.status, st.transferred_at, s.name AS school, s.initials
    FROM student st JOIN school s ON s.id = st.school_id WHERE st.code = ? ORDER BY st.id`, code);
  const cur = rows.find((r) => Number(r.school_id) === Number(owner.school_id));
  if (!cur || cur.birth_date !== birth) return null;
  return { code, cur, rows };
}
async function lastClass(sys, schoolId, studentId) {
  const e = await sys.get(`SELECT e.status, c.name AS class_name, y.label AS year FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
    JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id WHERE e.school_id = ? AND e.student_id = ? ORDER BY e.id DESC LIMIT 1`, schoolId, studentId);
  if (e) return { classe: e.class_name, annee: e.year, actif: e.status === 'actif' };
  const h = await sys.get("SELECT label, year_label FROM student_history WHERE school_id = ? AND student_id = ? AND kind = 'classe' ORDER BY id DESC LIMIT 1", schoolId, studentId);
  return h ? { classe: h.label, annee: h.year_label, actif: false } : null;
}
// Résultat minimal : jamais de note, de moyenne, de santé, de famille, de parent ni d'identifiant interne.
async function minimal(sys, info, u) {
  const { cur, rows, code } = info;
  const lc = await lastClass(sys, cur.school_id, cur.id);
  const statut = cur.status === 'transfere' ? 'transfere' : lc && lc.actif ? 'inscrit' : 'sorti';
  let dec = await sys.get(`SELECT d.decision, y.label AS year FROM year_decision d JOIN school_year y ON y.id = d.school_year_id AND y.school_id = d.school_id
    WHERE d.school_id = ? AND d.student_id = ? ORDER BY y.label DESC, d.id DESC LIMIT 1`, cur.school_id, cur.id);
  if (!dec) {
    const h = await sys.get("SELECT label AS decision, year_label AS year FROM student_history WHERE school_id = ? AND student_id = ? AND kind = 'decision' ORDER BY year_label DESC, id DESC LIMIT 1", cur.school_id, cur.id);
    if (h) dec = h;
  }
  const dir = P.has(u, 'direction');
  const flags = [];
  for (const r of rows.filter((x) => Number(x.school_id) !== Number(u.school_id))) {
    for (const f of await sys.all('SELECT category, flagged_on, note FROM student_flag WHERE school_id = ? AND student_id = ? AND lifted_on IS NULL ORDER BY id', r.school_id, r.id))
      flags.push({ categorie: f.category, date: f.flagged_on, ecole: r.school, ...(dir && f.note ? { texte: f.note } : {}) });
  }
  const prev = rows.filter((r) => r.status === 'transfere').sort((a, b) => String(b.transferred_at).localeCompare(String(a.transferred_at)))[0];
  const busy = await sys.get(`SELECT id FROM transfer WHERE student_code = ? AND status IN (${ACTIFS.map(() => '?').join(',')})`, code, ...ACTIFS);
  return {
    existe: true,
    eleve: { prenom: cur.first_name, nom: `${String(cur.last_name || '').slice(0, 1)}.` },
    ecole: { nom: cur.school, initiales: cur.initials, actuelle: statut === 'inscrit' },
    statut, derniere_classe: lc ? lc.classe : null, annee: lc ? lc.annee : null,
    decision: dec ? { valeur: dec.decision, annee: dec.year } : null,
    signalements: flags,
    precedente: prev ? { ecole: prev.school, statut: 'transfere', date: String(prev.transferred_at || '').slice(0, 10) } : null,
    meme_ecole: Number(cur.school_id) === Number(u.school_id),
    transfert_en_cours: !!busy,
  };
}

/* ---------- Transitions, journal, notifications ---------- */
const TITRES = {
  demande: ['Demande de transfert créée', 'Demann transfè kreye'],
  consentement: ['Transfert : consentement du parent reçu', 'Transfè : paran an bay konsantman'],
  approuve_origine: ["Transfert approuvé par l'école d'origine", 'Lekòl orijin nan apwouve transfè a'],
  approuve_ministere: ['Transfert approuvé par le ministère', 'Ministè a apwouve transfè a'],
  transfere: ['Dossier transféré', 'Dosye a transfere'],
  refuse: ['Transfert refusé', 'Transfè refize'],
  annule: ['Transfert annulé', 'Transfè anile'],
};
async function staff(db, schoolId, roles) {
  return (await db.all(`SELECT DISTINCT u.id FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
    WHERE u.school_id = ? AND u.state = 'actif' AND r.role IN (${roles.map(() => '?').join(',')})`, schoolId, ...roles)).map((r) => r.id);
}
// Notification du portail à chaque étape : direction et secrétariat de l'accueil ; direction de l'origine (dès qu'elle a à agir).
async function notifyStep(db, t) {
  const [fr, ht] = TITRES[t.status];
  const ids = [[t.to_school_id, await staff(db, t.to_school_id, ['direction', 'secretariat'])]];
  if (t.status !== 'demande') ids.push([t.from_school_id, await staff(db, t.from_school_id, ['direction'])]);
  for (const [sid, list] of ids) for (const uid of list)
    await db.insert('INSERT INTO notification (school_id, user_id, kind, ref, title_fr, title_ht) VALUES (?,?,?,?,?,?)', sid, uid, `transfert.${t.status}`, String(t.id), fr, ht);
}
// Journal des deux écoles : l'acteur est nommé dans la sienne ; l'autre voit « par l'école … ».
async function auditBoth(db, t, u, action, reason, who) {
  for (const sid of [t.to_school_id, t.from_school_id]) {
    const mine = u && Number(u.school_id) === Number(sid);
    const by = mine ? '' : `[par ${who || (u ? `école n° ${u.school_id}, compte n° ${u.id}` : 'NORIA (automatique)')}] `;
    await audit(db, { school_id: sid, id: mine ? u.id : null }, action, 'transfer', t.id, `${by}${reason || ''}`.slice(0, 500));
  }
}
const getTr = (db, id) => db.get('SELECT * FROM transfer WHERE id = ?', id);
async function transition(db, ctx, t, to, actor, u, reason, extra = {}, who = null) {
  if (!canTransition(t.status, to, actor, { ministere: !!Number(t.ministry_required) })) throw new HttpError(409, `transition interdite (${t.status} → ${to})`);
  const dl = delais(ctx);
  const sets = { status: to, updated_at: iso(), ...extra };
  if (dl[to]) sets.expires_at = iso(dl[to] * D);
  if (CLOS.includes(to)) sets.closed_at = iso();
  const keys = Object.keys(sets);
  const r = await db.run(`UPDATE transfer SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND status = ?`, ...keys.map((k) => sets[k]), t.id, t.status);
  if (!r.changes) throw new HttpError(409, 'transfert modifié entre-temps : rechargez la page');
  await db.run('INSERT INTO transfer_event (transfer_id, from_status, to_status, actor, school_id, user_id, reason) VALUES (?,?,?,?,?,?,?)',
    t.id, t.status, to, actor, u ? u.school_id : null, u ? u.id : null, reason ? String(reason).slice(0, 300) : null);
  await auditBoth(db, t, u, `transfert.${to}`, reason, who);
  const next = await getTr(db, t.id);
  await notifyStep(db, next);
  return next;
}
// Délais dépassés : annulation automatique (journalisée, notifiée).
async function expireDue(sys, ctx) {
  const st = Object.keys(DEFAULT_DELAIS);
  const rows = await sys.all(`SELECT * FROM transfer WHERE status IN (${st.map(() => '?').join(',')}) AND expires_at < ?`, ...st, iso());
  for (const t of rows) {
    try { await sys.tx((x) => transition(x, ctx, t, 'annule', 'systeme', null, `délai expiré (${t.status})`, { cancel_reason: `Délai expiré (${t.status})` })); }
    catch (e) { if (!(e instanceof HttpError)) throw e; }
  }
  return rows.length;
}

/* ---------- Consentement par code (parent rattaché à l'école d'origine) ---------- */
async function parentContact(sys, schoolId, studentId) {
  const rows = await sys.all(`SELECT u.phone, u.email FROM parent_link pl JOIN app_user u ON u.id = pl.parent_user_id AND u.school_id = pl.school_id
    WHERE pl.school_id = ? AND pl.student_id = ? AND u.state <> 'desactive' ORDER BY pl.id`, schoolId, studentId);
  return rows.map((x) => x.phone || (x.email && !x.email.endsWith('@telephone.invalid') ? x.email : null)).find(Boolean) || null;
}

/* ---------- Copie du dossier et certificat ---------- */
async function schoolDoc(sys, id) {
  const s = await sys.get('SELECT id, name, initials, address, email, phone, motto, logo, signature, signature_name, default_lang FROM school WHERE id = ?', id);
  const img = (v) => (v ? Buffer.from(v, 'base64') : null);
  return { ...s, initials: s.initials || s.name.slice(0, 3).toUpperCase(), logo: img(s.logo), signature: img(s.signature) };
}
async function copyDossier(t, tr, st, sid, fromName) {
  const A = tr.from_school_id;
  const n = { classes: 0, decisions: 0, notes: 0, releves: 0 };
  const key = { classe: 'classes', decision: 'decisions', note: 'notes', releve: 'releves' };
  const ins = async (kind, src, srcId, year, label, data) => {
    n[key[kind]]++;
    await t.insert(`INSERT INTO student_history (school_id, student_id, transfer_id, kind, source_school, source_school_id, year_label, label, data)
      VALUES (?,?,?,?,?,?,?,?,?)`, tr.to_school_id, sid, tr.id, kind, src, srcId, year, label, typeof data === 'string' ? data : JSON.stringify(data));
  };
  // Dossier déjà reçu par l'école d'origine lors d'un transfert précédent : transmis tel quel (école source conservée).
  for (const h of await t.all('SELECT kind, source_school, source_school_id, year_label, label, data FROM student_history WHERE school_id = ? AND student_id = ? ORDER BY id', A, st.id))
    await ins(h.kind, h.source_school, h.source_school_id, h.year_label, h.label, h.data);
  for (const e of await t.all(`SELECT e.status, e.created_at, c.name, y.label FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
    JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id WHERE e.school_id = ? AND e.student_id = ? ORDER BY e.id`, A, st.id))
    await ins('classe', fromName, A, e.label, e.name, { statut: e.status === 'actif' ? 'transfere' : e.status, inscrit_le: String(e.created_at).slice(0, 10) });
  for (const d of await t.all(`SELECT d.decision, d.decided_at, y.label FROM year_decision d JOIN school_year y ON y.id = d.school_year_id AND y.school_id = d.school_id
    WHERE d.school_id = ? AND d.student_id = ? ORDER BY y.label`, A, st.id))
    await ins('decision', fromName, A, d.label, d.decision, { decide_le: String(d.decided_at).slice(0, 10) });
  for (const g of await t.all(`SELECT s.name AS subject, ev.title, ev.day, ev.max_score, ev.coefficient, g.score, g.mention, tm.name AS term, y.label
    FROM grade g JOIN evaluation ev ON ev.id = g.evaluation_id AND ev.school_id = g.school_id JOIN subject s ON s.id = ev.subject_id AND s.school_id = ev.school_id
    JOIN term tm ON tm.id = ev.term_id AND tm.school_id = ev.school_id JOIN school_year y ON y.id = tm.school_year_id AND y.school_id = tm.school_id
    WHERE g.school_id = ? AND g.student_id = ? AND ev.status = 'publiee' ORDER BY y.label, tm.position, s.name, ev.day, ev.id`, A, st.id))
    await ins('note', fromName, A, g.label, g.subject, { periode: g.term, evaluation: g.title, date: g.day, note: g.score == null ? null : Number(g.score), sur: Number(g.max_score), coefficient: Number(g.coefficient), mention: g.mention });
  for (const r of await t.all(`SELECT t.scope, t.code, t.issued_at, t.sha256, t.signature, t.key_id, t.pdf, tm.name AS term, ty.label AS term_year, y.label AS year
    FROM transcript t LEFT JOIN term tm ON tm.id = t.term_id AND tm.school_id = t.school_id LEFT JOIN school_year ty ON ty.id = tm.school_year_id AND ty.school_id = tm.school_id
    LEFT JOIN school_year y ON y.id = t.school_year_id AND y.school_id = t.school_id WHERE t.school_id = ? AND t.student_id = ? AND t.status = 'emis' ORDER BY t.id`, A, st.id))
    await ins('releve', fromName, A, r.year || r.term_year, r.scope === 'periode' ? `${r.term} ${r.term_year}` : `Année scolaire ${r.year}`,
      { code: r.code, emis_le: r.issued_at, sha256: r.sha256, signature: r.signature, key_id: r.key_id, ecole_id: A, pdf: r.pdf });
  return n;
}
// Approbation finale : vérifie la signature de la demande, copie le dossier, archive l'origine, émet le certificat.
async function finalize(sys, ctx, req, t) {
  if (!(await verifyRequest(sys, t))) {
    await auditBoth(sys, t, null, 'transfert.signature_invalide', 'signature Ed25519 de la demande invalide : transfert bloqué');
    throw new HttpError(409, 'signature de la demande invalide : transfert bloqué');
  }
  const base = S.publicUrl(req, ctx);
  const from = await schoolDoc(sys, t.from_school_id), to = await schoolDoc(sys, t.to_school_id);
  const keys = await K.schoolKeys(sys, t.from_school_id);
  const code = `T${S.verifyCode()}`; const at = iso();
  return sys.tx(async (x) => {
    const st = await x.get('SELECT * FROM student WHERE id = ? AND school_id = ?', t.from_student_id, t.from_school_id);
    const owner = await x.get('SELECT school_id FROM student_code WHERE code = ?', t.student_code);
    if (!st || st.status !== 'actif' || !owner || Number(owner.school_id) !== Number(t.from_school_id)) throw new HttpError(409, 'dossier de l’élève indisponible à l’origine');
    const lc = await lastClass(x, t.from_school_id, st.id);
    // 1. Identité dans l'école d'accueil (élève qui revient : sa fiche archivée est réactivée). Le code élève la suit.
    const back = await x.get('SELECT id FROM student WHERE school_id = ? AND code = ?', t.to_school_id, t.student_code);
    let sid;
    if (back) {
      sid = back.id;
      await x.run("UPDATE student SET status = 'actif', first_name = ?, last_name = ?, birth_date = ?, sex = ?, transferred_at = NULL, transfer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?",
        st.first_name, st.last_name, st.birth_date, st.sex, t.id, sid, t.to_school_id);
    } else {
      sid = await x.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex, transfer_id) VALUES (?,?,?,?,?,?,?)',
        t.to_school_id, t.student_code, st.first_name, st.last_name, st.birth_date, st.sex, t.id);
    }
    await x.run('UPDATE student_code SET school_id = ? WHERE code = ? AND school_id = ?', t.to_school_id, t.student_code, t.from_school_id);
    if (t.to_class_id) await x.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', t.to_school_id, sid, t.to_class_id, `Transfert depuis ${from.name}`);
    // 2. Dossier antérieur (badges exclus).
    const summary = await copyDossier(x, t, st, sid, from.name);
    // 3. Archive à l'origine : lecture seule, inscription « transfere », badges révoqués.
    await x.run("UPDATE enrollment SET status = 'transfere', reason = ?, updated_at = CURRENT_TIMESTAMP WHERE school_id = ? AND student_id = ? AND status = 'actif'", `Transfert vers ${to.name}`, t.from_school_id, st.id);
    await x.run("UPDATE badge SET status = 'revoque', revoked_at = ?, revoked_reason = ? WHERE school_id = ? AND student_id = ? AND status = 'valide'", at, 'Élève transféré', t.from_school_id, st.id);
    await x.run("UPDATE student SET status = 'transfere', transferred_at = ?, transfer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", at, t.id, st.id, t.from_school_id);
    // 3 bis. Adresse e-mail NORIA de l'élève (bloc 7) : elle le suit ou reste redirigée (voir emails-eleves.js).
    if (emailsEleves.enabled(ctx)) await emailsEleves.onTransfer(x, ctx, t, sid);
    // 4. Certificat (signé par l'école d'origine).
    const pdf = certificatePdf({
      from: { ...from, signature: t.origin_signature_image ? Buffer.from(t.origin_signature_image, 'base64') : from.signature }, to,
      student: `${st.first_name} ${st.last_name}`, studentCode: t.student_code, birthDate: st.birth_date, lastClass: lc && lc.classe, lastYear: lc && lc.annee,
      requestedAt: String(t.created_at), consent: { mode: t.consent_mode, parent: t.consent_parent, to: t.consent_to, at: t.consent_at },
      originAt: t.origin_at, originName: t.origin_name, keyId: t.key_id, ministry: t.ministry_at ? { at: t.ministry_at, keyId: t.ministry_key_id || null } : null,
      transferredAt: at, summary, code: `T-${S.fmtCode(code.slice(1))}`, verifyUrl: `${base}/#verifier=${code}`, requestSha: t.payload_sha256,
    });
    const csha = sha256(pdf);
    return transition(x, ctx, t, 'transfere', 'systeme', null, `dossier copié : ${summary.classes} classe(s), ${summary.decisions} décision(s), ${summary.notes} note(s), ${summary.releves} relevé(s)`,
      { to_student_id: sid, code, certificate: pdf.toString('base64'), certificate_sha256: csha, certificate_signature: K.sign(keys.privateKey(), certMessage(code, csha)), summary: JSON.stringify(summary) });
  });
}

/* ---------- Présentation ---------- */
const LIST = `SELECT t.*, a.name AS from_name, a.initials AS from_initials, b.name AS to_name, b.initials AS to_initials, st.first_name, st.last_name, c.name AS to_class
  FROM transfer t JOIN school a ON a.id = t.from_school_id JOIN school b ON b.id = t.to_school_id
  JOIN student st ON st.id = t.from_student_id AND st.school_id = t.from_school_id LEFT JOIN class c ON c.id = t.to_class_id AND c.school_id = t.to_school_id`;
function out(r, u) {
  const recu = Number(r.from_school_id) === Number(u.school_id);
  return {
    id: r.id, sens: recu ? 'recu' : 'envoye', statut: r.status, code_eleve: r.student_code,
    eleve: recu ? `${r.first_name} ${r.last_name}` : `${r.first_name} ${String(r.last_name).slice(0, 1)}.`,
    eleve_id: recu ? r.from_student_id : r.to_student_id,
    ecole_origine: r.from_name, ecole_accueil: r.to_name, classe_accueil: recu ? undefined : r.to_class,
    motif: r.motive, consentement: { mode: r.consent_mode, parent: r.consent_parent, destinataire: r.consent_to, le: r.consent_at },
    cree_le: day(r.created_at), expire_le: CLOS.includes(r.status) ? null : day(r.expires_at),
    approuve_le: r.origin_at ? day(r.origin_at) : null, signataire: r.origin_name, cle: r.key_id, ministere: !!Number(r.ministry_required), ministere_le: r.ministry_at,
    motif_refus: r.decision_reason, motif_annulation: r.cancel_reason, termine_le: r.closed_at,
    certificat: r.code ? `T-${S.fmtCode(r.code.slice(1))}` : null, resume: r.summary ? JSON.parse(r.summary) : null,
  };
}
const mine = async (sys, u, id) => {
  const r = await sys.get(`${LIST} WHERE t.id = ? AND (t.from_school_id = ? OR t.to_school_id = ?)`, int(id), u.school_id, u.school_id);
  // L'école d'origine ne voit la demande qu'une fois le consentement du parent recueilli.
  if (!r || (Number(r.from_school_id) === Number(u.school_id) && r.status === 'demande')) notFound();
  return r;
};

function createRoutes({ outbox, reqLang, createLimiter }) {
  async function tellParent(sys, ctx, req, t) {
    if (!['transfere', 'refuse'].includes(t.status) || !t.consent_at) return;
    const to = await parentContact(sys, t.from_school_id, t.from_student_id); if (!to) return;
    const a = await sys.get('SELECT name, default_lang FROM school WHERE id = ?', t.from_school_id); const b = await sys.get('SELECT name FROM school WHERE id = ?', t.to_school_id);
    await outbox(sys, ctx, t.from_school_id, to, 'transfert', reqLang(req, a.default_lang), { from: a.name, to: b.name, status: t.status });
  }
  async function sendCode(sys, ctx, req, t) {
    const to = await parentContact(sys, t.from_school_id, t.from_student_id);
    if (!to) throw new HttpError(409, 'aucun parent rattaché joignable : utilisez la case et le nom du parent');
    const code = otp.newCode();
    const a = await sys.get('SELECT name, default_lang FROM school WHERE id = ?', t.from_school_id); const b = await sys.get('SELECT name FROM school WHERE id = ?', t.to_school_id);
    await sys.run('UPDATE transfer SET otp_hash = ?, otp_attempts = 0, otp_expires_at = ?, otp_sent = otp_sent + 1, consent_to = ?, updated_at = ? WHERE id = ? AND status = ?',
      otp.hashCode(code, `transfert${t.id}`), iso(OTP_MIN * 60e3), maskAccount(to), iso(), t.id, 'demande');
    const sent = await outbox(sys, ctx, t.from_school_id, to, 'transfert_code', reqLang(req, a.default_lang), { code, minutes: OTP_MIN, from: a.name, to: b.name }, [code]);
    await auditBoth(sys, t, null, 'transfert.code', `code de consentement envoyé au parent rattaché (${maskAccount(to)}, ${sent.channel} ${sent.envoi})`);
    return { destinataire: maskAccount(to), envoi: sent.envoi };
  }
  const staffOnly = async (ctx, u, action, id) => { if (!P.has(u, 'direction', 'secretariat')) await refuse(ctx, u, action, 'transfer', id, null); };

  const routes = [
    // Vérification d'un élève : code + date de naissance obligatoires ; limite de débit dédiée (compte et école).
    ['POST', /^\/api\/transferts\/recherche$/, async (sys, req, u, _m, ctx) => {
      await staffOnly(ctx, u, 'transfert.recherche', null);
      const b = req.body || {};
      const birth = birthOf(b); const code = codeOf(b);
      const L = ctx.searchLimit;
      const wait = Math.max(await L.user.blocked([`recherche:u:${u.id}`]), await L.school.blocked([`recherche:e:${u.school_id}`]));
      if (wait) {
        await audit(sys, u, 'transfert.recherche', 'student_code', code, 'limite de débit atteinte', 'refuse');
        throw new HttpError(429, 'trop de recherches, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
      }
      await L.user.fail([`recherche:u:${u.id}`]); await L.school.fail([`recherche:e:${u.school_id}`]);
      const info = await lookup(sys, code, birth);
      await audit(sys, u, 'transfert.recherche', 'student_code', code, info ? 'élève trouvé' : 'aucun élève (code ou date de naissance)');
      if (!info) { req.secDetail = 'introuvable'; return { existe: false }; }
      if (Number(info.cur.school_id) !== Number(u.school_id)) {
        const me = await sys.get('SELECT name FROM school WHERE id = ?', u.school_id);
        await audit(sys, { school_id: info.cur.school_id, id: null }, 'transfert.consultation', 'student', info.cur.id, `[par ${me.name}, compte n° ${u.id}] vérification minimale`);
      }
      return minimal(sys, info, u);
    }, { system: true }],

    ['GET', /^\/api\/transferts$/, async (sys, req, u, _m, ctx) => {
      await staffOnly(ctx, u, 'transfert.liste', null);
      await expireDue(sys, ctx);
      const rows = await sys.all(`${LIST} WHERE (t.from_school_id = ? AND t.status <> 'demande') OR t.to_school_id = ? ORDER BY t.id DESC LIMIT 300`, u.school_id, u.school_id);
      return { ministere: ministereActive(ctx), delais: delais(ctx), items: rows.map((r) => out(r, u)) };
    }, { system: true }],

    // Demande de l'école d'accueil, avec le consentement du parent.
    ['POST', /^\/api\/transferts$/, async (sys, req, u, _m, ctx) => {
      await staffOnly(ctx, u, 'transfert.demande', null);
      await expireDue(sys, ctx);
      const b = req.body || {};
      const birth = birthOf(b); const code = codeOf(b);
      const c = b.consentement || {};
      const mode = c.mode === 'otp' ? 'otp' : c.mode === 'case' ? 'case' : null;
      if (!mode) throw new HttpError(400, 'consentement du parent obligatoire (case et nom, ou code)');
      let parent = null;
      if (mode === 'case') {
        parent = text(c.parent, 120, 'nom du parent', true);
        if (parent.length < 3) throw new HttpError(400, 'nom du parent : 3 caractères au moins');
        if (c.accord !== true) throw new HttpError(400, 'case de consentement du parent non cochée');
      }
      const motive = text(b.motif, 300, 'motif', false);
      const info = await lookup(sys, code, birth);
      if (!info) throw new HttpError(404, 'aucun élève ne correspond à ce code et à cette date de naissance');
      if (Number(info.cur.school_id) === Number(u.school_id)) throw new HttpError(409, 'élève déjà inscrit dans votre école');
      if (info.cur.status !== 'actif') throw new HttpError(409, 'dossier indisponible');
      let classId = null;
      if (b.class_id) { const cl = await sys.get('SELECT id FROM class WHERE id = ? AND school_id = ?', int(b.class_id), u.school_id); if (!cl) notFound(); classId = cl.id; }
      if (mode === 'otp' && !(await parentContact(sys, info.cur.school_id, info.cur.id))) throw new HttpError(409, 'aucun parent rattaché joignable : utilisez la case et le nom du parent');
      let t;
      try {
        t = await sys.tx(async (x) => {
          const id = await x.insert(`INSERT INTO transfer (student_code, from_school_id, from_student_id, to_school_id, to_class_id, status, motive, requested_by, consent_mode, consent_parent, expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`, code, info.cur.school_id, info.cur.id, u.school_id, classId, 'demande', motive, u.id, mode, parent, iso(delais(ctx).demande * D));
          const row = await getTr(x, id);
          await x.run('INSERT INTO transfer_event (transfer_id, from_status, to_status, actor, school_id, user_id, reason) VALUES (?,?,?,?,?,?,?)', id, null, 'demande', 'accueil', u.school_id, u.id, motive);
          await auditBoth(x, row, u, 'transfert.demande', `élève ${code}, consentement : ${mode === 'case' ? 'case et nom' : 'code au parent'}${motive ? `, motif : ${motive}` : ''}`);
          await notifyStep(x, row);
          if (mode === 'case') return transition(x, ctx, row, 'consentement', 'accueil', u, `case cochée, parent : ${parent}`, { consent_at: iso(), consent_by: u.id });
          return row;
        });
      } catch (e) { if (isUnique(e)) throw new HttpError(409, 'un transfert est déjà en cours pour cet élève'); throw e; }
      let envoi = null;
      if (mode === 'otp') envoi = await sendCode(sys, ctx, req, t);
      return { ...out(await mine(sys, u, t.id), u), code_envoye: envoi };
    }, { system: true }],

    ['POST', /^\/api\/transferts\/(\d+)\/code$/, async (sys, req, u, [id], ctx) => {
      await staffOnly(ctx, u, 'transfert.code', id);
      await expireDue(sys, ctx);
      const r = await mine(sys, u, id);
      if (Number(r.to_school_id) !== Number(u.school_id)) notFound();
      if (r.status !== 'demande' || r.consent_mode !== 'otp') throw new HttpError(409, 'aucun code attendu pour ce transfert');
      if (r.otp_sent >= OTP_MAX_SENT) throw new HttpError(429, `${OTP_MAX_SENT} codes envoyés au plus : annulez et utilisez la case et le nom du parent`);
      return sendCode(sys, ctx, req, r);
    }, { system: true }],

    ['POST', /^\/api\/transferts\/(\d+)\/consentement$/, async (sys, req, u, [id], ctx) => {
      await staffOnly(ctx, u, 'transfert.consentement', id);
      await expireDue(sys, ctx);
      const r = await mine(sys, u, id);
      if (Number(r.to_school_id) !== Number(u.school_id)) notFound();
      if (r.status !== 'demande' || r.consent_mode !== 'otp' || !r.otp_hash) throw new HttpError(409, `transition interdite (${r.status} → consentement)`);
      const code = String((req.body || {}).code || '').trim();
      if (r.otp_attempts >= otp.MAX_ATTEMPTS || r.otp_expires_at < iso()) throw new HttpError(400, 'code expiré : demandez un nouveau code');
      if (!/^\d{6}$/.test(code) || !otp.checkCode(code, `transfert${r.id}`, r.otp_hash)) {
        await sys.run('UPDATE transfer SET otp_attempts = otp_attempts + 1 WHERE id = ? AND status = ?', r.id, 'demande');
        await audit(sys, u, 'transfert.consentement', 'transfer', r.id, 'code du parent invalide', 'refuse');
        throw new HttpError(400, 'code invalide');
      }
      const next = await sys.tx((x) => transition(x, ctx, r, 'consentement', 'accueil', u, `code reçu par le parent (${r.consent_to})`,
        { consent_at: iso(), consent_by: u.id, consent_parent: `Parent rattaché (${r.consent_to})`, otp_hash: null }));
      return out(await mine(sys, u, next.id), u);
    }, { system: true }],

    // École d'origine : approbation signée ou refus motivé (direction).
    ['POST', /^\/api\/transferts\/(\d+)\/approuver$/, async (sys, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'transfert.approuver', 'transfer', id, null);
      await expireDue(sys, ctx);
      const r = await mine(sys, u, id);
      if (Number(r.from_school_id) !== Number(u.school_id)) notFound();
      // Approbation déjà signée mais copie interrompue (étape ministère désactivée) : la copie est relancée.
      if (r.status === 'approuve_origine' && !Number(r.ministry_required)) {
        const done = await finalize(sys, ctx, req, await getTr(sys, r.id)); await tellParent(sys, ctx, req, done);
        return out(await mine(sys, u, done.id), u);
      }
      if (r.status !== 'consentement') throw new HttpError(409, `transition interdite (${r.status} → approuve_origine)`);
      const sch = await sys.get('SELECT signature, signature_name FROM school WHERE id = ?', u.school_id);
      if (!sch.signature) throw new HttpError(409, 'signature du directeur absente : téléversez-la d’abord (Relevés de notes)');
      const keys = await K.schoolKeys(sys, u.school_id);
      const at = iso();
      const payload = requestPayload({ ...r, origin_at: at });
      const ministere = ministereActive(ctx);
      let next = await sys.tx((x) => transition(x, ctx, r, 'approuve_origine', 'origine', u, `approbation signée (Ed25519, clé ${keys.keyId})${ministere ? ' : en attente du ministère' : ''}`, {
        origin_by: u.id, origin_at: at, origin_name: sch.signature_name || u.display_name, origin_signature_image: sch.signature,
        payload_sha256: sha256(payload), signature: K.sign(keys.privateKey(), Buffer.from(payload, 'utf8')), key_id: keys.keyId, ministry_required: ministere ? 1 : 0,
      }));
      if (!ministere) { next = await finalize(sys, ctx, req, next); await tellParent(sys, ctx, req, next); }
      return out(await mine(sys, u, next.id), u);
    }, { system: true }],
    ['POST', /^\/api\/transferts\/(\d+)\/refuser$/, async (sys, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'transfert.refuser', 'transfer', id, null);
      const why = text((req.body || {}).motif, 300, 'motif du refus', true);
      await expireDue(sys, ctx);
      const r = await mine(sys, u, id);
      if (Number(r.from_school_id) !== Number(u.school_id)) notFound();
      const next = await sys.tx((x) => transition(x, ctx, r, 'refuse', 'origine', u, why, { decision_reason: why }));
      await tellParent(sys, ctx, req, next);
      return out(await mine(sys, u, next.id), u);
    }, { system: true }],
    // École d'accueil : annulation motivée tant que le dossier n'est pas transféré.
    ['POST', /^\/api\/transferts\/(\d+)\/annuler$/, async (sys, req, u, [id], ctx) => {
      await staffOnly(ctx, u, 'transfert.annuler', id);
      const why = text((req.body || {}).motif, 300, 'motif de l’annulation', true);
      await expireDue(sys, ctx);
      const r = await mine(sys, u, id);
      if (Number(r.to_school_id) !== Number(u.school_id)) { await audit(sys, u, 'transfert.annule', 'transfer', r.id, 'école d’origine : annulation interdite (refus motivé)', 'refuse'); forbid(); }
      const next = await sys.tx((x) => transition(x, ctx, r, 'annule', 'accueil', u, why, { cancel_reason: why }));
      return out(await mine(sys, u, next.id), u);
    }, { system: true }],
    ['GET', /^\/api\/transferts\/(\d+)\/certificat$/, async (sys, req, u, [id], ctx) => {
      await staffOnly(ctx, u, 'transfert.certificat', id);
      const r = await mine(sys, u, id);
      if (r.status !== 'transfere') throw new HttpError(409, 'certificat disponible une fois le dossier transféré');
      await audit(sys, u, 'transfert.certificat', 'transfer', r.id, null);
      return { __pdf: Buffer.from(r.certificate, 'base64'), filename: `certificat-transfert-${r.student_code}.pdf` };
    }, { system: true }],

    /* --- Dans l'école (RLS) : signalements, décisions de fin d'année, dossier antérieur reçu --- */
    ['GET', /^\/api\/signalements$/, async (db, req, u) => {
      if (!P.has(u, 'direction', 'secretariat')) forbid();
      const dir = P.has(u, 'direction');
      const rows = await db.all(`SELECT f.id, f.category, f.note, f.flagged_on, f.lifted_on, f.lift_reason, st.code, st.first_name, st.last_name, us.display_name AS by_name
        FROM student_flag f JOIN student st ON st.id = f.student_id AND st.school_id = f.school_id JOIN app_user us ON us.id = f.created_by AND us.school_id = f.school_id
        WHERE f.school_id = ? ORDER BY f.id DESC LIMIT 300`, u.school_id);
      return rows.map((r) => ({ id: r.id, code: r.code, eleve: `${r.first_name} ${r.last_name}`, categorie: r.category, date: r.flagged_on, par: r.by_name,
        texte: dir ? r.note : undefined, leve_le: r.lifted_on, motif_levee: r.lift_reason, actif: !r.lifted_on }));
    }],
    ['POST', /^\/api\/signalements$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'signalement.poser', 'student', null, null);
      const b = req.body || {};
      const st = await db.get('SELECT id, status FROM student WHERE school_id = ? AND code = ?', u.school_id, normCode(b.code));
      if (!st) notFound();
      if (!CATEGORIES.includes(b.categorie)) throw new HttpError(400, `catégorie : ${CATEGORIES.join(', ')}`);
      const day = String(b.date || localDay());
      if (!DAY.test(day) || day > localDay()) throw new HttpError(400, 'date invalide (AAAA-MM-JJ, pas dans le futur)');
      const note = text(b.texte, 200, 'texte court', false);
      const id = await db.insert('INSERT INTO student_flag (school_id, student_id, category, note, flagged_on, created_by) VALUES (?,?,?,?,?,?)', u.school_id, st.id, b.categorie, note, day, u.id);
      await audit(db, u, 'signalement.poser', 'student', st.id, `${b.categorie} au ${day}${note ? ' (texte réservé aux directions)' : ''}`);
      return { id, categorie: b.categorie, date: day };
    }],
    ['POST', /^\/api\/signalements\/(\d+)\/lever$/, async (db, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'signalement.lever', 'student_flag', id, null);
      const why = text((req.body || {}).motif, 200, 'motif de la levée', true);
      const day = String((req.body || {}).date || localDay());
      if (!DAY.test(day) || day > localDay()) throw new HttpError(400, 'date invalide (AAAA-MM-JJ, pas dans le futur)');
      const f = await db.get('SELECT id, student_id, category, flagged_on FROM student_flag WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!f) notFound();
      if (day < f.flagged_on) throw new HttpError(400, 'date de levée antérieure au signalement');
      const r = await db.run('UPDATE student_flag SET lifted_on = ?, lifted_by = ?, lift_reason = ? WHERE id = ? AND school_id = ? AND lifted_on IS NULL', day, u.id, why, f.id, u.school_id);
      if (!r.changes) throw new HttpError(409, 'signalement déjà levé');
      await audit(db, u, 'signalement.lever', 'student', f.student_id, `${f.category} levé le ${day} : ${why}`);
      return { id: f.id, leve_le: day };
    }],
    ['GET', /^\/api\/decisions$/, async (db, req, u) => {
      if (!P.has(u, 'direction', 'secretariat')) forbid();
      const cls = await db.get(`SELECT c.id, c.name, c.school_year_id, y.label FROM class c JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id
        WHERE c.id = ? AND c.school_id = ?`, int(req.query.get('class_id')), u.school_id);
      if (!cls) notFound();
      const rows = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name, d.decision, d.decided_at FROM enrollment e
        JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id
        LEFT JOIN year_decision d ON d.student_id = st.id AND d.school_id = st.school_id AND d.school_year_id = ?
        WHERE e.school_id = ? AND e.class_id = ? AND e.status = 'actif' ORDER BY st.last_name, st.first_name`, cls.school_year_id, u.school_id, cls.id);
      return { classe: cls.name, annee: cls.label, school_year_id: cls.school_year_id, eleves: rows.map((r) => ({ id: r.id, code: r.code, eleve: `${r.first_name} ${r.last_name}`, decision: r.decision, le: r.decided_at ? String(r.decided_at).slice(0, 10) : null })) };
    }],
    ['PUT', /^\/api\/students\/(\d+)\/decision$/, async (db, req, u, [id], ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'decision.fin_annee', 'student', id, null);
      const b = req.body || {};
      if (!DECISIONS.includes(b.decision)) throw new HttpError(400, `décision : ${DECISIONS.join(', ')}`);
      const st = await db.get('SELECT id, status FROM student WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!st) notFound();
      if (st.status === 'transfere') throw new HttpError(409, 'dossier archivé (élève transféré) : lecture seule');
      const y = await db.get('SELECT id, label FROM school_year WHERE id = ? AND school_id = ?', int(b.school_year_id), u.school_id); if (!y) notFound();
      const note = text(b.note, 200, 'note', false);
      const prev = await db.get('SELECT id, decision FROM year_decision WHERE school_id = ? AND student_id = ? AND school_year_id = ?', u.school_id, st.id, y.id);
      if (prev) await db.run('UPDATE year_decision SET decision = ?, note = ?, decided_by = ?, decided_at = ? WHERE id = ? AND school_id = ?', b.decision, note, u.id, iso(), prev.id, u.school_id);
      else await db.insert('INSERT INTO year_decision (school_id, student_id, school_year_id, decision, note, decided_by) VALUES (?,?,?,?,?,?)', u.school_id, st.id, y.id, b.decision, note, u.id);
      await audit(db, u, 'decision.fin_annee', 'student', st.id, `${y.label} : ${prev ? prev.decision : '—'} → ${b.decision}`);
      return { student_id: st.id, school_year_id: y.id, decision: b.decision };
    }],
    ['GET', /^\/api\/students\/(\d+)\/historique$/, async (db, req, u, [id], ctx) => {
      if (!P.has(u, 'direction', 'secretariat')) forbid();
      const st = await db.get('SELECT id FROM student WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!st) notFound();
      const rows = await db.all('SELECT id, kind, source_school, source_school_id, year_label, label, data FROM student_history WHERE school_id = ? AND student_id = ? ORDER BY id', u.school_id, st.id);
      const res = { classes: [], decisions: [], notes: [], releves: [] };
      for (const r of rows) {
        const d = JSON.parse(r.data); const base = { id: r.id, ecole: r.source_school, annee: r.year_label, libelle: r.label };
        if (r.kind === 'classe') res.classes.push({ ...base, ...d });
        else if (r.kind === 'decision') res.decisions.push({ ...base, ...d });
        else if (r.kind === 'note') res.notes.push({ ...base, ...d });
        else {
          // Relevé : la signature d'origine (clé de l'école émettrice) est contrôlée à chaque lecture.
          const k = await K.publicKey(ctx.db, d.ecole_id);
          const ok = !!k && k.keyId === d.key_id && K.verify(k.publicKey, K.transcriptMessage(d.code, d.sha256), d.signature) && sha256(Buffer.from(d.pdf || '', 'base64')) === d.sha256;
          res.releves.push({ ...base, code: `R-${S.fmtCode(String(d.code).slice(1))}`, emis_le: String(d.emis_le).slice(0, 10), cle: d.key_id, signature_valide: ok });
        }
      }
      await audit(db, u, 'dossier.anterieur', 'student', st.id, `${rows.length} élément(s) lus`);
      return res;
    }],
    ['GET', /^\/api\/historique\/(\d+)\/pdf$/, async (db, req, u, [id]) => {
      if (!P.has(u, 'direction', 'secretariat')) forbid();
      const r = await db.get("SELECT id, student_id, data FROM student_history WHERE id = ? AND school_id = ? AND kind = 'releve'", int(id), u.school_id); if (!r) notFound();
      const d = JSON.parse(r.data);
      await audit(db, u, 'dossier.anterieur.releve', 'student', r.student_id, d.code);
      return { __pdf: Buffer.from(d.pdf, 'base64'), filename: `releve-origine-${d.code}.pdf` };
    }],
  ];

  const publicRoutes = [
    ['POST', /^\/api\/verifier\/(T[A-Za-z0-9-]{12,20})\/fichier$/, async (db, req, _u, [raw], ctx) => {
      const code = raw.toUpperCase().replace(/-/g, '');
      const keys = [`verif:${req.ip}`];
      if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de vérifications, réessayez plus tard');
      const b = req.body || {};
      let hash = String(b.sha256 || '').toLowerCase();
      if (b.pdf) hash = sha256(Buffer.from(String(b.pdf), 'base64'));
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, 'empreinte SHA-256 ou fichier attendu');
      const r = await checkCertificate(db, code, hash);
      if (!r) { await ctx.limiter.fail(keys); throw new HttpError(404, 'aucun certificat ne correspond à ce code'); }
      return r;
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

// Vérification publique d'un certificat : écoles, élève abrégé, date ; signatures de la demande et du certificat.
async function verifyTransferPublic(db, code) {
  if (!/^T[A-Z2-9]{12}$/.test(code)) return null;
  const t = await db.get(`SELECT t.*, a.name AS from_name, b.name AS to_name, st.first_name, st.last_name FROM transfer t JOIN school a ON a.id = t.from_school_id
    JOIN school b ON b.id = t.to_school_id JOIN student st ON st.id = t.from_student_id AND st.school_id = t.from_school_id WHERE t.code = ? AND t.status = 'transfere'`, code);
  if (!t) return null;
  const k = await K.publicKey(db, t.from_school_id);
  const min = await verifyMinistry(db, t); // null : pas de décision signée du ministère
  const ok = (await verifyRequest(db, t)) && !!k && K.verify(k.publicKey, certMessage(t.code, t.certificate_sha256), t.certificate_signature)
    && sha256(Buffer.from(t.certificate || '', 'base64')) === t.certificate_sha256 && min !== false;
  return { authentique: ok, type: 'transfert', document: 'Certificat de transfert', statut: ok ? 'valide' : 'modifie', ecole: t.from_name, ecole_accueil: t.to_name,
    eleve: `${t.first_name} ${String(t.last_name).slice(0, 1)}.`, emis_le: day(t.closed_at), signature: { algo: 'Ed25519', cle: t.key_id, valide: ok },
    ...(min === null ? {} : { ministere: { algo: 'Ed25519', cle: t.ministry_key_id, valide: min, le: day(t.ministry_at) } }) };
}
async function checkCertificate(db, code, hash) {
  if (!/^T[A-Z2-9]{12}$/.test(code)) return null;
  const t = await db.get("SELECT from_school_id, code, certificate_signature FROM transfer WHERE code = ? AND status = 'transfere'", code);
  if (!t) return null;
  const k = await K.publicKey(db, t.from_school_id);
  const ok = !!k && K.verify(k.publicKey, certMessage(t.code, hash), t.certificate_signature);
  return { resultat: ok ? 'authentique' : 'modifie', statut: 'valide' };
}

// Décision du ministère sur un transfert « approuve_origine » : par le super-admin (sans portail) ou par un compte du
// ministère (portail actif : signature Ed25519 de la clé du ministère, opts.account). Retourne le transfert à jour.
async function ministryDecision(db, ctx, req, id, b, { who, extra = {}, account = null }) {
  await expireDue(db, ctx);
  const t = await getTr(db, int(id));
  if (!t || (!ministereActive(ctx) && !Number(t.ministry_required))) throw new HttpError(404, 'étape ministère désactivée (NORIA_TRANSFERT_MINISTERE=0)');
  if (!['approuver', 'refuser'].includes(b.decision)) throw new HttpError(400, 'décision : approuver ou refuser');
  const why = text(b.motif, 300, 'motif', b.decision === 'refuser');
  const at = iso();
  const sets = { ...extra, ministry_at: at, ministry_reason: why };
  if (account) {
    if (t.status !== 'approuve_origine' || !Number(t.ministry_required)) throw new HttpError(409, `transition interdite (${t.status})`);
    const mk = await K.ministryKeys(db);
    Object.assign(sets, { ministry_account_id: account.id, ministry_key_id: mk.keyId, ministry_payload_sha256: t.payload_sha256,
      ministry_signature: K.sign(mk.privateKey(), ministryMessage(t, b.decision, account.id, at)) });
  }
  if (b.decision === 'approuver') {
    if (t.status === 'approuve_origine' && !(await verifyRequest(db, t))) {
      await auditBoth(db, t, null, 'transfert.signature_invalide', 'signature Ed25519 de la demande invalide : autorisation impossible', who);
      throw new HttpError(409, 'signature de la demande invalide : transfert bloqué');
    }
    const next = await db.tx((x) => transition(x, ctx, t, 'approuve_ministere', 'ministere', null, `${why || 'autorisation accordée'}${account ? ` (signée Ed25519, clé ${sets.ministry_key_id})` : ''}`, sets, who));
    return finalize(db, ctx, req, next);
  }
  return db.tx((x) => transition(x, ctx, t, 'refuse', 'ministere', null, `${why}${account ? ` (signée Ed25519, clé ${sets.ministry_key_id})` : ''}`, { ...sets, decision_reason: why }, who));
}
// Transferts en attente du ministère (vue du portail du ministère : élève abrégé, écoles, dates).
async function pendingMinistry(db, ctx) {
  await expireDue(db, ctx);
  const rows = await db.all(`${LIST} WHERE t.status = 'approuve_origine' AND t.ministry_required = 1 ORDER BY t.id`);
  return rows.map((r) => ({ id: r.id, statut: r.status, code_eleve: r.student_code, eleve: `${r.first_name} ${String(r.last_name).slice(0, 1)}.`,
    ecole_origine: r.from_name, ecole_accueil: r.to_name, motif: r.motive, approuve_le: r.origin_at, expire_le: r.expires_at, cle: r.key_id }));
}

// Étape « autorisation ministère » (NORIA_TRANSFERT_MINISTERE=1) : en attendant un rôle ministère, validée depuis
// la session super-admin (journal de la plateforme). Désactivée par défaut : 404.
function adminRoutes({ log }) {
  return [
    ['GET', /^\/api\/admin\/transferts$/, async (db, req, a, _m, ctx) => {
      if (!ministereActive(ctx)) throw new HttpError(404, 'étape ministère désactivée (NORIA_TRANSFERT_MINISTERE=0)');
      if (portailMinistere(ctx)) throw new HttpError(409, 'étape ministère : passe par le portail du ministère (NORIA_MINISTERE=1)');
      return pendingMinistry(db, ctx);
    }, { auth: true }],
    ['POST', /^\/api\/admin\/transferts\/(\d+)\/ministere$/, async (db, req, a, [id], ctx) => {
      if (portailMinistere(ctx)) throw new HttpError(409, 'étape ministère : passe par le portail du ministère (NORIA_MINISTERE=1)');
      const b = req.body || {};
      const next = await ministryDecision(db, ctx, req, id, b, { who: `ministère (super-admin n° ${a.id})`, extra: { ministry_by: a.id } });
      await log(db, a, 'admin.transfert.ministere', next.id, `${b.decision}${b.motif ? ` : ${String(b.motif).slice(0, 300)}` : ''}`, 'ok', req.ip);
      return { id: next.id, statut: next.status };
    }, { auth: true, write: true }],
  ];
}

module.exports = { createRoutes, adminRoutes, ministryDecision, pendingMinistry, verifyMinistry, portailMinistere, ministereActive, canTransition, MACHINE, lookup, minimal, verifyTransferPublic, checkCertificate, requestPayload, verifyRequest, expireDue, CATEGORIES, DECISIONS, ACTIFS };
