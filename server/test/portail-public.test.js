'use strict';
// Bloc 8 : portail ouvert. Inscription des écoles (code e-mail, champ piège, limite de débit), demandes acceptées ou
// refusées par le super-admin, invitation de la direction, comptes grand public (code, cookie, abonnements, envoi
// groupé à la publication, désinscription signée en un clic, suppression), flux RSS, logo et favicon.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer, createLimiter } = require('../src/app');
const { seed, seedMulti } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const Pt = require('../src/portail');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
let db, server, base, admin; const sent = [];
const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
// Fichier PDF minimal fictif (signature %PDF-) joint par défaut aux demandes d'inscription (formulaire multipart).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
async function form(p, data, headers = {}, b = base) {
  if (/inscrire-ecole$/.test(p) && data.step === 'envoyer') {
    const fd = new FormData(); const { __file, ...rest } = data;
    for (const [k, v] of Object.entries(rest)) fd.append(k, v);
    const f = __file === undefined ? { data: PDF, type: 'application/pdf', name: 'autorisation.pdf' } : __file;
    if (f) fd.append('document', new Blob([f.data], { type: f.type }), f.name);
    const res = await fetch(b + p, { method: 'POST', redirect: 'manual', headers, body: fd });
    return { status: res.status, text: await res.text(), headers: res.headers };
  }
  const res = await fetch(b + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(data).toString() });
  return { status: res.status, text: await res.text(), headers: res.headers };
}
const page = async (p, headers = {}) => { const r = await fetch(base + p, { redirect: 'manual', headers: { accept: 'text/html', ...headers } }); return { status: r.status, text: await r.text(), headers: r.headers, buf: null }; };
const acall = (m, p, b) => call(admin, m, p, b);
const ticketOf = (html) => html.match(/name="ticket" value="([^"]+)"/)[1];
const lastTo = (to) => [...sent].reverse().find((m) => m.to === to);
const codeIn = (m) => m.text.match(/(\d{6})/)[1];
const DEMANDE = { step: 'envoyer', school_name: 'Collège Fictif de Jacmel', department: 'sud-est', commune: 'Jacmel', director_name: 'Directrice Fictive', email: 'direction@jacmel.exemple.invalid', phone: '3712 3456', students_approx: '320', message: 'Bonjour (fictif)', doc_kind: 'autorisation_menfp' };

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
});
after(async () => { server.close(); await db.cleanup(); });

test('logo et favicon : /favicon.ico, apple-touch-icon, balises du portail, de l’application et du ministère', async () => {
  const ico = await fetch(`${base}/favicon.ico`);
  assert.equal(ico.status, 200); assert.equal(ico.headers.get('content-type'), 'image/x-icon');
  const buf = Buffer.from(await ico.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 4)], [0, 0, 1, 0], 'en-tête ICO'); assert.ok(buf.length < 8000, 'favicon léger');
  const ap = await fetch(`${base}/apple-touch-icon.png`); assert.equal(ap.status, 200); assert.equal(ap.headers.get('content-type'), 'image/png');
  for (const f of ['/src/favicon-32.png', '/src/apple-touch-icon.png', '/src/icon-192.png', '/src/icon-512.png', '/src/noria-logo.png']) {
    const r = await fetch(base + f); assert.equal(r.status, 200, f); assert.ok((await r.arrayBuffer()).byteLength < 12000, `${f} léger`);
  }
  for (const p of ['/', '/ht', '/evenements']) {
    const h = (await page(p)).text;
    assert.match(h, /<img src="\/src\/noria-logo\.png" alt="NORIA[^"]*" width="89" height="48">/, `logo ${p}`);
    assert.match(h, /<link rel="icon" href="\/favicon\.ico/); assert.match(h, /rel="apple-touch-icon" href="\/src\/apple-touch-icon\.png(?:\?v=[^"]*)?" sizes="180x180"/);
    assert.doesNotMatch(h, /rel="icon"[^>]*favicon\.svg/); assert.doesNotMatch(h, /manifest\.webmanifest/);
  }
  const app = (await page('/app')).text;
  assert.match(app, /<link rel="icon" href="\/favicon\.ico/); assert.match(app, /<link rel="manifest" href="\/manifest\.webmanifest">/); assert.match(app, /href="\/src\/favicon-32\.png/);
  assert.doesNotMatch(app, /favicon\.svg/);
  const fs = require('node:fs'); const path = require('node:path');
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'ministere.html'), 'utf8'), /<link rel="icon" href="\/favicon\.ico/);
});

