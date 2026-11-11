'use strict';
// Politique de confidentialité publique (/confidentialite, /ht/confidentialite) : page servie sans connexion ni cookie,
// CSP stricte du portail sans script ni style en ligne, contenu attendu (exploitant, contact, prestataires, cookies,
// rétention, droits, date), liens depuis le pied de page du portail et l'écran de connexion, présence dans le plan du site.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed } = require('../src/seed');
const PV = require('../src/confidentialite');
const { PORTAL_CSP } = require('../src/portail-pages');

let db, server, base;
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual', headers: { accept: 'text/html' } }); return { status: r.status, headers: r.headers, text: await r.text() }; };

before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { rateLimit: { max: 1000 }, security: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

for (const [L, p] of [['fr', '/confidentialite'], ['ht', '/ht/confidentialite']]) {
  test(`${p} : 200, public, sans cookie, CSP stricte, contenu complet (${L})`, async () => {
    const r = await get(p);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.equal(r.headers.get('content-security-policy'), PORTAL_CSP);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.equal(r.headers.get('content-language'), L);
    assert.match(r.text, new RegExp(`<html lang="${L}">`));
    assert.match(r.text, new RegExp(`<link rel="canonical" href="[^"]*${p.replace(/\//g, '\\/')}"`));
    assert.match(r.text, /hreflang="ht" href="[^"]*\/ht\/confidentialite"/);
    // Aucun script ni style en ligne (la CSP les bloquerait) ; aucune ressource externe.
    assert.doesNotMatch(r.text, /<script(?![^>]*\bsrc="\/src\/)/);
    assert.doesNotMatch(r.text, /\sstyle=|\son[a-z]+=/i);
    assert.doesNotMatch(r.text, /(src|href)="https?:\/\/(?!127\.0\.0\.1)/);
    const c = PV.C[L];
    assert.ok(r.text.includes(`<h1>${c.title}</h1>`));
    for (const s of ['Klirline Inc.', 'confidentialite@noriaedu.com', 'mailto:confidentialite@noriaedu.com', 'Philippe Davenson Azor', '777880576RC0001',
      '10948 Avenue de Rome', 'Montréal-Nord', 'H1H 4P4',
      'Vultr', 'Miami', 'Cloudflare', 'R2', 'Resend', 'WhatsApp', 'Telegram',
      'noria_session', 'noria_appareil', 'noria_public', 'noria_admin', 'noria_ministere',
      'TCA', '30', '35', '12', 'datetime="2026-11-04"']) assert.ok(r.text.includes(s), `${L} contient ${s}`);
    assert.ok(r.text.includes(L === 'fr' ? '4 novembre 2026' : '4 novanm 2026'));
    assert.ok(r.text.includes(L === 'fr' ? 'Version 2.0' : 'Vèsyon 2.0'));
    assert.ok(r.text.includes(L === 'fr' ? 'nous ne vendons ni ne louons aucune donnée personnelle.' : 'nou pa vann ni lwe okenn done pèsonèl.'));
    assert.ok(r.text.includes(L === 'fr' ? 'Aucune reconnaissance faciale' : 'Pa gen rekonesans figi'));
    assert.ok(r.text.includes('Network Error Logging'));
    assert.ok(r.text.includes('Web Analytics'));
    assert.doesNotMatch(r.text, /privacy@noriaedu\.com|PROJET NON PUBLI|\[à confirmer\]|\[à compléter\]|\[a konfime\]/i);
    assert.doesNotMatch(r.text, /\[[^\]]{0,120}\]/);
    assert.equal(c.sections.length, 17);
    // Aucune revendication de certification ou de conformité (texte à faire relire par un juriste).
    assert.doesNotMatch(r.text, /certifié|certification|sètifye|ISO ?27001|SOC ?2|RGPD|GDPR|HIPAA|conforme|konfòm/i);
  });
}

test('versions FR et HT : mêmes sections, mêmes puces de prestataires', () => {
  assert.equal(PV.C.fr.sections.length, PV.C.ht.sections.length);
  PV.C.fr.sections.forEach(([, ps], i) => {
    const ht = PV.C.ht.sections[i][1];
    assert.equal(ps.length, ht.length, `section ${i} paragraphes`);
    assert.equal(ps.filter((x) => x.startsWith('• ')).length, ht.filter((x) => x.startsWith('• ')).length, `section ${i} puces`);
  });
});

test('liens : pied de page du portail (FR/HT), écran de connexion, plan du site ; adresse avec / final refusée', async () => {
  const fr = await get('/'); const ht = await get('/ht');
  assert.match(fr.text, /<footer[\s\S]*href="\/confidentialite">Confidentialité<\/a>/);
  assert.match(ht.text, /<footer[\s\S]*href="\/ht\/confidentialite">Konfidansyalite<\/a>/);
  for (const html of [fr.text, ht.text, (await get('/confidentialite')).text, (await get('/tarifs')).text]) {
    assert.match(html, /<footer[\s\S]*mailto:info@noriaedu\.com">info@noriaedu.com/);
    assert.match(html, /<footer[\s\S]*mailto:contact@klirline\.ca">contact@klirline.ca/);
  }
  assert.match(fr.text, /Une question \?/);
  assert.match(ht.text, /Ou gen yon kesyon \?/);
  const login = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'login.js'), 'utf8');
  assert.match(login, /class="login-priv"><a href="\$\{lang\(\)==="ht"\?"\/ht":""\}\/confidentialite"/);
  assert.match(login, /priv:"Politique de confidentialité"/); assert.match(login, /priv:"Politik konfidansyalite"/);
  assert.match(login, /help:"Besoin d'aide \?"/); assert.match(login, /help:"Ou bezwen èd \?"/);
  assert.match(login, /mailto:support@noriaedu\.com">support@noriaedu.com/);
  const sm = await fetch(`${base}/sitemap.xml`).then((r) => r.text());
  assert.match(sm, /<loc>[^<]*\/confidentialite<\/loc><lastmod>2026-11-04<\/lastmod>/);
  assert.match(sm, /<loc>[^<]*\/ht\/confidentialite<\/loc>/);
  assert.notEqual((await get('/confidentialite/')).status, 200);
  assert.notEqual((await get('/confidentialite/x')).status, 200);
});
