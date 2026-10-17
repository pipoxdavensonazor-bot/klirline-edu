'use strict';
// Socle multi-écoles : profil et en-tête PDF, code élève, import .xlsx/.csv, identité globale (plusieurs écoles),
// parent de plusieurs enfants, école active dans la session, isolation RLS entre écoles.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');
const I = require('../src/identite');
const X = require('../src/xlsx');
const E = require('../src/ecoles');

const LOGO = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhaKK3PDfht9dkkkklaG2iIDMFyXPcA9Onftkcc169evTw9N1KjskedTpyqSUYrUw6K9esdJ0/TVAs7SKIgEbwMsQTnBY8n86kvNPs9Qj2XdtFMACBvXJXPXB6j8K+afE1Pnsqb5e99fu/4J6f9lyt8Wp47RXTeKPCg0mM31o7NbNJgxkEmLPTnuM8c+o61zNfR4bFUsVTVSk7o82rSlSlyy3CvXtJsRpulW1mAoMUYDbSSC3ViM+pJryGvYtPvE1DT4LtNoE0YbCtu2nuM+xyPwr5ziZz9nTS+G7v69P1PSyu3NLuWKKKK+LPcGTwx3EEkEq7o5VKOucZBGDXjt1bvaXc1tIVLwyMjFehIODivY3dIo2kkZURQSzMcAAdSTXjt7c/bL64utmzzpWk25zjJzjP419dww53qL7On36nj5pa0e+pDXTeFPFCaSrWl80rWzEGMrz5Rzzx1wc549OnNczRX1OKw1PFUnSqLRnk0qsqUuaO57PDPFcRLLBKksbdHRgwP4ild0ijaSRlRFBLMxwAB1JNeOW91cWkhktp5YHIwWjcqSPTIpbm9u7zb9qupp9mdvmyFsZ64z9K+WfDD59Knu+mv5nrf2orfDr6nV+K/FcVzA+nadI5BbbNMpAV1x91e5BPU8dO4NcdRRX02DwdLCUvZ0/+HPLrVpVpc0j/2Q==';
let db, server, base, ids; const sent = [];

