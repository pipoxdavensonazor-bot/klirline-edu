'use strict';
// Bot Telegram (bloc 9) : l'API Bot de Telegram est gratuite. La personne relie une fois son compte (lien profond
// t.me/<bot>?start=<jeton>, 15 min, usage unique, depuis « Connexion et appareils ») ; ensuite « Recevoir le code par
// Telegram » lui envoie le code à 6 chiffres dans sa conversation privée avec le bot. Webhook authentifié par l'en-tête
// X-Telegram-Bot-Api-Secret-Token (secret choisi à l'enregistrement du webhook). « /stop » retire la liaison.
// Désactivé tant que NORIA_TELEGRAM_BOT_TOKEN, NORIA_TELEGRAM_WEBHOOK_SECRET et NORIA_TELEGRAM_BOT_USERNAME manquent.
const crypto = require('node:crypto');
const { sha256 } = require('./auth');
const { HttpError, audit } = require('./common');

const LINK_MIN = 15;
const GATED = /^\/api\/(telegram\/|me\/telegram)/;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const envOf = (ctx) => ctx.env || process.env;
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function enabled(ctx) {
  const e = envOf(ctx);
  return /^\d+:[\w-]{20,}$/.test(String(e.NORIA_TELEGRAM_BOT_TOKEN || '')) && /^[\w-]{16,256}$/.test(String(e.NORIA_TELEGRAM_WEBHOOK_SECRET || ''))
    && /^\w{5,32}$/.test(botName(ctx));
}
const botName = (ctx) => String(envOf(ctx).NORIA_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');

const TXT = {
  fr: {
    code: (c, m) => `NORIA : votre code de connexion est ${c}. Valable ${m} min, une seule fois. Ne le donnez à personne.`,
    linked: (n) => `NORIA : compte relié (${n}). Vous recevrez ici vos codes de connexion, gratuitement. Pour arrêter : /stop`,
    badLink: 'NORIA : lien expiré ou déjà utilisé. Ouvrez NORIA > Connexion et appareils > Relier Telegram pour en obtenir un nouveau.',
    help: 'NORIA : pour recevoir vos codes ici, ouvrez NORIA > Connexion et appareils > Relier Telegram. Pour arrêter : /stop',
    stopped: 'NORIA : liaison retirée. Ce bot ne vous enverra plus de codes.',
  },
  ht: {
    code: (c, m) => `NORIA : kòd koneksyon ou se ${c}. Li bon pou ${m} min, yon sèl fwa. Pa bay pèsonn li.`,
    linked: (n) => `NORIA : kont ou konekte (${n}). W ap resevwa kòd koneksyon ou yo la a, gratis. Pou kanpe : /stop`,
    badLink: 'NORIA : lyen an ekspire oswa li deja sèvi. Louvri NORIA > Koneksyon ak aparèy > Konekte Telegram pou jwenn yon lòt.',
    help: 'NORIA : pou resevwa kòd ou yo la a, louvri NORIA > Koneksyon ak aparèy > Konekte Telegram. Pou kanpe : /stop',
    stopped: 'NORIA : koneksyon an retire. Bot sa a p ap voye kòd ba ou ankò.',
  },
};
const tx = (lang) => TXT[lang === 'ht' ? 'ht' : 'fr'];

async function sendMessage(ctx, chatId, text) {
  const f = ctx.channelFetch || fetch;
  const res = await f(`https://api.telegram.org/bot${envOf(ctx).NORIA_TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}

// Conversation liée à la personne (n'importe laquelle de ses adhésions), la plus récente.
async function chatFor(db, user) {
  const r = await db.get(`SELECT tl.chat_id FROM telegram_link tl JOIN app_user u ON u.id = tl.user_id AND u.school_id = tl.school_id
    WHERE tl.chat_id IS NOT NULL AND tl.revoked_at IS NULL AND (tl.user_id = ? OR (u.person_id IS NOT NULL AND u.person_id = ?))
    ORDER BY tl.linked_at DESC, tl.id DESC LIMIT 1`, user.id, user.person_id || -1);
  return r ? r.chat_id : null;
}

// Livraison d'un code de connexion (appelée par otp.request) : jamais d'exception, résultat journalisé par l'appelant.
async function sendCode(ctx, chatId, code, minutes, lang) {
  try { await sendMessage(ctx, chatId, tx(lang).code(code, minutes)); return { channel: 'telegram', envoi: 'envoyé' }; }
  catch (e) { console.error(`[telegram] échec d'envoi : ${e.message}`); return { channel: 'telegram', envoi: 'échec' }; }
}

const lightName = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || 'NORIA'; };

async function handleUpdate(db, ctx, update) {
  const msg = update && (update.message || update.edited_message);
  if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return 'ignore';
  const chatId = String(msg.chat.id);
  if (!/^-?\d{1,20}$/.test(chatId)) return 'ignore';
  const lang = /^ht\b/i.test(String((msg.from && msg.from.language_code) || '')) ? 'ht' : 'fr';
  const text = msg.text.trim();
  const start = text.match(/^\/start(?:@\w+)?(?:\s+([\w-]{1,64}))?$/);
  if (start && start[1]) {
    const row = await db.get('SELECT * FROM telegram_link WHERE token_hash = ?', sha256(start[1]));
    if (!row || row.chat_id || row.revoked_at || !row.token_expires_at || row.token_expires_at <= iso()) { await sendMessage(ctx, chatId, tx(lang).badLink).catch(() => {}); return 'lien_invalide'; }
    const now = iso();
    const done = await db.tx(async (t) => {
      const u = await t.run('UPDATE telegram_link SET chat_id = ?, linked_at = ?, token_hash = NULL, token_expires_at = NULL WHERE id = ? AND chat_id IS NULL AND revoked_at IS NULL', chatId, now, row.id);
      if (!u.changes) return false;
      await t.run('UPDATE telegram_link SET revoked_at = ? WHERE school_id = ? AND user_id = ? AND id <> ? AND revoked_at IS NULL', now, row.school_id, row.user_id, row.id);
      await audit(t, { id: row.user_id, school_id: row.school_id }, 'telegram.link', 'user', row.user_id, null);
      return true;
    });
    if (!done) { await sendMessage(ctx, chatId, tx(lang).badLink).catch(() => {}); return 'lien_invalide'; }
    const u = await db.get('SELECT display_name FROM app_user WHERE id = ? AND school_id = ?', row.user_id, row.school_id);
    await sendMessage(ctx, chatId, tx(lang).linked(lightName(u && u.display_name))).catch(() => {});
    return 'relie';
  }
  if (/^\/(stop|arreter|arrete|kanpe)(@\w+)?$/i.test(text)) {
    const rows = await db.all('SELECT id, school_id, user_id FROM telegram_link WHERE chat_id = ? AND revoked_at IS NULL', chatId);
    for (const r of rows) {
      await db.run('UPDATE telegram_link SET revoked_at = ? WHERE id = ?', iso(), r.id);
      await audit(db, { id: r.user_id, school_id: r.school_id }, 'telegram.unlink', 'user', r.user_id, 'depuis Telegram');
    }
    await sendMessage(ctx, chatId, tx(lang).stopped).catch(() => {});
    return 'arrete';
  }
  await sendMessage(ctx, chatId, tx(lang).help).catch(() => {});
  return 'aide';
}

function createRoutes() {
  const routes = [
    ['GET', /^\/api\/me\/telegram$/, async (db, req, u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const r = await db.get('SELECT linked_at FROM telegram_link WHERE school_id = ? AND user_id = ? AND chat_id IS NOT NULL AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', u.school_id, u.id);
      return { bot: botName(ctx), relie: !!r, linked_at: r ? r.linked_at : null };
    }],
    // Lien profond à ouvrir dans Telegram (bouton « Démarrer ») : 15 min, usage unique.
    ['POST', /^\/api\/me\/telegram\/lien$/, async (db, req, u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const n = await db.get('SELECT COUNT(*) AS n FROM telegram_link WHERE school_id = ? AND user_id = ? AND created_at > ?', u.school_id, u.id, iso(-3600e3));
      if (Number(n.n) >= 10) throw new HttpError(429, 'trop de liens demandés, réessayez dans une heure');
      const token = crypto.randomBytes(24).toString('base64url'); // 32 caractères, alphabet accepté par Telegram
      await db.run('INSERT INTO telegram_link (school_id, user_id, token_hash, token_expires_at, created_at) VALUES (?,?,?,?,?)',
        u.school_id, u.id, sha256(token), iso(LINK_MIN * 60e3), iso());
      return { url: `https://t.me/${botName(ctx)}?start=${token}`, minutes: LINK_MIN };
    }],
    ['POST', /^\/api\/me\/telegram\/delier$/, async (db, req, u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const r = await db.run('UPDATE telegram_link SET revoked_at = ? WHERE school_id = ? AND user_id = ? AND revoked_at IS NULL', iso(), u.school_id, u.id);
      await audit(db, u, 'telegram.unlink', 'user', u.id, null);
      return { ok: true, retires: r.changes };
    }],
  ];
  const publicRoutes = [
    ['POST', /^\/api\/telegram\/webhook$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      if (!safeEq(req.headers['x-telegram-bot-api-secret-token'] || '', envOf(ctx).NORIA_TELEGRAM_WEBHOOK_SECRET)) throw new HttpError(401, 'secret invalide');
      const r = await handleUpdate(db, ctx, req.body);
      return { ok: true, resultat: r }; // toujours 200 : Telegram ne renvoie pas la mise à jour
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

module.exports = { enabled, GATED, createRoutes, chatFor, sendCode, handleUpdate, botName, LINK_MIN };
