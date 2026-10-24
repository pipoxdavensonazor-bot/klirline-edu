'use strict';
// Prise de parole audio des parents pendant une diffusion (réseaux faibles : audio seulement, aucune vidéo).
//   1. Le parent lève la main (module réunions). 2. La direction clique « Donner la parole » : NORIA crée une
//      autorisation pour CE parent et CETTE réunion, valable 60 s et à usage unique.
//   3. La page du parent demande le micro et publie en WHIP (Opus mono ≈ 24 kbit/s) sur parole-<réunion>-<autorisation>.
//      MediaMTX demande l'accord de NORIA (authMethod http) : jeton signé + autorisation « accordee », jamais utilisée,
//      non expirée → consommée (state « publie ») dans la même requête ; toute autre publication est refusée.
//   4. La page de la direction lit ce chemin (WHEP, jeton de lecture « l ») et mélange la voix du parent à son micro
//      (Web Audio) dans le flux qu'elle publie déjà : tous les auditeurs l'entendent dans le HLS, sans WebRTC de leur côté.
//   5. « Couper le micro » (direction) ou « Arrêter de parler » (parent) : autorisation terminée, publication expulsée
//      par l'API MediaMTX (réseau Docker interne), et la direction cesse de mélanger ce chemin.
// Le parent ne peut jamais réactiver son micro seul : il faut une nouvelle autorisation de la direction.
const crypto = require('node:crypto');
const { HttpError, notFound, audit, refuse } = require('./common');
const D = require('./diffusion');

const GRANT_TTL = 60; const READ_TTL = 600; const iso = () => new Date().toISOString();
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const secret = (ctx) => D.env(ctx).NORIA_DIRECT_SECRET;
const maxSpeakers = (ctx) => (Number(D.env(ctx).NORIA_PAROLE_MAX) === 2 ? 2 : 1);
const pathOf = (mid, gid) => `parole-${mid}-${gid}`;
const mac = (ctx, s) => crypto.createHmac('sha256', secret(ctx)).update(s).digest();
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

// Jeton de publication : v.<réunion>.<parent>.<autorisation>.<expiration>.<hmac> (lié au parent, à la réunion, à l'autorisation).
function signGrant(ctx, mid, uid, gid, ttl = GRANT_TTL) {
  const body = `v.${mid}.${uid}.${gid}.${Math.floor(Date.now() / 1000) + ttl}`;
  return `${body}.${mac(ctx, body).toString('base64url')}`;
}
function verifyGrant(ctx, tok) {
  const p = String(tok || '').split('.'); if (p.length !== 6 || p[0] !== 'v') return null;
  if (!same(Buffer.from(p[5], 'base64url'), mac(ctx, p.slice(0, 5).join('.')))) return null;
  if (Number(p[4]) < Date.now() / 1000) return null;
  return { mid: Number(p[1]), uid: Number(p[2]), gid: Number(p[3]) };
}
// Mot de passe de NORIA pour l'API MediaMTX (expulsion d'un orateur) : dérivé du secret, jamais stocké ni journalisé.
const apiPassword = (ctx) => mac(ctx, 'api-mediamtx').toString('hex');

// Autorisations « accordee » non utilisées à temps : expirées.
async function sweep(db, mid) {
  await db.run("UPDATE parent_meeting_speaker SET state = 'terminee', ended_at = ?, ended_by = 'expire' WHERE meeting_id = ? AND state = 'accordee' AND expires_at < ?", iso(), mid, iso());
}
const activeRows = (db, mid) => db.all("SELECT s.*, us.display_name AS nom FROM parent_meeting_speaker s JOIN app_user us ON us.id = s.user_id AND us.school_id = s.school_id WHERE s.meeting_id = ? AND s.state IN ('accordee','publie') ORDER BY s.id", mid);