async function call(token, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, json, buf, headers: res.headers };
}
const login = async (school, email, extra = {}) => {
  const r = await call(null, 'POST', '/api/login', { ...(school ? { school } : {}), identifier: email, password: DEMO_PASSWORD, ...extra });
  assert.equal(r.status, 200, `connexion ${email}`); return r.json;
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  server = createServer(db, { notifier, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('code élève : exemple du cahier des charges, initiales dérivées du nom', () => {
  assert.equal(I.deriveInitials('Collège Saint-Pierre'), 'CSP');
  assert.equal(I.baseCode('Ana', 'Fils-Aimé', '2012-03-05', 'CSP'), 'AF120305-CSP');
  assert.equal(I.baseCode('Élise', 'Ôbin', '2013-11-30', 'EFA'), 'EO131130-EFA');
});

test('migration : une personne par adresse e-mail, codes existants enregistrés', async () => {
  const n = await db.get("SELECT COUNT(*) AS n FROM app_user WHERE person_id IS NULL AND state = 'actif'");
  assert.equal(Number(n.n), 0);
  const codes = (await db.all('SELECT code FROM student_code ORDER BY code')).map((r) => r.code);
  assert.ok(codes.includes('A-001') && codes.includes('B-002'));
  // L'enseignant 1 de A et son adhésion en B : une seule personne.
  const p = await db.all('SELECT DISTINCT person_id FROM app_user WHERE email = ?', 'prof1@a.exemple.invalid');
  assert.equal(p.length, 1);
});

test('profil de l’école : direction seulement, logo validé, journalisé', async () => {
  const dir = (await login('ecole-a', 'direction@a.exemple.invalid')).token;
  const sec = (await login('ecole-a', 'secretariat@a.exemple.invalid')).token;
  const body = { name: 'Collège Saint-Pierre', initials: '', address: '12, rue Fictive, Jacmel', email: 'Contact@CSP.exemple.invalid', phone: '3700 0000', motto: 'Lumière et savoir', logo: LOGO };
  assert.equal((await call(sec, 'PUT', '/api/ecole', body)).status, 403);
  const r = await call(dir, 'PUT', '/api/ecole', body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.initials, 'CSP'); assert.equal(r.json.email, 'contact@csp.exemple.invalid'); assert.equal(r.json.phone, '+50937000000');
  assert.match(r.json.logo, /^\/api\/ecoles\/ecole-a\/logo\?v=/);
  const lg = await call(null, 'GET', r.json.logo);
  assert.equal(lg.status, 200); assert.equal(lg.headers.get('content-type'), 'image/jpeg'); assert.equal(lg.buf.toString('base64'), LOGO);
  // Refus : PNG, trop lourd.
  assert.equal((await call(dir, 'PUT', '/api/ecole', { ...body, logo: Buffer.from('\x89PNG\r\n').toString('base64') })).status, 400);
  assert.equal((await call(dir, 'PUT', '/api/ecole', { ...body, logo: Buffer.concat([Buffer.from(LOGO, 'base64'), Buffer.alloc(60000)]).toString('base64') })).status, 400);
  const j = await db.all("SELECT outcome FROM audit_log WHERE action = 'school.profile' ORDER BY id");
  assert.deepEqual(j.map((x) => x.outcome), ['refuse', 'ok']);
  // L'écran d'accueil reçoit le profil.
  const me = await call(dir, 'GET', '/api/me');
  assert.equal(me.json.school.name, 'Collège Saint-Pierre'); assert.equal(me.json.school.motto, 'Lumière et savoir');
});

test('en-tête PDF : logo (image JPEG), nom, adresse, e-mail, téléphone et devise sur le reçu', async () => {
  const compta = (await login('ecole-a', 'compta@a.exemple.invalid')).token;
  const p = await call(compta, 'POST', '/api/payments', { student_id: ids.A.students[0], amount_htg: 1500, method: 'especes' });
  assert.equal(p.status, 200, JSON.stringify(p.json));
  const pdf = await call(compta, 'GET', `/api/payments/${p.json.id}/pdf`);
  assert.equal(pdf.status, 200);
  const s = pdf.buf.toString('latin1');
  assert.match(s, /\/Subtype \/Image \/Width 48 \/Height 48 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
  const stream = s.match(/\/FlateDecode >>\nstream\n([\s\S]*?)\nendstream/)[1];
  const ops = zlib.inflateSync(Buffer.from(stream, 'latin1')).toString('latin1');
  for (const t of ['Collège Saint-Pierre', '12, rue Fictive, Jacmel', 'contact@csp.exemple.invalid', '+50937000000', 'Lumière et savoir'])
    assert.ok(ops.includes(Buffer.from(t, 'latin1').toString('latin1')), t);
  assert.match(ops, /\/Im1 Do/);
});

test('modèle .xlsx : colonnes obligatoires en rouge, relu par le lecteur maison', async () => {
  const sec = (await login('ecole-a', 'secretariat@a.exemple.invalid')).token;
  const r = await call(sec, 'GET', '/api/import/eleves/modele');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /spreadsheetml/);
  const files = X.unzip(r.buf);
  assert.match(files.get('xl/styles.xml').toString(), /<color rgb="FFC00000"\/>/);
  const sheet = files.get('xl/worksheets/sheet1.xml').toString();
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1">/); assert.match(sheet, /<c r="F1" t="inlineStr" s="2">/);
  const rows = X.readXlsx(r.buf);
  assert.equal(rows[0][0], 'Nom / Non *'); assert.equal(rows[0][5], 'Parent (nom complet) / Paran');
  const prof = (await login('ecole-a', 'prof1@a.exemple.invalid')).token;
  assert.equal((await call(prof, 'GET', '/api/import/eleves/modele')).status, 403);
});

const XLSX_ROWS = (rows) => X.writeXlsx({ columns: E.COLUMNS.map((c) => ({ title: c.fr, required: c.required })), rows }).toString('base64');

test('aperçu : erreurs et motifs, doublons, formules neutralisées ; rien n’est écrit', async () => {
  const sec = (await login('ecole-a', 'secretariat@a.exemple.invalid')).token;
  const before = Number((await db.get('SELECT COUNT(*) AS n FROM student')).n);
  const content = XLSX_ROWS([
    ['Fils-Aimé', 'Ana', '2012-03-05', 'F', '7e A', 'Marie Fils-Aimé', '+509 3711 1111', ''],
    ['=HYPERLINK("x")', 'Jo', '05/03/2012', 'M', '7e A', '', '', ''],
    ['Pierre', 'Jean', '2012-02-30', 'X', '9e Z', '', 'abc', 'pas-un-mail'],
    ['Fils-Aimé', 'Ana', '05/03/2012', 'F', '7e B', '', '', ''],
    ['FictifA', 'Ana', '2014-01-01', 'F', '7e A', '', '', ''],
  ]);
  const r = await call(sec, 'POST', '/api/import/eleves/apercu', { filename: 'liste.xlsx', content });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.total, 5); assert.equal(r.json.valid, 1); assert.equal(r.json.invalid, 4);
  const why = (i) => r.json.rows[i].errors.map((e) => e.fr).join(' | ');
  assert.equal(why(0), '');
  assert.match(why(1), /formule/);
  assert.match(why(2), /date invalide/); assert.match(why(2), /sexe/); assert.match(why(2), /classe inconnue/); assert.match(why(2), /téléphone invalide/); assert.match(why(2), /e-mail invalide/);
  assert.match(why(3), /doublon : même élève qu’à la ligne 2/);
  assert.match(why(4), /doublon : élève déjà inscrit/);
  assert.ok(r.json.rows[1].errors.every((e) => e.ht), 'motifs en kreyòl');
  // Import refusé en bloc tant qu'une ligne est en erreur.
  const imp = await call(sec, 'POST', '/api/import/eleves', { filename: 'liste.xlsx', content });
  assert.equal(imp.status, 400);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM student')).n), before);
});

test('import : transactionnel, codes générés uniques sur tout le système, parent relié par téléphone sans fuite', async () => {
  // Les deux écoles ont les mêmes initiales : le même élève donne une collision → suffixe.
  await db.run("UPDATE school SET initials = 'CSP'");
  const secA = (await login('ecole-a', 'secretariat@a.exemple.invalid')).token;
  const secB = (await login('ecole-b', 'secretariat@b.exemple.invalid')).token;
  // Le téléphone de parent2 de A : personne connue → adhésion en B reliée à la même identité.
  const parent2A = await db.get('SELECT phone, person_id FROM app_user WHERE id = ?', ids.A.users.parent2);
  const rowsB = [['Fils-Aimé', 'Ana', '2012-03-05', 'F', '7e A', 'Parent importé', parent2A.phone, ''],
    ['Fils-Aimé', 'Rose', '2013-04-06', 'F', '7e B', 'Parent importé', parent2A.phone, ''],
    ['Neuf', 'Paul', '2011-01-02', 'M', '7e A', 'Parent Nouveau', '+509 3799 0001', 'nouveau.parent@exemple.invalid']];
  const rA = await call(secA, 'POST', '/api/import/eleves', { filename: 'a.xlsx', content: XLSX_ROWS([['Fils-Aimé', 'Ana', '2012-03-05', 'F', '7e A', '', '', '']]) });
  assert.equal(rA.status, 200, JSON.stringify(rA.json));
  assert.deepEqual(rA.json.codes.map((c) => c.code), ['AF120305-CSP']);
  const rB = await call(secB, 'POST', '/api/import/eleves', { filename: 'b.xlsx', content: XLSX_ROWS(rowsB) });
  assert.equal(rB.status, 200, JSON.stringify(rB.json));
  assert.deepEqual(rB.json.codes.map((c) => c.code), ['AF120305-CSP-2', 'RF130406-CSP', 'PN110102-CSP']);
  assert.equal(rB.json.linked, 1); assert.equal(rB.json.invited, 1);
  // Adhésion en B reliée à la personne de A ; un seul compte parent pour les deux enfants.
  const mB = await db.get('SELECT id, person_id, state, email FROM app_user WHERE school_id = ? AND phone = ?', ids.B.school, parent2A.phone);
  assert.equal(mB.person_id, parent2A.person_id); assert.equal(mB.state, 'actif');
  assert.match(mB.email, /@telephone\.invalid$/, 'aucune donnée de l’autre école (e-mail) recopiée');
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM parent_link WHERE parent_user_id = ?', mB.id)).n), 2);
  // Parent inconnu : adhésion en attente + invitation avec les initiales de l'école.
  const pend = await db.get("SELECT id, state FROM app_user WHERE school_id = ? AND email = 'nouveau.parent@exemple.invalid'", ids.B.school);
  assert.equal(pend.state, 'invite');
  const sms = sent.filter((m) => m.channel === 'sms').pop();
  assert.match(sms.text, /^\[CSP\] École fictive B vous invite/);
  // Fiche élève : le code est affiché.
  const st = await call(secB, 'GET', '/api/students');
  assert.ok(st.json.some((s) => s.code === 'AF120305-CSP-2'));
  // Journal.
  assert.ok(await db.get("SELECT 1 AS x FROM audit_log WHERE action = 'student.import' AND school_id = ? AND outcome = 'ok'", ids.B.school));
  // Le parent (même identité) voit ses enfants dans les deux écoles.
  const par = (await login('ecole-a', 'parent2@a.exemple.invalid'));
  const kids = await call(par.token, 'GET', '/api/me/enfants');
  assert.deepEqual(kids.json.map((k) => k.school_id).sort(), [ids.A.school, ids.B.school, ids.B.school].sort());
  assert.ok(kids.json.every((k) => k.initials && k.school));
});

test('import CSV : séparateur deviné, limite de taille, format refusé', async () => {
  const sec = (await login('ecole-a', 'secretariat@a.exemple.invalid')).token;
  const csv = '\uFEFFNom;Prénom;Date de naissance;Sexe;Classe\nLafleur;Mia;2012-07-08;F;7e A\n';
  const r = await call(sec, 'POST', '/api/import/eleves/apercu', { filename: 'l.csv', content: b64(csv) });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.valid, 1);
  assert.equal((await call(sec, 'POST', '/api/import/eleves/apercu', { filename: 'l.csv', content: Buffer.alloc(700 * 1024, 65).toString('base64') })).status, 413);
  assert.equal((await call(sec, 'POST', '/api/import/eleves/apercu', { filename: 'l.ods', content: b64('x') })).status, 400);
  assert.equal((await call(sec, 'POST', '/api/import/eleves/apercu', { filename: 'l.xlsx', content: b64('PK pas un zip') })).status, 400);
});

test('plusieurs écoles : connexion globale, choix, changement d’école active (session), RLS sur l’école active', async () => {
  const r = await login(null, 'prof1@a.exemple.invalid');
  assert.equal(r.choisir, true); assert.equal(r.ecoles, 2);
  const list = await call(r.token, 'GET', '/api/me/ecoles');
  assert.equal(list.json.length, 2); assert.equal(list.json.filter((e) => e.active).length, 1);
  const meA = await call(r.token, 'GET', '/api/me');
  assert.equal(meA.json.schoolId, ids.A.school);
  // Changement vers B : nouvelle session, l'ancienne est fermée.
  const sw = await call(r.token, 'POST', '/api/session/ecole', { school_id: ids.B.school });
  assert.equal(sw.status, 200);
  assert.equal((await call(r.token, 'GET', '/api/me')).status, 401);
  const meB = await call(sw.json.token, 'GET', '/api/me');
  assert.equal(meB.json.schoolId, ids.B.school); assert.deepEqual(meB.json.roles, ['enseignant']);
  // En B : seulement la classe affectée en B ; aucun élève de A.
  const cls = await call(sw.json.token, 'GET', '/api/classes');
  assert.deepEqual(cls.json.map((c) => c.id), [ids.B.classes[1]]);
  assert.equal((await call(sw.json.token, 'GET', `/api/students/${ids.A.students[0]}`)).status, 404);
  // École non membre : refus.
  assert.equal((await call(sw.json.token, 'POST', '/api/session/ecole', { school_id: 999 })).status, 404);
  // Avec l'école précisée : pas de choix demandé.
  assert.equal((await login('ecole-b', 'prof1@a.exemple.invalid')).choisir, false);
  // Un compte d'une seule école n'a rien à choisir.
  assert.equal((await login(null, 'direction@a.exemple.invalid')).choisir, false);
  assert.ok(await db.get("SELECT 1 AS x FROM audit_log WHERE action = 'session.school' AND school_id = ?", ids.B.school));
});

test('parent de plusieurs enfants dans deux écoles : sélecteur, puis bascule vers l’école de l’enfant', async () => {
  const r = await login(null, 'parent1@a.exemple.invalid');
  const kids = (await call(r.token, 'GET', '/api/me/enfants')).json;
  assert.equal(kids.length, 2);
  const kidB = kids.find((k) => k.school_id === ids.B.school);
  assert.equal(kidB.student_id, ids.B.students[1]);
  // Session en A : l'enfant de B n'est pas lisible tant que l'école active est A.
  assert.equal((await call(r.token, 'GET', `/api/students/${kidB.student_id}`)).status, 404);
  const sw = await call(r.token, 'POST', '/api/session/ecole', { school_id: ids.B.school });
  const st = await call(sw.json.token, 'GET', '/api/students');
  assert.deepEqual(st.json.map((s) => s.id), [kidB.student_id]);
});

test('invitation : page d’arrivée avec l’école ; identité existante → mot de passe actuel exigé', async () => {
  const dir = (await login('ecole-b', 'direction@b.exemple.invalid')).token;
  const inv = await call(dir, 'POST', '/api/invitations', { email: 'prof2@a.exemple.invalid', display_name: 'Prof 2 A', role: 'enseignant' });
  assert.equal(inv.status, 200);
  const token = inv.json.link.split('=')[1];
  const info = await call(null, 'POST', '/api/invitations/info', { token });
  assert.equal(info.status, 200); assert.equal(info.json.school.name, 'École fictive B'); assert.equal(info.json.school.initials, 'CSP'); assert.equal(info.json.role, 'enseignant');
  assert.equal((await call(null, 'POST', '/api/invitations/info', { token: 'x'.repeat(40) })).status, 400);
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'autre-mot-de-passe' })).status, 401);
  const ok = await call(null, 'POST', '/api/invitations/accept', { token, password: DEMO_PASSWORD });
  assert.equal(ok.status, 200); assert.equal(ok.json.existing, true);
  const r = await login(null, 'prof2@a.exemple.invalid');
  assert.equal(r.ecoles, 2);
});