test('portail : bouton « Inscrire mon école » (FR/HT), encadré, mention du pied de page, aucun cookie sans compte', async () => {
  const fr = await page('/');
  assert.match(fr.text, /href="\/inscrire-ecole">Inscrire mon école</); assert.match(fr.text, /Vous dirigez une école/);
  assert.match(fr.text, /sans traceur ; un cookie de session est posé seulement si vous vous connectez/);
  assert.match(fr.text, /type="application\/rss\+xml"/);
  assert.equal(fr.headers.get('set-cookie'), null);
  const ht = await page('/ht');
  assert.match(ht.text, /href="\/ht\/inscrire-ecole">Enskri lekòl mwen</); assert.match(ht.text, /Kont mwen/); assert.match(ht.text, /pa gen traseur/);
  // Lien sur l'écran de connexion de l'application.
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'src', 'login.js'), 'utf8'), /\/inscrire-ecole/);
  const f = await page('/inscrire-ecole');
  assert.equal(f.status, 200); assert.equal(f.headers.get('cache-control'), 'no-store, private, no-transform');
  assert.match(f.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(f.text, /<script>|style="|\son[a-z]+="/, 'aucun script ni style en ligne');
  for (const d of Pt.DEPARTMENTS) assert.match(f.text, new RegExp(`<option value="${d}"`));
  assert.match(f.text, /name="site_web"/, 'champ piège');
  assert.match((await page('/ht/inscrire-ecole')).text, /Non lekòl la/);
});

