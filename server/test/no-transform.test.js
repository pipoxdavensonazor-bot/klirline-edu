'use strict';
// Cloudflare ne doit pas réécrire le HTML (injection du script Web Analytics bloqué par la CSP) :
// toute réponse HTML porte « no-transform » en plus de son Cache-Control habituel ; le reste est inchangé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer, createLimiter, withNoTransform } = require('../src/app');

test('withNoTransform : ajouté aux seules réponses HTML, sémantique de cache conservée', () => {
  assert.equal(withNoTransform({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })['cache-control'], 'no-cache, no-transform');
  assert.equal(withNoTransform({ 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=60' })['cache-control'], 'public, max-age=60, no-transform');
  assert.equal(withNoTransform({ 'content-type': 'text/html' })['cache-control'], 'no-transform');
  assert.equal(withNoTransform({ 'content-type': 'text/html', 'cache-control': 'no-store, no-transform' })['cache-control'], 'no-store, no-transform');
  assert.equal(withNoTransform({ 'content-type': 'application/json', 'cache-control': 'no-store' })['cache-control'], 'no-store');
});

test('pages HTML servies (/, /app, /confidentialite) : no-transform ; API et fichiers JS : inchangés', async () => {
  const db = await openTestDb();
  const server = createServer(db, { rateLimit: { max: 1000 }, security: false, publicLimit: createLimiter({ max: 1000, windowMs: 3600e3 }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const p of ['/', '/app', '/confidentialite']) {
      const r = await fetch(base + p);
      assert.match(r.headers.get('content-type') || '', /text\/html/, p);
      assert.match(r.headers.get('cache-control') || '', /(^|, )no-transform$/, p);
    }
    const api = await fetch(base + '/api/config');
    assert.doesNotMatch(api.headers.get('cache-control') || '', /no-transform/);
    const js = await fetch(base + '/src/login.js');
    assert.doesNotMatch(js.headers.get('cache-control') || '', /no-transform/);
  } finally { server.close(); await db.close?.(); }
});
