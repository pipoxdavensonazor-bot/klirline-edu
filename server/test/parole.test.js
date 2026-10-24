'use strict';
// Prise de parole audio des parents : seule la direction l'accorde, jeton court à usage unique lié au parent et à la
// réunion, publication refusée sinon, lecture WHEP réservée à la direction, coupure = expulsion MediaMTX.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openTestDb } = require('./helpers');
const app = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { createRelay } = require('../src/diffusion-relais');
const P = require('../src/parole');

const SECRET = 'y'.repeat(40);
let db, server, base, dir, relay, mid; const tok = {}; const mtx = [];
const env = { ...process.env, NORIA_DIRECT_URL: 'https://direct.exemple.invalid', NORIA_DIRECT_SECRET: SECRET, NORIA_DIFFUSION_API: 'http://mtx.invalid:9997', NORIA_PAROLE_MAX: '' };
async function call(w, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(w ? { authorization: `Bearer ${tok[w]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const auth = (b) => call(null, 'POST', '/api/interne/diffusion/auth', b).then((r) => r.status);
const uidOf = async (h) => (await db.get('SELECT id FROM app_user WHERE email = ?', `${h}@a.exemple.invalid`)).id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-parole-'));
  relay = createRelay({ dir, publicBase: 'https://direct.exemple.invalid', intervalMs: 3600e3, log: () => {}, r2: { endpoint: 'http://127.0.0.1:9', bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'SK' } });
  // Faux API MediaMTX : le chemin a une session WebRTC ; l'expulsion est enregistrée.
  const mtxFetch = async (url, o = {}) => { mtx.push(`${o.method || 'GET'} ${url} ${o.headers.authorization.startsWith('Basic ') ? 'basic' : '?'}`);
    if (url.includes('/v3/paths/get/')) return { ok: true, status: 200, json: async () => ({ source: { type: 'webRTCSession', id: 'sess-1' } }) };
    return { ok: true, status: 200, json: async () => ({}) }; };
  db = await openTestDb(); await seed(db);
  server = app.createServer(db, { relay, mtxFetch, rateLimit: { max: 1000 }, env });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, h] of [['direction', 'direction'], ['prof1', 'prof1'], ['parent1', 'parent1'], ['parent2', 'parent2']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: `${h}@a.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
  mid = (await call('direction', 'POST', '/api/reunions-parents', { titre: 'Réunion parole', debut: new Date().toISOString() })).json.id;
  await call('direction', 'PUT', `/api/reunions-parents/${mid}`, { questions_ouvertes: true });
});
after(async () => { relay.close(); server.close(); await db.cleanup(); fs.rmSync(dir, { recursive: true, force: true }); });

test('jeton de parole : signé, lié au parent, à la réunion et à l’autorisation, expiré refusé', () => {
  const ctx = { env: { NORIA_DIRECT_SECRET: SECRET } };
  const t = P.signGrant(ctx, 4, 7, 9);
  assert.deepEqual(P.verifyGrant(ctx, t), { mid: 4, uid: 7, gid: 9 });
  assert.equal(P.verifyGrant(ctx, t.replace('v.4.7', 'v.4.8')), null);
  assert.equal(P.verifyGrant(ctx, P.signGrant(ctx, 4, 7, 9, -1)), null);
  assert.equal(P.verifyGrant({ env: { NORIA_DIRECT_SECRET: 'z'.repeat(40) } }, t), null);
});

test('avant la diffusion : impossible de donner la parole', async () => {
  const p1 = await uidOf('parent1');
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`)).status, 409);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'aucune');
});

test('parcours complet : main levée → parole donnée → publication unique → lecture direction → micro coupé', async () => {
  const p1 = await uidOf('parent1'); const p2 = await uidOf('parent2');
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`)).status, 200);
  // Sans main levée : refus. Un parent ou un enseignant ne peut pas donner la parole (ni à lui-même).
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`)).status, 409);
  await call('parent1', 'POST', `/api/reunions-parents/${mid}/main`);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'main_levee');
  assert.equal((await call('parent1', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`)).status, 403);
  assert.equal((await call('prof1', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`)).status, 403);
  // Aucune publication possible sans autorisation (chemin inventé, jeton de la direction, jeton d'écoute).
  const dirPub = (await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/demarrer`)).json.jeton;
  assert.equal(await auth({ action: 'publish', path: `parole-${mid}-1`, token: dirPub }), 401);
  assert.equal(await auth({ action: 'publish', path: `parole-${mid}-1`, token: 'v.1.2.3.4.x' }), 401);
  // La direction voit la main levée et donne la parole.
  const v0 = await call('direction', 'GET', `/api/reunions-parents/${mid}/diffusion`);
  assert.deepEqual(v0.json.mains.map((x) => x.uid), [p1]); assert.equal(v0.json.parole_max, 1);
  const g = await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`);
  assert.equal(g.status, 200); assert.match(g.json.chemin, new RegExp(`^parole-${mid}-\\d+$`));
  // Un seul orateur à la fois par défaut.
  await call('parent2', 'POST', `/api/reunions-parents/${mid}/main`);
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p2}/donner`)).status, 409);
  // Le parent reçoit son jeton ; un autre parent ne peut pas s'en servir sur ce chemin, ni le sien ailleurs.
  const s1 = await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`);
  assert.equal(s1.json.etat, 'accordee'); assert.equal(s1.json.whip, `/direct/whip/${g.json.chemin}/whip`);
  assert.equal((await call('parent2', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'main_levee');
  const gid = Number(g.json.chemin.split('-')[2]);
  assert.equal(await auth({ action: 'publish', path: `parole-${mid}-${gid + 1}`, token: s1.json.jeton }), 401);
  assert.equal(await auth({ action: 'read', path: g.json.chemin, token: s1.json.jeton }), 401);
  // Publication acceptée une fois, puis le même jeton est refusé (usage unique).
  assert.equal(await auth({ action: 'publish', path: g.json.chemin, token: s1.json.jeton, protocol: 'webrtc' }), 200);
  assert.equal(await auth({ action: 'publish', path: g.json.chemin, token: s1.json.jeton, protocol: 'webrtc' }), 401);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'parle');
  // La direction lit la voix (WHEP) avec son jeton de lecture ; un parent ne peut pas.
  const v1 = await call('direction', 'GET', `/api/reunions-parents/${mid}/diffusion`);
  const o = v1.json.orateurs[0]; assert.equal(o.uid, p1); assert.equal(o.etat, 'parle'); assert.equal(o.whep, `/direct/whip/${g.json.chemin}/whep`);
  assert.equal(await auth({ action: 'read', path: g.json.chemin, token: o.jeton, protocol: 'webrtc' }), 200);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/diffusion`)).json.orateurs, undefined);
  // Le parent ne peut pas couper ni redonner, un enseignant non plus.
  assert.equal((await call('parent1', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/couper`)).status, 403);
  // Micro coupé par la direction : expulsion MediaMTX (API, authentification basique), lecture refusée ensuite.
  mtx.length = 0;
  const c = await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/couper`);
  assert.equal(c.status, 200); assert.equal(c.json.expulsion, true);
  for (let i = 0; i < 50 && mtx.length < 2; i++) await sleep(20);
  assert.deepEqual(mtx, [`GET http://mtx.invalid:9997/v3/paths/get/${g.json.chemin} basic`, 'POST http://mtx.invalid:9997/v3/webrtcsessions/kick/sess-1 basic']);
  assert.equal(await auth({ action: 'read', path: g.json.chemin, token: o.jeton }), 401);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'coupee');
  // Le parent ne peut pas se redonner la parole : la main levée seule ne publie rien.
  await call('parent1', 'POST', `/api/reunions-parents/${mid}/main`);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'main_levee');
  assert.equal(await auth({ action: 'publish', path: g.json.chemin, token: s1.json.jeton }), 401);
  // Le micro libéré, parent2 peut parler ; il arrête lui-même.
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p2}/donner`)).status, 200);
  const s2 = await call('parent2', 'GET', `/api/reunions-parents/${mid}/parole`);
  assert.equal(await auth({ action: 'publish', path: s2.json.whip.split('/')[3], token: s2.json.jeton }), 200);
  assert.equal((await call('parent2', 'POST', `/api/reunions-parents/${mid}/parole/arreter`)).status, 200);
  assert.equal((await call('parent2', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'aucune');
  assert.equal((await call('direction', 'GET', `/api/reunions-parents/${mid}/diffusion`)).json.orateurs.length, 0);
  // Journal : parole donnée et coupée.
  const a = await db.all("SELECT action FROM audit_log WHERE action LIKE 'reunion_parents.parole.%' AND outcome = 'ok' ORDER BY id");
  assert.deepEqual(a.map((x) => x.action), ['reunion_parents.parole.donner', 'reunion_parents.parole.couper', 'reunion_parents.parole.donner']);
});

test('autorisation non utilisée : expirée après 60 s ; baisser la main termine la parole', async () => {
  const p1 = await uidOf('parent1');
  await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`);
  const s = await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`); assert.equal(s.json.etat, 'accordee');
  await db.run("UPDATE parent_meeting_speaker SET expires_at = ? WHERE meeting_id = ? AND state = 'accordee'", new Date(Date.now() - 1000).toISOString(), mid);
  assert.equal(await auth({ action: 'publish', path: s.json.whip.split('/')[3], token: s.json.jeton }), 401);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'aucune');
  await call('parent1', 'POST', `/api/reunions-parents/${mid}/main`);
  await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`);
  await call('parent1', 'POST', `/api/reunions-parents/${mid}/baisser`);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'aucune');
});

