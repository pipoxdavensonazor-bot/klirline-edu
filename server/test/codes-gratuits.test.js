'use strict';
// Bloc 9 : codes de connexion gratuits — WhatsApp inversé (webhook Meta signé), bot Telegram (secret d'en-tête),
// canal e-mail explicite, appareils de confiance (30 jours, révocables), codes d'activation imprimés par l'école.
// Aucun SMS payant : le fournisseur SMS reste « console » par défaut et n'est jamais activé ici. Aucun appel réseau :
// les API Meta et Telegram passent par un faux fetch.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const A = require('../src/appareils');
const ACT = require('../src/activation');

const ENV = {
  NORIA_WHATSAPP_NUMBER: '+509 3700-0000', NORIA_WHATSAPP_VERIFY_TOKEN: 'jeton-verif-fictif-123456', NORIA_WHATSAPP_APP_SECRET: 'secret-app-fictif-0123456789',
  NORIA_WHATSAPP_TOKEN: 'jeton-graph-fictif', NORIA_WHATSAPP_PHONE_ID: '111222333',
  NORIA_TELEGRAM_BOT_TOKEN: '123456:ABCdefGHIjklMNOpqrSTUvwx-yz', NORIA_TELEGRAM_WEBHOOK_SECRET: 'secret-webhook-fictif-tg', NORIA_TELEGRAM_BOT_USERNAME: 'NoriaFictifBot',
};
let db, ids, on, off; const sent = []; const calls = [];
const notifier = { adapter: (channel) => ({ name: `test-${channel}`, simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: `id-${sent.length}` }; } }) };
const channelFetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers }); return { ok: true, status: 200, async json() { return { ok: true }; } }; };

async function listen(options) {
  const s = createServer(db, { notifier, rateLimit: { max: 1000 }, security: false, portal: false, staticRoot: false, channelFetch, ...options });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  s.base = `http://127.0.0.1:${s.address().port}`;
  return s;
}
// Requête HTTP : renvoie statut, JSON (ou texte) et cookies posés.
async function call(s, method, path, { body, token, cookie, headers = {}, raw } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  const res = await fetch(s.base + path, { method, headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* texte */ }
  const cookies = {};
  for (const c of res.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('='); cookies[kv.slice(0, i)] = { value: kv.slice(i + 1), attrs: attrs.map((x) => x.trim()) }; }
  return { status: res.status, json, text, cookies };
}
const login = async (s, handle, extra = {}) => call(s, 'POST', '/api/login', { body: { school: 'ecole-a', identifier: `${handle}@a.exemple.invalid`, password: DEMO_PASSWORD, ...extra } });
const sign = (raw) => `sha256=${crypto.createHmac('sha256', ENV.NORIA_WHATSAPP_APP_SECRET).update(raw).digest('hex')}`;
const waBody = (from, text, ts = Math.floor(Date.now() / 1000)) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages',
  value: { messaging_product: 'whatsapp', metadata: { phone_number_id: ENV.NORIA_WHATSAPP_PHONE_ID }, contacts: [{ wa_id: from }],
    messages: [{ from, id: `wamid.${crypto.randomBytes(4).toString('hex')}`, timestamp: String(ts), type: 'text', text: { body: text } }] } }] }] });
const hook = (s, raw, sig = sign(raw)) => call(s, 'POST', '/api/whatsapp/webhook', { raw, headers: { 'x-hub-signature-256': sig } });
const PROF1 = '+50900000103';

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  on = await listen({ env: { ...process.env, ...ENV } });
  off = await listen({ env: { ...process.env, NORIA_WHATSAPP_NUMBER: '', NORIA_TELEGRAM_BOT_TOKEN: '' }, notifier: undefined });
});
after(async () => { on.close(); off.close(); await db.cleanup(); });

test('par défaut : WhatsApp et Telegram désactivés (404), aucun SMS proposé, e-mail et code de l’école proposés', async () => {
  const c = await call(off, 'GET', '/api/config');
  assert.equal(c.status, 200);
  assert.deepEqual(c.json.canaux, { email: true, ecole: true });
  for (const [m, p] of [['POST', '/api/login/whatsapp'], ['POST', '/api/login/whatsapp/statut'], ['GET', '/api/whatsapp/webhook'], ['POST', '/api/whatsapp/webhook'], ['POST', '/api/telegram/webhook'], ['GET', '/api/me/telegram']])
    assert.equal((await call(off, m, p, { body: m === 'POST' ? {} : undefined })).status, 404, p);
  const r = await call(off, 'POST', '/api/login/code', { body: { school: 'ecole-a', identifier: PROF1, channel: 'telegram' } });
  assert.equal(r.status, 400, 'Telegram non configuré');
  const conf = await call(on, 'GET', '/api/config');
  assert.equal(conf.json.canaux.whatsapp, true); assert.equal(conf.json.canaux.telegram, 'NoriaFictifBot');
  // Le fournisseur SMS n'est pas touché : « console » (simulé) par défaut.
  const { createNotifier } = require('../src/notify');
  assert.equal(createNotifier({}).adapter('sms').name, 'console');
});

