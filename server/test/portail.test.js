'use strict';
// Bloc 5 : portail public. Modération (rien de public avant validation), consentement des lauréats mineurs, XSS,
// dates et clics des annonces, pages publiques sans connexion ni cookie, aucune donnée privée d'école exposée,
// images (signature, poids, métadonnées), règle « propositions_masse » de l'assistant sécurité, RLS (PostgreSQL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer, createLimiter } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const { createSecurity } = require('../src/securite');
const Pt = require('../src/portail');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
const JPG = fs.readFileSync(path.join(__dirname, 'fixtures', 'photo-fictive.jpg'));
let db, server, base, ids, sec, admin; const sent = [];
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, json, text: buf.toString('utf8'), buf, headers: res.headers };
}
const page = (p, headers = {}) => call(null, 'GET', p, null, { accept: 'text/html', ...headers });
const tokens = {};
const tok = async (k, who) => {
  const key = `${k}:${who}`;
  if (!tokens[key]) {
    const r = await call(null, 'POST', '/api/login', { school: `ecole-${k.toLowerCase()}`, identifier: `${who}@${k.toLowerCase()}.exemple.invalid`, password: DEMO_PASSWORD });
    assert.equal(r.status, 200, `connexion ${who}`); tokens[key] = r.json.token;
  }
  return tokens[key];
};
const acall = (m, p, b) => call(admin, m, p, b);
const propose = async (k, body, who = 'direction') => call(await tok(k, who), 'POST', '/api/portail/propositions', body);
const day = (n) => Pt.haitiDay(new Date(Date.now() + n * 86400e3));
const ev = (o = {}) => ({ kind: 'evenement', title_fr: 'Kermesse fictive', category: 'culture', event_date: day(10), place: 'Cour de l’école (fictive)', ...o });

