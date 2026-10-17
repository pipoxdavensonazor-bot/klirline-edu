'use strict';
// Connexion (e-mail, téléphone, cookie), invitations, récupération de compte, classes, fichiers statiques.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { openTestDb, FK } = require('./helpers');
const { createServer, normalizePhone } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, ids;
async function call(token, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}
const login = async (handle, school = 'a') => {
  const r = await call(null, 'POST', '/api/login', { school: `ecole-${school}`, identifier: `${handle}@${school}.exemple.invalid`, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, handle); return r.json.token;
};
const lastLink = async (kind) => {
  const row = await db.get('SELECT body FROM outbox WHERE kind = ? ORDER BY id DESC LIMIT 1', kind);
  return row.body.match(new RegExp(`#${kind}=([\\w-]+)`))[1];
};
const raw = (path, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(base);
  http.get({ host: u.hostname, port: u.port, path, headers }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { demo: true, rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('config publique : méthodes, écoles en démo, session', async () => {
  const c = await call(null, 'GET', '/api/config');
  assert.equal(c.status, 200);
  assert.deepEqual(c.json.methods, ['password', 'code6']);
  assert.deepEqual(c.json.code, { digits: 6, minutes: 10, resendSeconds: 60 });
  assert.equal(c.json.session, false);
  assert.deepEqual(c.json.ecoles.map((e) => e.slug), ['ecole-a', 'ecole-b']);
  const t = await login('direction');
  assert.equal((await call(t, 'GET', '/api/config')).json.session, true);
});

test('connexion par téléphone, normalisation, code à 6 chiffres sans demande', async () => {
  assert.equal(normalizePhone('509 0000-0107'), '+50900000107');
  assert.equal(normalizePhone('0000 0107'), '+50900000107');
  const r = await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: '+509 0000 0107', password: DEMO_PASSWORD });
  assert.equal(r.status, 200);
  assert.equal((await call(r.json.token, 'GET', '/api/me')).json.name, 'Parent fictif 1 A');
  // Le téléphone de l'école A ne vaut pas pour l'école B.
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-b', identifier: '+50900000107', password: DEMO_PASSWORD })).status, 401);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: '+50900000107', method: 'code' })).status, 401, 'code à 6 chiffres sans demande préalable');
});

test('cookie de session HttpOnly + en-tête x-noria obligatoire pour écrire', async () => {
  const r = await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD });
  const set = r.headers.get('set-cookie');
  assert.match(set, /noria_session=[\w-]+; HttpOnly; SameSite=Strict; Path=\//);
  const cookie = set.split(';')[0];
  assert.equal((await call(null, 'GET', '/api/me', null, { cookie })).status, 200);
  const body = { display_name: 'Parent invité fictif', email: 'csrf@a.exemple.invalid', role: 'parent', student_id: ids.A.students[1] };
  assert.equal((await call(null, 'POST', '/api/invitations', body, { cookie })).status, 403);
  assert.equal((await call(null, 'POST', '/api/invitations', body, { cookie, 'x-noria': '1' })).status, 200);
  assert.equal((await call(null, 'POST', '/api/logout', {}, { cookie, 'x-noria': '1' })).status, 200);
  assert.equal((await call(null, 'GET', '/api/me', null, { cookie })).status, 401);
});

test('invitations : droits par rôle, acceptation unique, compte créé et rattaché', async () => {
  const dir = await login('direction'); const sec = await login('secretariat'); const prof = await login('prof1');
  const parent = { display_name: 'Parent nouveau fictif', phone: '+509 0000 0199', role: 'parent', student_id: ids.A.students[0] };
  assert.equal((await call(prof, 'POST', '/api/invitations', parent)).status, 403);
  assert.equal((await call(sec, 'POST', '/api/invitations', { ...parent, role: 'direction' })).status, 403);
  assert.equal((await call(sec, 'POST', '/api/invitations', { ...parent, student_id: ids.B.students[0] })).status, 404);
  assert.equal((await call(sec, 'POST', '/api/invitations', { ...parent, phone: '+50900000107' })).status, 409);
  const ok = await call(sec, 'POST', '/api/invitations', parent);
  assert.equal(ok.status, 200);
  const token = await lastLink('invitation');
  assert.ok(!(await db.get('SELECT 1 AS x FROM account_token WHERE token_hash = ?', token)), 'jeton jamais stocké en clair');
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'court' })).status, 400);
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'nouveau-fictif-1' })).status, 200);
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'nouveau-fictif-1' })).status, 400, 'usage unique');
  const r = await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: '50900000199', password: 'nouveau-fictif-1' });
  assert.equal(r.status, 200);
  const me = (await call(r.json.token, 'GET', '/api/me')).json;
  assert.deepEqual(me.roles, ['parent']);
  assert.deepEqual((await call(r.json.token, 'GET', '/api/students')).json.map((s) => s.id), [ids.A.students[0]]);
  // Direction peut inviter un enseignant.
  assert.equal((await call(dir, 'POST', '/api/invitations', { display_name: 'Prof fictif', email: 'prof9@a.exemple.invalid', role: 'enseignant' })).status, 200);
});