// Expulsion de la publication par l'API MediaMTX (best effort, 3 s au plus) ; la direction arrête aussi de la mélanger.
async function kick(ctx, pathName) {
  const base = String(D.env(ctx).NORIA_DIFFUSION_API || 'http://diffusion:9997').replace(/\/$/, '');
  const f = ctx.mtxFetch || fetch; const headers = { authorization: 'Basic ' + Buffer.from(`noria:${apiPassword(ctx)}`).toString('base64') };
  try {
    const r = await f(`${base}/v3/paths/get/${pathName}`, { headers, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const src = (await r.json()).source; if (!src || !src.id) return false;
    const kind = { webRTCSession: 'webrtcsessions', rtspSession: 'rtspsessions', rtmpConn: 'rtmpconns', srtConn: 'srtconns' }[src.type];
    if (!kind) return false;
    const k = await f(`${base}/v3/${kind}/kick/${encodeURIComponent(src.id)}`, { method: 'POST', headers, signal: AbortSignal.timeout(3000) });
    return k.ok;
  } catch { return false; }
}

async function end(db, ctx, rows, by) {
  let expulses = 0;
  for (const r of rows) {
    const c = await db.run("UPDATE parent_meeting_speaker SET state = 'terminee', ended_at = ?, ended_by = ? WHERE id = ? AND state IN ('accordee','publie')", iso(), by, r.id);
    // Expulsion hors de la transaction (pas d'attente réseau pendant la requête) ; la direction cesse aussi le mélange.
    if (c.changes && r.state === 'publie') { expulses++; kick(ctx, pathOf(r.meeting_id, r.id)); }
  }
  return expulses;
}
async function endAll(db, ctx, mid, by) { return end(db, ctx, await db.all("SELECT * FROM parent_meeting_speaker WHERE meeting_id = ? AND state IN ('accordee','publie')", mid), by); }
async function endFor(db, ctx, mid, uid, by) { return end(db, ctx, await db.all("SELECT * FROM parent_meeting_speaker WHERE meeting_id = ? AND user_id = ? AND state IN ('accordee','publie')", mid, uid), by); }

async function liveMeeting(db, u, mid, ctx) {
  D.need(ctx); const m = await D.meetingFor(db, u, mid);
  if (m.direct_state !== 'active' || m.status !== 'en_cours') throw new HttpError(409, 'la diffusion n’est pas en cours');
  return m;
}

// Vue de la direction (ajoutée à GET …/diffusion) : orateurs (avec WHEP + jeton de lecture) et mains levées.
async function organizerView(db, ctx, u, m) {
  const out = { parole_max: maxSpeakers(ctx), orateurs: [], mains: [] };
  if (m.direct_state !== 'active' || m.status !== 'en_cours') return out;
  await sweep(db, m.id);
  out.orateurs = (await activeRows(db, m.id)).map((r) => ({ uid: r.user_id, nom: r.nom, etat: r.state === 'publie' ? 'parle' : 'en_attente',
    whep: `/direct/whip/${pathOf(m.id, r.id)}/whep`, jeton: D.sign(ctx, 'l', m.id, u.id, READ_TTL), chemin: pathOf(m.id, r.id) }));
  out.mains = await db.all(`SELECT q.user_id AS uid, us.display_name AS nom FROM parent_meeting_question q JOIN app_user us ON us.id = q.user_id AND us.school_id = q.school_id
    WHERE q.meeting_id = ? AND q.kind = 'main' AND q.status = 'en_attente' ORDER BY q.id LIMIT 100`, m.id);
  return out;
}

const routes = [
  // Parent : son état de parole (sondé toutes les 3 s tant que la main est levée ou qu'il parle).
  ['GET', /^\/api\/reunions-parents\/(\d+)\/parole$/, async (db, req, u, [mid], ctx) => {
    if (!D.isParent(u)) await refuse(ctx, u, 'reunion_parents.parole', 'parent_meeting', mid, 'rôle');
    if (!D.enabled(ctx)) return { etat: 'aucune' };
    const m = await D.meetingFor(db, u, mid);
    if (m.direct_state !== 'active' || m.status !== 'en_cours') return { etat: 'aucune' };
    await sweep(db, m.id);
    const r = await db.get("SELECT * FROM parent_meeting_speaker WHERE meeting_id = ? AND user_id = ? AND state IN ('accordee','publie') ORDER BY id DESC LIMIT 1", m.id, u.id);
    if (r && r.state === 'accordee') return { etat: 'accordee', whip: `/direct/whip/${pathOf(m.id, r.id)}/whip`, jeton: signGrant(ctx, m.id, u.id, r.id, Math.max(1, Math.floor((Date.parse(r.expires_at) - Date.now()) / 1000))) };
    if (r) return { etat: 'parle' };
    const hand = await db.get("SELECT id FROM parent_meeting_question WHERE meeting_id = ? AND user_id = ? AND kind = 'main' AND status = 'en_attente'", m.id, u.id);
    if (hand) return { etat: 'main_levee' };
    const last = await db.get("SELECT ended_by, ended_at FROM parent_meeting_speaker WHERE meeting_id = ? AND user_id = ? AND state = 'terminee' ORDER BY id DESC LIMIT 1", m.id, u.id);
    if (last && last.ended_by === 'moderateur' && Date.parse(last.ended_at) > Date.now() - 60e3) return { etat: 'coupee' };
    return { etat: 'aucune' };
  }],
  // Parent : arrêter de parler lui-même (ou renoncer à la parole accordée). Jamais l'inverse.
  ['POST', /^\/api\/reunions-parents\/(\d+)\/parole\/arreter$/, async (db, req, u, [mid], ctx) => {
    if (!D.isParent(u)) await refuse(ctx, u, 'reunion_parents.parole', 'parent_meeting', mid, 'rôle');
    D.need(ctx); const m = await D.meetingFor(db, u, mid);
    await endFor(db, ctx, m.id, u.id, 'parent');
    return { ok: true };
  }],
  // Direction : donner la parole à un parent qui a levé la main ; couper son micro.
  ['POST', /^\/api\/reunions-parents\/(\d+)\/parole\/(\d+)\/(donner|couper)$/, async (db, req, u, [mid, uidS, act], ctx) => {
    if (!D.isOrganizer(u)) await refuse(ctx, u, `reunion_parents.parole.${act}`, 'parent_meeting', mid, 'rôle');
    const m = await liveMeeting(db, u, mid, ctx); const uid = id(uidS);
    await sweep(db, m.id);
    if (act === 'couper') {
      const n = await endFor(db, ctx, m.id, uid, 'moderateur');
      await audit(db, u, 'reunion_parents.parole.couper', 'parent_meeting', m.id, `parent ${uid}`);
      return { ok: true, expulsion: n > 0 };
    }
    const hand = await db.get("SELECT id FROM parent_meeting_question WHERE meeting_id = ? AND school_id = ? AND user_id = ? AND kind = 'main' AND status = 'en_attente'", m.id, u.school_id, uid);
    if (!hand) throw new HttpError(409, 'ce parent n’a pas levé la main');
    const act2 = await activeRows(db, m.id);
    if (act2.some((r) => r.user_id === uid)) throw new HttpError(409, 'ce parent a déjà la parole');
    const max = maxSpeakers(ctx);
    if (act2.length >= max) throw new HttpError(409, max === 1 ? 'un parent a déjà la parole : coupez d’abord son micro' : `déjà ${max} parents ont la parole : coupez d’abord un micro`);
    const gid = await db.insert("INSERT INTO parent_meeting_speaker (school_id, meeting_id, user_id, granted_by, state, granted_at, expires_at) VALUES (?,?,?,?,'accordee',?,?)",
      u.school_id, m.id, uid, u.id, iso(), new Date(Date.now() + GRANT_TTL * 1000).toISOString());
    await db.run("UPDATE parent_meeting_question SET status = 'repondue', answered_at = ? WHERE id = ?", iso(), hand.id);
    await audit(db, u, 'reunion_parents.parole.donner', 'parent_meeting', m.id, `parent ${uid}`);
    return { ok: true, chemin: pathOf(m.id, gid) };
  }],
];

// Autorisation MediaMTX pour l'API et les chemins parole-* ; null = pas concerné (chemins reunion-*).
async function authorize(db, ctx, b) {
  if (b.action === 'api') return b.user === 'noria' && same(Buffer.from(String(b.password || '')), Buffer.from(apiPassword(ctx)));
  const pm = /^parole-(\d{1,9})-(\d{1,9})$/.exec(String(b.path || '')); if (!pm) return null;
  const mid = Number(pm[1]); const gid = Number(pm[2]);
  const tok = b.token || b.password || new URLSearchParams(String(b.query || '')).get('jeton');
  const live = await db.get("SELECT id FROM parent_meeting WHERE id = ? AND direct_state = 'active' AND status = 'en_cours'", mid);
  if (!live) return false;
  if (b.action === 'publish') {
    const t = verifyGrant(ctx, tok); if (!t || t.mid !== mid || t.gid !== gid) return false;
    // Usage unique : une seule requête peut faire passer l'autorisation de « accordee » à « publie ».
    const c = await db.run("UPDATE parent_meeting_speaker SET state = 'publie', used_at = ? WHERE id = ? AND meeting_id = ? AND user_id = ? AND state = 'accordee' AND used_at IS NULL AND expires_at > ?",
      iso(), gid, mid, t.uid, iso());
    return c.changes === 1;
  }
  if (b.action === 'read') {
    const t = D.verify(ctx, tok, 'l', mid); if (!t) return false;
    return !!(await db.get("SELECT id FROM parent_meeting_speaker WHERE id = ? AND meeting_id = ? AND state IN ('accordee','publie')", gid, mid));
  }
  return false;
}

module.exports = { routes, authorize, organizerView, endAll, endFor, signGrant, verifyGrant, apiPassword, kick, GRANT_TTL };