// WebP minimal (en-tête VP8L valide, contenu factice) : le serveur vérifie la structure, il ne décode pas l'image.
function webp({ w = 32, h = 32, extra = [], anim = false } = {}) {
  const chunk = (tag, data) => { const hd = Buffer.alloc(8); hd.write(tag, 0, 'ascii'); hd.writeUInt32LE(data.length, 4); return Buffer.concat([hd, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8l = Buffer.alloc(12); vp8l[0] = 0x2f; vp8l.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 1);
  const parts = [];
  if (extra.length || anim) { const x = Buffer.alloc(10); x[0] = (anim ? 0x02 : 0) | 0x08 | 0x04; x.writeUIntLE(w - 1, 4, 3); x.writeUIntLE(h - 1, 7, 3); parts.push(chunk('VP8X', x)); }
  if (anim) parts.push(chunk('ANIM', Buffer.alloc(6)));
  parts.push(chunk('VP8L', vp8l));
  for (const [t, d] of extra) parts.push(chunk(t, d));
  const body = Buffer.concat(parts); const hd = Buffer.alloc(12); hd.write('RIFF', 0, 'ascii'); hd.writeUInt32LE(body.length + 4, 4); hd.write('WEBP', 8, 'ascii');
  return Buffer.concat([hd, body]);
}
// JPEG avec un segment EXIF (APP1) ajouté après SOI.
const withExif = (jpg) => { const d = Buffer.from('Exif\0\0GPS-FICTIF-12'); const h = Buffer.from([0xff, 0xe1, 0, 0]); h.writeUInt16BE(d.length + 2, 2); return Buffer.concat([jpg.subarray(0, 2), h, d, jpg.subarray(2)]); };

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  sec = createSecurity({ db, env: {}, notifier, log: () => {} });
  server = createServer(db, { notifier, rateLimit: { max: 1000 }, security: sec, portalLimit: createLimiter({ max: 1000, windowMs: 3600e3 }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  admin = (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
});
after(async () => { server.close(); await db.cleanup(); });

test('initiales : lettres seulement (chiffres et ponctuation ignorés), nom composé compté une fois, repli', () => {
  assert.equal(Pt.initials('Élève Fictif Pixel 7'), 'É. F. P.');
  assert.equal(Pt.initials('Anne-Marie Exemple'), 'A. E.');
  assert.equal(Pt.initials('  r   d '), 'R. D.');
  assert.equal(Pt.initials('123 (?)'), '?');
});

test('pages publiques sans connexion : HTML, CSP stricte, aucun cookie, cache, SEO, langue', async () => {
  for (const p of ['/', '/evenements', '/laureats', '/communaute', '/annonces', '/ht', '/ht/evenements', '/ht/laureats', '/ht/communaute', '/ht/annonces']) {
    const r = await page(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('set-cookie'), null, `${p} : aucun cookie`);
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'/);
    assert.match(r.headers.get('cache-control'), /^public, max-age=60/);
    assert.match(r.text, new RegExp(`<html lang="${p.startsWith('/ht') ? 'ht' : 'fr'}">`));
    assert.match(r.text, /<meta name="description" content="[^"]{20,}">/);
    assert.match(r.text, /<meta property="og:title"/); assert.match(r.text, /<meta property="og:image" content="http/);
    assert.match(r.text, /<link rel="canonical" href="http[^"]+">/);
    assert.match(r.text, /hreflang="ht"/); assert.match(r.text, /href="\/app"/, 'lien « Se connecter » vers l’espace des écoles');
    assert.doesNotMatch(r.text, /<script>|<script [^>]*>[^<]|\son\w+=|style="/, `${p} : ni script ni style en ligne`);
  }
  assert.match((await page('/')).text, />Se connecter</); assert.match((await page('/ht')).text, />Konekte</);
  const head = await call(null, 'HEAD', '/laureats'); assert.equal(head.status, 200); assert.equal(head.buf.length, 0);
  const robots = await call(null, 'GET', '/robots.txt'); assert.equal(robots.status, 200); assert.match(robots.text, /Disallow: \/app/); assert.match(robots.text, /Sitemap: http/);
  const sm = await call(null, 'GET', '/sitemap.xml'); assert.equal(sm.status, 200); assert.match(sm.text, /<urlset/); assert.match(sm.text, /hreflang="ht"/);
  const old = await call(null, 'GET', '/public/laureats?annee=2026'); assert.equal(old.status, 301); assert.equal(old.headers.get('location'), '/laureats?annee=2026');
  assert.equal((await page('/nexiste-pas')).status, 404); assert.match((await page('/nexiste-pas')).text, /Page introuvable/);
  assert.equal((await call(null, 'GET', '/nexiste-pas')).json.error, 'introuvable', 'client API : réponse JSON');
  assert.equal((await page('/evenements/abc')).status, 404);
});

test('modération : rien de public avant validation ; refus et dépublication motivés ; tout au journal', async () => {
  const dA = await tok('A', 'direction');
  // Seule la direction propose (refus journalisé).
  const refused = await propose('A', ev(), 'prof1');
  assert.equal(refused.status, 403);
  assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'portail.proposer' AND outcome = 'refuse'"));
  const r = await propose('A', ev({ title_fr: 'Kermesse en attente (fictive)', event_date: day(3) }));
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.status, 'en_attente');
  const id = r.json.id;
  assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'portail.proposer' AND record_id = ? AND outcome = 'ok'", String(id)));
  // Pas public : ni liste, ni détail, ni accueil, ni plan du site.
  assert.doesNotMatch((await page('/evenements')).text, /Kermesse en attente/);
  assert.doesNotMatch((await page('/')).text, /Kermesse en attente/);
  assert.equal((await page(`/evenements/${id}`)).status, 404);
  assert.doesNotMatch((await call(null, 'GET', '/sitemap.xml')).text, new RegExp(`/evenements/${id}<`));
  // Cloisonnement des propositions : B ne voit ni ne retire celles de A.
  const listB = await call(await tok('B', 'direction'), 'GET', '/api/portail/propositions');
  assert.ok(!listB.json.propositions.some((p) => p.id === id));
  assert.equal((await call(await tok('B', 'direction'), 'POST', `/api/portail/propositions/${id}/retirer`)).status, 404);
  assert.ok((await call(dA, 'GET', '/api/portail/propositions')).json.propositions.some((p) => p.id === id && p.status === 'en_attente'));
  // Un compte d'école n'atteint pas les routes de modération.
  assert.equal((await call(dA, 'POST', `/api/admin/portail/elements/${id}/publier`, {})).status, 401);
  // Refus : motif obligatoire.
  assert.equal((await acall('POST', `/api/admin/portail/elements/${id}/refuser`, {})).status, 400);
  // Publication par le super-admin.
  const pub = await acall('POST', `/api/admin/portail/elements/${id}/publier`, {});
  assert.equal(pub.status, 200); assert.equal(pub.json.status, 'publie');
  assert.match((await page('/evenements')).text, /Kermesse en attente/);
  assert.equal((await page(`/evenements/${id}`)).status, 200);
  assert.match((await call(null, 'GET', '/sitemap.xml')).text, new RegExp(`/evenements/${id}<`));
  assert.equal((await call(dA, 'POST', `/api/portail/propositions/${id}/retirer`)).status, 404, 'publié : plus retirable par l’école');
  // Dépublication motivée : disparaît.
  assert.equal((await acall('POST', `/api/admin/portail/elements/${id}/depublier`, {})).status, 400);
  assert.equal((await acall('POST', `/api/admin/portail/elements/${id}/depublier`, { reason: 'Date reportée (fictif)' })).status, 200);
  assert.equal((await page(`/evenements/${id}`)).status, 404);
  // Refus d'une autre proposition, puis retrait par l'école d'une proposition en attente.
  const r2 = await propose('A', ev({ title_fr: 'À refuser (fictif)' }));
  assert.equal((await acall('POST', `/api/admin/portail/elements/${r2.json.id}/refuser`, { reason: 'Hors sujet (fictif)' })).status, 200);
  assert.equal((await acall('POST', `/api/admin/portail/elements/${r2.json.id}/refuser`, { reason: 'Encore' })).status, 409);
  const r3 = await propose('A', ev({ title_fr: 'À retirer (fictif)' }));
  assert.equal((await call(dA, 'POST', `/api/portail/propositions/${r3.json.id}/retirer`)).status, 200);
  assert.equal((await acall('POST', `/api/admin/portail/elements/${r3.json.id}/publier`, {})).status, 409, 'retiré par l’école : non publiable');
  const mine = (await call(dA, 'GET', '/api/portail/propositions')).json.propositions;
  assert.equal(mine.find((p) => p.id === r2.json.id).moderation_reason, 'Hors sujet (fictif)');
  for (const a of ['admin.portail.publier', 'admin.portail.depublier', 'admin.portail.refuser']) assert.ok(await db.get('SELECT id FROM platform_audit WHERE action = ?', a), a);
  // Jamais supprimé (garde-fou de la base).
  await assert.rejects(db.run('DELETE FROM portal_item WHERE id = ?', id), /suppression interdite/);
});

test('lauréat mineur : nom complet et photo seulement avec le consentement de l’école ET du parent', async () => {
  const base = { kind: 'laureat', person_name: 'Jacques Fictif-Exemple', year: 2026, exam: 'Examens officiels 9e AF (fictif)', exam_type: 'examen', department: 'ouest', mention: 'Excellent' };
  assert.equal((await propose('A', base)).status, 400, 'mineur : réponse explicite exigée');
  assert.equal((await propose('A', { ...base, minor: true, consent_school: true, consent_parent: true })).status, 400, 'consentement du parent : nom exigé');
  assert.equal((await propose('A', { ...base, minor: true, consent_parent: true, consent_parent_name: 'Parent fictif' })).status, 400, 'parent sans école');
  // Mineur sans consentement (avec photo) : initiales seules, aucune photo publique.
  const a = await propose('A', { ...base, minor: true, consent_school: true, image: { data: JPG.toString('base64') } });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  await acall('POST', `/api/admin/portail/elements/${a.json.id}/publier`, {});
  const row = await db.get('SELECT image_id, school_name FROM portal_item WHERE id = ?', a.json.id);
  assert.equal(row.school_name, 'École fictive A', 'l’école propose ses propres lauréats');
  for (const p of ['/laureats', '/ht/laureats', '/laureats?annee=2026&type=examen&departement=ouest']) {
    const h = (await page(p)).text;
    assert.match(h, /J\. F\./, p); assert.doesNotMatch(h, /Jacques|Fictif-Exemple/, `${p} : nom complet masqué`);
    assert.doesNotMatch(h, new RegExp(`/p/img/${row.image_id}`), `${p} : pas de photo`);
  }
  assert.equal((await call(null, 'GET', `/p/img/${row.image_id}`)).status, 404, 'photo inaccessible');
  await acall('POST', `/api/admin/portail/elements/${a.json.id}/une`, { featured: true });
  assert.doesNotMatch((await page('/')).text, /Jacques/);
  // Mineur avec les deux consentements : nom complet et photo.
  const b = await propose('A', { ...base, person_name: 'Lucie Consentie', minor: true, consent_school: true, consent_parent: true, consent_parent_name: 'Parent fictif de Lucie', image: { data: JPG.toString('base64') } });
  await acall('POST', `/api/admin/portail/elements/${b.json.id}/publier`, {});
  const rb = await db.get('SELECT image_id, consent_at, consent_by FROM portal_item WHERE id = ?', b.json.id);
  assert.ok(rb.consent_at && /direction/.test(rb.consent_by), 'consentement daté et attribué');
  const h = (await page('/laureats')).text;
  assert.match(h, /Lucie Consentie/); assert.match(h, new RegExp(`/p/img/${rb.image_id}`));
  assert.doesNotMatch(h, /Parent fictif de Lucie/, 'le nom du parent n’est jamais public');
  const img = await call(null, 'GET', `/p/img/${rb.image_id}`);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.match(img.headers.get('cache-control'), /public/);
  // Majeur : publié en entier ; les consentements envoyés sont ignorés.
  const c = await propose('B', { ...base, person_name: 'Marc Majeur', minor: false, consent_parent: true });
  assert.equal(c.status, 200);
  assert.equal(Number((await db.get('SELECT consent_parent FROM portal_item WHERE id = ?', c.json.id)).consent_parent), 0);
  assert.deepEqual(Pt.publicItem({ kind: 'laureat', id: 1, person_name: 'Anne-Marie Fils-Aimé', minor: 1, consent_school: 1, consent_parent: 0, year: 2026, exam: 'x', image_id: 3 }).name, 'A. F.');
});

test('XSS : texte nettoyé à l’entrée et échappé à l’affichage ; liens https seulement', async () => {
  const evil = await propose('B', ev({
    title_fr: '<script>alert(1)</script>Fête <img src=x onerror=alert(2)> "fictive"',
    body_fr: 'Bonjour <b onclick="x()">tous</b>\n\n<iframe src="https://x.invalid"></iframe>javascript:alert(3) \u202eabc',
    place: 'Salle <svg onload=alert(4)> & cour',
  }));
  assert.equal(evil.status, 200, JSON.stringify(evil.json));
  const row = await db.get('SELECT title_fr, body_fr, place FROM portal_item WHERE id = ?', evil.json.id);
  for (const v of [row.title_fr, row.body_fr, row.place]) { assert.doesNotMatch(v, /[<>]/); assert.doesNotMatch(v, /\u202e/); }
  assert.doesNotMatch(row.title_fr, /alert\(1\)/, 'contenu du bloc script retiré');
  await acall('POST', `/api/admin/portail/elements/${evil.json.id}/publier`, {});
  const h = (await page(`/evenements/${evil.json.id}`)).text;
  assert.doesNotMatch(h, /<script>|<img src=x|onerror|onclick|<iframe|<svg/);
  assert.match(h, /&quot;fictive&quot;/); assert.match(h, /&amp; cour/);
  assert.equal((await propose('B', ev({ title_fr: '<b></b>' }))).status, 400, 'titre vide après nettoyage');
  for (const url of ['javascript:alert(1)', 'http://exemple.invalid', 'https://u:p@exemple.org', 'data:text/html,x', 'https://exemple.org/"onmouseover="x'])
    assert.equal((await acall('POST', '/api/admin/portail/annonces', { sponsor: 'X', title_fr: 'X', url, starts_on: day(0), ends_on: day(1) })).status, 400, url);
});

test('annonces : « Sponsorisé », dates de début et de fin, clics comptés sans traceur', async () => {
  assert.equal((await acall('POST', '/api/admin/portail/annonces', { title_fr: 'Sans annonceur', starts_on: day(0), ends_on: day(5) })).status, 400, 'sponsorisé : annonceur exigé');
  assert.equal((await acall('POST', '/api/admin/portail/annonces', { sponsor: 'X', title_fr: 'Dates inversées', starts_on: day(5), ends_on: day(1) })).status, 400);
  assert.equal((await acall('POST', '/api/admin/portail/annonces', { sponsor: 'X', title_fr: 'Date fausse', starts_on: '2026-02-30', ends_on: day(1) })).status, 400);
  const mk = async (title, a, b, extra = {}) => { const r = await acall('POST', '/api/admin/portail/annonces', { sponsor: 'Annonceur fictif', title_fr: title, title_ht: `${title} HT`, url: 'https://example.org/promo', starts_on: day(a), ends_on: day(b), ...extra }); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.id; };
  const now = await mk('Encart en cours', -1, 3);
  const future = await mk('Encart futur', 2, 9);
  const past = await mk('Encart expiré', -9, -1);
  const lastDay = await mk('Encart dernier jour', -3, 0);
  const official = await mk('Annonce officielle', 0, 0, { sponsored: false, sponsor: null });
  const h = (await page('/annonces')).text;
  assert.match(h, /Encart en cours/); assert.match(h, /Encart dernier jour/); assert.match(h, /Annonce officielle/);
  assert.doesNotMatch(h, /Encart futur|Encart expiré/);
  assert.match(h, /<span class="tag-sp">Sponsorisé<\/span>/); assert.match(h, /Encart payé par Annonceur fictif/);
  assert.match(h, new RegExp(`href="/p/clic/${now}" rel="sponsored nofollow noopener"`));
  assert.doesNotMatch(h, /example\.org/, 'lien direct absent : passage par /p/clic');
  assert.match((await page('/ht/annonces')).text, /<span class="tag-sp">Sponsorize<\/span>/);
  // Clics : redirection, compteur journalier, un seul clic par visiteur et par jour, aucun cookie.
  const c1 = await call(null, 'GET', `/p/clic/${now}`, null, { 'user-agent': 'test-a' });
  assert.equal(c1.status, 302); assert.equal(c1.headers.get('location'), 'https://example.org/promo'); assert.equal(c1.headers.get('set-cookie'), null);
  await call(null, 'GET', `/p/clic/${now}`, null, { 'user-agent': 'test-a' });
  await call(null, 'GET', `/p/clic/${now}`, null, { 'user-agent': 'test-b' });
  assert.equal(Number((await db.get('SELECT clicks FROM portal_ad_click WHERE ad_id = ?', now)).clicks), 2);
  for (const id of [future, past]) {
    const r = await call(null, 'GET', `/p/clic/${id}`);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/annonces');
    assert.equal(await db.get('SELECT clicks FROM portal_ad_click WHERE ad_id = ?', id), undefined);
  }
  const cols = (await db.all('SELECT * FROM portal_ad_click'))[0];
  assert.deepEqual(Object.keys(cols).sort(), ['ad_id', 'clicks', 'day'], 'ni IP ni identifiant de visiteur');
  const list = (await acall('GET', '/api/admin/portail/annonces')).json;
  assert.equal(list.find((a) => a.id === now).clics, 2);
  // Désactivation : retirée immédiatement.
  assert.equal((await acall('POST', `/api/admin/portail/annonces/${now}/desactiver`)).status, 200);
  assert.doesNotMatch((await page('/annonces')).text, /Encart en cours/);
  assert.ok(lastDay && official);
});

test('aucune donnée privée d’école exposée ; école suspendue masquée ; partenaires', async () => {
  const dA = await tok('A', 'direction');
  assert.equal((await call(dA, 'PUT', '/api/portail/partenaire', { actif: true, logo: webp({ w: 300, h: 300 }).toString('base64') })).status, 400, 'logo trop grand (256 px au plus)');
  assert.equal((await call(dA, 'PUT', '/api/portail/partenaire', { actif: true })).status, 200);
  assert.equal((await call(await tok('A', 'secretariat'), 'PUT', '/api/portail/partenaire', { actif: false })).status, 403);
  const t = await propose('A', { kind: 'temoignage', title_fr: 'Témoignage fictif A', body_fr: 'Texte du témoignage fictif.', author: 'Direction' });
  await acall('POST', `/api/admin/portail/elements/${t.json.id}/publier`, {});
  let all = '';
  for (const p of ['/', '/evenements', '/laureats', '/communaute', `/communaute/${t.json.id}`, '/annonces', '/sitemap.xml', '/ht']) all += (await page(p)).text;
  assert.match(all, /École fictive A/);
  for (const secret of ['contact@a.exemple.invalid', '+50900000199', '12, rue Fictive', 'Direction fictive A', 'FictifA', 'Note santé', 'Frais fictifs', 'A-001', '@a.exemple.invalid', 'consent_parent', 'Parent fictif', 'created_by', 'moderation_reason'])
    assert.ok(!all.includes(secret), `donnée privée exposée : ${secret}`);
  // Suspension : contenus et logo de l'école masqués.
  await db.run("UPDATE school SET status = 'suspendue' WHERE id = ?", ids.A.school); Pt.bump();
  assert.equal((await page(`/communaute/${t.json.id}`)).status, 404);
  assert.doesNotMatch((await page('/')).text, /École fictive A/);
  await db.run("UPDATE school SET status = 'active' WHERE id = ?", ids.A.school); Pt.bump();
  assert.equal((await call(dA, 'PUT', '/api/portail/partenaire', { actif: false })).status, 200);
  assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'portail.partenaire'"));
});

test('images : JPEG ou WebP seulement, 80 Ko au plus, métadonnées retirées, vignette', async () => {
  // EXIF retiré du JPEG.
  const clean = Pt.checkImage(withExif(JPG).toString('base64'));
  assert.ok(!clean.buf.includes(Buffer.from('GPS-FICTIF')), 'EXIF retiré'); assert.equal(clean.mime, 'image/jpeg');
  // WebP : EXIF/XMP retirés, indicateurs effacés ; animation refusée.
  const w = Pt.checkImage(webp({ extra: [['EXIF', Buffer.from('GPS-FICTIF-WEBP')], ['XMP ', Buffer.from('<x:xmpmeta/>')]] }).toString('base64'));
  assert.equal(w.mime, 'image/webp'); assert.equal(w.width, 32); assert.ok(!w.buf.includes(Buffer.from('GPS-FICTIF')));
  assert.equal(w.buf[20] & 0x0c, 0, 'indicateurs EXIF/XMP effacés');
  assert.throws(() => Pt.checkImage(webp({ anim: true }).toString('base64')), /animée/);
  assert.throws(() => Pt.checkImage(Buffer.from('\x89PNG\r\n\x1a\nxxxxxxxxxxxxxxxx').toString('base64')), /JPEG et WebP/);
  assert.throws(() => Pt.checkImage(webp({ w: 4000, h: 20 }).toString('base64')), /pixels/);
  assert.throws(() => Pt.checkImage('<svg onload=alert(1)>'), /base64/);
  // Trop lourd : refusé par la route.
  const big = Buffer.concat([JPG.subarray(0, JPG.length - 2), Buffer.alloc(82 * 1024, 0), JPG.subarray(JPG.length - 2)]);
  assert.equal((await propose('B', ev({ image: { data: big.toString('base64') } }))).status, 400);
  // Vignette obligatoire au-delà de 16 Ko ; acceptée en WebP.
  const mid = Buffer.concat([JPG.subarray(0, JPG.length - 2), Buffer.alloc(20 * 1024, 0), JPG.subarray(JPG.length - 2)]);
  assert.equal((await propose('B', ev({ image: { data: mid.toString('base64') } }))).status, 400);
  const ok = await propose('B', ev({ title_fr: 'Avec image (fictif)', image: { data: mid.toString('base64'), thumb: webp().toString('base64') } }));
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const im = await db.get('SELECT i.id, i.bytes, i.thumb_mime FROM portal_image i JOIN portal_item p ON p.image_id = i.id WHERE p.id = ?', ok.json.id);
  assert.ok(im.bytes <= Pt.IMG_MAX); assert.equal(im.thumb_mime, 'image/webp');
  assert.equal((await call(null, 'GET', `/p/img/${im.id}-v`)).status, 404, 'image d’une proposition non publiée : inaccessible');
  await acall('POST', `/api/admin/portail/elements/${ok.json.id}/publier`, {});
  const th = await call(null, 'GET', `/p/img/${im.id}-v`);
  assert.equal(th.status, 200); assert.equal(th.headers.get('content-type'), 'image/webp');
  assert.equal((await acall('GET', `/api/admin/portail/images/${im.id}`)).status, 200);
  // Images figées.
  await assert.rejects(db.run('UPDATE portal_image SET bytes = 1 WHERE id = ?', im.id));
});

test('assistant sécurité : règle « propositions_masse » et limite de débit par école', async () => {
  for (let i = 0; i < 11; i++) assert.equal((await propose('B', ev({ title_fr: `Rafale ${i} (fictive)` }))).status, 200);
  await sec.flush();
  await sec.analyse({ backups: () => [], dbSize: () => 0 });
  const al = await db.get("SELECT * FROM security_alert WHERE rule = 'propositions_masse' AND status = 'ouverte'");
  assert.ok(al, 'alerte « propositions_masse »'); assert.match(al.explain_fr, /propositions pour le portail public/); assert.ok(al.explain_ht.length > 20);
  assert.match(al.fingerprint, new RegExp(`e:${ids.B.school}$`));
  const g = await sec.guide({ ...al, rule: al.rule }, 'pourquoi', 'fr');
  assert.ok(g);
  // Limite de débit dédiée (serveur de test avec une limite basse).
  const srv2 = createServer(db, { rateLimit: { max: 1000 }, security: false, portalLimit: createLimiter({ max: 2, windowMs: 3600e3 }) });
  await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  try {
    const b2 = `http://127.0.0.1:${srv2.address().port}`;
    const t = await tok('A', 'direction');
    const post = () => fetch(`${b2}/api/portail/propositions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(ev()) });
    assert.equal((await post()).status, 200); assert.equal((await post()).status, 200);
    const r = await post(); assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  } finally { srv2.close(); }
});

test('RLS : une école ne publie pas elle-même et ne voit que ses propositions', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  const A = ids.A.school, B = ids.B.school;
  const ins = (t, sid, status, extra = '') => t.insert(`INSERT INTO portal_item (kind, school_id, status, title_fr, category, event_date, place${extra ? ', published_at' : ''}) VALUES ('evenement', ?, ?, 'x', 'culture', '2030-01-01', 'x'${extra ? ', CURRENT_TIMESTAMP' : ''})`, sid, status);
  await assert.rejects(db.asSchool(A, (t) => ins(t, A, 'publie', 'pub')), /row-level security/);
  await assert.rejects(db.asSchool(A, (t) => ins(t, B, 'en_attente')), /row-level security/);
  const id = await db.asSchool(A, (t) => ins(t, A, 'en_attente'));
  await assert.rejects(db.asSchool(A, (t) => t.run("UPDATE portal_item SET status = 'publie', published_at = CURRENT_TIMESTAMP WHERE id = ?", id)), /row-level security/);
  await assert.rejects(db.asSchool(A, (t) => t.run('UPDATE portal_item SET featured = 1 WHERE id = ?', id)), /row-level security/);
  assert.equal((await db.asSchool(B, (t) => t.run("UPDATE portal_item SET status = 'retire' WHERE id = ?", id))).changes, 0);
  assert.equal((await db.asSchool(B, (t) => t.all('SELECT id FROM portal_item WHERE id = ?', id))).length, 0);
  await assert.rejects(db.asSchool(A, (t) => t.run('DELETE FROM portal_item WHERE id = ?', id)), /permission denied/);
  await assert.rejects(db.asSchool(A, (t) => t.all('SELECT * FROM portal_ad')), /permission denied/);
  await assert.rejects(db.asSchool(A, (t) => t.all('SELECT * FROM portal_ad_click')), /permission denied/);
  await assert.rejects(db.asSchool(A, (t) => t.run('UPDATE portal_image SET bytes = 1')), /permission denied/);
  assert.equal((await db.asSchool(A, (t) => t.run("UPDATE portal_item SET status = 'retire' WHERE id = ?", id))).changes, 1);
});