test('WhatsApp inversé : code affiché, message signé du bon numéro, interrogation, session ouverte une seule fois', async () => {
  const r = await call(on, 'POST', '/api/login/whatsapp', { body: { school: 'ecole-a', identifier: PROF1, trust: true } });
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^\d{6}$/); assert.match(r.json.ticket, /^[\w-]{43}$/);
  assert.equal(r.json.number, '+50937000000'); assert.equal(r.json.pollSeconds, 3); assert.equal(r.json.minutes, 10);
  assert.equal(r.json.link, `https://wa.me/50937000000?text=NORIA%20${r.json.code}`);
  const row = await db.get("SELECT * FROM login_challenge WHERE phone = ? ORDER BY id DESC LIMIT 1", PROF1);
  assert.ok(!row.code_hash.includes(r.json.code) && !row.ticket_hash.includes(r.json.ticket), 'codes hachés');
  const poll = () => call(on, 'POST', '/api/login/whatsapp/statut', { body: { ticket: r.json.ticket } });
  assert.deepEqual((await poll()).json, { statut: 'en_attente' });
  // Vérification de l'abonnement par Meta.
  const v = await call(on, 'GET', `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${ENV.NORIA_WHATSAPP_VERIFY_TOKEN}&hub.challenge=1158201444`);
  assert.equal(v.status, 200); assert.equal(v.text, '1158201444');
  assert.equal((await call(on, 'GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=mauvais&hub.challenge=1')).status, 403);
  // Signature absente, fausse ou corps modifié : refusé.
  const good = waBody('50900000103', `NORIA ${r.json.code}`);
  assert.equal((await hook(on, good, '')).status, 401);
  assert.equal((await hook(on, good, sign(good + ' '))).status, 401);
  // Bon code depuis un AUTRE numéro, mauvais code, message trop ancien : rien n'est vérifié.
  for (const raw of [waBody('50900000104', `NORIA ${r.json.code}`), waBody('50900000103', 'NORIA 000000'.replace('000000', r.json.code === '000000' ? '111111' : '000000')),
    waBody('50900000103', `NORIA ${r.json.code}`, Math.floor(Date.now() / 1000) - 3600)]) assert.equal((await hook(on, raw)).status, 200);
  assert.deepEqual((await poll()).json, { statut: 'en_attente' });
  calls.length = 0;
  assert.equal((await hook(on, good)).status, 200);
  // Réaction ✅ gratuite (fenêtre de service), par l'API Graph.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/111222333/messages');
  assert.equal(calls[0].body.type, 'reaction'); assert.equal(calls[0].body.to, '50900000103'); assert.equal(calls[0].headers.authorization, 'Bearer jeton-graph-fictif');
  const ok = await poll();
  assert.equal(ok.json.statut, 'ok'); assert.ok(ok.json.token);
  assert.ok(ok.cookies.noria_session, 'cookie de session');
  assert.ok(ok.cookies.noria_appareil, 'appareil de confiance demandé');
  const me = await call(on, 'GET', '/api/me', { token: ok.json.token });
  assert.equal(me.status, 200); assert.equal(me.json.id, ids.A.users.prof1);
  assert.deepEqual((await poll()).json, { statut: 'en_attente' }, 'usage unique');
  // Même message rejoué : plus rien à vérifier.
  assert.equal((await hook(on, good)).status, 200);
  assert.deepEqual((await poll()).json, { statut: 'en_attente' });
});

test('WhatsApp inversé : compte inconnu → même réponse, rien en base ; réponse texte facultative', async () => {
  const n = (await db.get('SELECT COUNT(*) AS n FROM login_challenge')).n;
  const r = await call(on, 'POST', '/api/login/whatsapp', { body: { school: 'ecole-a', identifier: '+50900009999' } });
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.json).sort(), ['code', 'link', 'minutes', 'number', 'pollSeconds', 'ticket']);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM login_challenge')).n, n);
  const t = await listen({ env: { ...process.env, ...ENV, NORIA_WHATSAPP_REPLY: 'texte' } });
  try {
    const q = await call(t, 'POST', '/api/login/whatsapp', { body: { school: 'ecole-a', identifier: PROF1, lang: 'fr' } });
    calls.length = 0;
    await hook(t, waBody('50900000103', `Bonjour, noria ${q.json.code.slice(0, 3)} ${q.json.code.slice(3)}`));
    assert.equal(calls.length, 1); assert.equal(calls[0].body.type, 'text'); assert.match(calls[0].body.text.body, /connexion confirmée/);
    assert.equal((await call(t, 'POST', '/api/login/whatsapp/statut', { body: { ticket: q.json.ticket } })).json.statut, 'ok');
  } finally { t.close(); }
});

