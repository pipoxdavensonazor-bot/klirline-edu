'use strict';
// Déploiement : sonde /healthz, adresse client derrière le mandataire, cookie Secure, arrêt propre, chiffrement GCM.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { openTestDb } = require('./helpers');
const { createServer, clientIp } = require('../src/app');
const { encryptStream, decryptStream, readKey } = require('../scripts/chiffrer');

async function listen(db, opts) {
  const s = createServer(db, { staticRoot: false, ...opts });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { s, base: `http://127.0.0.1:${s.address().port}` };
}

test('/healthz : 200 si la base répond, 503 sinon, sans session', async () => {
  const db = await openTestDb();
  const { s, base } = await listen(db);
  try {
    const r = await fetch(`${base}/healthz`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const orig = db.get; db.get = async () => { throw new Error('base indisponible'); };
    const r2 = await fetch(`${base}/healthz`); db.get = orig;
    assert.equal(r2.status, 503);
  } finally { s.close(); await db.cleanup(); }
});

test('trust proxy : X-Forwarded-For pris en compte seulement si activé (dernière entrée)', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: { remoteAddress: '172.18.0.3' } };
  assert.equal(clientIp(req, false), '172.18.0.3');
  assert.equal(clientIp(req, true), '203.0.113.9');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '::1' } }, true), '::1');
});

test('cookie de session Secure quand secureCookie (production)', async () => {
  const db = await openTestDb();
  const { seed, DEMO_PASSWORD } = require('../src/seed');
  await seed(db);
  const { s, base } = await listen(db, { secureCookie: true, trustProxy: true });
  try {
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
      body: JSON.stringify({ school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }) });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /; Secure/);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  } finally { s.close(); await db.cleanup(); }
});

test('arrêt propre sur SIGTERM : code 0, base fermée', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, NORIA_DB: ':memory:', DATABASE_URL: '', PORT: String(port), NODE_ENV: 'test', NORIA_DEMO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 100 && !out.includes('NORIA ('); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
  const code = await new Promise((resolve) => { child.on('exit', resolve); child.kill('SIGTERM'); });
  assert.equal(code, 0, out);
  assert.match(out, /Arrêt terminé/);
});

async function pipe(input, t) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    Readable.from(input).pipe(t).on('data', (c) => chunks.push(c)).on('end', resolve).on('error', reject);
    t.on('error', reject);
  });
  return Buffer.concat(chunks);
}

test('chiffrement AES-256-GCM : aller-retour, mauvaise clé et altération refusées', async () => {
  const key = crypto.randomBytes(32);
  const plain = crypto.randomBytes(200_000);
  const parts = [plain.subarray(0, 7), plain.subarray(7, 150_000), plain.subarray(150_000)];
  const enc = await pipe(parts, encryptStream(key));
  assert.ok(!enc.includes(plain.subarray(0, 64)));
  assert.deepEqual(await pipe([enc.subarray(0, 5), enc.subarray(5)], decryptStream(key)), plain);
  await assert.rejects(pipe([enc], decryptStream(crypto.randomBytes(32))), /authentification/);
  const bad = Buffer.from(enc); bad[1000] ^= 1;
  await assert.rejects(pipe([bad], decryptStream(key)), /authentification/);
  await assert.rejects(pipe([enc.subarray(0, enc.length - 3)], decryptStream(key)), /authentification|tronqué/);
  assert.equal(readKey({ NORIA_BACKUP_KEY: key.toString('hex') }).length, 32);
  assert.throws(() => readKey({ NORIA_BACKUP_KEY: 'court' }), /32 octets/);
});
