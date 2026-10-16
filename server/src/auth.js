'use strict';
const crypto = require('node:crypto');

// scrypt (module natif de Node) : pas de dépendance cryptographique externe.
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Jeton opaque ; seule son empreinte est stockée en base.
function createSession(db, user, ttlHours = 8) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ttlHours * 3600e3).toISOString();
  db.prepare('INSERT INTO session (token_hash, user_id, school_id, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), user.id, user.school_id, expires);
  return token;
}

function loadSession(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.school_id, u.display_name, u.state, s.expires_at
    FROM session s JOIN app_user u ON u.id = s.user_id AND u.school_id = s.school_id
    WHERE s.token_hash = ?`).get(sha256(token));
  if (!row || row.state !== 'actif' || row.expires_at < new Date().toISOString()) return null;
  row.roles = db.prepare('SELECT role FROM user_role WHERE user_id = ? AND school_id = ?')
    .all(row.id, row.school_id).map((r) => r.role);
  return row;
}

function destroySession(db, token) {
  db.prepare('DELETE FROM session WHERE token_hash = ?').run(sha256(token));
}

module.exports = { hashPassword, verifyPassword, createSession, loadSession, destroySession };
