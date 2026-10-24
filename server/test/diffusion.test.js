'use strict';
// Diffusion audio des réunions de parents : jetons signés, autorisation MediaMTX, relais HLS → R2 (faux S3 local),
// liste servie aux seuls parents de la réunion, nettoyage de R2 à l'arrêt, CSP minimale.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { openTestDb } = require('./helpers');
const app = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { createRelay, parsePlaylist, s3Request } = require('../src/diffusion-relais');
const diff = require('../src/diffusion');

const SECRET = 'x'.repeat(40);
let db, server, base, s3, s3base, dir, relay, mid; const tok = {}; const store = new Map(); const s3log = [];
async function call(w, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(w ? { authorization: `Bearer ${tok[w]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null, text: type.includes('json') ? null : await res.text(), headers: res.headers };
}
function writeHls(n, from) {
  const d = path.join(dir, `reunion-${mid}`); fs.mkdirSync(d, { recursive: true });
  const segs = []; for (let i = from; i < from + n; i++) { fs.writeFileSync(path.join(d, `s${i}.ts`), Buffer.alloc(100, i)); segs.push(`#EXTINF:6.000000,\ns${i}.ts`); }
  fs.writeFileSync(path.join(d, 'index.m3u8'), `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:${from}\n${segs.join('\n')}\n`);
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-diff-'));
  // Faux R2 : vérifie la présence d'une signature v4, stocke en mémoire.
  s3 = http.createServer((req, res) => {
    const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => {
      s3log.push(`${req.method} ${req.url}`);
      if (!/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/.test(req.headers.authorization || '')) { res.writeHead(403); return res.end(); }
      if (req.method === 'PUT') { store.set(req.url, { body: Buffer.concat(parts), cc: req.headers['cache-control'] }); res.writeHead(200); return res.end(); }
      if (req.method === 'DELETE') { store.delete(req.url); res.writeHead(204); return res.end(); }
      res.writeHead(405); res.end();
    });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r)); s3base = `http://127.0.0.1:${s3.address().port}`;
  relay = createRelay({ dir, publicBase: 'https://direct.exemple.invalid', intervalMs: 3600e3, log: () => {}, r2: { endpoint: s3base, bucket: 'noria-direct', accessKeyId: 'AK', secretAccessKey: 'SK' } });
  db = await openTestDb(); await seed(db);
  server = app.createServer(db, { relay, rateLimit: { max: 400 }, env: { ...process.env, NORIA_DIRECT_URL: 'https://direct.exemple.invalid', NORIA_DIRECT_SECRET: SECRET } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['prof1', 'a', 'prof1'], ['parent1', 'a', 'parent1'], ['eleve1', 'a', 'eleve1'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
  const c = await call('direction', 'POST', '/api/reunions-parents', { titre: 'Réunion de rentrée', debut: new Date().toISOString() });
  mid = c.json.id;
});
after(async () => { relay.close(); server.close(); s3.close(); await db.cleanup(); fs.rmSync(dir, { recursive: true, force: true }); });

test('liste HLS : analyse et noms de segments filtrés', () => {
  const p = parsePlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:7\n#EXTINF:6.0,\ns7.ts\n#EXTINF:6.0,\n../../etc/passwd\n#EXTINF:5.9,\ns8.ts\n');
  assert.equal(p.seq, 7); assert.deepEqual(p.segs.map((s) => s.name), ['s7.ts', 's8.ts']);
});

test('jetons : signature, type, réunion et expiration vérifiés', () => {
  const ctx = { env: { NORIA_DIRECT_SECRET: SECRET } };
  const t = diff.sign(ctx, 'e', 5, 9, 60);
  assert.deepEqual(diff.verify(ctx, t, 'e', 5), { uid: 9 });
  assert.equal(diff.verify(ctx, t, 'p', 5), null);
  assert.equal(diff.verify(ctx, t, 'e', 6), null);
  assert.equal(diff.verify(ctx, t.slice(0, -2) + 'AA', 'e', 5), null);
  assert.equal(diff.verify(ctx, diff.sign(ctx, 'e', 5, 9, -1), 'e', 5), null);
});

test('rôles : seule la direction démarre ; un parent d’une autre école ne voit rien', async () => {
  assert.equal((await call('parent1', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`)).status, 403);
  assert.equal((await call('prof1', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`)).status, 403);
  assert.equal((await call('dirB', 'GET', `/api/reunions-parents/${mid}/diffusion`)).status, 404);
  assert.equal((await call('eleve1', 'GET', `/api/reunions-parents/${mid}/diffusion`)).status, 403);
  const avant = await call('parent1', 'GET', `/api/reunions-parents/${mid}/diffusion`);
  assert.equal(avant.json.active, false); assert.equal(avant.json.liste, null);
});

test('diffusion complète : WHIP autorisé, segments vers R2, liste signée, auditeurs, nettoyage', async () => {
  const d = await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`);
  assert.equal(d.status, 200); assert.equal(d.json.whip, `/direct/whip/reunion-${mid}/whip`);
  const row = await db.get('SELECT status, direct_state, direct_key FROM parent_meeting WHERE id = ?', mid);
  assert.equal(row.status, 'en_cours'); assert.equal(row.direct_state, 'active'); assert.match(row.direct_key, /^[0-9a-f]{32}$/);
  // Autorisation MediaMTX.
  const auth = (b) => call(null, 'POST', '/api/interne/diffusion/auth', b).then((r) => r.status);
  assert.equal(await auth({ action: 'publish', path: `reunion-${mid}`, token: d.json.jeton, ip: '203.0.113.5', protocol: 'webrtc' }), 200);
  assert.equal(await auth({ action: 'publish', path: `reunion-${mid + 1}`, token: d.json.jeton }), 401);
  assert.equal(await auth({ action: 'publish', path: `reunion-${mid}`, token: 'faux' }), 401);
  assert.equal(await auth({ action: 'read', path: `reunion-${mid}`, ip: '127.0.0.1', protocol: 'rtsp' }), 200);
  assert.equal(await auth({ action: 'read', path: `reunion-${mid}`, ip: '203.0.113.5', protocol: 'webrtc' }), 401);
  assert.equal(await auth({ action: 'api', ip: '127.0.0.1' }), 401);
  // Le parent obtient une liste signée ; rien n'est encore envoyé → 404.
  const e = await call('parent1', 'GET', `/api/reunions-parents/${mid}/diffusion`);
  assert.equal(e.json.active, true); assert.match(e.json.liste, new RegExp(`^/api/direct/${mid}/index\\.m3u8\\?t=e\\.`));
  assert.equal((await call(null, 'GET', e.json.liste)).status, 404);
  // ffmpeg écrit 3 segments ; le relais les envoie (signés, cache immuable) ; la liste pointe vers le domaine R2.
  writeHls(3, 0); await relay.tick();
  const prefix = `/noria-direct/r/${mid}-${row.direct_key}/`;
  assert.deepEqual([...store.keys()].sort(), [0, 1, 2].map((i) => `${prefix}s${i}.ts`));
  assert.equal(store.get(`${prefix}s0.ts`).cc, 'public, max-age=86400, immutable');
  const pl = await call(null, 'GET', e.json.liste);
  assert.equal(pl.status, 200); assert.match(pl.headers.get('content-type'), /mpegurl/); assert.equal(pl.headers.get('cache-control'), 'no-store');
  assert.match(pl.text, new RegExp(`https://direct\\.exemple\\.invalid/r/${mid}-${row.direct_key}/s2\\.ts`));
  assert.doesNotMatch(pl.text, /index\.m3u8/);
  // Jeton modifié, ou jeton d'une autre réunion : refusé.
  assert.equal((await call(null, 'GET', e.json.liste.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).status, 403);
  assert.equal((await call(null, 'GET', e.json.liste.replace(`/direct/${mid}/`, `/direct/${mid + 1}/`))).status, 403);
  // Auditeurs comptés côté direction (1 parent distinct), et pas pour le parent.
  const m = await call('direction', 'GET', `/api/reunions-parents/${mid}/diffusion`);
  assert.equal(m.json.auditeurs, 1); assert.equal(e.json.auditeurs, undefined);
  // Fenêtre glissante : s0 sort de la liste ; retiré de R2 après 60 s seulement.
  writeHls(3, 1); await relay.tick();
  assert.ok(store.has(`${prefix}s0.ts`)); assert.ok(store.has(`${prefix}s3.ts`));
  // Arrêt : tout le préfixe disparaît de R2, la liste n'est plus servie, MediaMTX refuse la publication.
  const s = await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/arreter`);
  assert.equal(s.status, 200); assert.equal(s.json.retires, 4); assert.equal(store.size, 0);
  assert.ok(s3log.every((l) => l.includes(prefix)));
  assert.equal(await auth({ action: 'publish', path: `reunion-${mid}`, token: d.json.jeton }), 401);
  relay.keyCache.clear();
  assert.equal((await call(null, 'GET', e.json.liste)).status, 404);
  // Redémarrage : nouvelle clé de chemin (les anciennes URL de segments ne servent plus).
  await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`);
  const k2 = (await db.get('SELECT direct_key FROM parent_meeting WHERE id = ?', mid)).direct_key;
  assert.notEqual(k2, row.direct_key);
  await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/arreter`);
});

test('signature v4 : forme conforme à S3 (R2)', async () => {
  let seen; const r = await s3Request({ endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'SK',
    fetch: async (url, o) => { seen = { url, o }; return { ok: true, status: 200 }; } }, 'PUT', 'r/1-abc/s0.ts', Buffer.from('x'), { 'content-type': 'video/mp2t' });
  assert.ok(r.ok); assert.equal(seen.url, 'https://acc.r2.cloudflarestorage.com/b/r/1-abc/s0.ts');
  assert.match(seen.o.headers.authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
  assert.equal(seen.o.headers.host, undefined);
});

test('sans configuration : diffusion désactivée, liste et autorisation introuvables', async () => {
  const s2 = app.createServer(db, { rateLimit: { max: 400 }, env: { ...process.env, NORIA_DIRECT_URL: '', NORIA_DIRECT_SECRET: '' } });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r)); const b2 = `http://127.0.0.1:${s2.address().port}`;
  try {
    const h = { 'content-type': 'application/json', authorization: `Bearer ${tok.direction}` };
    assert.equal((await fetch(`${b2}/api/reunions-parents/${mid}/diffusion/demarrer`, { method: 'POST', headers: h })).status, 409);
    assert.equal((await (await fetch(`${b2}/api/reunions-parents/${mid}/diffusion`, { headers: h })).json()).configuree, false);
    assert.equal((await fetch(`${b2}/api/interne/diffusion/auth`, { method: 'POST', headers: h, body: '{}' })).status, 404);
  } finally { s2.close(); }
});
