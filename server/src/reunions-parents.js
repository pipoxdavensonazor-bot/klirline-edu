'use strict';
// Lot 3 — Réunion de parents en mode diffusion (500 parents et plus).
//   - Seuls les intervenants (direction, secrétariat, enseignants) reçoivent le nom de la salle Jitsi : la salle vidéo
//     reste à quelques participants. Les parents ne la reçoivent JAMAIS quand l'assistance dépasse le seuil.
//   - Les parents écoutent un flux audio (ou vidéo basse définition) diffusé hors de NORIA : URL HLS/Icecast saisie par
//     l'école (serveur MediaMTX / Owncast / Icecast, voir docs/reunion-500-parents.md). Sans flux et pour une petite
//     assistance (≤ NORIA_REUNION_JITSI_MAX, 50 par défaut), lien Jitsi en audio seul.
//   - Questions écrites, main levée et présence passent par NORIA : GET /etat est minuscule (quelques centaines
//     d'octets) et indique au client le délai avant le prochain sondage (10 s en direct, 60 s avant, arrêt après), avec
//     recul exponentiel côté client si rien ne change. La présence n'est écrite qu'une fois par minute et par parent.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, notFound, audit, refuse } = require('./common');

const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
function text(v, label, min, max) { const s = clean(v); if (s.length < min || s.length > max) throw new HttpError(400, `${label} : ${min} à ${max} caractères`); return s; }
const opt = (v, label, max) => { const s = clean(v); if (!s) return null; if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`); return s; };
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const iso = () => new Date().toISOString();
function when(v) { const t = Date.parse(clean(v)); if (Number.isNaN(t)) throw new HttpError(400, 'date et heure invalides'); return new Date(t).toISOString(); }
function httpsUrl(v) {
  const s = clean(v); if (!s) return null; let u; try { u = new URL(s); } catch { throw new HttpError(400, 'lien du flux invalide'); }
  if (u.protocol !== 'https:' || s.length > 300) throw new HttpError(400, 'lien du flux : https seulement');
  return u.toString();
}
const env = (ctx) => (ctx && ctx.env) || process.env;
const jitsiBase = (ctx) => String(env(ctx).NORIA_JITSI_BASE || 'https://meet.jit.si').replace(/\/$/, '');
const jitsiMax = (ctx) => { const n = Number(env(ctx).NORIA_REUNION_JITSI_MAX); return Number.isInteger(n) && n >= 0 ? n : 50; };
const isOrganizer = (u) => P.has(u, 'direction', 'secretariat');
const isSpeaker = (u) => P.has(u, 'direction', 'secretariat', 'enseignant');
const isParent = (u) => !isSpeaker(u) && P.has(u, 'parent');

// Réunions visibles : intervenants → toutes ; parent → école entière + classes de ses enfants.
function visible(u) {
  if (isSpeaker(u)) return { sql: 'pm.school_id = ?', params: [u.school_id] };
  const st = P.studentScope(u, 'st');
  return { sql: `pm.school_id = ? AND (pm.audience = 'ecole' OR pm.class_id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE e.status = 'actif' AND ${st.sql}))`,
    params: [u.school_id, ...st.params] };
}
async function meetingFor(db, u, mid) {
  const v = visible(u);
  const m = await db.get(`SELECT pm.*, c.name AS class_name FROM parent_meeting pm LEFT JOIN class c ON c.id = pm.class_id AND c.school_id = pm.school_id WHERE pm.id = ? AND ${v.sql}`, id(mid), ...v.params);
  if (!m) notFound();
  return m;
}
// Taille de l'assistance attendue : nombre de comptes parents concernés.
async function expected(db, m) {
  const r = m.audience === 'ecole'
    ? await db.get("SELECT COUNT(DISTINCT ur.user_id) AS n FROM user_role ur WHERE ur.school_id = ? AND ur.role = 'parent'", m.school_id)
    : await db.get("SELECT COUNT(DISTINCT pl.parent_user_id) AS n FROM parent_link pl JOIN enrollment e ON e.student_id = pl.student_id AND e.school_id = pl.school_id AND e.status = 'actif' WHERE pl.school_id = ? AND e.class_id = ?", m.school_id, m.class_id);
  return Number(r.n);
}
function nextPoll(m) { return m.status === 'en_cours' ? 10 : m.status === 'prevue' ? 60 : 0; }

async function view(db, ctx, u, m) {
  const n = await expected(db, m);
  const out = { id: m.id, titre: m.title, debut: m.starts_at, audience: m.audience, classe: m.class_name || null, mode: m.mode, statut: m.status,
    questions_ouvertes: !!m.qa_open, intervenants: m.speakers, flux: m.stream_url, replay: m.replay_url, attendus: n, prochain_sondage: nextPoll(m) };
  if (isSpeaker(u)) out.salle_intervenants = `${jitsiBase(ctx)}/${m.room}`;
  else if (!m.stream_url && n <= jitsiMax(ctx)) out.salle_audio = `${jitsiBase(ctx)}/${m.room}#config.startAudioOnly=true&config.startWithVideoMuted=true&config.disableTileView=true`;
  return out;
}

