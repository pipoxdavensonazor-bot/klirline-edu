'use strict';
// Portail grand public : aucun lien vers les portails des écoles (/app), « Espaces des écoles » par catégorie,
// inscription / connexion du grand public, suivi d'écoles et envois groupés aux abonnés.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer, createLimiter } = require('../src/app');
const { seed, seedMulti } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const Pt = require('../src/portail');
const PP = require('../src/portail-public');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
let db, server, base, admin, sidA; const sent = [];
const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
async function call(token, method, p, body) {
  const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
async function form(p, data, headers = {}) {
  const res = await fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(data).toString() });
  return { status: res.status, text: await res.text(), headers: res.headers };
}
const page = async (p, headers = {}) => { const r = await fetch(base + p, { redirect: 'manual', headers: { accept: 'text/html', ...headers } }); return { status: r.status, text: await r.text(), headers: r.headers }; };
const ticketOf = (html) => html.match(/name="ticket" value="([^"]+)"/)[1];
const lastTo = (to) => [...sent].reverse().find((m) => m.to === to);
const codeIn = (m) => m.text.match(/(\d{6})/)[1];
const article = (title, sid = sidA, status = 'publie') => db.insert(`INSERT INTO portal_item (kind, school_id, status, title_fr, body_fr${status === 'publie' ? ', published_at' : ''}) VALUES ('article', ?, ?, ?, 'Texte fictif de l’article.'${status === 'publie' ? ', CURRENT_TIMESTAMP' : ''})`, sid, status, title);

