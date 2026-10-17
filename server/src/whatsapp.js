'use strict';
// WhatsApp « inversé » (bloc 9) : au lieu d'ENVOYER un code (payant), NORIA en AFFICHE un et la personne l'envoie
// depuis son WhatsApp au numéro NORIA (lien wa.me pré-rempli « NORIA 123456 »). Meta ne facture pas les messages
// reçus. Le webhook de la WhatsApp Cloud API (signature X-Hub-Signature-256, HMAC-SHA256 du corps avec le secret de
// l'application) relie le numéro expéditeur et le code à la demande en attente ; le navigateur interroge toutes les
// 3 s et la session s'ouvre. WhatsApp garantit que l'expéditeur possède bien ce numéro : la preuve vaut un code SMS.
// Réponse facultative et gratuite dans la fenêtre de service : réaction ✅ (par défaut) ou court texte.
// Désactivé tant que NORIA_WHATSAPP_NUMBER, NORIA_WHATSAPP_VERIFY_TOKEN et NORIA_WHATSAPP_APP_SECRET ne sont pas réglés.
const crypto = require('node:crypto');
const { sha256 } = require('./auth');
const { HttpError, audit } = require('./common');
const otp = require('./otp');
const { activeUser } = require('./appareils');

const TTL_MIN = 10;
const POLL_SECONDS = 3;
const GATED = /^\/api\/(login\/whatsapp|whatsapp\/)/;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const envOf = (ctx) => ctx.env || process.env;
const digits = (v) => String(v || '').replace(/\D/g, '');