test('demande d’inscription : validation, champ piège, code e-mail, enregistrement, notification du super-admin', async () => {
  const bad = await form('/inscrire-ecole', { ...DEMANDE, email: 'pas-une-adresse', department: 'mars' });
  assert.equal(bad.status, 400); assert.match(bad.text, /adresse e-mail valide/); assert.match(bad.text, /département/);
  // Champ piège rempli : même réponse apparente, rien n'est envoyé ni enregistré.
  const n0 = sent.length;
  const hp = await form('/inscrire-ecole', { ...DEMANDE, site_web: 'http://spam.invalid' });
  assert.equal(hp.status, 200); assert.match(hp.text, /name="ticket"/); assert.equal(sent.length, n0);
  // Origine étrangère refusée.
  assert.equal((await form('/inscrire-ecole', DEMANDE, { origin: 'https://malveillant.invalid' })).status, 403);
  assert.equal((await form('/inscrire-ecole', DEMANDE, { 'sec-fetch-site': 'cross-site' })).status, 403);
  const r = await form('/inscrire-ecole', DEMANDE);
  assert.equal(r.status, 200); assert.match(r.text, /Vérifiez votre adresse e-mail/);
  const m = lastTo(DEMANDE.email); assert.match(m.subject, /code de vérification/);
  const wrong = await form('/inscrire-ecole', { step: 'code', ticket: ticketOf(r.text), code: codeIn(m) === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM school_request')).n), 0);
  const ok = await form('/inscrire-ecole', { step: 'code', ticket: ticketOf(r.text), code: codeIn(m) });
  assert.equal(ok.status, 200, ok.text); assert.match(ok.text, /Demande enregistrée/);
  const row = await db.get('SELECT * FROM school_request ORDER BY id DESC LIMIT 1');
  assert.equal(row.status, 'en_attente'); assert.equal(row.phone, '+50937123456'); assert.equal(Number(row.students_approx), 320); assert.equal(row.department, 'sud-est');
  assert.match(lastTo('admin@noria.exemple.invalid').text, /Collège Fictif de Jacmel/, 'super-admin notifié');
  assert.match(lastTo(DEMANDE.email).subject, /demande reçue/);
  // Code à usage unique.
  assert.equal((await form('/inscrire-ecole', { step: 'code', ticket: ticketOf(r.text), code: codeIn(m) })).status, 400);
  assert.ok(await db.get("SELECT 1 AS x FROM platform_audit WHERE action = 'public.demande'"));
});

test('limite de débit des formulaires publics (par adresse IP et par e-mail)', async () => {
  const s2 = createServer(db, { notifier, rateLimit: { max: 1000 }, security: false, publicLimit: createLimiter({ max: 2, windowMs: 3600e3 }) });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  try {
    for (let i = 0; i < 2; i++) assert.equal((await form('/inscrire-ecole', { ...DEMANDE, email: `x${i}@lim.exemple.invalid` }, {}, b2)).status, 200);
    const r = await form('/inscrire-ecole', { ...DEMANDE, email: 'x9@lim.exemple.invalid' }, {}, b2);
    assert.equal(r.status, 429); assert.match(r.text, /Trop de demandes/);
  } finally { s2.close(); }
});

test('super-admin : liste, accepter (école + invitation direction par e-mail), refuser avec motif, journal', async () => {
  const list = await acall('GET', '/api/admin/demandes?statut=en_attente');
  assert.equal(list.status, 200); const d = list.json.find((x) => x.school_name === DEMANDE.school_name);
  assert.equal(d.suggested_slug, 'college-fictif-de-jacmel');
  assert.equal((await call(null, 'GET', '/api/admin/demandes')).status, 401);
  const acc = await acall('POST', `/api/admin/demandes/${d.id}/accepter`, {});
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  const sch = await db.get('SELECT * FROM school WHERE id = ?', acc.json.school.id);
  assert.equal(sch.slug, 'college-fictif-de-jacmel'); assert.equal(sch.department, 'sud-est'); assert.equal(sch.commune, 'Jacmel');
  const inv = await db.get("SELECT * FROM account_token WHERE school_id = ? AND kind = 'invitation'", sch.id);
  assert.equal(inv.role, 'direction'); assert.equal(inv.email, DEMANDE.email);
  const mail = lastTo(DEMANDE.email); assert.match(mail.subject, /Invitation NORIA — Collège Fictif de Jacmel/);
  const token = mail.text.match(/\/app#invitation=([\w-]+)/)[1];
  assert.equal((await acall('POST', `/api/admin/demandes/${d.id}/accepter`, {})).status, 409, 'déjà traitée');
  // La direction active son compte avec le lien reçu.
  const ok = await call(null, 'POST', '/api/invitations/accept', { token, password: 'direction-fictive-2026' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const u = await db.get('SELECT u.id FROM app_user u WHERE u.school_id = ? AND u.email = ?', sch.id, DEMANDE.email);
  assert.ok(await db.get("SELECT 1 AS x FROM user_role WHERE user_id = ? AND role = 'direction'", u.id));
  // Refus : motif obligatoire, e-mail au demandeur.
  const id2 = await db.insert("INSERT INTO school_request (school_name, department, commune, director_name, email, lang, created_at) VALUES ('École Fictive Refusée','nord','Cap-Haïtien','Directeur Fictif','refus@exemple.invalid','ht',?)", new Date().toISOString());
  assert.equal((await acall('POST', `/api/admin/demandes/${id2}/refuser`, { reason: '' })).status, 400);
  const rf = await acall('POST', `/api/admin/demandes/${id2}/refuser`, { reason: 'Doublon d’une école déjà inscrite (fictif)' });
  assert.equal(rf.status, 200); assert.equal(rf.json.envoi, 'envoyé');
  const rm = lastTo('refus@exemple.invalid'); assert.match(rm.text, /Rezon : Doublon/, 'e-mail en kreyòl avec le motif');
  assert.equal((await acall('POST', `/api/admin/demandes/${id2}/accepter`, {})).status, 409);
  const j = (await db.all("SELECT action FROM platform_audit WHERE action LIKE 'admin.demande.%' OR action = 'admin.direction.inviter'")).map((x) => x.action);
  for (const a of ['admin.demande.accepter', 'admin.demande.refuser', 'admin.direction.inviter']) assert.ok(j.includes(a), a);
});

test('document officiel : obligatoire, PDF/JPEG/PNG vérifiés par signature, 5 Mo, rattaché après le code, lu par le super-admin seul', async () => {
  const D = { ...DEMANDE, email: 'doc@exemple.invalid', school_name: 'École Fictive du Document' };
  const nDocs = async () => Number((await db.get('SELECT COUNT(*) AS n FROM school_request_document')).n);
  const n0 = await nDocs();
  const f = await page('/inscrire-ecole');
  assert.match(f.text, /enctype="multipart\/form-data"/); assert.match(f.text, /name="document" type="file" required/); assert.match(f.text, /Autorisation de fonctionnement du MENFP/);
  assert.match((await page('/ht/inscrire-ecole')).text, /Dokiman ofisyèl lekòl la/);
  const none = await form('/inscrire-ecole', { ...D, __file: null });
  assert.equal(none.status, 400); assert.match(none.text, /document officiel \(PDF, JPG ou PNG\)/); assert.match(none.text, /choisissez-le de nouveau/);
  const exe = await form('/inscrire-ecole', { ...D, __file: { data: Buffer.from('MZ\x90\x00 programme fictif........'), type: 'application/pdf', name: 'faux.pdf' } });
  assert.equal(exe.status, 400, 'signature non PDF refusée malgré le type annoncé'); assert.match(exe.text, /seuls les fichiers PDF, JPG et PNG/);
  const html = await form('/inscrire-ecole', { ...D, __file: { data: Buffer.from('<html><script>alert(1)</script></html>'), type: 'text/html', name: 'x.html' } });
  assert.equal(html.status, 400);
  const mism = await form('/inscrire-ecole', { ...D, __file: { data: PDF, type: 'image/png', name: 'x.png' } });
  assert.equal(mism.status, 400, 'type annoncé incohérent avec le contenu');
  const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  const tooBig = await form('/inscrire-ecole', { ...D, __file: { data: big, type: 'application/pdf', name: 'gros.pdf' } });
  assert.ok([400, 413].includes(tooBig.status), String(tooBig.status));
  const noKind = await form('/inscrire-ecole', { ...D, doc_kind: '' });
  assert.equal(noKind.status, 400); assert.match(noKind.text, /type de document/);
  const ht = await form('/ht/inscrire-ecole', { ...D, __file: null }); assert.match(ht.text, /dokiman ofisyèl/);
  assert.equal(await nDocs(), n0, 'rien n’est gardé en cas d’erreur');
  // Envoi valide (PNG) : document en attente, lié au ticket, puis rattaché à la demande après le code.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('image fictive')]);
  const r = await form('/inscrire-ecole', { ...D, doc_kind: 'patente', __file: { data: png, type: 'image/png', name: 'Patente école été.png' } });
  assert.equal(r.status, 200, r.text);
  const pend = await db.get('SELECT * FROM school_request_document WHERE request_id IS NULL ORDER BY id DESC');
  assert.ok(pend.ticket_hash); assert.equal(pend.mime, 'image/png'); assert.equal(pend.filename, 'Patente-ecole-ete.png'); assert.equal(pend.kind, 'patente');
  const ok = await form('/inscrire-ecole', { step: 'code', ticket: ticketOf(r.text), code: codeIn(lastTo(D.email)) });
  assert.equal(ok.status, 200);
  const reqRow = await db.get('SELECT id FROM school_request WHERE email = ?', D.email);
  const linked = await db.get('SELECT * FROM school_request_document WHERE request_id = ?', reqRow.id);
  assert.equal(linked.id, pend.id); assert.equal(linked.ticket_hash, null);
  // Le super-admin voit les métadonnées dans la liste et lit le fichier ; personne d'autre.
  const list = await acall('GET', '/api/admin/demandes');
  const d = list.json.find((x) => x.id === reqRow.id);
  assert.equal(d.documents.length, 1); assert.equal(d.documents[0].kind, 'patente'); assert.equal(d.documents[0].data, undefined, 'pas de contenu dans la liste');
  const url = `/api/admin/demandes/${reqRow.id}/documents/${linked.id}`;
  const dl = await fetch(base + url, { headers: { authorization: `Bearer ${admin}` } });
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'image/png');
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename="Patente-ecole-ete.png"/); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await dl.arrayBuffer()).equals(png));
  const v = await fetch(base + url + '?voir=1', { headers: { authorization: `Bearer ${admin}` } });
  assert.equal(v.headers.get('content-disposition'), 'inline');
  assert.equal((await call(null, 'GET', url)).status, 401);
  const dir = await call(null, 'POST', '/api/login', { school: 'demo', identifier: 'direction', password: 'demo1234' });
  if (dir.json && dir.json.token) assert.notEqual((await call(dir.json.token, 'GET', url)).status, 200, 'un compte école ne lit pas les documents');
  assert.equal((await acall('GET', `/api/admin/demandes/${reqRow.id}/documents/999999`)).status, 404);
  assert.ok(await db.get("SELECT 1 AS x FROM platform_audit WHERE action = 'admin.demande.document'"));
});

test('super-admin : création d’école avec département et commune, puis « Inviter la direction »', async () => {
  const c = await acall('POST', '/api/admin/ecoles', { slug: 'lycee-fictif-hinche', name: 'Lycée Fictif de Hinche', department: 'centre', commune: 'Hinche', reason: 'Pilote fictif' });
  assert.equal(c.status, 200); assert.equal(c.json.department, 'centre'); assert.equal(c.json.commune, 'Hinche');
  assert.equal((await acall('POST', '/api/admin/ecoles', { slug: 'lycee-fictif-hinche', name: 'Doublon', reason: 'Pilote fictif' })).status, 409);
  assert.equal((await acall('POST', `/api/admin/ecoles/${c.json.id}/inviter-direction`, { email: 'pas-valide', name: 'X Y' })).status, 400);
  const i = await acall('POST', `/api/admin/ecoles/${c.json.id}/inviter-direction`, { email: 'Direction@Hinche.exemple.invalid', name: 'Direction Fictive Hinche' });
  assert.equal(i.status, 200, JSON.stringify(i.json)); assert.equal(i.json.envoi, 'envoyé'); assert.match(i.json.link, /^\/app#invitation=/);
  assert.match(lastTo('direction@hinche.exemple.invalid').text, /Lycée Fictif de Hinche vous invite/);
  assert.equal((await call(null, 'POST', `/api/admin/ecoles/${c.json.id}/inviter-direction`, { email: 'a@b.invalid', name: 'X Y' })).status, 401);
  assert.equal((await acall('POST', '/api/admin/ecoles/99999/inviter-direction', { email: 'a@b.exemple.invalid', name: 'X Y' })).status, 404);
});

async function login(identifier, L = '') {
  const r = await form(`${L}/compte/code`, { identifier });
  assert.equal(r.status, 200, r.text);
  const m = lastTo(identifier.includes('@') ? identifier : identifier);
  const v = await form(`${L}/compte/verifier`, { ticket: ticketOf(r.text), code: codeIn(m) });
  assert.equal(v.status, 303);
  const c = v.headers.get('set-cookie');
  return { cookie: c.split(';')[0], raw: c, m };
}

test('compte grand public : code par e-mail, cookie HttpOnly SameSite=Lax, abonnements, désinscription signée, suppression', async () => {
  const { cookie, raw } = await login('lectrice@exemple.invalid');
  assert.match(raw, /^noria_public=[\w-]+; HttpOnly; SameSite=Lax; Path=\//);
  const me = await page('/compte', { cookie });
  assert.match(me.text, /Connecté : lectrice@exemple\.invalid/); assert.match(me.text, /Mes abonnements/);
  // Abonnements : événements + lauréats, filtre département Ouest, e-mails en kreyòl.
  const s = await form('/compte/abonnements', { evenements: '1', laureats: '1', department: 'ouest', lang: 'ht' }, { cookie });
  assert.equal(s.status, 303); assert.equal(s.headers.get('location'), '/compte?ok=1');
  const acc = await db.get("SELECT * FROM public_account WHERE email = 'lectrice@exemple.invalid'");
  assert.deepEqual([acc.sub_annonces, acc.sub_evenements, acc.sub_laureats, acc.department, acc.lang].map(String), ['0', '1', '1', 'ouest', 'ht']);
  assert.equal(acc.role, 'public');
  // Sans cookie : pas d'action possible (redirection vers la connexion).
  assert.equal((await form('/compte/abonnements', { annonces: '1' })).headers.get('location'), '/compte');
  // Téléphone accepté (SMS simulé).
  const t = await form('/compte/code', { identifier: '3711 2233' });
  assert.equal(t.status, 200); assert.match(t.text, /SMS pas encore disponible/); assert.equal(sent.at(-1).channel, 'sms'); assert.equal(sent.at(-1).to, '+50937112233');

  // Publication d'un événement dans l'Ouest → e-mail ; dans le Nord → rien (filtre).
  const day = Pt.haitiDay(new Date(Date.now() + 5 * 86400e3));
  const n0 = sent.filter((m) => m.to === 'lectrice@exemple.invalid').length;
  const e1 = await acall('POST', '/api/admin/portail/elements', { kind: 'evenement', title_fr: 'Foire scientifique fictive', title_ht: 'Fwa syantifik fiktif', category: 'science', event_date: day, place: 'Port-au-Prince (fictif)', department: 'ouest' });
  assert.equal(e1.status, 200, JSON.stringify(e1.json));
  await server.ctx.digests;
  const e2 = await acall('POST', '/api/admin/portail/elements', { kind: 'evenement', title_fr: 'Concours fictif du Nord', category: 'concours', event_date: day, place: 'Cap-Haïtien (fictif)', department: 'nord' });
  assert.equal(e2.status, 200); await server.ctx.digests;
  const got = sent.filter((m) => m.to === 'lectrice@exemple.invalid').slice(n0);
  assert.equal(got.length, 1, 'un seul e-mail (filtre département)');
  assert.match(got[0].subject, /Nouvo evènman : Fwa syantifik fiktif/);
  assert.match(got[0].headers['List-Unsubscribe'], /desinscription\?c=\d+&s=evenements&t=/);
  // Dépublier puis republier : pas de second envoi.
  await acall('POST', `/api/admin/portail/elements/${e1.json.id}/depublier`, { reason: 'Correction fictive' });
  await acall('POST', `/api/admin/portail/elements/${e1.json.id}/publier`, {}); await server.ctx.digests;
  assert.equal(sent.filter((m) => m.to === 'lectrice@exemple.invalid').length, n0 + 1);
  const dg = await db.get("SELECT * FROM public_digest WHERE kind = 'evenement' AND ref_id = ?", e1.json.id); assert.equal(Number(dg.recipients), 1);

  // Désinscription en un clic (lien signé) ; lien altéré refusé.
  const link = new URL(got[0].text.match(/(http\S+desinscription\S+)/)[1]);
  const forged = await page(`/desinscription?c=${link.searchParams.get('c')}&s=evenements&t=${'A'.repeat(32)}`);
  assert.equal(forged.status, 400);
  assert.equal(Number((await db.get('SELECT sub_evenements AS n FROM public_account WHERE id = ?', acc.id)).n), 1);
  const un = await page(link.pathname + link.search);
  assert.equal(un.status, 200); assert.match(un.text, /ne recevrez plus/);
  assert.equal(Number((await db.get('SELECT sub_evenements AS n FROM public_account WHERE id = ?', acc.id)).n), 0);
  assert.equal(Number((await db.get('SELECT sub_laureats AS n FROM public_account WHERE id = ?', acc.id)).n), 1, 'les autres abonnements restent');
  // List-Unsubscribe-Post (client de messagerie).
  const lp = await fetch(`${base}/desinscription?c=${acc.id}&s=laureats&t=${require('../src/portail-public').unsubLink('', acc, 'laureats').split('t=')[1]}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(lp.status, 200);
  assert.equal(Number((await db.get('SELECT sub_laureats AS n FROM public_account WHERE id = ?', acc.id)).n), 0);

  // Déconnexion, puis suppression du compte.
  const out = await form('/compte/deconnexion', {}, { cookie });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.doesNotMatch((await page('/compte', { cookie })).text, /Connecté/);
  const again = await login('lectrice@exemple.invalid', '/ht');
  assert.match((await page('/ht/compte', { cookie: again.cookie })).text, /Kont NORIA mwen/);
  assert.equal((await form('/ht/compte/supprimer', {}, { cookie: again.cookie })).headers.get('location'), '/ht/compte', 'confirmation exigée');
  const del = await form('/ht/compte/supprimer', { confirm: '1' }, { cookie: again.cookie });
  assert.equal(del.headers.get('location'), '/ht/compte?supprime=1');
  assert.equal(await db.get("SELECT id FROM public_account WHERE email = 'lectrice@exemple.invalid'"), undefined);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM public_session WHERE account_id = ?', acc.id)).n), 0);
});

test('annonces : e-mail aux abonnés à l’activation (officielles seulement) et flux RSS sans compte', async () => {
  const { cookie } = await login('abonne@exemple.invalid');
  await form('/compte/abonnements', { annonces: '1', lang: 'fr' }, { cookie });
  const today = Pt.haitiDay(); const later = Pt.haitiDay(new Date(Date.now() + 20 * 86400e3));
  const off = await acall('POST', '/api/admin/portail/annonces', { sponsored: false, title_fr: 'Inscriptions aux examens (fictif)', text_fr: 'Date limite fictive.', starts_on: today, ends_on: later });
  assert.equal(off.status, 200, JSON.stringify(off.json)); await server.ctx.digests;
  const sp = await acall('POST', '/api/admin/portail/annonces', { sponsored: true, sponsor: 'Librairie Fictive', title_fr: 'Promo fictive', starts_on: today, ends_on: later });
  assert.equal(sp.status, 200); await server.ctx.digests;
  const mine = sent.filter((m) => m.to === 'abonne@exemple.invalid' && /Nouvelle annonce/.test(m.subject));
  assert.equal(mine.length, 1); assert.match(mine[0].subject, /Inscriptions aux examens/);
  assert.match(mine[0].text, /Se désinscrire en un clic : http/);
  const rss = await fetch(`${base}/annonces.rss`); const x = await rss.text();
  assert.equal(rss.status, 200); assert.match(rss.headers.get('content-type'), /application\/rss\+xml/); assert.equal(rss.headers.get('set-cookie'), null);
  assert.match(x, /<rss version="2.0">/); assert.match(x, /Inscriptions aux examens \(fictif\)/); assert.doesNotMatch(x, /Promo fictive/, 'encart sponsorisé exclu');
  assert.match(await (await fetch(`${base}/ht/annonces.rss`)).text(), /<language>ht<\/language>/);
});
