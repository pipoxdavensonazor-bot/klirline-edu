'use strict';
// Campagne d'inscription : le titre n'est jamais collé au libellé de statut (« Inscriptions 2027-2028Inscriptions ouvertes »).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { campaignTitle } = require('../src/candidatures');

let db, server, base, tok;
before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 50 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }) });
  tok = (await r.json()).token;
});
after(async () => { server.close(); await db.cleanup(); });

test('titre : libellé par défaut collé retiré, titres normaux intacts', () => {
  assert.equal(campaignTitle('Inscriptions 2027-2028Inscriptions ouvertes'), 'Inscriptions 2027-2028');
  assert.equal(campaignTitle('Inscriptions ouvertesInscriptions 2027-2028'), 'Inscriptions 2027-2028');
  assert.equal(campaignTitle('Enskripsyon 2027-2028Enskripsyon ouvè'), 'Enskripsyon 2027-2028');
  assert.equal(campaignTitle('Inscriptions 2027-2028'), 'Inscriptions 2027-2028');
  assert.equal(campaignTitle('Rentrée : Inscriptions ouvertes'), 'Rentrée : Inscriptions ouvertes');
  assert.equal(campaignTitle(''), 'Inscriptions ouvertes');
  assert.equal(campaignTitle('Inscriptions ouvertes'), 'Inscriptions ouvertes');
});

test('campagne : annonce, formulaire public et espace des écoles affichent le titre propre et un statut séparé', async () => {
  const r = await fetch(base + '/api/candidatures/campagnes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({ titre: 'Inscriptions 2027-2028Inscriptions ouvertes', fin: '2099-01-01' }) });
  assert.equal(r.status, 200);
  const anns = await (await fetch(base + '/api/announcements', { headers: { authorization: `Bearer ${tok}` } })).json();
  assert.ok(anns.some((a) => a.title === 'Inscriptions 2027-2028'));
  assert.ok(!JSON.stringify(anns).includes('2027-2028Inscriptions'));
  const page = await (await fetch(base + '/inscription/ecole-a')).text();
  assert.match(page, /<strong class="camp-t">Inscriptions 2027-2028<\/strong> <span class="badge camp-st">Inscriptions ouvertes<\/span>/);
  for (const u of ['/inscriptions', '/ecoles', '/ecoles?categorie=inscriptions']) {
    const h = await (await fetch(base + u)).text();
    assert.ok(!h.includes('2027-2028Inscriptions'), u);
  }
});

test('interface école : le champ titre n’est plus prérempli (placeholder) et le statut est une pastille séparée', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lot3.js'), 'utf8');
  assert.ok(!/name="titre" maxlength="140" value=/.test(src));
  assert.match(src, /l3-camp-t[^]*?<\/b> <span class="badge/);
});
