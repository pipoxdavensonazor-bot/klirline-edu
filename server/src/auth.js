'use strict';
const crypto = require('node:crypto');

// scrypt (module natif de Node), en version asynchrone : le calcul tourne hors de la boucle
// d'événements et ne fige pas le serveur pendant une connexion.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (pw, salt, len) => new Promise((ok, ko) =>
  crypto.scrypt(pw, salt, len, SCRYPT, (e, k) => (e ? ko(e) : ok(k))));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const got = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, got);
}

// Hachage factice : pour un e-mail inconnu, on fait le même calcul que pour un vrai compte,
// afin que le temps de réponse ne révèle pas l'existence du compte.
let dummyHash = null;
async function getDummyHash() {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Jeton opaque ; seule son empreinte est stockée en base. Ces fonctions utilisent la connexion système
// (hors RLS) : la session n'est pas encore connue quand on la cherche.
async function createSession(db, user, ttlHours = 8) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ttlHours * 3600e3).toISOString();
  await db.run('INSERT INTO session (token_hash, user_id, school_id, expires_at) VALUES (?,?,?,?)', sha256(token), user.id, user.school_id, expires);
  return token;
}

async function loadSession(db, token) {
  if (!token) return null;
  // Une école suspendue (administration de la plateforme) ferme l'accès de tous ses comptes.
  const row = await db.get(`SELECT u.id, u.school_id, u.person_id, u.display_name, u.state, s.expires_at
    FROM session s JOIN app_user u ON u.id = s.user_id AND u.school_id = s.school_id
    JOIN school sc ON sc.id = u.school_id AND sc.status = 'active'
    LEFT JOIN person p ON p.id = u.person_id
    WHERE s.token_hash = ? AND p.locked_at IS NULL`, sha256(token));
  if (!row || row.state !== 'actif' || row.expires_at < new Date().toISOString()) return null;
  row.roles = (await db.all('SELECT role FROM user_role WHERE user_id = ? AND school_id = ?', row.id, row.school_id)).map((r) => r.role);
  return row;
}

// Révoque toutes les sessions d'un compte (récupération, désactivation).
async function destroyUserSessions(db, userId) {
  await db.run('DELETE FROM session WHERE user_id = ?', userId);
}

async function destroySession(db, token) {
  await db.run('DELETE FROM session WHERE token_hash = ?', sha256(String(token || '')));
}

module.exports = { sha256, hashPassword, verifyPassword, getDummyHash, createSession, loadSession, destroySession, destroyUserSessions };