test('invitation expirée refusée', async () => {
  const dir = await login('direction');
  await call(dir, 'POST', '/api/invitations', { display_name: 'Expiré fictif', email: 'exp@a.exemple.invalid', role: 'enseignant' });
  const token = await lastLink('invitation');
  (await db.run("UPDATE account_token SET expires_at = '2000-01-01T00:00:00.000Z' WHERE used_at IS NULL"));
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'nouveau-fictif-2' })).status, 400);
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token: 'x'.repeat(43), password: 'nouveau-fictif-2' })).status, 400);
});

test('récupération : même réponse si le compte n\'existe pas, réinitialisation révoque les sessions', async () => {
  const before = (await db.get('SELECT COUNT(*) n FROM outbox')).n;
  const none = await call(null, 'POST', '/api/recovery/request', { school: 'ecole-a', identifier: 'personne@a.exemple.invalid' });
  assert.equal((await db.get('SELECT COUNT(*) n FROM outbox')).n, before);
  const old = await login('prof2');
  const yes = await call(null, 'POST', '/api/recovery/request', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid' });
  assert.equal(none.status, yes.status); assert.deepEqual(none.json, yes.json);
  const token = await lastLink('recuperation');
  assert.equal((await call(null, 'POST', '/api/recovery/reset', { token, password: 'remplace-fictif-1' })).status, 200);
  assert.equal((await call(old, 'GET', '/api/me')).status, 401, 'ancienne session révoquée');
  assert.equal((await call(null, 'POST', '/api/recovery/reset', { token, password: 'remplace-fictif-2' })).status, 400);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: DEMO_PASSWORD })).status, 401);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: 'remplace-fictif-1' })).status, 200);
});

test('classes : portée par rôle', async () => {
  const names = async (h) => (await call(await login(h), 'GET', '/api/classes')).json.map((c) => c.name);
  assert.deepEqual(await names('direction'), ['7e A', '7e B']);
  assert.deepEqual(await names('prof1'), ['7e A']);
  assert.deepEqual(await names('parent2'), ['7e B']);
  assert.deepEqual(await names('eleve1'), ['7e A']);
  assert.equal((await call(await login('compta'), 'GET', '/api/classes')).status, 403);
});

test('fichiers statiques : liste blanche, pas de traversée, gzip, ETag, CSP', async () => {
  // L'application est servie sur /app (et /index.html) ; la racine / est le portail public (bloc 5).
  const home = await raw('/app', { 'accept-encoding': 'gzip' });
  assert.equal(home.status, 200);
  assert.equal(home.headers['content-encoding'], 'gzip');
  assert.match(zlib.gunzipSync(home.body).toString(), /<meta name="noria-server" content="1">/);
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  const again = await raw('/app', { 'if-none-match': home.headers.etag });
  assert.equal(again.status, 304);
  assert.equal((await raw('/index.html')).status, 200);
  const app2 = await raw('/app/'); assert.equal(app2.status, 301); assert.equal(app2.headers.location, '/app');
  const portal = await raw('/', { 'accept-encoding': 'gzip' });
  assert.equal(portal.status, 200); assert.equal(portal.headers['content-encoding'], 'gzip');
  const ph = zlib.gunzipSync(portal.body).toString();
  assert.match(ph, /<html lang="fr">/); assert.match(ph, /href="\/app"/); assert.doesNotMatch(ph, /noria-server|manifest\.webmanifest/);
  assert.match(portal.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(portal.headers['set-cookie'], undefined);
  assert.equal((await raw('/', { 'if-none-match': portal.headers.etag })).status, 304);
  assert.equal((await raw('/src/app.js')).status, 200);
  // Application installable : manifeste et service worker servis à la racine, version et liste remplies par le serveur.
  const sw = await raw('/sw.js');
  assert.equal(sw.status, 200); assert.equal(sw.headers['cache-control'], 'no-cache');
  const swText = sw.body.toString();
  assert.doesNotMatch(swText, /__NORIA_(VERSION|ASSETS)__/);
  assert.match(swText, /"\/src\/app\.js\?v=[0-9a-f]{10}"/); assert.match(swText, /"\/src\/offline\.js\?v=[0-9a-f]{10}"/); // mêmes URL versionnées que la page
  assert.match(swText, /startsWith\("\/api\/"\)/, 'les réponses API ne sont jamais mises en cache');
  const mf = await raw('/manifest.webmanifest');
  assert.equal(mf.status, 200); assert.match(mf.headers['content-type'], /manifest\+json/);
  assert.equal(JSON.parse(mf.body.toString()).display, 'standalone');
  assert.equal(JSON.parse(mf.body.toString()).start_url, '/app');
  assert.match(swText, /"\/app"/, 'le service worker met /app en cache');
  for (const p of ['/server/src/seed.js', '/src/../server/package.json', '/src/%2e%2e/server/package.json', '/.git/config', '/src/x.sqlite', '/package.json'])
    assert.equal((await raw(p)).status, 404, p);
});