test('option 2 orateurs ; arrêt de la diffusion = toutes les paroles terminées ; API MediaMTX réservée à NORIA', async () => {
  const p1 = await uidOf('parent1'); const p2 = await uidOf('parent2');
  const s2 = app.createServer(db, { relay, mtxFetch: async () => ({ ok: false, status: 404 }), rateLimit: { max: 1000 }, env: { ...env, NORIA_PAROLE_MAX: '2' } });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r)); const b0 = base; base = `http://127.0.0.1:${s2.address().port}`;
  try {
    for (const w of ['parent1', 'parent2']) await call(w, 'POST', `/api/reunions-parents/${mid}/main`);
    assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p1}/donner`)).status, 200);
    assert.equal((await call('direction', 'POST', `/api/reunions-parents/${mid}/parole/${p2}/donner`)).status, 200);
    assert.equal((await call('direction', 'GET', `/api/reunions-parents/${mid}/diffusion`)).json.orateurs.length, 2);
    const ctx = { env };
    assert.equal(await auth({ action: 'api', user: 'noria', password: P.apiPassword(ctx), ip: '172.18.0.3' }), 200);
    assert.equal(await auth({ action: 'api', user: 'noria', password: 'faux', ip: '127.0.0.1' }), 401);
    assert.equal(await auth({ action: 'api', ip: '127.0.0.1' }), 401);
    await call('direction', 'POST', `/api/reunions-parents/${mid}/diffusion/arreter`);
    const n = await db.get("SELECT COUNT(*) AS n FROM parent_meeting_speaker WHERE meeting_id = ? AND state <> 'terminee'", mid);
    assert.equal(Number(n.n), 0);
    assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${mid}/parole`)).json.etat, 'aucune');
  } finally { base = b0; s2.close(); }
});
