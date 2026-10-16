'use strict';
// Code de connexion à 6 chiffres : valable 10 min, usage unique, stocké haché (HMAC-SHA256 salé, poivre facultatif
// NORIA_OTP_SECRET), 5 essais au plus, renvoi limité (60 s entre deux codes, 5 codes par heure et par compte, plus le
// limiteur IP/compte), comparaison à temps constant. Réponses identiques que le compte existe ou non.
const crypto = require('node:crypto');
const { HttpError, audit } = require('./common');

const DIGITS = 6;
const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;

const pepper = () => process.env.NORIA_OTP_SECRET || '';
function newCode() { return String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, '0'); }
function hashCode(code, userId, salt = crypto.randomBytes(16).toString('hex')) {
  const mac = crypto.createHmac('sha256', `${pepper()}|${salt}`).update(`${userId}:${code}`).digest('hex');
  return `hmac$${salt}$${mac}`;
}
// Temps constant : on compare toujours deux empreintes de même longueur, même si le format stocké est inattendu.
function checkCode(code, userId, stored) {
  const parts = String(stored || '').split('$');
  const salt = parts.length === 3 ? parts[1] : 'x';
  const expected = Buffer.from(parts.length === 3 ? parts[2] : '0'.repeat(64), 'hex');
  const got = Buffer.from(hashCode(String(code), userId, salt).split('$')[2], 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got) && parts.length === 3;
}
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const generic = { ok: true, message: 'Si ce compte existe, un code vient d’être envoyé.', minutes: TTL_MIN, resendIn: RESEND_SECONDS };

async function request(db, req, ctx, { findUser, parseIdentifier, outbox, reqLang }) {
  const { school } = req.body || {};
  const ident = parseIdentifier(req.body && req.body.identifier);
  const keys = [`code-ip:${req.ip}`, `code:${String(school || '')}|${ident.value}`];
  const wait = await ctx.limiter.blocked(keys);
  if (wait) throw new HttpError(429, 'trop de demandes de code, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
  await ctx.limiter.fail(keys); // chaque demande compte : le renvoi est limité même pour un compte inconnu
  const user = await findUser(db, school, ident);
  if (!user) return generic;
  const last = await db.get('SELECT created_at FROM login_code WHERE school_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', user.school_id, user.id);
  if (last && last.created_at > iso(-RESEND_SECONDS * 1000)) return generic; // renvoi trop rapproché : rien n'est envoyé
  const hour = await db.get('SELECT COUNT(*) AS n FROM login_code WHERE school_id = ? AND user_id = ? AND created_at > ?', user.school_id, user.id, iso(-3600e3));
  if (Number(hour.n) >= MAX_PER_HOUR) { await audit(db, user, 'login.code.request', 'user', user.id, 'plafond horaire', 'refuse'); return generic; }
  const code = newCode();
  await db.tx(async (t) => {
    // Un nouveau code annule les précédents encore valables.
    await t.run('UPDATE login_code SET used_at = ? WHERE school_id = ? AND user_id = ? AND used_at IS NULL', iso(), user.school_id, user.id);
    await t.run('INSERT INTO login_code (school_id, user_id, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)',
      user.school_id, user.id, hashCode(code, user.id), iso(TTL_MIN * 60e3), iso());
  });
  const sch = await db.get('SELECT default_lang FROM school WHERE id = ?', user.school_id);
  const to = ident.field === 'phone' ? user.phone : user.email;
  const sent = await outbox(db, ctx, user.school_id, to, 'code', reqLang(req, sch.default_lang), { code, minutes: TTL_MIN }, [code]);
  await audit(db, user, 'login.code.request', 'user', user.id, `${sent.channel} ${sent.envoi}`);
  return generic;
}

async function verifyLogin(db, req, ctx, { findUser, parseIdentifier, startSession }) {
  const { school } = req.body || {};
  const ident = parseIdentifier(req.body.identifier);
  const code = String(req.body.code ?? '').replace(/\s/g, '');
  // Clé IP + compte : un même réseau d'école (NAT partagé) ne bloque pas tous ses comptes après quelques fautes de frappe.
  const keys = [`code-verif:${req.ip}|${String(school || '')}|${ident.value}`];
  const wait = await ctx.limiter.blocked(keys);
  if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
  const bad = async (user, why) => {
    await ctx.limiter.fail(keys);
    if (user) await audit(db, user, 'login', 'user', user.id, `code ${why}`, 'refuse');
    throw new HttpError(401, 'code invalide ou expiré');
  };
  const user = await findUser(db, school, ident);
  const row = user ? await db.get('SELECT * FROM login_code WHERE school_id = ? AND user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1',
    user.school_id, user.id, iso()) : null;
  if (!row) { checkCode(code, 0, null); return bad(user, 'absent ou expiré'); }
  // L'essai est compté AVANT la comparaison, de façon atomique : deux requêtes parallèles ne dépassent pas 5 essais.
  const take = await db.run('UPDATE login_code SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?', row.id, MAX_ATTEMPTS);
  if (!take.changes) return bad(user, 'essais épuisés');
  const ok = /^\d{6}$/.test(code) & checkCode(code, user.id, row.code_hash);
  if (!ok) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) await db.run('UPDATE login_code SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id);
    return bad(user, 'erroné');
  }
  const use = await db.run('UPDATE login_code SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id);
  if (!use.changes) return bad(user, 'déjà utilisé');
  await ctx.limiter.reset([`code:${String(school || '')}|${ident.value}`]);
  await audit(db, user, 'login', 'user', user.id, `code ${ident.field}`, 'ok');
  return startSession(db, req, ctx, user);
}

module.exports = { request, verifyLogin, hashCode, checkCode, newCode, DIGITS, TTL_MIN, MAX_ATTEMPTS, RESEND_SECONDS, MAX_PER_HOUR };
