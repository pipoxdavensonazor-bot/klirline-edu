'use strict';
// Limiteur de la connexion : les demandes de lien de récupération ont leur propre compteur par IP. Avant, elles
// consommaient les 5 essais « ip: » de la connexion (2 mots de passe faux + 3 demandes de lien = connexion bloquée
// 15 min, même avec le bon mot de passe juste après l'activation d'une invitation).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base;
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status);
before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { security: false }); // limiteur par défaut : 5 essais / 15 min
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('récupération puis connexion : les demandes de lien ne bloquent pas la connexion', async () => {
  await db.run('DELETE FROM login_attempt');
  const who = { school: 'ecole-a', identifier: 'direction@a.exemple.invalid' };
  assert.equal(await post('/api/login', { ...who, password: 'mauvais-mot-de-passe-1' }), 401);
  assert.equal(await post('/api/login', { ...who, identifier: 'autre@a.exemple.invalid', password: 'x' }), 401);
  for (let i = 0; i < 3; i++) assert.equal(await post('/api/recovery/request', who), 200);
  assert.equal(await post('/api/login', { ...who, password: DEMO_PASSWORD }), 200);
});

test('la limite par IP reste active : 5 mots de passe faux bloquent, et la récupération garde sa propre limite', async () => {
  await db.run('DELETE FROM login_attempt');
  for (let i = 0; i < 5; i++) assert.equal(await post('/api/login', { school: 'ecole-a', identifier: `x${i}@a.exemple.invalid`, password: 'x' }), 401);
  assert.equal(await post('/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }), 429);
  await db.run('DELETE FROM login_attempt');
  for (let i = 0; i < 5; i++) assert.equal(await post('/api/recovery/request', { school: 'ecole-a', identifier: `y${i}@a.exemple.invalid` }), 200);
  assert.equal(await post('/api/recovery/request', { school: 'ecole-a', identifier: 'z@a.exemple.invalid' }), 429);
  assert.equal(await post('/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }), 200);
});