function enabled(ctx) {
  const e = envOf(ctx);
  return digits(e.NORIA_WHATSAPP_NUMBER).length >= 8 && String(e.NORIA_WHATSAPP_VERIFY_TOKEN || '').length >= 16
    && String(e.NORIA_WHATSAPP_APP_SECRET || '').length >= 16;
}
const number = (ctx) => digits(envOf(ctx).NORIA_WHATSAPP_NUMBER);
function waLink(ctx, code) { return `https://wa.me/${number(ctx)}?text=${encodeURIComponent(`NORIA ${code}`)}`; }
const codeHash = (code, phone) => otp.hashCode(code, `wa:${phone}`);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Signature Meta : « sha256=<hex HMAC-SHA256(secret de l'application, corps brut)> ».
function validSignature(ctx, req) {
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const want = `sha256=${crypto.createHmac('sha256', String(envOf(ctx).NORIA_WHATSAPP_APP_SECRET)).update(req.rawBuffer || Buffer.from(req.rawBody || '')).digest('hex')}`;
  return safeEq(sig, want);
}

// Réponse gratuite (fenêtre de service de 24 h ouverte par le message reçu) : réaction ou texte.
async function reply(ctx, to, messageId, lang) {
  const e = envOf(ctx);
  const mode = String(e.NORIA_WHATSAPP_REPLY || 'reaction');
  if (!e.NORIA_WHATSAPP_TOKEN || !e.NORIA_WHATSAPP_PHONE_ID || mode === '0' || mode === 'non') return null;
  const body = mode === 'texte'
    ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: lang === 'ht'
      ? 'NORIA : koneksyon an konfime. Retounen sou paj koneksyon an. Si se pa ou ki te mande l, avèti lekòl ou.'
      : 'NORIA : connexion confirmée. Revenez sur la page de connexion. Si ce n’est pas vous, prévenez votre école.' } }
    : { messaging_product: 'whatsapp', to, type: 'reaction', reaction: { message_id: messageId, emoji: '✅' } };
  const version = /^v\d+\.\d+$/.test(String(e.NORIA_WHATSAPP_GRAPH_VERSION || '')) ? e.NORIA_WHATSAPP_GRAPH_VERSION : 'v21.0';
  const f = ctx.channelFetch || fetch;
  try {
    const res = await f(`https://graph.facebook.com/${version}/${encodeURIComponent(e.NORIA_WHATSAPP_PHONE_ID)}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${e.NORIA_WHATSAPP_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) console.error(`[whatsapp] réponse refusée : HTTP ${res.status}`);
    return res.ok;
  } catch (err) { console.error(`[whatsapp] réponse impossible : ${err.message}`); return false; }
}

// Un message reçu : « NORIA 123456 » (espaces, tirets et majuscules tolérés) depuis le numéro du compte.
async function handleMessage(db, ctx, msg) {
  if (!msg || msg.type !== 'text' || !msg.text) return 'ignore';
  const m = String(msg.text.body || '').match(/\bNORIA\b[\s:.\-]*(\d{3})[\s-]?(\d{3})\b/i);
  if (!m) return 'ignore';
  const ts = Number(msg.timestamp);
  if (Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) > TTL_MIN * 60) return 'ancien';
  const phone = `+${digits(msg.from)}`;
  const code = m[1] + m[2];
  const rows = await db.all("SELECT * FROM login_challenge WHERE phone = ? AND status = 'en_attente' AND expires_at > ? ORDER BY id DESC LIMIT 5", phone, iso());
  // Comparaison à temps constant pour chaque demande ouverte de ce numéro (quelques lignes au plus).
  const hit = rows.find((r) => otp.checkCode(code, `wa:${phone}`, r.code_hash));
  if (!hit) return 'inconnu';
  const upd = await db.run("UPDATE login_challenge SET status = 'verifie', verified_at = ? WHERE id = ? AND status = 'en_attente'", iso(), hit.id);
  if (!upd.changes) return 'inconnu';
  await audit(db, { id: hit.user_id, school_id: hit.school_id }, 'login.whatsapp.verify', 'user', hit.user_id, 'message reçu du numéro du compte');
  const sch = await db.get('SELECT default_lang FROM school WHERE id = ?', hit.school_id);
  await reply(ctx, digits(msg.from), msg.id, sch && sch.default_lang);
  return 'verifie';
}

function createRoutes({ findUser, parseIdentifier, startSession }) {
  return [
    // 1) Demande : un code court à envoyer par WhatsApp ; réponse identique que le compte existe ou non.
    ['POST', /^\/api\/login\/whatsapp$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const { school } = req.body || {};
      const ident = parseIdentifier(req.body && req.body.identifier);
      const keys = [`wa-ip:${req.ip}`, `wa:${String(school || '')}|${ident.value}`];
      const wait = await ctx.limiter.blocked(keys);
      if (wait) throw new HttpError(429, 'trop de demandes, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
      await ctx.limiter.fail(keys);
      const ticket = crypto.randomBytes(32).toString('base64url');
      const code = otp.newCode();
      const user = await findUser(db, school, ident);
      if (user && user.phone) {
        await db.tx(async (t) => {
          await t.run("UPDATE login_challenge SET status = 'utilise', used_at = ? WHERE school_id = ? AND user_id = ? AND status <> 'utilise'", iso(), user.school_id, user.id);
          await t.run(`INSERT INTO login_challenge (school_id, user_id, ticket_hash, phone, code_hash, trust, school_given, expires_at, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)`, user.school_id, user.id, sha256(ticket), user.phone, codeHash(code, user.phone),
          req.body.trust === true ? 1 : 0, school ? 1 : 0, iso(TTL_MIN * 60e3), iso());
        });
        await audit(db, user, 'login.whatsapp.request', 'user', user.id, ident.field);
      }
      return { ticket, code, number: `+${number(ctx)}`, link: waLink(ctx, code), minutes: TTL_MIN, pollSeconds: POLL_SECONDS };
    }, { public: true }],
    // 2) Interrogation par le navigateur (ticket secret). Tant que rien n'est vérifié : « en_attente », que la demande
    //    existe, ait expiré ou non (aucune information sur l'existence du compte). Vérifiée : session ouverte.
    ['POST', /^\/api\/login\/whatsapp\/statut$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const ticket = String((req.body && req.body.ticket) || '');
      if (!/^[\w-]{40,64}$/.test(ticket)) throw new HttpError(400, 'ticket invalide');
      const row = await db.get('SELECT * FROM login_challenge WHERE ticket_hash = ?', sha256(ticket));
      if (!row || row.status !== 'verifie' || row.expires_at <= iso()) return { statut: 'en_attente' };
      const use = await db.run("UPDATE login_challenge SET status = 'utilise', used_at = ? WHERE id = ? AND status = 'verifie'", iso(), row.id);
      if (!use.changes) return { statut: 'en_attente' };
      const user = await activeUser(db, row.school_id, row.user_id);
      if (!user) return { statut: 'en_attente' };
      await audit(db, user, 'login', 'user', user.id, 'whatsapp', 'ok');
      req.body = { ...req.body, trust: row.trust === 1, school: row.school_given ? user.school_slug : '' };
      return { statut: 'ok', ...(await startSession(db, req, ctx, user)) };
    }, { public: true }],
    // Webhook Meta : vérification de l'abonnement (GET) puis messages entrants (POST signé).
    ['GET', /^\/api\/whatsapp\/webhook$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const q = req.query;
      const challenge = String(q.get('hub.challenge') || '');
      if (q.get('hub.mode') !== 'subscribe' || !safeEq(q.get('hub.verify_token') || '', envOf(ctx).NORIA_WHATSAPP_VERIFY_TOKEN) || !/^[\w.-]{1,128}$/.test(challenge))
        throw new HttpError(403, 'jeton de vérification invalide');
      return { __file: Buffer.from(challenge), type: 'text/plain; charset=utf-8', inline: true };
    }, { public: true }],
    ['POST', /^\/api\/whatsapp\/webhook$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      if (!validSignature(ctx, req)) throw new HttpError(401, 'signature invalide');
      const phoneId = envOf(ctx).NORIA_WHATSAPP_PHONE_ID;
      const out = [];
      for (const entry of (req.body && Array.isArray(req.body.entry) ? req.body.entry : []).slice(0, 20)) {
        for (const ch of (Array.isArray(entry.changes) ? entry.changes : []).slice(0, 20)) {
          const v = ch && ch.value;
          if (!v || (phoneId && v.metadata && v.metadata.phone_number_id && String(v.metadata.phone_number_id) !== String(phoneId))) continue;
          for (const msg of (Array.isArray(v.messages) ? v.messages : []).slice(0, 50)) out.push(await handleMessage(db, ctx, msg));
        }
      }
      // Toujours 200 une fois la signature vérifiée : Meta ne renvoie pas le message.
      return { ok: true, traites: out.length };
    }, { public: true }],
  ];
}

module.exports = { enabled, GATED, createRoutes, handleMessage, validSignature, waLink, TTL_MIN, POLL_SECONDS };
