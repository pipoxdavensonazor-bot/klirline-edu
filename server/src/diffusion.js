'use strict';
// Diffusion audio des réunions de parents, à coût nul (voir docs/reunion-diffusion-r2.md) :
//   téléphone de la direction --WHIP (WebRTC, Opus)--> MediaMTX (conteneur « diffusion ») --ffmpeg--> HLS AAC 32 kbit/s,
//   segments de 6 s --relais NORIA--> bucket R2 dédié, domaine direct.<domaine> (cache Cloudflare, hors VPS).
//   Les parents connectés de l'école reçoivent une liste .m3u8 signée (jeton court, lié au compte et à la réunion) ;
//   la liste pointe vers des segments dont le chemin contient une clé aléatoire renouvelée à chaque démarrage.
// Désactivée tant que NORIA_DIRECT_URL et NORIA_DIRECT_SECRET ne sont pas définis (routes « diffusion » → 409).
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, notFound, audit, refuse } = require('./common');

const env = (ctx) => (ctx && ctx.env) || process.env;
const enabled = (ctx) => !!(env(ctx).NORIA_DIRECT_URL && String(env(ctx).NORIA_DIRECT_SECRET || '').length >= 32 && ctx && ctx.relay);
const iso = () => new Date().toISOString();
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const isOrganizer = (u) => P.has(u, 'direction', 'secretariat');
const isSpeaker = (u) => P.has(u, 'direction', 'secretariat', 'enseignant');
const isParent = (u) => !isSpeaker(u) && P.has(u, 'parent');
const PUBLISH_TTL = 4 * 3600; const LISTEN_TTL = 3 * 3600;

// Jeton signé : <type>.<réunion>.<utilisateur>.<expiration>.<hmac> (type p = publier, e = écouter).
function sign(ctx, kind, mid, uid, ttl) {
  const body = `${kind}.${mid}.${uid}.${Math.floor(Date.now() / 1000) + ttl}`;
  return `${body}.${crypto.createHmac('sha256', env(ctx).NORIA_DIRECT_SECRET).update(body).digest('base64url')}`;
}
function verify(ctx, tok, kind, mid) {
  const p = String(tok || '').split('.'); if (p.length !== 5 || p[0] !== kind || Number(p[1]) !== mid) return null;
  const want = crypto.createHmac('sha256', env(ctx).NORIA_DIRECT_SECRET).update(p.slice(0, 4).join('.')).digest();
  const got = Buffer.from(p[4], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  if (Number(p[3]) < Date.now() / 1000) return null;
  return { uid: Number(p[2]) };
}
function need(ctx) { if (!enabled(ctx)) throw new HttpError(409, 'diffusion non configurée sur ce serveur'); }

// Même visibilité que le module réunions : parent → réunion de l'école ou d'une classe de ses enfants.
async function meetingFor(db, u, mid) {
  let sql = 'pm.school_id = ?'; let params = [u.school_id];
  if (!isSpeaker(u)) {
    const st = P.studentScope(u, 'st');
    sql = `pm.school_id = ? AND (pm.audience = 'ecole' OR pm.class_id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE e.status = 'actif' AND ${st.sql}))`;
    params = [u.school_id, ...st.params];
  }
  const m = await db.get(`SELECT pm.* FROM parent_meeting pm WHERE pm.id = ? AND ${sql}`, id(mid), ...params);
  if (!m) notFound();
  return m;
}

const routes = [
  // Démarrer : nouvelle clé de chemin, réunion « en cours », jeton WHIP (4 h) pour le téléphone de la direction.
  ['POST', /^\/api\/reunions-parents\/(\d+)\/diffusion\/demarrer$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.diffusion', 'parent_meeting', mid, 'rôle');
    need(ctx); const m = await meetingFor(db, u, mid);
    if (m.status === 'terminee') throw new HttpError(409, 'réunion terminée');
    const key = m.direct_state === 'active' && m.direct_key ? m.direct_key : crypto.randomBytes(16).toString('hex');
    await db.run("UPDATE parent_meeting SET direct_key = ?, direct_state = 'active', direct_started_at = ?, status = 'en_cours' WHERE id = ? AND school_id = ?", key, iso(), m.id, u.school_id);
    ctx.relay.start(m.id, key);
    await audit(db, u, 'reunion_parents.diffusion.start', 'parent_meeting', m.id, null);
    return { whip: `/direct/whip/reunion-${m.id}/whip`, jeton: sign(ctx, 'p', m.id, u.id, PUBLISH_TTL) };
  }],
  ['POST', /^\/api\/reunions-parents\/(\d+)\/diffusion\/arreter$/, async (db, req, u, [mid], ctx) => {
    if (!isOrganizer(u)) await refuse(ctx, u, 'reunion_parents.diffusion', 'parent_meeting', mid, 'rôle');
    need(ctx); const m = await meetingFor(db, u, mid);
    await db.run("UPDATE parent_meeting SET direct_state = 'arretee' WHERE id = ? AND school_id = ?", m.id, u.school_id);
    await require('./parole').endAll(db, ctx, m.id, 'fin');
    const r = await ctx.relay.stop(m.id);
    await audit(db, u, 'reunion_parents.diffusion.stop', 'parent_meeting', m.id, `${r.retires} segment(s) retiré(s) de R2`);
    return { ok: true, ...r };
  }],
  // Écouter : liste signée (3 h) pour un parent de la réunion, ou un intervenant (contrôle du son).
  ['GET', /^\/api\/reunions-parents\/(\d+)\/diffusion$/, async (db, req, u, [mid], ctx) => {
    if (!isSpeaker(u) && !isParent(u)) await refuse(ctx, u, 'reunion_parents.listen', 'parent_meeting', mid, 'rôle');
    if (!enabled(ctx)) return { active: false, configuree: false };
    const m = await meetingFor(db, u, mid);
    const active = m.direct_state === 'active' && m.status === 'en_cours';
    const out = { active, configuree: true, liste: active ? `/api/direct/${m.id}/index.m3u8?t=${sign(ctx, 'e', m.id, u.id, LISTEN_TTL)}` : null };
    if (isSpeaker(u)) { out.auditeurs = ctx.relay.listeners(m.id); out.relais = ctx.relay.stats(m.id); }
    if (isOrganizer(u)) Object.assign(out, await require('./parole').organizerView(db, ctx, u, m));
    return out;
  }],
];

