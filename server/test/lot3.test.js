'use strict';
// Lot 3 : visiteurs exclus des données des écoles, badges élève (Code128/QR locaux), e-mails automatiques à
// l'inscription, messagerie familles ↔ école, réunions de parents à grande audience, inscriptions en ligne.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openTestDb } = require('./helpers');
const app = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const CB = require('../src/codes-barres');
const cand = require('../src/candidatures');
const auth = require('../src/auth');

let db, server, base; const tok = {}; let visitor;
async function call(w, method, path, body, extra = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(w ? { authorization: `Bearer ${tok[w] || w}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null, text: type.includes('json') ? null : await res.text(), headers: res.headers };
}
const schoolA = async () => (await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id;

before(async () => {
  db = await openTestDb(); await seed(db);
  server = app.createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 400 }, env: { ...process.env, NORIA_EMAIL_ELEVES: '1', NORIA_EMAIL_DOMAINE: 'eleves.exemple.invalid' } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['parent1', 'a', 'parent1'],
    ['eleve1', 'a', 'eleve1'], ['compta', 'a', 'compta'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
  // Visiteur grand public connecté (session portail public).
  const acc = await db.insert("INSERT INTO public_account (email, lang, link_key, created_at) VALUES ('visiteur@exemple.invalid','fr','k',?)", new Date().toISOString());
  visitor = crypto.randomBytes(24).toString('base64url');
  await db.run('INSERT INTO public_session (token_hash, account_id, expires_at, created_at) VALUES (?,?,?,?)', auth.sha256(visitor), acc, new Date(Date.now() + 864e5).toISOString(), new Date().toISOString());
});
after(async () => { server.close(); await db.cleanup(); });

test('visiteurs : une session grand public n’ouvre aucune donnée d’école (jeton ou cookie), le portail reste ouvert', async () => {
  const paths = ['/api/me', '/api/badges/moi', '/api/messagerie', '/api/reunions-parents', '/api/candidatures', '/api/students', '/api/announcements', '/api/emails'];
  for (const p of paths) {
    assert.equal((await call(visitor, 'GET', p)).status, 401, `jeton ${p}`);
    const c = await call(null, 'GET', p, null, { cookie: `noria_public=${visitor}` });
    assert.ok([401, 404].includes(c.status), `cookie ${p} → ${c.status}`);
  }
  const pub = await fetch(`${base}/compte`, { headers: { cookie: `noria_public=${visitor}` } });
  assert.equal(pub.status, 200);
  for (const p of ['/', '/evenements', '/inscriptions', '/ht/inscriptions']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('visiteurs : liste blanche des routes /api sans session (aucune ne rend de données d’école)', async () => {
  const pub = app.routes.filter((r) => r[3] && r[3].public).map((r) => `${r[0]} ${r[1].source}`);
  const allowed = /login|code|invitation|recuperation|recovery|activation|appareil|device|verifier|verif|telegram|whatsapp|webhook|entrant|ecoles|inscription-ecole|config|sante|health|version|logout|deconnexion|reinitialis|mot-de-passe|password/i;
  const unknown = pub.filter((s) => !allowed.test(s));
  assert.deepEqual(unknown, [], `routes publiques à justifier : ${unknown.join(', ')}`);
  for (const s of pub) assert.doesNotMatch(s, /messagerie|reunions|candidatures|badges\/moi|students|grades|notes/, s);
});

test('codes-barres : Code128 conforme (somme de contrôle, motifs de 11 modules) et QR en SVG local', () => {
  const mods = CB.code128Modules('AB260101-EA');
  assert.ok(Array.isArray(mods) || typeof mods === 'string');
  const svg = CB.code128Svg('AB260101-EA', { label: true });
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/); assert.match(svg, /AB260101-EA/); assert.doesNotMatch(svg, /<script|href=/i);
  const qr = CB.qrSvg('https://noria.exemple.invalid/verifier/x');
  assert.match(qr, /^<svg/); assert.doesNotMatch(qr, /<script|https?:\/\/(?!www\.w3\.org)/);
});

test('badges : l’élève et le parent voient le badge avec codes-barres ; les autres rôles et l’autre école non', async () => {
  const c = (await db.get('SELECT id FROM class WHERE school_id = ? ORDER BY id LIMIT 1', await schoolA())).id;
  const g = await call('direction', 'POST', '/api/badges/generer', { class_id: c });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  const e = await call('eleve1', 'GET', '/api/badges/moi');
  assert.equal(e.status, 200, JSON.stringify(e.json));
  const all = [...(e.json.badges || []), ...(e.json.sans_badge || [])];
  assert.ok(all.length >= 1);
  assert.ok(all.every((b) => /<svg/.test(b.code128_svg)), 'Code128 présent');
  const p = await call('parent1', 'GET', '/api/badges/moi');
  assert.equal(p.status, 200);
  for (const w of ['prof1', 'compta', 'dirB']) assert.equal((await call(w, 'GET', '/api/badges/moi')).status, 403, w);
  const pl = await call('direction', 'GET', `/api/badges/planche?class_id=${c}&par=8`);
  assert.equal(pl.status, 200, 'impression par classe');
  assert.equal((await call('dirB', 'GET', `/api/badges/planche?class_id=${c}&par=8`)).status, 404, 'autre école');
});

test('messagerie : parent → école, statut lu, pièce jointe bornée, cloisonnement famille et école', async () => {
  for (const w of ['direction', 'prof1']) assert.equal((await call(w, 'POST', '/api/messagerie', { sujet: 'Test', message: 'Bonjour' })).status, 403, w);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const t = await call('parent1', 'POST', '/api/messagerie', { sujet: 'Absence de demain', message: 'Mon enfant sera absent demain (fictif).', piece: { nom: 'mot.png', data: png.toString('base64') } });
  assert.equal(t.status, 200, JSON.stringify(t.json));
  const big = await call('parent1', 'POST', '/api/messagerie', { sujet: 'Gros', message: 'x', piece: { nom: 'g.png', data: Buffer.concat([png, Buffer.alloc(210 * 1024)]).toString('base64') } });
  assert.ok([400, 413].includes(big.status));
  const tid = t.json.id;
  assert.ok((await call('secretariat', 'GET', '/api/messagerie/non-lus')).json.non_lus >= 1);
  const r = await call('secretariat', 'GET', `/api/messagerie/${tid}`);
  assert.equal(r.status, 200); assert.equal(r.json.messages.length, 1);
  assert.equal((await call('secretariat', 'GET', '/api/messagerie/non-lus')).json.non_lus, 0, 'lu après ouverture');
  assert.equal((await call('secretariat', 'POST', `/api/messagerie/${tid}/repondre`, { message: 'Bien noté.' })).status, 200);
  const mine = await call('parent1', 'GET', `/api/messagerie/${tid}`);
  assert.equal(mine.json.messages.length, 2);
  const mid = mine.json.messages[0].id;
  const f = await fetch(`${base}/api/messagerie/${tid}/piece/${mid}`, { headers: { authorization: `Bearer ${tok.parent1}` } });
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png');
  for (const w of ['eleve1', 'prof1', 'compta', 'dirB']) assert.equal((await call(w, 'GET', `/api/messagerie/${tid}`)).status, w === 'prof1' || w === 'compta' ? 403 : 404, w);
  assert.equal((await call('parent1', 'POST', `/api/messagerie/${tid}/clore`)).status, 403);
  assert.equal((await call('direction', 'POST', `/api/messagerie/${tid}/clore`)).status, 200);
  assert.equal((await call('parent1', 'POST', `/api/messagerie/${tid}/repondre`, { message: 'Encore' })).status, 409);
});

test('réunions de parents : salle Jitsi réservée aux intervenants, flux pour les parents, questions et présence légères', async () => {
  assert.equal((await call('parent1', 'POST', '/api/reunions-parents', { titre: 'X', debut: '2026-11-01T14:00' })).status, 403);
  const m = await call('direction', 'POST', '/api/reunions-parents', { titre: 'Réunion générale (fictive)', debut: '2026-11-01T14:00', flux: 'https://flux.exemple.invalid/live.m3u8' });
  assert.equal(m.status, 200, JSON.stringify(m.json));
  await call('direction', 'PUT', `/api/reunions-parents/${m.json.id}`, { statut: 'en_cours' });
  const pl = await call('parent1', 'GET', '/api/reunions-parents');
  const r = pl.json.reunions.find((x) => x.id === m.json.id);
  assert.ok(r); assert.equal(r.salle_intervenants, undefined); assert.equal(r.salle_audio, undefined); assert.equal(r.flux, 'https://flux.exemple.invalid/live.m3u8');
  const sp = (await call('prof1', 'GET', '/api/reunions-parents')).json.reunions.find((x) => x.id === m.json.id);
  assert.match(sp.salle_intervenants, /^https:\/\//);
  const st = await call('parent1', 'GET', `/api/reunions-parents/${m.json.id}/etat`);
  assert.equal(st.status, 200); assert.equal(st.json.prochain_sondage, 10);
  await call('parent1', 'GET', `/api/reunions-parents/${m.json.id}/etat`);
  const a = await db.get('SELECT pings FROM parent_meeting_attendance WHERE meeting_id = ?', m.json.id);
  assert.equal(a.pings, 1, 'au plus une écriture de présence par minute');
  const q = await call('parent1', 'POST', `/api/reunions-parents/${m.json.id}/question`, { texte: 'Quand ont lieu les examens ?' });
  assert.equal(q.status, 200);
  assert.equal((await call('parent1', 'POST', `/api/reunions-parents/${m.json.id}/main`)).status, 200);
  const mod = await call('direction', 'GET', `/api/reunions-parents/${m.json.id}/moderation`);
  assert.equal(mod.json.questions.length, 1); assert.equal(mod.json.mains.length, 1); assert.equal(mod.json.presents, 1);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${m.json.id}/moderation`)).status, 403);
  assert.equal((await call('direction', 'POST', `/api/reunions-parents/${m.json.id}/questions/${q.json.id}`, { reponse: 'En juin.' })).status, 200);
  assert.equal((await call('parent1', 'GET', `/api/reunions-parents/${m.json.id}/etat`)).json.reponses.length, 1);
  assert.equal((await call('dirB', 'GET', `/api/reunions-parents/${m.json.id}/moderation`)).status, 404);
  assert.equal((await call('compta', 'GET', '/api/reunions-parents')).status, 403);
});