test('Telegram : lien profond, webhook authentifié, code reçu gratuitement, /stop', async () => {
  const s = await login(on, 'prof2');
  const tok = s.json.token;
  assert.deepEqual((await call(on, 'GET', '/api/me/telegram', { token: tok })).json, { bot: 'NoriaFictifBot', relie: false, linked_at: null });
  const l = await call(on, 'POST', '/api/me/telegram/lien', { token: tok, body: {} });
  assert.equal(l.status, 200);
  const m = l.json.url.match(/^https:\/\/t\.me\/NoriaFictifBot\?start=([\w-]{32})$/); assert.ok(m, l.json.url);
  const upd = (text, chat = 4242) => ({ update_id: 1, message: { message_id: 1, date: 0, chat: { id: chat, type: 'private' }, from: { id: chat, language_code: 'fr' }, text } });
  const tg = (body, secret = ENV.NORIA_TELEGRAM_WEBHOOK_SECRET) => call(on, 'POST', '/api/telegram/webhook', { body, headers: { 'x-telegram-bot-api-secret-token': secret } });
  assert.equal((await tg(upd(`/start ${m[1]}`), 'mauvais-secret-0000')).status, 401);
  assert.equal((await call(on, 'POST', '/api/telegram/webhook', { body: upd(`/start ${m[1]}`) })).status, 401);
  calls.length = 0;
  const a = await tg(upd(`/start ${m[1]}`));
  assert.equal(a.status, 200); assert.equal(a.json.resultat, 'relie');
  assert.equal(calls[0].url, `https://api.telegram.org/bot${ENV.NORIA_TELEGRAM_BOT_TOKEN}/sendMessage`); assert.equal(calls[0].body.chat_id, '4242');
  assert.equal((await tg(upd(`/start ${m[1]}`, 777))).json.resultat, 'lien_invalide', 'jeton à usage unique');
  assert.equal((await call(on, 'GET', '/api/me/telegram', { token: tok })).json.relie, true);
  // Code par Telegram (aucun SMS, aucun e-mail).
  calls.length = 0; const before = sent.length;
  const r = await call(on, 'POST', '/api/login/code', { body: { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', channel: 'telegram' } });
  assert.equal(r.status, 200); assert.equal(sent.length, before);
  assert.equal(calls.length, 1); assert.equal(calls[0].body.chat_id, '4242');
  const code = calls[0].body.text.match(/\b(\d{6})\b/)[1];
  const ok = await call(on, 'POST', '/api/login', { body: { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', method: 'code', code } });
  assert.equal(ok.status, 200);
  // Groupe ou canal : ignoré.
  assert.equal((await tg({ message: { chat: { id: -100, type: 'group' }, text: '/start x' } })).json.resultat, 'ignore');
  // /stop : plus de codes par Telegram (réponse identique, rien d'envoyé).
  assert.equal((await tg(upd('/stop'))).json.resultat, 'arrete');
  await db.run('UPDATE login_code SET created_at = ? WHERE user_id = ?', new Date(Date.now() - 120e3).toISOString(), ids.A.users.prof2);
  calls.length = 0;
  const r2 = await call(on, 'POST', '/api/login/code', { body: { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', channel: 'telegram' } });
  assert.equal(r2.status, 200); assert.equal(calls.length, 0);
});

test('canal e-mail explicite : le code part à l’adresse du compte même avec un téléphone', async () => {
  const before = sent.length;
  const r = await call(on, 'POST', '/api/login/code', { body: { school: 'ecole-a', identifier: '+50900000105', channel: 'email' } });
  assert.equal(r.status, 200); assert.equal(sent.length, before + 1);
  assert.equal(sent[sent.length - 1].channel, 'email'); assert.equal(sent[sent.length - 1].to, 'compta@a.exemple.invalid');
});

test('appareil de confiance : cookie 30 jours haché, reprise sans code, jeton renouvelé, liste et révocation', async () => {
  const s = await login(on, 'biblio', { trust: true });
  const c = s.cookies.noria_appareil;
  assert.ok(c, 'cookie posé');
  assert.ok(c.attrs.includes('HttpOnly') && c.attrs.includes('SameSite=Strict') && c.attrs.includes('Path=/api/') && c.attrs.includes(`Max-Age=${30 * 86400}`), c.attrs.join(';'));
  const row = await db.get('SELECT * FROM trusted_device WHERE user_id = ? ORDER BY id DESC LIMIT 1', ids.A.users.biblio);
  assert.notEqual(row.token_hash, c.value); assert.equal(row.revoked_at, null);
  assert.ok(Date.parse(row.expires_at) - Date.now() > 29.9 * 86400e3);
  const cookie = `${A.COOKIE}=${c.value}`;
  assert.equal((await call(on, 'GET', '/api/config', { cookie })).json.appareil, true);
  assert.equal((await call(on, 'POST', '/api/login/appareil', { cookie, body: {} })).status, 403, 'en-tête x-noria exigé');
  const r = await call(on, 'POST', '/api/login/appareil', { cookie, body: {}, headers: { 'x-noria': '1' } });
  assert.equal(r.status, 200); assert.ok(r.json.token); assert.ok(r.cookies.noria_session);
  const fresh = r.cookies.noria_appareil.value; assert.notEqual(fresh, c.value);
  assert.equal((await call(on, 'POST', '/api/login/appareil', { cookie, body: {}, headers: { 'x-noria': '1' } })).status, 401, 'ancien jeton refusé');
  const cookie2 = `${A.COOKIE}=${fresh}`;
  const list = await call(on, 'GET', '/api/me/appareils', { token: r.json.token, cookie: cookie2 });
  assert.equal(list.status, 200); assert.equal(list.json.length, 1); assert.equal(list.json[0].actuel, true); assert.ok(!('token_hash' in list.json[0]));
  assert.equal(list.json[0].label, 'Appareil · navigateur');
  assert.equal((await call(on, 'POST', `/api/me/appareils/${list.json[0].id}/revoquer`, { token: r.json.token, body: {} })).status, 200);
  assert.equal((await call(on, 'POST', '/api/login/appareil', { cookie: cookie2, body: {}, headers: { 'x-noria': '1' } })).status, 401, 'révoqué');
  // Autre compte : ne peut pas révoquer l'appareil d'autrui.
  const other = await login(on, 'direction', { trust: true });
  const id = (await db.get('SELECT id FROM trusted_device WHERE user_id = ? ORDER BY id DESC LIMIT 1', ids.A.users.direction)).id;
  assert.equal((await call(on, 'POST', `/api/me/appareils/${id}/revoquer`, { token: r.json.token, body: {} })).status, 404);
  // Déconnexion : l'appareil cesse d'être de confiance.
  const dc = `${A.COOKIE}=${other.cookies.noria_appareil.value}`;
  await call(on, 'POST', '/api/logout', { token: other.json.token, cookie: dc, body: {} });
  assert.equal((await call(on, 'POST', '/api/login/appareil', { cookie: dc, body: {}, headers: { 'x-noria': '1' } })).status, 401);
  // Sans case cochée : aucun appareil de confiance.
  assert.equal((await login(on, 'compta')).cookies.noria_appareil, undefined);
  // Révocation de toutes les sessions (récupération, désactivation) : appareils révoqués aussi.
  const p = await login(on, 'prof1', { trust: true });
  await require('../src/auth').destroyUserSessions(db, ids.A.users.prof1);
  assert.equal((await call(on, 'POST', '/api/login/appareil', { cookie: `${A.COOKIE}=${p.cookies.noria_appareil.value}`, body: {}, headers: { 'x-noria': '1' } })).status, 401);
  assert.equal(A.label('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'Android · Chrome');
});

test('codes d’activation : direction et secrétariat seulement, liste imprimable, usage unique, nouveau code annule l’ancien', async () => {
  const dir = (await login(on, 'direction')).json.token;
  const prof = (await login(on, 'prof1')).json.token;
  assert.equal((await call(on, 'POST', '/api/codes-activation', { token: prof, body: { role: 'eleve' } })).status, 403);
  assert.equal((await call(on, 'POST', '/api/codes-activation', { token: dir, body: { role: 'direction' } })).status, 400);
  assert.equal((await call(on, 'POST', '/api/codes-activation', { token: dir, body: { role: 'eleve', days: 365 } })).status, 400);
  const g = await call(on, 'POST', '/api/codes-activation', { token: dir, body: { role: 'eleve', class_id: ids.A.classes[0] } });
  assert.equal(g.status, 200); assert.equal(g.json.codes.length, 1);
  const first = g.json.codes[0];
  assert.match(first.code, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
  assert.equal(first.student_code, 'A-001'); assert.equal(first.class, '7e A'); assert.equal(g.json.school.slug, 'ecole-a');
  const stored = await db.get('SELECT code_hash FROM activation_code WHERE batch = ?', g.json.batch);
  assert.ok(!stored.code_hash.includes(ACT.normalize(first.code)));
  // Nouveau lot pour le même compte : l'ancien code est annulé.
  const sec = (await login(on, 'secretariat')).json.token;
  const g2 = await call(on, 'POST', '/api/codes-activation', { token: sec, body: { role: 'eleve', student_ids: [ids.A.students[0]] } });
  assert.equal(g2.status, 200);
  const use = (code, school = 'ecole-a', extra = {}) => call(on, 'POST', '/api/login/activation', { body: { school, code, ...extra } });
  assert.equal((await use(first.code)).status, 401, 'ancien code annulé');
  const c2 = g2.json.codes[0].code;
  assert.equal((await use(c2, 'ecole-b')).status, 401, 'lié à l’école');
  const ok = await use(c2.toLowerCase().replace(/-/g, ' '), 'ecole-a', { trust: true });
  assert.equal(ok.status, 200); assert.ok(ok.json.token); assert.ok(ok.cookies.noria_appareil);
  assert.equal((await call(on, 'GET', '/api/me', { token: ok.json.token })).json.id, ids.A.users.eleve1);
  assert.equal((await use(c2)).status, 401, 'usage unique');
  // Parents : un code par compte parent relié.
  const gp = await call(on, 'POST', '/api/codes-activation', { token: dir, body: { role: 'parent' } });
  assert.deepEqual(gp.json.codes.map((x) => x.name).sort(), ['Parent fictif 1 A', 'Parent fictif 2 A']);
  // Liste (sans les codes) et annulation.
  const list = await call(on, 'GET', '/api/codes-activation', { token: dir });
  assert.ok(list.json.length >= 4); assert.ok(list.json.every((r) => !('code' in r) && !('code_hash' in r)));
  assert.ok(list.json.find((r) => r.batch === g2.json.batch).used_at);
  const pend = list.json.find((r) => r.batch === gp.json.batch);
  assert.equal((await call(on, 'POST', `/api/codes-activation/${pend.id}/annuler`, { token: dir, body: {} })).status, 200);
  assert.equal((await call(on, 'POST', `/api/codes-activation/${pend.id}/annuler`, { token: dir, body: {} })).status, 404);
  assert.equal((await call(on, 'GET', '/api/codes-activation', { token: prof })).status, 403);
  // École B : ne voit pas les codes de A.
  const dirB = (await call(on, 'POST', '/api/login', { body: { school: 'ecole-b', identifier: 'direction@b.exemple.invalid', password: DEMO_PASSWORD } })).json.token;
  assert.equal((await call(on, 'GET', '/api/codes-activation', { token: dirB })).json.length, 0);
});

test('codes d’activation : tentatives limitées (IP)', async () => {
  const s = await listen({ env: { ...process.env }, rateLimit: { max: 3 } });
  await db.run('DELETE FROM login_attempt'); // limiteur en base, partagé avec les tests précédents
  try {
    for (let i = 0; i < 3; i++) assert.equal((await call(s, 'POST', '/api/login/activation', { body: { school: 'ecole-a', code: 'AAAA-BBB-CCC' } })).status, 401);
    assert.equal((await call(s, 'POST', '/api/login/activation', { body: { school: 'ecole-a', code: 'AAAA-BBB-CCC' } })).status, 429);
  } finally { s.close(); }
});

test('RLS : nouvelles tables cloisonnées par école ; demandes WhatsApp hors du rôle applicatif', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  const counts = await db.asSchool(ids.B.school, async (t) => ({
    dev: (await t.get('SELECT COUNT(*) AS n FROM trusted_device')).n,
    act: (await t.get('SELECT COUNT(*) AS n FROM activation_code')).n,
    tg: (await t.get('SELECT COUNT(*) AS n FROM telegram_link')).n,
  }));
  assert.deepEqual(counts, { dev: 0, act: 0, tg: 0 });
  assert.ok((await db.get('SELECT COUNT(*) AS n FROM trusted_device')).n > 0);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.all('SELECT * FROM login_challenge')), /permission denied/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('DELETE FROM trusted_device')), /permission denied/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('INSERT INTO activation_code (school_id, user_id, role, batch, code_hash, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)',
    ids.B.school, ids.B.users.eleve1, 'eleve', 'x', 'y', ids.B.users.direction, 'now', 'now')), /row-level security/);
});