test('RLS (PostgreSQL) : tables globales interdites au rôle applicatif, registre des codes cloisonné mais unique', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  for (const t of ['person', 'platform_admin', 'platform_session', 'platform_login', 'platform_audit'])
    await assert.rejects(db.asSchool(ids.A.school, (x) => x.all(`SELECT * FROM ${t}`)), /permission denied/, t);
  const codes = await db.asSchool(ids.A.school, (t) => t.all('SELECT code, school_id FROM student_code'));
  assert.ok(codes.length && codes.every((c) => c.school_id === ids.A.school));
  // Un code déjà pris par B est refusé à A (unicité globale), sans que A puisse le lire.
  const codeB = (await db.get('SELECT code FROM student_code WHERE school_id = ? LIMIT 1', ids.B.school)).code;
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', codeB, ids.A.school)), /duplicate key/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', 'ZZ-1', ids.B.school)), /row-level security/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('DELETE FROM student_code')), /permission denied/);
  // La fonction de rattachement ne rend qu'un entier.
  const ph = (await db.get('SELECT phone FROM app_user WHERE id = ?', ids.B.users.direction)).phone;
  const r = await db.asSchool(ids.A.school, (t) => t.get('SELECT noria_person_by_phone(?) AS id', ph));
  assert.equal(typeof r.id, 'number');
  // Lecture du profil d'une autre école : invisible.
  assert.equal((await db.asSchool(ids.A.school, (t) => t.all('SELECT id FROM school WHERE id = ?', ids.B.school))).length, 0);
});

