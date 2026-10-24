'use strict';
// Lot 6 — Salles de cours : séances planifiées d'une classe (horaire, enseignant, matière, ordre du jour), ressources
// (lien, PDF léger, texte, formule KaTeX), mains levées et sondages simples. La vidéo reste dans Jitsi : rien ici.
// Portée : direction et secrétariat (toute l'école), enseignant (ses classes), élève et parent (classe de l'élève).
// Animer (créer, ouvrir, fermer, joindre des ressources, baisser les mains, sondages) : direction ou enseignant de la classe.
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const { sniff } = require('./televersement');

const PDF_MAX = 700 * 1024; // le corps JSON est borné à 1 Mo : PDF léger (base64) ; les gros documents passent par un lien
const STATUS = ['planifiee', 'ouverte', 'terminee'];
const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
function text(v, label, min, max) { const s = clean(v); if (s.length < min || s.length > max) throw new HttpError(400, `${label} : ${min} à ${max} caractères`); return s; }
const opt = (v, label, max) => { const s = clean(v); if (!s) return null; if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`); return s; };
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
function when(v) { const s = clean(v); const t = Date.parse(s); if (!s || Number.isNaN(t)) throw new HttpError(400, 'date et heure invalides'); return new Date(t).toISOString(); }
function minutes(v) { const n = Number(v ?? 45); if (!Number.isInteger(n) || n < 5 || n > 240) throw new HttpError(400, 'durée : 5 à 240 minutes'); return n; }
function httpUrl(v) {
  const s = clean(v); let u; try { u = new URL(s); } catch { throw new HttpError(400, 'lien invalide'); }
  if (!['https:', 'http:'].includes(u.protocol) || s.length > 500) throw new HttpError(400, 'lien invalide (http ou https)');
  return u.toString();
}

// Classes visibles par l'utilisateur (même règle que GET /api/classes).
function scope(u, alias = 'c') {
  let sc = P.classScope(u, alias);
  if (sc === P.NONE && P.has(u, 'parent', 'eleve')) {
    const st = P.studentScope(u);
    sc = { sql: `${alias}.school_id = ? AND ${alias}.id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE e.status = 'actif' AND ${st.sql})`, params: [u.school_id, ...st.params] };
  }
  return sc;
}
const canHost = (u) => P.has(u, 'direction', 'enseignant');
async function classFor(db, u, cid, host) {
  const sc = host ? (P.has(u, 'direction') ? { sql: 'c.school_id = ?', params: [u.school_id] } : P.classScope(u)) : scope(u);
  if (sc === P.NONE) forbid();
  const c = await db.get(`SELECT c.id, c.name, c.archived_at FROM class c WHERE c.id = ? AND ${sc.sql}`, id(cid), ...sc.params);
  if (!c) notFound();
  return c;
}
async function sessionFor(db, u, sid, host = false) {
  const s = await db.get('SELECT * FROM class_session WHERE id = ? AND school_id = ?', id(sid), u.school_id);
  if (!s) notFound();
  const c = await classFor(db, u, s.class_id, false);
  if (host && !(P.has(u, 'direction') || (P.has(u, 'enseignant') && P.classScope(u) !== P.NONE && await db.get(
    'SELECT 1 AS x FROM teacher_assignment WHERE class_id = ? AND teacher_user_id = ? AND school_id = ?', s.class_id, u.id, u.school_id)))) forbid();
  return { ...s, class_name: c.name };
}
const SESSION_COLS = `s.id, s.class_id, c.name AS class_name, s.teacher_user_id, t.display_name AS teacher_name, s.subject, s.title, s.agenda,
  s.starts_at, s.duration_min, s.status, s.low_data, s.created_at, s.updated_at`;

async function state(db, u, s) {
  const host = canHost(u) && (P.has(u, 'direction') || !!(await db.get('SELECT 1 AS x FROM teacher_assignment WHERE class_id = ? AND teacher_user_id = ? AND school_id = ?', s.class_id, u.id, u.school_id)));
  const full = await db.get(`SELECT ${SESSION_COLS} FROM class_session s JOIN class c ON c.id = s.class_id AND c.school_id = s.school_id
    LEFT JOIN app_user t ON t.id = s.teacher_user_id AND t.school_id = s.school_id WHERE s.id = ? AND s.school_id = ?`, s.id, u.school_id);
  const resources = await db.all('SELECT id, kind, title, url, body, mime, size, created_at FROM class_resource WHERE school_id = ? AND session_id = ? ORDER BY id', u.school_id, s.id);
  const hands = await db.all(`SELECT h.id, h.user_id, u.display_name AS name, h.raised_at FROM class_hand h LEFT JOIN app_user u ON u.id = h.user_id AND u.school_id = h.school_id
    WHERE h.school_id = ? AND h.session_id = ? AND h.lowered_at IS NULL ORDER BY h.raised_at, h.id`, u.school_id, s.id);
  const polls = [];
  for (const p of await db.all('SELECT id, question, options, is_open, created_at FROM class_poll WHERE school_id = ? AND session_id = ? ORDER BY id DESC LIMIT 10', u.school_id, s.id)) {
    const votes = await db.all('SELECT choice, COUNT(*) AS n FROM class_poll_vote WHERE school_id = ? AND poll_id = ? GROUP BY choice', u.school_id, p.id);
    const mine = await db.get('SELECT choice FROM class_poll_vote WHERE school_id = ? AND poll_id = ? AND user_id = ?', u.school_id, p.id, u.id);
    const options = JSON.parse(p.options);
    const counts = options.map((_, i) => Number((votes.find((v) => Number(v.choice) === i) || {}).n || 0));
    // Résultats : l'animateur les voit toujours ; les participants après avoir voté ou à la fermeture.
    polls.push({ id: p.id, question: p.question, options, is_open: !!Number(p.is_open), mine: mine ? Number(mine.choice) : null,
      counts: host || mine || !Number(p.is_open) ? counts : null, total: counts.reduce((a, b) => a + b, 0) });
  }
  return { session: { ...full, low_data: !!Number(full.low_data) }, host, resources, hands: host ? hands : hands.map((h) => (h.user_id === u.id ? h : { id: h.id, raised_at: h.raised_at })),
    my_hand: !!hands.find((h) => h.user_id === u.id), polls, now: new Date().toISOString() };
}

module.exports = { PDF_MAX, routes: [
  ['GET', /^\/api\/salles$/, async (db, req, u) => {
    const sc = scope(u); if (sc === P.NONE) forbid();
    const cid = req.query.get('class_id');
    return db.all(`SELECT ${SESSION_COLS}, (SELECT COUNT(*) FROM class_resource r WHERE r.session_id = s.id AND r.school_id = s.school_id) AS resources
      FROM class_session s JOIN class c ON c.id = s.class_id AND c.school_id = s.school_id
      LEFT JOIN app_user t ON t.id = s.teacher_user_id AND t.school_id = s.school_id
      WHERE ${sc.sql}${cid ? ' AND s.class_id = ?' : ''} ORDER BY CASE s.status WHEN 'ouverte' THEN 0 WHEN 'planifiee' THEN 1 ELSE 2 END, s.starts_at LIMIT 200`,
      ...sc.params, ...(cid ? [id(cid)] : []));
  }],
  ['POST', /^\/api\/salles$/, async (db, req, u, m, ctx) => {
    if (!canHost(u)) await refuse(ctx, u, 'salle.create', 'class_session', null, null);
    const b = req.body || {};
    const c = await classFor(db, u, b.class_id, true);
    if (c.archived_at) throw new HttpError(409, 'classe archivée');
    const v = { title: text(b.title, 'titre', 2, 120), subject: opt(b.subject, 'matière', 80), agenda: opt(b.agenda, 'ordre du jour', 2000),
      starts_at: when(b.starts_at), duration_min: minutes(b.duration_min), low_data: b.low_data ? 1 : 0 };
    const teacher = P.has(u, 'enseignant') ? u.id : (b.teacher_user_id ? id(b.teacher_user_id) : null);
    if (teacher && teacher !== u.id && !(await db.get('SELECT 1 AS x FROM teacher_assignment WHERE class_id = ? AND teacher_user_id = ? AND school_id = ?', c.id, teacher, u.school_id)))
      throw new HttpError(400, 'cet enseignant n’est pas affecté à la classe');
    const sid = await db.insert(`INSERT INTO class_session (school_id, class_id, teacher_user_id, subject, title, agenda, starts_at, duration_min, low_data, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, u.school_id, c.id, teacher, v.subject, v.title, v.agenda, v.starts_at, v.duration_min, v.low_data, u.id);
    await audit(db, u, 'salle.create', 'class_session', sid, `${c.name} — ${v.title}`.slice(0, 300));
    return state(db, u, await sessionFor(db, u, sid));
  }],
  ['GET', /^\/api\/salles\/(\d+)$/, async (db, req, u, [sid]) => state(db, u, await sessionFor(db, u, sid))],
  ['PATCH', /^\/api\/salles\/(\d+)$/, async (db, req, u, [sid]) => {
    const s = await sessionFor(db, u, sid, true); const b = req.body || {}; const o = {};
    if (b.title !== undefined) o.title = text(b.title, 'titre', 2, 120);
    if (b.subject !== undefined) o.subject = opt(b.subject, 'matière', 80);
    if (b.agenda !== undefined) o.agenda = opt(b.agenda, 'ordre du jour', 2000);
    if (b.starts_at !== undefined) o.starts_at = when(b.starts_at);
    if (b.duration_min !== undefined) o.duration_min = minutes(b.duration_min);
    if (b.low_data !== undefined) o.low_data = b.low_data ? 1 : 0;
    if (b.status !== undefined) { if (!STATUS.includes(b.status)) throw new HttpError(400, 'statut inconnu'); o.status = b.status; }
    const keys = Object.keys(o); if (!keys.length) throw new HttpError(400, 'aucun champ modifiable');
    await db.run(`UPDATE class_session SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?`, ...keys.map((k) => o[k]), s.id, u.school_id);
    if (o.status === 'terminee') await db.run('UPDATE class_hand SET lowered_at = ? WHERE school_id = ? AND session_id = ? AND lowered_at IS NULL', new Date().toISOString(), u.school_id, s.id);
    await audit(db, u, 'salle.update', 'class_session', s.id, `[${keys.join(',')}]${o.status ? ` → ${o.status}` : ''}`);
    return state(db, u, await sessionFor(db, u, s.id));
  }],
  // Ressources : lien http(s), texte, formule (rendue par KaTeX côté navigateur), PDF léger vérifié par signature.
  ['POST', /^\/api\/salles\/(\d+)\/ressources$/, async (db, req, u, [sid]) => {
    const s = await sessionFor(db, u, sid, true); const b = req.body || {};
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM class_resource WHERE school_id = ? AND session_id = ?', u.school_id, s.id)).n);
    if (n >= 30) throw new HttpError(409, '30 ressources au plus par séance');
    const title = text(b.title, 'titre', 1, 120); let url = null, body = null, mime = null, size = null, data = null;
    if (b.kind === 'lien') url = httpUrl(b.url);
    else if (b.kind === 'texte' || b.kind === 'formule') body = text(b.body, b.kind === 'formule' ? 'formule' : 'texte', 1, b.kind === 'formule' ? 1000 : 4000);
    else if (b.kind === 'pdf') {
      const buf = Buffer.from(String(b.data || ''), 'base64');
      if (!buf.length) throw new HttpError(400, 'fichier manquant');
      if (buf.length > PDF_MAX) throw new HttpError(413, 'PDF trop volumineux (700 Ko au plus) : utilisez un lien');
      if (sniff(buf) !== 'application/pdf') throw new HttpError(400, 'seuls les fichiers PDF sont acceptés');
      mime = 'application/pdf'; size = buf.length; data = buf.toString('base64');
    } else throw new HttpError(400, 'type de ressource inconnu');
    const rid = await db.insert('INSERT INTO class_resource (school_id, session_id, kind, title, url, body, mime, size, data, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u.school_id, s.id, b.kind, title, url, body, mime, size, data, u.id);
    await audit(db, u, 'salle.ressource', 'class_session', s.id, `${b.kind} — ${title}`.slice(0, 300));
    return { id: rid, kind: b.kind, title, url, body, mime, size };
  }],
  ['GET', /^\/api\/salles\/(\d+)\/ressources\/(\d+)\/fichier$/, async (db, req, u, [sid, rid]) => {
    const s = await sessionFor(db, u, sid);
    const r = await db.get("SELECT title, data FROM class_resource WHERE id = ? AND session_id = ? AND school_id = ? AND kind = 'pdf'", id(rid), s.id, u.school_id);
    if (!r) notFound();
    const name = r.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'document';
    return { __file: Buffer.from(r.data, 'base64'), type: 'application/pdf', filename: `${name}.pdf`, inline: req.query.get('voir') === '1' };
  }],
  ['DELETE', /^\/api\/salles\/(\d+)\/ressources\/(\d+)$/, async (db, req, u, [sid, rid]) => {
    const s = await sessionFor(db, u, sid, true);
    const r = await db.run('DELETE FROM class_resource WHERE id = ? AND session_id = ? AND school_id = ?', id(rid), s.id, u.school_id);
    if (!r.changes) notFound();
    await audit(db, u, 'salle.ressource.retrait', 'class_session', s.id, `ressource ${rid}`);
    return { ok: true };
  }],
  // Main levée : un participant lève ou baisse sa main (séance ouverte) ; l'animateur baisse une main ou toutes.
  ['POST', /^\/api\/salles\/(\d+)\/main$/, async (db, req, u, [sid]) => {
    const s = await sessionFor(db, u, sid);
    if (s.status !== 'ouverte') throw new HttpError(409, 'la séance n’est pas ouverte');
    const now = new Date().toISOString();
    const cur = await db.get('SELECT id FROM class_hand WHERE school_id = ? AND session_id = ? AND user_id = ? AND lowered_at IS NULL', u.school_id, s.id, u.id);
    if ((req.body || {}).raised && !cur) await db.insert('INSERT INTO class_hand (school_id, session_id, user_id, raised_at) VALUES (?,?,?,?)', u.school_id, s.id, u.id, now);
    if (!(req.body || {}).raised && cur) await db.run('UPDATE class_hand SET lowered_at = ? WHERE id = ? AND school_id = ?', now, cur.id, u.school_id);
    return state(db, u, s);
  }],
  ['POST', /^\/api\/salles\/(\d+)\/mains\/baisser$/, async (db, req, u, [sid]) => {
    const s = await sessionFor(db, u, sid, true); const hid = (req.body || {}).hand_id;
    await db.run(`UPDATE class_hand SET lowered_at = ? WHERE school_id = ? AND session_id = ? AND lowered_at IS NULL${hid ? ' AND id = ?' : ''}`,
      new Date().toISOString(), u.school_id, s.id, ...(hid ? [id(hid)] : []));
    return state(db, u, s);
  }],
  // Sondage : 2 à 6 choix ; un vote par personne (modifiable tant que le sondage est ouvert).
  ['POST', /^\/api\/salles\/(\d+)\/sondages$/, async (db, req, u, [sid]) => {
    const s = await sessionFor(db, u, sid, true); const b = req.body || {};
    const question = text(b.question, 'question', 2, 200);
    const options = (Array.isArray(b.options) ? b.options : []).map((o) => clean(o)).filter(Boolean);
    if (options.length < 2 || options.length > 6 || options.some((o) => o.length > 80)) throw new HttpError(400, 'sondage : 2 à 6 choix de 80 caractères au plus');
    await db.insert('INSERT INTO class_poll (school_id, session_id, question, options, created_by) VALUES (?,?,?,?,?)', u.school_id, s.id, question, JSON.stringify(options), u.id);
    return state(db, u, s);
  }],
  ['POST', /^\/api\/salles\/(\d+)\/sondages\/(\d+)\/fermer$/, async (db, req, u, [sid, pid]) => {
    const s = await sessionFor(db, u, sid, true);
    const r = await db.run('UPDATE class_poll SET is_open = 0 WHERE id = ? AND session_id = ? AND school_id = ?', id(pid), s.id, u.school_id);
    if (!r.changes) notFound();
    return state(db, u, s);
  }],
  ['POST', /^\/api\/salles\/(\d+)\/sondages\/(\d+)\/vote$/, async (db, req, u, [sid, pid]) => {
    const s = await sessionFor(db, u, sid);
    const p = await db.get('SELECT id, options, is_open FROM class_poll WHERE id = ? AND session_id = ? AND school_id = ?', id(pid), s.id, u.school_id);
    if (!p) notFound();
    if (!Number(p.is_open)) throw new HttpError(409, 'sondage fermé');
    const choice = Number((req.body || {}).choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= JSON.parse(p.options).length) throw new HttpError(400, 'choix invalide');
    const cur = await db.get('SELECT id FROM class_poll_vote WHERE poll_id = ? AND user_id = ? AND school_id = ?', p.id, u.id, u.school_id);
    if (cur) await db.run('UPDATE class_poll_vote SET choice = ? WHERE id = ? AND school_id = ?', choice, cur.id, u.school_id);
    else await db.insert('INSERT INTO class_poll_vote (school_id, poll_id, user_id, choice) VALUES (?,?,?,?)', u.school_id, p.id, u.id, choice);
    return state(db, u, s);
  }],
] };
