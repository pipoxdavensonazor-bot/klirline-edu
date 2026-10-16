'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { openDb } = require('../src/db');
const { createServer, createLimiter, csv } = require('../src/app');
const auth = require('../src/auth');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, clock;
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const login = (email, password, school = 'ecole-a') => post('/api/login', { school, email, password });

before(async () => {
  db = openDb(':memory:');
  await seed(db);
  clock = { t: Date.now() };
  server = createServer(db, { rateLimit: { max: 5, windowMs: 60_000, now: () => clock.t } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('limitation : 5 échecs bloquent le compte (429 + Retry-After), même avec le bon mot de passe ; levée après la fenêtre', async () => {
  const email = 'secretariat@a.exemple.invalid';
  for (let i = 0; i < 5; i++) assert.equal((await login(email, 'mauvais')).status, 401);
  const blocked = await login(email, DEMO_PASSWORD);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  clock.t += 61_000;
  assert.equal((await login(email, DEMO_PASSWORD)).status, 200);
  const refus = db.prepare(`SELECT COUNT(*) n FROM audit_log WHERE action = 'login' AND outcome = 'refuse'`).get().n;
  assert.ok(refus >= 5, 'échecs de connexion journalisés');
});

test('limitation : le limiteur bloque aussi par IP, toutes adresses confondues', () => {
  let t = 0;
  const l = createLimiter({ max: 3, windowMs: 1000, now: () => t });
  for (const e of ['a', 'b', 'c']) l.fail(['ip:1', `compte:${e}`]);
  assert.ok(l.blocked(['ip:1', 'compte:d']) > 0, 'IP bloquée même pour un nouveau compte');
  assert.equal(l.blocked(['ip:2', 'compte:d']), 0);
  t = 1001;
  assert.equal(l.blocked(['ip:1', 'compte:d']), 0);
});

test('e-mail inconnu : vérification contre un hachage factice (pas de raccourci révélateur)', async () => {
  const orig = auth.verifyPassword;
  const seen = [];
  auth.verifyPassword = async (pw, stored) => { seen.push(stored); return orig(pw, stored); };
  try {
    clock.t += 120_000;
    assert.equal((await login('inconnu@a.exemple.invalid', 'x')).status, 401);
  } finally { auth.verifyPassword = orig; }
  assert.equal(seen.length, 1, 'scrypt calculé même sans compte');
  assert.equal(seen[0], await auth.getDummyHash());
  assert.match(seen[0], /^scrypt\$/);
});

test('scrypt asynchrone : la boucle d’événements reste libre pendant le hachage', async () => {
  let ticks = 0;
  const iv = setInterval(() => ticks++, 1);
  const p = auth.hashPassword('mot-de-passe-test');
  assert.ok(p instanceof Promise);
  const h = await p;
  clearInterval(iv);
  assert.ok(ticks > 0, 'des minuteries ont tourné pendant le calcul');
  assert.equal(await auth.verifyPassword('mot-de-passe-test', h), true);
  assert.equal(await auth.verifyPassword('autre', h), false);
});

test('en-têtes de sécurité sur les réponses JSON, CSV et d’erreur', async () => {
  clock.t += 120_000;
  const tok = (await (await login('direction@a.exemple.invalid', DEMO_PASSWORD)).json()).token;
  for (const [p, h] of [['/api/me', { authorization: `Bearer ${tok}` }], ['/api/export/students', { authorization: `Bearer ${tok}` }], ['/api/me', {}]]) {
    const r = await fetch(base + p, { headers: h });
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p);
    assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/);
    assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('CSV : les cellules commençant par = + - @ sont neutralisées, y compris dans un export réel', async () => {
  const out = csv([{ a: '=HYPERLINK("http://x")', b: '+1', c: '-2', d: '@SUM(A1)', e: 'Ana' }], ['a', 'b', 'c', 'd', 'e']);
  const line = out.split('\n')[1];
  assert.equal(line, `"'=HYPERLINK(""http://x"")",'+1,'-2,'@SUM(A1),Ana`);
  clock.t += 120_000;
  const tok = (await (await login('direction@a.exemple.invalid', DEMO_PASSWORD)).json()).token;
  const st = db.prepare(`SELECT id FROM student WHERE code = 'A-002'`).get().id;
  const r = await fetch(`${base}/api/students/${st}`, { method: 'PATCH', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ last_name: '=cmd|calc', reason: 'test formule (fictif)' }) });
  assert.equal(r.status, 200);
  const text = await (await fetch(`${base}/api/export/students`, { headers: { authorization: `Bearer ${tok}` } })).text();
  assert.match(text, /'=cmd\|calc/);
  assert.doesNotMatch(text, /(^|,)=cmd/m);
});

function runIndex(env) {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'noria-')), 'x.sqlite');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../src/index.js')], {
      env: { PATH: process.env.PATH, NORIA_DB: dbFile, PORT: '0', ...env },
    });
    let out = '';
    const done = (code) => { const d = openDb(dbFile); const n = d.prepare('SELECT COUNT(*) n FROM school').get().n; d.close(); resolve({ out, n, code }); };
    child.stdout.on('data', (b) => { out += b; if (/API NORIA/.test(out)) child.kill(); });
    child.stderr.on('data', (b) => { out += b; });
    child.on('exit', done);
  });
}

test('comptes de démonstration seulement avec NORIA_DEMO=1, jamais en production', async () => {
  const sans = await runIndex({});
  assert.equal(sans.n, 0, 'aucune école créée sans NORIA_DEMO');
  assert.match(sans.out, /aucune donnée de démonstration/);
  const avec = await runIndex({ NORIA_DEMO: '1' });
  assert.equal(avec.n, 2);
  const prod = await runIndex({ NORIA_DEMO: '1', NODE_ENV: 'production' });
  assert.equal(prod.code, 1);
  assert.equal(prod.n, 0);
});