before(async () => {
  db = await openTestDb(); await seedMulti(db, await seed(db));
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  server = createServer(db, { notifier, rateLimit: { max: 1000 }, security: false, publicLimit: createLimiter({ max: 1000, windowMs: 3600e3 }) });
  server.ctx.digestPauseMs = 0;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  admin = (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
  sidA = (await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id;
});
after(async () => { server.close(); await db.cleanup(); });

test('migration 023 : table public_follow, colonne sub_actualites, envois groupés des actualités', async () => {
  const acc = await db.insert("INSERT INTO public_account (email, link_key, created_at) VALUES ('mig@exemple.invalid', 'cle-fictive-migration', CURRENT_TIMESTAMP)");
  assert.equal(Number((await db.get('SELECT sub_actualites FROM public_account WHERE id = ?', acc)).sub_actualites), 0);
  await db.run('INSERT INTO public_follow (account_id, school_id, created_at) VALUES (?,?,CURRENT_TIMESTAMP)', acc, sidA);
  await assert.rejects(db.run('INSERT INTO public_follow (account_id, school_id, created_at) VALUES (?,?,CURRENT_TIMESTAMP)', acc, sidA), 'pas de doublon');
  await db.run('DELETE FROM public_account WHERE id = ?', acc);
  assert.ok(PP.SUBS.includes('actualites'));
  assert.deepEqual(Pt.FEED_CATS, ['inscriptions', 'evenements', 'actualites', 'examens', 'laureats', 'autres']);
});

test('Espaces des écoles : annonces par catégorie, pagination légère, campagne avec « S’inscrire en ligne »', async () => {
  for (let i = 1; i <= 14; i++) await article(`Actualité fictive ${String(i).padStart(2, '0')}`);
  await article('Brouillon fictif', sidA, 'en_attente');
  const day = Pt.haitiDay(); const end = Pt.haitiDay(new Date(Date.now() + 20 * 86400e3));
  await db.insert("INSERT INTO enrolment_campaign (school_id, title, opens_on, closes_on, created_by, created_at) VALUES (?, 'Rentrée fictive 2027', ?, ?, 1, CURRENT_TIMESTAMP)", sidA, day, end);
  const all = await page('/ecoles');
  assert.match(all.text, /Rentrée fictive 2027/); assert.match(all.text, /href="\/inscription\/ecole-a"[^>]*>S’inscrire en ligne/);
  assert.equal((all.text.match(/Actualité fictive/g) || []).length, 3, 'vue générale : 3 par catégorie');
  assert.match(all.text, /categorie=actualites[^"]*">[^<]*\(14\)/); assert.doesNotMatch(all.text, /Brouillon fictif/);
  assert.match(all.text, /class="[^"]*ec-reg[^"]*"[\s\S]*href="\/inscrire-ecole"/, 'Inscrire mon école en bas de page');
  const p1 = await page('/ecoles?categorie=actualites');
  assert.equal((p1.text.match(/Actualité fictive/g) || []).length, 12); assert.match(p1.text, /page=2/);
  const p2 = await page('/ecoles?categorie=actualites&page=2');
  assert.equal((p2.text.match(/Actualité fictive/g) || []).length, 2);
  const one = await page('/ecoles?ecole=ecole-a');
  assert.match(one.text, /action="\/compte\/suivre"/); assert.match(one.text, /name="ecole" value="ecole-a"/);
  assert.equal(p1.headers.get('set-cookie'), null, 'aucun cookie sans compte');
  assert.ok(Buffer.byteLength(p1.text) < 40000, 'page légère');
  const ht = await page('/ht/ecoles'); assert.equal(ht.status, 200); assert.match(ht.text, /lang="ht"/);
});

test('aucun lien public vers les portails des écoles ; /app reste servi quand on le tape', async () => {
  for (const L of ['', '/ht']) {
    for (const p of ['', '/ecoles', '/evenements', '/laureats', '/communaute', '/annonces', '/compte', '/compte?inscription=1', '/inscrire-ecole', '/confidentialite']) {
      const r = await page(`${L}${p}` || '/');
      assert.equal(r.status, 200, `${L}${p}`);
      assert.doesNotMatch(r.text, /href="[^"]*\/app\b/, `${L}${p} : aucun lien vers /app`);
      assert.doesNotMatch(r.text, /href="\/admin|href="\/ministere/, `${L}${p} : aucun lien vers les autres portails`);
      assert.match(r.text, /class="acc-out"><a class="btn btn-reg" href="[^"]*\/compte\?inscription=1">/, `${L}${p} : bouton S'inscrire`);
      assert.match(r.text, /href="(?:\/ht)?\/inscrire-ecole"/, `${L}${p} : Inscrire mon école reste au pied de page`);
    }
  }
  const app = await page('/app'); assert.equal(app.status, 200); assert.match(app.text, /noria-server/);
});

test('inscription grand public : abonnements choisis, suivi d’école, témoin d’en-tête, retour sur « Mon compte »', async () => {
  // Suivre sans compte : renvoi vers la connexion avec l'école à suivre.
  const anon = await form('/compte/suivre', { ecole: 'ecole-a' });
  assert.equal(anon.status, 303); assert.equal(anon.headers.get('location'), '/compte?suivre=ecole-a');
  const s = await page('/compte?inscription=1');
  assert.match(s.text, /name="mode" value="signup"/); assert.match(s.text, /name="sub_actualites" value="1" checked/);
  const r = await form('/compte/code', { mode: 'signup', identifier: 'suiveuse@exemple.invalid', sub_actualites: '1', suivre: 'ecole-a' });
  assert.equal(r.status, 200, r.text);
  const v = await form('/compte/verifier', { ticket: ticketOf(r.text), code: codeIn(lastTo('suiveuse@exemple.invalid')) });
  assert.equal(v.status, 303); assert.match(v.headers.get('location'), /^\/compte(\?|$)/); assert.doesNotMatch(v.headers.get('location'), /app/);
  const cookies = v.headers.getSetCookie();
  assert.ok(cookies.some((c) => /^noria_public=[\w-]+; HttpOnly/.test(c)));
  assert.ok(cookies.some((c) => /^noria_pub_in=1;/.test(c) && !/HttpOnly/.test(c)), 'témoin lisible par le script d’en-tête');
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const acc = await db.get("SELECT * FROM public_account WHERE email = 'suiveuse@exemple.invalid'");
  assert.deepEqual([acc.sub_annonces, acc.sub_evenements, acc.sub_laureats, acc.sub_actualites].map(Number), [0, 0, 0, 1]);
  assert.ok(await db.get('SELECT 1 AS x FROM public_follow WHERE account_id = ? AND school_id = ?', acc.id, sidA));
  const me = await page('/compte', { cookie });
  assert.match(me.text, /<html lang="fr" class="pub-in">/); assert.match(me.text, /École fictive A/); assert.match(me.text, /Actualité fictive 14/);
  assert.doesNotMatch(me.text, /href="[^"]*\/app\b/);
  // Le compte grand public n'ouvre pas l'application des écoles.
  assert.equal((await call(null, 'GET', '/api/classes')).status, 401);
  // Envoi groupé : nouvel article de l'école suivie → un e-mail.
  const n0 = sent.filter((m) => m.to === 'suiveuse@exemple.invalid').length;
  const id = await article('Nouvelle fictive pour les abonnés', sidA, 'en_attente');
  assert.equal((await call(admin, 'POST', `/api/admin/portail/elements/${id}/publier`, {})).status, 200); await server.ctx.digests;
  const got = sent.filter((m) => m.to === 'suiveuse@exemple.invalid').slice(n0);
  assert.equal(got.length, 1); assert.match(got[0].subject + got[0].text, /Nouvelle fictive pour les abonnés/);
  // Ne plus suivre.
  const un = await form('/compte/suivre', { ecole: 'ecole-a', action: 'retirer' }, { cookie });
  assert.equal(un.status, 303); assert.match(un.headers.get('location'), /retire=ecole-a/);
  assert.equal(await db.get('SELECT 1 AS x FROM public_follow WHERE account_id = ?', acc.id), undefined);
  // Déconnexion : les deux cookies effacés, retour à l'accueil.
  const out = await form('/compte/deconnexion', {}, { cookie });
  assert.equal(out.status, 303); assert.equal(out.headers.get('location'), '/');
  assert.ok(out.headers.getSetCookie().some((c) => /^noria_pub_in=;.*Max-Age=0/.test(c)));
});

test('script d’en-tête et styles : témoin, bascule S’inscrire / Mon compte', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'portail.js'), 'utf8');
  assert.match(js, /noria_pub_in=1/); assert.match(js, /classList\.add\("pub-in"\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'portail.css'), 'utf8');
  assert.match(css, /\.pub-in \.acc-in\{display:flex\}/); assert.match(css, /\.pub-in \.acc-out\{display:none\}/);
});
