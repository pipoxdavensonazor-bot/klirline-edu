'use strict';
// Appareil de confiance (bloc 9) : après une connexion réussie où la personne a coché « Faire confiance à cet appareil »,
// un cookie HttpOnly « noria_appareil » (Secure en production, SameSite=Strict, chemin /api/, 30 jours) permet de rouvrir
// une session sans nouveau code. Seule l'empreinte SHA-256 du jeton est en base ; le jeton est renouvelé à chaque
// reprise (un jeton volé puis réutilisé après la personne ne marche plus). Révocable dans « Connexion et appareils »,
// à la déconnexion (pour cet appareil) et à toute révocation des sessions du compte (récupération, désactivation).
const crypto = require('node:crypto');
const { sha256 } = require('./auth');
const { HttpError, notFound, audit } = require('./common');
const I = require('./identite');

const COOKIE = 'noria_appareil';
const DAYS = 30;
const MAX_PER_USER = 10; // au-delà, les plus anciens sont révoqués
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function parseCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
function setCookie(req, ctx, token, maxAge) {
  req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=${maxAge}${ctx.secureCookie ? '; Secure' : ''}`);
}
const clearCookie = (req, ctx) => setCookie(req, ctx, '', 0);

// Libellé lisible (système · navigateur), sans conserver l'en-tête User-Agent complet.
function label(ua) {
  const s = String(ua || '');
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iPod/i.test(s) ? 'iPhone/iPad' : /Windows/i.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /CrOS/i.test(s) ? 'Chromebook' : /Linux/i.test(s) ? 'Linux' : 'Appareil';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'navigateur';
  return `${os} · ${br}`.slice(0, 80);
}

// Compte actif (même règles que la connexion : adhésion active, école active, identité non verrouillée), avec le
// nombre d'écoles de la personne (choix de l'école après connexion).
async function activeUser(db, schoolId, userId) {
  const u = await db.get(`SELECT u.*, s.slug AS school_slug FROM app_user u JOIN school s ON s.id = u.school_id LEFT JOIN person p ON p.id = u.person_id
    WHERE u.id = ? AND u.school_id = ? AND u.state = 'actif' AND s.status = 'active' AND p.locked_at IS NULL`, userId, schoolId);
  if (u) u.ecoles = u.person_id ? (await I.memberships(db, u.person_id)).length : 1;
  return u;
}

// Appelé par startSession quand la requête de connexion porte trust: true.
async function trust(db, req, ctx, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = iso();
  await db.run('INSERT INTO trusted_device (school_id, user_id, token_hash, label, created_at, last_used_at, expires_at) VALUES (?,?,?,?,?,?,?)',
    user.school_id, user.id, sha256(token), label(req.headers['user-agent']), now, now, iso(DAYS * 86400e3));
  const old = await db.all('SELECT id FROM trusted_device WHERE school_id = ? AND user_id = ? AND revoked_at IS NULL ORDER BY id DESC', user.school_id, user.id);
  for (const r of old.slice(MAX_PER_USER)) await db.run('UPDATE trusted_device SET revoked_at = ? WHERE id = ?', now, r.id);
  await audit(db, user, 'device.trust', 'user', user.id, `${DAYS} jours`);
  setCookie(req, ctx, token, DAYS * 86400);
}

async function current(db, req) {
  const token = parseCookie(req, COOKIE);
  if (!token || !/^[\w-]{20,100}$/.test(token)) return null;
  const row = await db.get('SELECT * FROM trusted_device WHERE token_hash = ?', sha256(token));
  if (!row || row.revoked_at || row.expires_at <= iso()) return null;
  return row;
}

// Déconnexion : l'appareil cesse d'être de confiance (sinon la session se rouvrirait toute seule).
async function forgetCurrent(db, req, ctx) {
  const token = parseCookie(req, COOKIE);
  if (token) {
    await db.run('UPDATE trusted_device SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', iso(), sha256(token));
    clearCookie(req, ctx);
  }
}

function createRoutes({ startSession }) {
  const routes = [
    // Liste des appareils de confiance du compte (école active) ; « actuel » = celui qui fait la requête.
    ['GET', /^\/api\/me\/appareils$/, async (db, req, u) => {
      const cur = parseCookie(req, COOKIE);
      const curHash = cur ? sha256(cur) : '';
      const rows = await db.all(`SELECT id, label, created_at, last_used_at, expires_at, token_hash FROM trusted_device
        WHERE school_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY id DESC`, u.school_id, u.id, iso());
      return rows.map(({ token_hash: h, ...r }) => ({ ...r, actuel: h === curHash }));
    }],
    ['POST', /^\/api\/me\/appareils\/(\d+)\/revoquer$/, async (db, req, u, [id]) => {
      const r = await db.run('UPDATE trusted_device SET revoked_at = ? WHERE id = ? AND school_id = ? AND user_id = ? AND revoked_at IS NULL', iso(), Number(id), u.school_id, u.id);
      if (!r.changes) notFound();
      await audit(db, u, 'device.revoke', 'device', id, null);
      return { ok: true };
    }],
    ['POST', /^\/api\/me\/appareils\/revoquer-tout$/, async (db, req, u, _m, ctx) => {
      const r = await db.run('UPDATE trusted_device SET revoked_at = ? WHERE school_id = ? AND user_id = ? AND revoked_at IS NULL', iso(), u.school_id, u.id);
      clearCookie(req, ctx);
      await audit(db, u, 'device.revoke', 'device', null, `tous (${r.changes})`);
      return { ok: true, revoques: r.changes };
    }],
  ];
  const publicRoutes = [
    // Reprise de session sur un appareil de confiance (cookie seul, en-tête x-noria obligatoire).
    ['POST', /^\/api\/login\/appareil$/, async (db, req, _u, _m, ctx) => {
      if (req.headers['x-noria'] !== '1') throw new HttpError(403, 'en-tête x-noria manquant');
      const keys = [`appareil-ip:${req.ip}`];
      if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de tentatives, réessayez plus tard');
      const row = await current(db, req);
      const user = row && await activeUser(db, row.school_id, row.user_id);
      if (!row || !user) {
        if (parseCookie(req, COOKIE)) { await ctx.limiter.fail(keys); clearCookie(req, ctx); }
        throw new HttpError(401, 'appareil non reconnu');
      }
      // Renouvellement du jeton (même échéance) : l'ancien ne marche plus.
      const token = crypto.randomBytes(32).toString('base64url');
      const upd = await db.run('UPDATE trusted_device SET token_hash = ?, last_used_at = ? WHERE id = ? AND token_hash = ? AND revoked_at IS NULL',
        sha256(token), iso(), row.id, row.token_hash);
      if (!upd.changes) throw new HttpError(401, 'appareil non reconnu');
      setCookie(req, ctx, token, Math.max(60, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000)));
      await audit(db, user, 'login', 'user', user.id, 'appareil de confiance', 'ok');
      req.body = { ...(req.body || {}), trust: false, school: user.school_slug }; // l'école de cet appareil, sans écran de choix
      return startSession(db, req, ctx, user);
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

module.exports = { COOKIE, DAYS, trust, current, forgetCurrent, activeUser, label, parseCookie, createRoutes };
