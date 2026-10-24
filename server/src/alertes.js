'use strict';
// Alertes de sécurité hors de l'application (pt67) : e-mail (Resend, NORIA_ALERTES_EMAIL) et Telegram (conversation
// reliée par le super-admin, table admin_telegram). Aucune donnée personnelle dans les messages : titre de la règle,
// gravité, numéro d'alerte. Plafond global (NORIA_ALERTES_MAX_HEURE, 20 par défaut) pour que rien ne déborde ;
// ce qui dépasse le plafond reste marqué « non signalé » et part dans le récapitulatif suivant.
const crypto = require('node:crypto');
const { sha256 } = require('./auth');
const telegram = require('./telegram');

const H = 3600e3;
const iso = (ms) => new Date(ms).toISOString();
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;

function createAlertes({ db, env = process.env, notifier = null, fetch: f = null, now = () => Date.now(), log = console.error } = {}) {
  const ctx = { env, channelFetch: f || undefined };
  const max = Number(env.NORIA_ALERTES_MAX_HEURE) > 0 ? Number(env.NORIA_ALERTES_MAX_HEURE) : 20;
  const sentAt = [];
  const email = () => { const e = String(env.NORIA_ALERTES_EMAIL || '').trim(); return EMAIL.test(e) ? e : null; };
  const tgOn = () => telegram.enabled(ctx);
  const chats = async () => (tgOn() ? (await db.all('SELECT DISTINCT chat_id FROM admin_telegram WHERE chat_id IS NOT NULL AND revoked_at IS NULL')).map((r) => r.chat_id) : []);
  const room = () => { while (sentAt.length && now() - sentAt[0] > H) sentAt.shift(); return sentAt.length < max; };

  // Envoie un message sur tous les canaux configurés. { force } : message de test (compte quand même dans le plafond).
  async function deliver(subject, text, { skipEmail = null, force = false } = {}) {
    if (!force && !room()) return { sent: false, capped: true, channels: [] };
    const out = [];
    const to = email();
    if (to && notifier && (!skipEmail || to.toLowerCase() !== String(skipEmail).toLowerCase())) {
      try { await notifier.adapter('email').send({ to, subject, text }); out.push('email'); } catch (e) { log(`[alertes] e-mail en échec : ${e.message}`); }
    }
    for (const c of await chats()) {
      try { await telegram.sendMessage(ctx, c, `${subject}\n${text}`); out.push('telegram'); } catch (e) { log(`[alertes] Telegram en échec : ${e.message}`); }
    }
    if (out.length) sentAt.push(now());
    return { sent: out.length > 0, capped: false, channels: out };
  }
  const configured = async () => !!email() || (await chats()).length > 0;

  /* ---------- Liaison Telegram du super-admin ---------- */
  async function status(adminId) {
    const mine = await db.get('SELECT linked_at FROM admin_telegram WHERE admin_id = ? AND chat_id IS NOT NULL AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', adminId);
    return { email: email(), telegram_actif: tgOn(), bot: tgOn() ? telegram.botName(ctx) : null, relie: !!mine, linked_at: mine ? mine.linked_at : null,
      existant: !mine && tgOn() ? !!(await existingChat(adminId)) : false, max_heure: max };
  }
  // Conversation déjà reliée par le super-admin avec son compte d'école (même adresse e-mail), s'il en a un.
  async function existingChat(adminId) {
    const a = await db.get('SELECT email FROM platform_admin WHERE id = ?', adminId); if (!a || !a.email) return null;
    const r = await db.get(`SELECT tl.chat_id FROM telegram_link tl JOIN app_user u ON u.id = tl.user_id AND u.school_id = tl.school_id
      WHERE tl.chat_id IS NOT NULL AND tl.revoked_at IS NULL AND lower(u.email) = lower(?) ORDER BY tl.linked_at DESC LIMIT 1`, a.email);
    return r ? r.chat_id : null;
  }
  async function link(adminId) {
    const n = await db.get('SELECT COUNT(*) AS n FROM admin_telegram WHERE admin_id = ? AND created_at > ?', adminId, iso(now() - H));
    if (Number(n.n) >= 10) return { error: 429 };
    const token = `adm-${crypto.randomBytes(24).toString('base64url')}`;
    await db.run('INSERT INTO admin_telegram (admin_id, token_hash, token_expires_at, created_at) VALUES (?,?,?,?)', adminId, sha256(token), iso(now() + telegram.LINK_MIN * 60e3), iso(now()));
    return { url: `https://t.me/${telegram.botName(ctx)}?start=${token}`, minutes: telegram.LINK_MIN };
  }
  async function useExisting(adminId) {
    const chat = await existingChat(adminId); if (!chat) return false;
    await db.run('UPDATE admin_telegram SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL', iso(now()), adminId);
    await db.run('INSERT INTO admin_telegram (admin_id, chat_id, linked_at, created_at) VALUES (?,?,?,?)', adminId, chat, iso(now()), iso(now()));
    return true;
  }
  async function unlink(adminId) {
    return (await db.run('UPDATE admin_telegram SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL', iso(now()), adminId)).changes;
  }
  return { deliver, configured, status, link, useExisting, unlink, email };
}

// Webhook Telegram : « /start adm-<jeton> » relie la conversation au super-admin (jeton 15 min, usage unique).
async function linkAdminChat(db, token, chatId) {
  const row = await db.get('SELECT * FROM admin_telegram WHERE token_hash = ?', sha256(token));
  const t = new Date().toISOString();
  if (!row || row.chat_id || row.revoked_at || !row.token_expires_at || row.token_expires_at <= t) return false;
  const u = await db.run('UPDATE admin_telegram SET chat_id = ?, linked_at = ?, token_hash = NULL, token_expires_at = NULL WHERE id = ? AND chat_id IS NULL AND revoked_at IS NULL', chatId, t, row.id);
  if (!u.changes) return false;
  await db.run('UPDATE admin_telegram SET revoked_at = ? WHERE admin_id = ? AND id <> ? AND revoked_at IS NULL', t, row.admin_id, row.id);
  await db.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip) VALUES (?,?,?,?,?,?)', row.admin_id, 'admin.alertes.telegram.relier', String(row.admin_id), 'depuis Telegram', 'ok', null);
  return true;
}

module.exports = { createAlertes, linkAdminChat };
