'use strict';
// Administration de la plateforme : compte créé par le script CLI, 2FA obligatoire, session séparée, routes dédiées
// journalisées, lecture par défaut ; création, suspension et réactivation d'une école (motif exigé).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const { openStore } = require('../src/store');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
let db, server, base, ids; const sent = [];
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}
async function adminLogin() {
  const a = await call(null, 'POST', '/api/admin/login', { email: 'Admin@Noria.exemple.invalid', password: ADMIN_PW });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  const b = await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code });
  assert.equal(b.status, 200); return b;
}

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  server = createServer(db, { notifier, rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('connexion : mot de passe puis code à 6 chiffres (2FA), échecs journalisés', async () => {
  assert.equal((await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: 'faux' })).status, 401);
  assert.equal((await call(null, 'POST', '/api/admin/login', { email: 'inconnu@x.invalid', password: ADMIN_PW })).status, 401);
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  assert.equal(a.status, 200); assert.equal(a.json.channel, 'sms'); assert.equal(a.json.token, undefined, 'pas de session sans code');
  const m = sent.pop(); assert.equal(m.to, '+50900000999');
  const code = m.text.match(/code (\d{6})/)[1];
  assert.equal((await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code: code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /noria_admin=.+HttpOnly; SameSite=Strict; Path=\/api\/admin/);
  assert.equal((await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).status, 401, 'code à usage unique');
  const fails = await db.all("SELECT detail FROM platform_audit WHERE action = 'admin.login' AND outcome = 'refuse'");
  assert.ok(fails.length >= 3);
  // Le code n'est pas stocké en clair.
  const row = await db.get('SELECT code_hash FROM platform_login ORDER BY id DESC LIMIT 1');
  assert.ok(!row.code_hash.includes(code));
});

test('accès séparé : un compte d’école (même direction) n’entre pas ; aucune route publique de création', async () => {
  const dir = (await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD })).json.token;
  assert.equal((await call(dir, 'GET', '/api/admin/ecoles')).status, 401);
  assert.equal((await call(null, 'GET', '/api/admin/ecoles')).status, 401);
  assert.equal((await call(null, 'POST', '/api/admin/comptes', { email: 'x@x.invalid' })).status, 404);
  // Et un jeton d'administration ne vaut rien sur les routes d'école.
  const adm = (await adminLogin()).json.token;
  assert.equal((await call(adm, 'GET', '/api/students')).status, 401);
});

test('lecture : écoles, comptes, journal global, état du serveur, connexions échouées — chaque lecture journalisée', async () => {
  const t = (await adminLogin()).json.token;
  const ec = await call(t, 'GET', '/api/admin/ecoles');
  assert.equal(ec.status, 200); assert.deepEqual(ec.json.map((e) => e.slug).sort(), ['ecole-a', 'ecole-b']);
  assert.equal(Number(ec.json[0].students), 2);
  const cpt = await call(t, 'GET', '/api/admin/comptes?q=direction');
  assert.equal(cpt.status, 200); assert.ok(cpt.json.length >= 2); assert.ok(cpt.json[0].ecoles[0].roles.includes('direction'));
  assert.equal(cpt.json[0].password_hash, undefined);
  const j = await call(t, 'GET', '/api/admin/journal');
  assert.ok(j.json.plateforme.length && j.json.ecoles.length);
  const st = await call(t, 'GET', '/api/admin/etat');
  assert.equal(st.json.healthz.ok, true); assert.ok(st.json.taille_base > 0); assert.ok(st.json.migrations.includes('009'));
  const e = await call(t, 'GET', '/api/admin/echecs');
  assert.ok(Array.isArray(e.json.ecoles) && e.json.admin.length >= 1);
  const reads = await db.all("SELECT target FROM platform_audit WHERE action = 'admin.read'");
  for (const x of ['ecoles', 'comptes', 'journal', 'etat', 'echecs']) assert.ok(reads.some((r) => r.target === x), x);
});

test('écriture : créer, suspendre (déconnexion immédiate, connexion refusée), réactiver ; motif obligatoire', async () => {
  const t = (await adminLogin()).json.token;
  assert.equal((await call(t, 'POST', '/api/admin/ecoles', { slug: 'college-saint-pierre', name: 'Collège Saint-Pierre' })).status, 400, 'motif');
  const c = await call(t, 'POST', '/api/admin/ecoles', { slug: 'college-saint-pierre', name: 'Collège Saint-Pierre', reason: 'nouvelle école pilote' });
  assert.equal(c.status, 200); assert.equal(c.json.initials, 'CSP');
  const dirB = (await call(null, 'POST', '/api/login', { school: 'ecole-b', identifier: 'direction@b.exemple.invalid', password: DEMO_PASSWORD })).json.token;
  assert.equal((await call(dirB, 'GET', '/api/me')).status, 200);
  assert.equal((await call(t, 'POST', `/api/admin/ecoles/${ids.B.school}/suspendre`, {})).status, 400);
  assert.equal((await call(t, 'POST', `/api/admin/ecoles/${ids.B.school}/suspendre`, { reason: 'impayé (fictif)' })).status, 200);
  assert.equal((await call(dirB, 'GET', '/api/me')).status, 401);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-b', identifier: 'direction@b.exemple.invalid', password: DEMO_PASSWORD })).status, 401);
  // L'école A n'est pas touchée.
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD })).status, 200);
  assert.equal((await call(t, 'POST', `/api/admin/ecoles/${ids.B.school}/reactiver`, { reason: 'régularisé' })).status, 200);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-b', identifier: 'direction@b.exemple.invalid', password: DEMO_PASSWORD })).status, 200);
  const acts = (await db.all("SELECT action FROM platform_audit WHERE action LIKE 'admin.school.%' ORDER BY id")).map((r) => r.action);
  assert.deepEqual(acts, ['admin.school.create', 'admin.school.suspendre', 'admin.school.reactiver']);
  // Journal en ajout seul.
  await assert.rejects(db.run('DELETE FROM platform_audit'), /ajout seul/);
});

test('cookie d’administration : en-tête x-noria exigé pour écrire ; déconnexion', async () => {
  const r = await adminLogin();
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(null, 'GET', '/api/admin/me', null, { cookie })).status, 200);
  assert.equal((await call(null, 'POST', '/api/admin/logout', {}, { cookie })).status, 403);
  assert.equal((await call(null, 'POST', '/api/admin/logout', {}, { cookie, 'x-noria': '1' })).status, 200);
  assert.equal((await call(null, 'GET', '/api/admin/me', null, { cookie })).status, 401);
});

test('script CLI npm run admin:creer (SQLite)', { skip: PG && 'SQLite seulement' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-adm-'));
  const file = path.join(dir, 'a.sqlite');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'admin-creer.js'), '--email', 'Cli@Exemple.invalid', '--nom', 'Admin CLI'],
    { env: { ...process.env, NORIA_DB: file, NORIA_ADMIN_PASSWORD: ADMIN_PW, DATABASE_URL: '' } }).toString();
  assert.match(out, /créé/);
  const d = await openStore(file);
  const a = await d.get('SELECT email, password_hash FROM platform_admin');
  assert.equal(a.email, 'cli@exemple.invalid'); assert.match(a.password_hash, /^scrypt\$/);
  await d.close();
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'admin-creer.js'), '--email', 'x@y.invalid', '--nom', 'X'],
    { env: { ...process.env, NORIA_DB: file, NORIA_ADMIN_PASSWORD: 'court', DATABASE_URL: '' }, stdio: 'pipe' }), /14 caractères/);
  fs.rmSync(dir, { recursive: true, force: true });
});