const publicRoutes = [
  // Liste HLS (lue toutes les ~6 s par chaque auditeur) : aucune session, jeton signé seulement ; rien en base.
  ['GET', /^\/api\/direct\/(\d+)\/index\.m3u8$/, async (db, req, _u, [mid], ctx) => {
    if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
    const n = id(mid); const t = verify(ctx, req.query.get('t'), 'e', n); if (!t) throw new HttpError(403, 'jeton invalide ou expiré');
    let key = ctx.relay.keyCache && ctx.relay.keyCache.get(n);
    if (!key || Date.now() - key.at > 15e3) {
      const m = await db.get("SELECT direct_key FROM parent_meeting WHERE id = ? AND direct_state = 'active' AND status = 'en_cours'", n);
      key = { k: m ? m.direct_key : null, at: Date.now() }; (ctx.relay.keyCache ||= new Map()).set(n, key);
    }
    const txt = key.k && ctx.relay.playlist(n, key.k);
    if (!txt) throw new HttpError(404, 'diffusion pas encore commencée');
    ctx.relay.seen(n, t.uid);
    return { __file: Buffer.from(txt), type: 'application/vnd.apple.mpegurl', inline: true, cache: 'no-store' };
  }, { public: true }],
  // Autorisation MediaMTX (authMethod: http, réseau Docker interne ; Caddy refuse /api/interne/*).
  //   publish : jeton « p » valide pour cette réunion et diffusion active ; read : ffmpeg local (127.0.0.1) seulement.
  ['POST', /^\/api\/interne\/diffusion\/auth$/, async (db, req, _u, _m, ctx) => {
    if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
    const b = req.body || {};
    const pr = await require('./parole').authorize(db, ctx, b); if (pr !== null) { if (!pr) throw new HttpError(401, 'refusé'); return { ok: true }; }
    const pm = /^reunion-(\d{1,9})$/.exec(String(b.path || ''));
    if (b.action === 'read' && ['127.0.0.1', '::1'].includes(String(b.ip)) && pm) return { ok: true };
    if (b.action !== 'publish' || !pm) throw new HttpError(401, 'refusé');
    const mid = Number(pm[1]); const q = new URLSearchParams(String(b.query || ''));
    const t = verify(ctx, b.token || b.password || q.get('jeton'), 'p', mid); if (!t) throw new HttpError(401, 'refusé');
    const m = await db.get("SELECT id FROM parent_meeting WHERE id = ? AND direct_state = 'active' AND status = 'en_cours'", mid);
    if (!m) throw new HttpError(401, 'refusé');
    return { ok: true };
  }, { public: true }],
];

// Au démarrage du serveur : reprendre le relais des diffusions restées actives (redémarrage du conteneur).
async function resume(db, relay) {
  const rows = await db.all("SELECT id, direct_key FROM parent_meeting WHERE direct_state = 'active' AND status = 'en_cours' AND direct_key IS NOT NULL");
  for (const r of rows) relay.start(r.id, r.direct_key);
  return rows.length;
}

module.exports = { routes, publicRoutes, enabled, sign, verify, resume, meetingFor, need, isOrganizer, isParent, isSpeaker, env };