test('migration 009 sur des données existantes : comptes réunis par e-mail sans perte, codes en double renommés', async () => {
  const { migrationList, migrate } = require('../src/store');
  const Database = require('better-sqlite3');
  const raw = new Database(':memory:'); raw.pragma('foreign_keys = ON');
  const lite = { kind: 'sqlite', raw, async get(s, ...p) { return raw.prepare(s).get(...p); }, async all(s, ...p) { return raw.prepare(s).all(...p); },
    async run(s, ...p) { return { changes: raw.prepare(s).run(...p).changes }; }, async insert(s, ...p) { return raw.prepare(`${s} RETURNING id`).get(...p).id; },
    async exec(s) { raw.exec(s); }, async tx(fn) { raw.exec('SAVEPOINT m'); try { const r = await fn(lite); raw.exec('RELEASE m'); return r; } catch (e) { raw.exec('ROLLBACK TO m'); raw.exec('RELEASE m'); throw e; } } };
  raw.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for (const m of migrationList('sqlite').filter((x) => x.version < '009')) { raw.exec(m.sql); raw.prepare('INSERT INTO schema_migrations (version, name) VALUES (?,?)').run(m.version, m.name); }
  raw.exec(`INSERT INTO school (id, slug, name) VALUES (1, 'a', 'École A'), (2, 'b', 'École B');
    INSERT INTO app_user (id, school_id, email, display_name, password_hash) VALUES (1, 1, 'meme@x.invalid', 'Même', 'scrypt$aa$bb'), (2, 2, 'meme@x.invalid', 'Même', 'scrypt$cc$dd'), (3, 2, 'autre@x.invalid', 'Autre', NULL);
    INSERT INTO user_role (school_id, user_id, role) VALUES (1, 1, 'enseignant'), (2, 2, 'direction');
    INSERT INTO student (id, school_id, code, first_name, last_name) VALUES (1, 1, 'E-001', 'Ana', 'X'), (2, 2, 'E-001', 'Bel', 'Y');`);
  assert.deepEqual(await migrate(lite), ['009']);
  const persons = raw.prepare('SELECT id, email FROM person ORDER BY id').all();
  assert.equal(persons.length, 2);
  const users = raw.prepare('SELECT id, person_id, password_hash FROM app_user ORDER BY id').all();
  assert.equal(users[0].person_id, users[1].person_id); assert.notEqual(users[2].person_id, users[0].person_id);
  assert.deepEqual(users.map((u) => u.password_hash), ['scrypt$aa$bb', 'scrypt$cc$dd', null], 'mots de passe conservés');
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM user_role').get().n, 2, 'rôles conservés');
  assert.deepEqual(raw.prepare('SELECT code FROM student ORDER BY id').all().map((r) => r.code), ['E-001', 'E-001-2']);
  assert.deepEqual(raw.prepare('SELECT code FROM student_code ORDER BY code').all().map((r) => r.code), ['E-001', 'E-001-2']);
  assert.equal(raw.prepare("SELECT status FROM school WHERE id = 1").get().status, 'active');
  raw.close();
});