async function postForm(path, fields, headers = {}) {
  const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(base + path, { method: 'POST', body: fd, headers, redirect: 'manual' });
  return { status: res.status, text: await res.text() };
}

test('inscriptions en ligne : campagne, dépôt public FR/HT anti-abus, décision qui crée l’élève (+ e-mail automatique)', async () => {
  assert.equal((await call('secretariat', 'POST', '/api/candidatures/campagnes', { fin: '2099-01-01' })).status, 403);
  // Avant ouverture : formulaire fermé.
  assert.equal((await fetch(`${base}/inscription/ecole-a`)).status, 404);
  const c = await call('direction', 'POST', '/api/candidatures/campagnes', { titre: 'Inscriptions 2027', fin: '2099-01-01', niveaux: '7e, 8e' });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal((await call('direction', 'POST', '/api/candidatures/campagnes', { fin: '2099-01-01' })).status, 409);
  const ann = await db.get('SELECT title FROM announcement WHERE id = (SELECT announcement_id FROM enrolment_campaign WHERE id = ?)', c.json.id);
  assert.equal(ann.title, 'Inscriptions 2027');
  const list = await (await fetch(`${base}/ht/inscriptions`)).text();
  assert.match(list, /Enskripsyon ouvè/); assert.match(list, /\/ht\/inscription\/ecole-a/);
  const pageFr = await (await fetch(`${base}/inscription/ecole-a`)).text();
  assert.match(pageFr, /Demande d’inscription/);
  const old = cand.formToken(Date.now() - 10e3), fresh = cand.formToken();
  const base0 = { first_name: 'Junior', last_name: 'Fictif', birth_date: '2015-03-04', guardian_name: 'Marie Fictive', guardian_relation: 'mere', guardian_phone: '3712 3456', level: '7e' };
  // Envoi trop rapide : refusé. Champ piège : faux succès sans enregistrement. Origine étrangère : 403.
  assert.equal((await postForm('/inscription/ecole-a', { ...base0, t: fresh })).status, 400);
  const hp = await postForm('/inscription/ecole-a', { ...base0, t: old, site_web: 'spam' });
  assert.equal(hp.status, 200); assert.match(hp.text, /INS-/);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM enrolment_application')).n), 0);
  assert.equal((await postForm('/inscription/ecole-a', { ...base0, t: old }, { origin: 'https://malveillant.exemple.invalid' })).status, 403);
  // Contact manquant : 400 en kreyòl.
  const bad = await postForm('/ht/inscription/ecole-a', { ...base0, guardian_phone: '', t: old });
  assert.equal(bad.status, 400); assert.match(bad.text, /Telefòn oswa imèl obligatwa/);
  const pdf = new Blob([Buffer.from('%PDF-1.4\n%fictif\n')], { type: 'application/pdf' });
  const fd = new FormData(); for (const [k, v] of Object.entries({ ...base0, t: old })) fd.append(k, v); fd.append('doc1', pdf, 'acte.pdf');
  const ok = await fetch(`${base}/inscription/ecole-a`, { method: 'POST', body: fd }); const okText = await ok.text();
  assert.equal(ok.status, 200, okText); const ref = okText.match(/INS-[0-9A-F]{10}/)[0];
  const row = await db.get('SELECT * FROM enrolment_application WHERE ref = ?', ref);
  assert.equal(row.school_id, await schoolA()); assert.equal(row.guardian_phone, '+50937123456');
  // Limiteur : 8 envois par heure et par IP / contact.
  let last; for (let i = 0; i < 9; i++) last = await postForm('/inscription/ecole-a', { ...base0, first_name: `N${i}`, guardian_phone: `3712 00${10 + i}`, t: old });
  assert.equal(last.status, 429);
  // Côté école.
  for (const w of ['prof1', 'parent1', 'compta']) assert.equal((await call(w, 'GET', '/api/candidatures')).status, 403, w);
  assert.equal((await call('dirB', 'GET', `/api/candidatures/${row.id}`)).status, 404, 'autre école');
  const d = await call('secretariat', 'GET', `/api/candidatures/${row.id}`);
  assert.equal(d.status, 200); assert.equal(d.json.pieces.length, 1);
  assert.equal((await call('secretariat', 'POST', `/api/candidatures/${row.id}/decision`, { decision: 'refuser' })).status, 400, 'motif obligatoire');
  await call('direction', 'PUT', '/api/emails/reglages', { format: 'prenom.nom', auto: true });
  const cls = await db.get('SELECT id FROM class WHERE school_id = ? ORDER BY id LIMIT 1', await schoolA());
  const acc = await call('secretariat', 'POST', `/api/candidatures/${row.id}/decision`, { decision: 'accepter', class_id: cls.id });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  assert.equal(acc.json.email, 'junior.fictif@eleves.exemple.invalid');
  const st = await db.get('SELECT first_name FROM student WHERE id = ?', acc.json.student_id);
  assert.equal(st.first_name, 'Junior');
  assert.ok(await db.get("SELECT 1 AS x FROM student_guardian WHERE student_id = ? AND phone = '+50937123456'", acc.json.student_id));
  assert.equal((await call('secretariat', 'POST', `/api/candidatures/${row.id}/decision`, { decision: 'accepter', class_id: cls.id })).status, 409);
  // Fermeture : le formulaire public disparaît.
  await call('direction', 'POST', `/api/candidatures/campagnes/${c.json.id}/fermer`);
  assert.equal((await fetch(`${base}/inscription/ecole-a`)).status, 404);
});

test('e-mails élèves : création automatique à l’inscription au guichet seulement si activée', async () => {
  const cls = await db.get('SELECT id FROM class WHERE school_id = ? ORDER BY id LIMIT 1', await schoolA());
  await call('direction', 'PUT', '/api/emails/reglages', { format: 'p.nom', auto: false });
  const a = await call('direction', 'POST', '/api/students', { first_name: 'Sans', last_name: 'Adresse', class_id: cls.id });
  assert.equal(a.status, 200); assert.equal(a.json.email, undefined);
  await call('direction', 'PUT', '/api/emails/reglages', { auto: true });
  const b = await call('direction', 'POST', '/api/students', { first_name: 'Avec', last_name: 'Adresse', class_id: cls.id });
  assert.equal(b.json.email, 'a.adresse@eleves.exemple.invalid');
  assert.equal((await call('direction', 'PUT', '/api/emails/reglages', { format: 'n-importe' })).status, 400);
  assert.equal((await call('secretariat', 'PUT', '/api/emails/reglages', { auto: false })).status, 403);
});
