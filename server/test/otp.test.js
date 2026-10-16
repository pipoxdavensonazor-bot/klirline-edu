'use strict';
// Code de connexion à 6 chiffres : 10 min, usage unique, haché, 5 essais, renvoi limité ; messages FR / kreyòl.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer, createLimiter } = require('../src/app');
const { seed } = require('../src/seed');
const otp = require('../src/otp');

let db, server, base, ids; const sent = []; let failNext = false;
const notifier = { adapter: (channel) => ({ name: `test-${channel}`, simulated: false,
  async send(m) { if (failNext) { failNext = false; throw new Error('passerelle indisponible'); } sent.push({ channel, ...m }); return { id: `id-${sent.length}` }; } }) };
async function call(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
const PHONE = '+50900000103'; // prof1, école A (fictif)
const ask = (o = {}) => call('/api/login/code', { school: 'ecole-a', identifier: PHONE, ...o });
const use = (code, o = {}) => call('/api/login', { school: 'ecole-a', identifier: PHONE, method: 'code', code, ...o });
const lastCode = () => sent[sent.length - 1].text.match(/\b(\d{6})\b/)[1];
const userId = async () => (await db.get('SELECT id FROM app_user WHERE phone = ?', PHONE)).id;
// Le délai de renvoi est contourné en vieillissant les codes existants.
const age = async (sec) => db.run('UPDATE login_code SET created_at = ? WHERE user_id = ?', new Date(Date.now() - sec * 1000).toISOString(), await userId());

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { notifier, rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('demande par téléphone : SMS court en français, code haché en base, trace masquée', async () => {
  const r = await ask();
  assert.equal(r.status, 200); assert.equal(r.json.minutes, 10); assert.equal(r.json.resendIn, 60);
  const m = sent[sent.length - 1];
  assert.equal(m.channel, 'sms'); assert.equal(m.to, PHONE);
  assert.match(m.text, /^NORIA : votre code est \d{6}\. Valable 10 min\./); assert.ok(m.text.length <= 160, m.text.length);
  const code = lastCode();
  const row = await db.get('SELECT code_hash, expires_at, attempts FROM login_code WHERE user_id = ? ORDER BY id DESC LIMIT 1', await userId());
  assert.ok(!row.code_hash.includes(code)); assert.match(row.code_hash, /^hmac\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  const ttl = new Date(row.expires_at) - Date.now(); assert.ok(ttl > 9 * 60e3 && ttl <= 10 * 60e3);
  const ob = await db.get("SELECT body, status, provider, provider_id FROM outbox WHERE kind = 'code' ORDER BY id DESC LIMIT 1");
  assert.ok(!ob.body.includes(code)); assert.match(ob.body, /\[masqué\]/);
  assert.deepEqual([ob.status, ob.provider, ob.provider_id], ['envoye', 'test-sms', `id-${sent.length}`]);
});

test('connexion avec le code, une seule fois', async () => {
  const code = lastCode();
  const ok = await use(code); assert.equal(ok.status, 200); assert.ok(ok.json.token);
  const again = await use(code); assert.equal(again.status, 401);
});

test('renvoi limité : 60 s entre deux codes, 5 par heure ; un nouveau code annule l’ancien', async () => {
  await age(120); const n = sent.length;
  await ask(); const first = lastCode();
  assert.equal((await ask()).status, 200, 'même réponse'); assert.equal(sent.length, n + 1, 'rien renvoyé avant 60 s');
  await age(61); await ask(); assert.equal(sent.length, n + 2);
  const second = lastCode();
  if (first !== second) assert.equal((await use(first)).status, 401, 'ancien code annulé');
  // 5 codes dans l'heure au plus.
  for (let i = 0; i < 6; i++) { await age(61); await ask(); }
  const count = (await db.get('SELECT COUNT(*) AS n FROM login_code WHERE user_id = ? AND created_at > ?', await userId(), new Date(Date.now() - 3600e3).toISOString())).n;
  assert.equal(Number(count), otp.MAX_PER_HOUR);
  await age(3700);
});

test('5 essais au plus : le bon code est refusé ensuite', async () => {
  await ask(); const code = lastCode(); const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await use(wrong)).status, 401);
  assert.equal((await use(code)).status, 401);
  const row = await db.get('SELECT attempts, used_at FROM login_code WHERE user_id = ? ORDER BY id DESC LIMIT 1', await userId());
  assert.equal(Number(row.attempts), 5); assert.ok(row.used_at);
});

test('code expiré refusé ; format invalide refusé', async () => {
  await age(3700); await ask(); const code = lastCode();
  assert.equal((await use('12a456')).status, 401);
  await db.run('UPDATE login_code SET expires_at = ? WHERE user_id = ?', new Date(Date.now() - 1000).toISOString(), await userId());
  assert.equal((await use(code)).status, 401);
});

test('kreyòl, e-mail, compte inconnu, échec d’envoi', async () => {
  await age(3700);
  await ask({ lang: 'ht' });
  assert.match(sent[sent.length - 1].text, /^NORIA : kòd ou se \d{6}\. Li bon pou 10 min\. Pa bay pèsonn li\.$/);
  await age(3700);
  await call('/api/login/code', { school: 'ecole-a', identifier: 'prof1@a.exemple.invalid' });
  const m = sent[sent.length - 1];
  assert.equal(m.channel, 'email'); assert.match(m.subject, /code de connexion NORIA/); assert.match(m.text, /10 minutes/);
  assert.equal((await use(lastCode(), { identifier: 'prof1@a.exemple.invalid' })).status, 200);
  const n = sent.length;
  const unknown = await call('/api/login/code', { school: 'ecole-a', identifier: '+50999999999' });
  assert.equal(unknown.status, 200); assert.equal(unknown.json.message, (await ask()).json.message); assert.equal(sent.length, n);
  await age(3700); failNext = true;
  assert.equal((await ask()).status, 200, 'échec d’envoi : réponse inchangée');
  const ob = await db.get("SELECT status, error FROM outbox WHERE kind = 'code' ORDER BY id DESC LIMIT 1");
  assert.deepEqual(ob, { status: 'echec', error: 'passerelle indisponible' });
});

test('école B cloisonnée : le code de A ne connecte pas B', async () => {
  await age(3700); await ask(); const code = lastCode();
  assert.equal((await use(code, { school: 'ecole-b' })).status, 401);
});

test('hachage : comparaison sur empreinte, format inattendu rejeté', () => {
  const h = otp.hashCode('123456', 7);
  assert.equal(otp.checkCode('123456', 7, h), true);
  assert.equal(otp.checkCode('123457', 7, h), false);
  assert.equal(otp.checkCode('123456', 8, h), false, 'lié au compte');
  assert.equal(otp.checkCode('123456', 7, 'abc'), false);
  assert.match(otp.newCode(), /^\d{6}$/);
});

test('limiteur : demandes de code bloquées au-delà du plafond', async () => {
  const s2 = createServer(db, { notifier, limiter: createLimiter({ max: 3 }) });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  const st = [];
  for (let i = 0; i < 5; i++) st.push((await fetch(b2 + '/api/login/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: '+50900000999' }) })).status);
  s2.close();
  assert.deepEqual(st, [200, 200, 200, 429, 429]);
});