const routes = [
  ['GET', /^\/api\/reunions-parents$/, async (db, req, u, _m, ctx) => {
    if (!isSpeaker(u) && !isParent(u)) await refuse(ctx, u, 'reunion_parents.list', 'parent_meeting', null, 'rôle');
    const v = visible(u);
    const rows = await db.all(`SELECT pm.*, c.name AS class_name FROM parent_meeting pm LEFT JOIN class c ON c.id = pm.class_id AND c.school_id = pm.school_id
      WHERE ${v.sql} ORDER BY CASE pm.status WHEN 'en_cours' THEN 0 WHEN 'prevue' THEN 1 ELSE 2 END, pm.starts_at DESC LIMIT 50`, ...v.params);
    const out = []; for (const m of rows) out.push(await view(db, ctx, u, m));
    const classes = isOrganizer(u) ? await db.all('SELECT id, name FROM class WHERE school_id = ? AND archived_at IS NULL ORDER BY name', u.school_id) : [];
    return { organisateur: isOrganizer(u), intervenant: isSpeaker(u), reunions: out, classes, seuil_jitsi: jitsiMax(ctx) };
  }],
  ['POST', /^\/api\/reunions-parents$/, async (db, req, u, _m, ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.create', 'parent_meeting', null, 'rôle');
    const b = req.body || {};
    const audience = b.class_id ? 'classe' : 'ecole';
    let cid = null;
    if (b.class_id) { const c = await db.get('SELECT id FROM class WHERE id = ? AND school_id = ?', id(b.class_id), u.school_id); if (!c) notFound(); cid = c.id; }
    const mode = b.mode === 'video_basse' ? 'video_basse' : 'audio';
    const school = await db.get('SELECT slug FROM school WHERE id = ?', u.school_id);
    const room = `noria-${String(school.slug).replace(/[^a-z0-9-]/gi, '')}-rp-${crypto.randomBytes(6).toString('hex')}`;
    const mid = await db.insert(`INSERT INTO parent_meeting (school_id, title, starts_at, audience, class_id, mode, stream_url, room, speakers, status, qa_open, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, text(b.titre, 'titre', 2, 140), when(b.debut), audience, cid, mode, httpsUrl(b.flux), room,
    opt(b.intervenants, 'intervenants', 300), 'prevue', 1, u.id, iso());
    await audit(db, u, 'reunion_parents.create', 'parent_meeting', mid, `${audience}${cid ? ` ${cid}` : ''}, ${mode}`);
    return { id: mid };
  }],
  ['PUT', /^\/api\/reunions-parents\/(\d+)$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.update', 'parent_meeting', mid, 'rôle');
    const m = await meetingFor(db, u, mid); const b = req.body || {};
    const status = b.statut ? (['prevue', 'en_cours', 'terminee'].includes(b.statut) ? b.statut : (() => { throw new HttpError(400, 'statut invalide'); })()) : m.status;
    const flux = b.flux !== undefined ? httpsUrl(b.flux) : m.stream_url;
    const replay = b.replay !== undefined ? httpsUrl(b.replay) : m.replay_url;
    const qa = b.questions_ouvertes !== undefined ? (b.questions_ouvertes ? 1 : 0) : m.qa_open;
    await db.run('UPDATE parent_meeting SET status = ?, stream_url = ?, replay_url = ?, qa_open = ? WHERE id = ? AND school_id = ?', status, flux, replay, qa, m.id, u.school_id);
    await audit(db, u, 'reunion_parents.update', 'parent_meeting', m.id, `statut ${status}`);
    return view(db, ctx, u, { ...m, status, stream_url: flux, replay_url: replay, qa_open: qa });
  }],
  // État léger pour le sondage des parents : présence (1 écriture / minute), réponses publiées depuis « depuis », ma main.
  ['GET', /^\/api\/reunions-parents\/(\d+)\/etat$/, async (db, req, u, [mid], ctx) => {
    if (!isSpeaker(u) && !isParent(u)) await refuse(ctx, u, 'reunion_parents.state', 'parent_meeting', mid, 'rôle');
    const m = await meetingFor(db, u, mid);
    if (isParent(u) && m.status === 'en_cours') {
      const a = await db.get('SELECT last_at FROM parent_meeting_attendance WHERE meeting_id = ? AND user_id = ?', m.id, u.id);
      const now = iso();
      if (!a) await db.run('INSERT INTO parent_meeting_attendance (school_id, meeting_id, user_id, first_at, last_at, pings) VALUES (?,?,?,?,?,1)', u.school_id, m.id, u.id, now, now);
      else if (Date.parse(a.last_at) < Date.now() - 60e3) await db.run('UPDATE parent_meeting_attendance SET last_at = ?, pings = pings + 1 WHERE meeting_id = ? AND user_id = ?', now, m.id, u.id);
    }
    const since = Number(req.query.get('depuis')) || 0;
    const answers = await db.all(`SELECT id, body, answer, answered_at FROM parent_meeting_question WHERE school_id = ? AND meeting_id = ? AND kind = 'question' AND status = 'repondue' AND id > ? ORDER BY id LIMIT 30`,
      u.school_id, m.id, since);
    const mine = await db.get("SELECT id FROM parent_meeting_question WHERE meeting_id = ? AND user_id = ? AND kind = 'main' AND status = 'en_attente'", m.id, u.id);
    return { statut: m.status, flux: m.stream_url, questions_ouvertes: !!m.qa_open, main_levee: !!mine, reponses: answers, prochain_sondage: nextPoll(m) };
  }],
  ['POST', /^\/api\/reunions-parents\/(\d+)\/(question|main|baisser)$/, async (db, req, u, [mid, act], ctx) => {
    if (!isParent(u)) await refuse(ctx, u, `reunion_parents.${act}`, 'parent_meeting', mid, 'rôle');
    const m = await meetingFor(db, u, mid);
    if (m.status === 'terminee') throw new HttpError(409, 'réunion terminée');
    if (act === 'baisser') {
      await db.run("UPDATE parent_meeting_question SET status = 'ecartee' WHERE meeting_id = ? AND user_id = ? AND kind = 'main' AND status = 'en_attente'", m.id, u.id);
      // Baisser la main met aussi fin à une parole accordée (le parent peut toujours se taire, jamais se redonner la parole).
      if (require('./diffusion').enabled(ctx)) await require('./parole').endFor(db, ctx, m.id, u.id, 'parent');
      return { ok: true };
    }
    if (!m.qa_open) throw new HttpError(409, 'questions fermées pour le moment');
    if (act === 'main') {
      const had = await db.get("SELECT id FROM parent_meeting_question WHERE meeting_id = ? AND user_id = ? AND kind = 'main' AND status = 'en_attente'", m.id, u.id);
      if (had) return { id: had.id };
      return { id: await db.insert("INSERT INTO parent_meeting_question (school_id, meeting_id, user_id, kind, status, created_at) VALUES (?,?,?,'main','en_attente',?)", u.school_id, m.id, u.id, iso()) };
    }
    const pending = await db.get("SELECT COUNT(*) AS n FROM parent_meeting_question WHERE meeting_id = ? AND user_id = ? AND kind = 'question' AND status = 'en_attente'", m.id, u.id);
    if (Number(pending.n) >= 3) throw new HttpError(429, '3 questions en attente au plus');
    const qid = await db.insert("INSERT INTO parent_meeting_question (school_id, meeting_id, user_id, kind, body, status, created_at) VALUES (?,?,?,'question',?,'en_attente',?)",
      u.school_id, m.id, u.id, text(req.body && req.body.texte, 'question', 3, 500), iso());
    return { id: qid };
  }],
  // Modération (intervenants) : questions en attente, mains levées, présence.
  ['GET', /^\/api\/reunions-parents\/(\d+)\/moderation$/, async (db, req, u, [mid], ctx) => {
    if (!isSpeaker(u)) await refuse(ctx, u, 'reunion_parents.moderation', 'parent_meeting', mid, 'rôle');
    const m = await meetingFor(db, u, mid);
    const qs = await db.all(`SELECT q.id, q.kind, q.body, q.status, q.answer, q.created_at, us.display_name AS parent FROM parent_meeting_question q
      JOIN app_user us ON us.id = q.user_id AND us.school_id = q.school_id WHERE q.school_id = ? AND q.meeting_id = ? AND q.status = 'en_attente' ORDER BY q.id LIMIT 200`, u.school_id, m.id);
    const pres = await db.get('SELECT COUNT(*) AS n, SUM(CASE WHEN last_at > ? THEN 1 ELSE 0 END) AS actifs FROM parent_meeting_attendance WHERE school_id = ? AND meeting_id = ?',
      new Date(Date.now() - 3 * 60e3).toISOString(), u.school_id, m.id);
    return { ...(await view(db, ctx, u, m)), questions: qs.filter((q) => q.kind === 'question'), mains: qs.filter((q) => q.kind === 'main'),
      presents: Number(pres.n || 0), actifs: Number(pres.actifs || 0) };
  }],
  ['POST', /^\/api\/reunions-parents\/(\d+)\/questions\/(\d+)$/, async (db, req, u, [mid, qid], ctx) => {
    if (!isSpeaker(u)) await refuse(ctx, u, 'reunion_parents.answer', 'parent_meeting_question', qid, 'rôle');
    const m = await meetingFor(db, u, mid); const b = req.body || {};
    const q = await db.get('SELECT * FROM parent_meeting_question WHERE id = ? AND meeting_id = ? AND school_id = ?', id(qid), m.id, u.school_id); if (!q) notFound();
    const status = b.statut === 'ecartee' ? 'ecartee' : 'repondue';
    const answer = status === 'repondue' && q.kind === 'question' ? text(b.reponse, 'réponse', 1, 500) : null;
    await db.run('UPDATE parent_meeting_question SET status = ?, answer = ?, answered_at = ? WHERE id = ? AND school_id = ?', status, answer, iso(), q.id, u.school_id);
    return { ok: true };
  }],
  ['GET', /^\/api\/reunions-parents\/(\d+)\/presences\.csv$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.attendance', 'parent_meeting', mid, 'rôle');
    const m = await meetingFor(db, u, mid);
    const rows = await db.all(`SELECT us.display_name, a.first_at, a.last_at, a.pings FROM parent_meeting_attendance a JOIN app_user us ON us.id = a.user_id AND us.school_id = a.school_id
      WHERE a.school_id = ? AND a.meeting_id = ? ORDER BY us.display_name`, u.school_id, m.id);
    const q = (s) => { const v = String(s ?? ''); return `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`; };
    const csv = ['parent;arrivee;derniere_activite;minutes_approx', ...rows.map((r) => [q(r.display_name), r.first_at, r.last_at, r.pings].join(';'))].join('\n');
    await audit(db, u, 'reunion_parents.attendance', 'parent_meeting', m.id, `${rows.length} présent(s)`);
    return { __file: Buffer.from('\ufeff' + csv, 'utf8'), type: 'text/csv; charset=utf-8', filename: `presences-reunion-${m.id}.csv` };
  }],
];

module.exports = { routes, jitsiMax };
