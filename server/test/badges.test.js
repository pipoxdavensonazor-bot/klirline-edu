'use strict';
// Bloc 2 : photo de l'élève (droits, poids, jamais publique), badges par année (QR signé, expiration à la fin de l'année,
// génération de l'année suivante, révocation et réédition, planche A4), recherche, scan selon le rôle, vérification
// par la direction, page publique minimale, cloisonnement RLS (PostgreSQL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');
const Bd = require('../src/badges');

const PHOTO = fs.readFileSync(path.join(__dirname, 'fixtures', 'photo-fictive.jpg'));
let db, server, base, ids;
async function call(token, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, json, buf, headers: res.headers };
}
const tokens = {};
const tok = async (k, who) => {
  const key = `${k}:${who}`;
  if (!tokens[key]) {
    const r = await call(null, 'POST', '/api/login', { school: `ecole-${k.toLowerCase()}`, identifier: `${who}@${k.toLowerCase()}.exemple.invalid`, password: DEMO_PASSWORD });
    assert.equal(r.status, 200, `connexion ${who}`); tokens[key] = r.json.token;
  }
  return tokens[key];
};
// Texte d'un PDF (flux FlateDecode décompressés).
const pdfText = (buf) => { const zlib = require('node:zlib'); let out = ''; const s = buf.toString('latin1'); let i = 0;
  while ((i = s.indexOf('>>\nstream\n', i)) >= 0) { const e = s.indexOf('\nendstream', i); if (e < 0) break; try { out += zlib.inflateSync(Buffer.from(s.slice(i + 10, e), 'latin1')).toString('latin1'); } catch {} i = e + 10; } return out; };
// Jeton d'un badge : lu dans le QR ? Le PDF ne contient que des rectangles ; on reconstruit le jeton avec le secret.
async function tokenOf(badgeId) {
  const b = await db.get('SELECT school_id, token_nonce FROM badge WHERE id = ?', badgeId);
  const k = await require('../src/cles').schoolKeys(db, b.school_id);
  return Bd.tokenFor(k.badgeSecret, b.token_nonce);
}

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  const notifier = { adapter: () => ({ name: 'test', simulated: true, async send() { return { id: 'x' }; } }) };
  server = createServer(db, { notifier, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

test('photo : direction et secrétariat seulement, carrée, 40 Ko au plus, journalisée', async () => {
  const st = ids.A.students[0];
  const photo = PHOTO.toString('base64');
  assert.equal((await call(await tok('A', 'prof1'), 'PUT', `/api/students/${st}/photo`, { photo })).status, 403);
  assert.equal((await call(await tok('A', 'parent1'), 'PUT', `/api/students/${st}/photo`, { photo })).status, 403);
  assert.equal((await call(await tok('A', 'biblio'), 'PUT', `/api/students/${st}/photo`, { photo })).status, 403);
  const heavy = Buffer.concat([PHOTO, Buffer.alloc(41 * 1024, 0)]).toString('base64');
  const r1 = await call(await tok('A', 'secretariat'), 'PUT', `/api/students/${st}/photo`, { photo: heavy });
  assert.equal(r1.status, 400); assert.match(r1.json.error, /40 Ko/);
  assert.equal((await call(await tok('A', 'secretariat'), 'PUT', `/api/students/${st}/photo`, { photo: 'AAAA' })).status, 400);
  const ok = await call(await tok('A', 'secretariat'), 'PUT', `/api/students/${st}/photo`, { photo });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  // Remplacement par la direction.
  assert.equal((await call(await tok('A', 'direction'), 'PUT', `/api/students/${st}/photo`, { photo })).status, 200);
  const log = await db.all("SELECT outcome FROM audit_log WHERE action = 'student.photo' AND school_id = ? ORDER BY id", ids.A.school);
  assert.deepEqual(log.map((l) => l.outcome), ['refuse', 'refuse', 'refuse', 'ok', 'ok']);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM student_photo')).n, 1);
});

test('photo : servie aux personnes autorisées seulement, jamais publiquement ni à une autre école', async () => {
  const st = ids.A.students[0]; const other = ids.A.students[1];
  await call(await tok('A', 'direction'), 'PUT', `/api/students/${other}/photo`, { photo: PHOTO.toString('base64') });
  const p = `/api/students/${st}/photo`;
  assert.equal((await call(null, 'GET', p)).status, 401); // public : jamais
  for (const who of ['direction', 'secretariat', 'biblio', 'prof1', 'parent1', 'eleve1']) {
    const r = await call(await tok('A', who), 'GET', p);
    assert.equal(r.status, 200, who); assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.match(r.headers.get('cache-control'), /private, no-store/);
  }
  for (const who of ['prof2', 'parent2', 'compta']) assert.equal((await call(await tok('A', who), 'GET', p)).status, 404, who);
  // Élève 1 ne voit pas la photo de l'élève 2 ; l'école B ne voit rien de A.
  assert.equal((await call(await tok('A', 'eleve1'), 'GET', `/api/students/${other}/photo`)).status, 404);
  assert.equal((await call(await tok('B', 'direction'), 'GET', p)).status, 404);
  // Aucune route publique ne renvoie la photo (page publique d'un badge : pas de photo).
});

test('badges : génération par année, contenu du PDF CR80, planche A4 de 8 ou 10, droits', async () => {
  const dir = await tok('A', 'direction');
  assert.equal((await call(await tok('A', 'prof1'), 'POST', '/api/badges/generer', {})).status, 403);
  assert.equal((await call(await tok('A', 'biblio'), 'POST', '/api/badges/generer', {})).status, 403);
  const g = await call(dir, 'POST', '/api/badges/generer', {});
  assert.equal(g.status, 200, JSON.stringify(g.json)); assert.equal(g.json.created, 2); assert.equal(g.json.year, '2026-2027');
  // Relancer : rien de nouveau (un seul badge valide par élève et par année).
  assert.equal((await call(dir, 'POST', '/api/badges/generer', {})).json.kept, 2);
  const list = (await call(dir, 'GET', '/api/badges')).json;
  assert.equal(list.length, 2); assert.ok(list.every((b) => b.status === 'valide' && b.expires_on === '2027-08-31'));
  const b1 = list.find((b) => b.student_id === ids.A.students[0]);
  const pdf = await call(dir, 'GET', `/api/badges/${b1.id}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const s = pdf.buf.toString('latin1');
  assert.match(s, /\/MediaBox \[0 0 242\.65 153\.01\]/); // carte CR80
  assert.match(s, /\/Subtype \/Image/); // photo (et logo s'il existe)
  const txt = pdfText(pdf.buf);
  for (const x of ['FICTIFA', 'Ana', '7e A', 'A-001', '2026-2027', 'cole fictive A']) assert.ok(txt.includes(x), x);
  // Le QR ne contient pas de données personnelles en clair : le jeton est aléatoire et signé.
  const token = await tokenOf(b1.id);
  assert.match(token, Bd.BADGE_RE); assert.ok(!token.includes('A001'));
  // Planche : 10 par défaut, 8 possible, autre valeur refusée.
  const sh = await call(dir, 'GET', `/api/badges/planche?class_id=${ids.A.classes[0]}&par=8`);
  assert.equal(sh.status, 200); assert.match(sh.buf.toString('latin1'), /\/MediaBox \[0 0 595 842\]/);
  assert.equal((await call(dir, 'GET', `/api/badges/planche?class_id=${ids.A.classes[0]}&par=9`)).status, 400);
  assert.equal((await call(await tok('A', 'secretariat'), 'GET', `/api/badges/planche?class_id=${ids.A.classes[0]}`)).status, 200);
  assert.equal((await call(await tok('A', 'parent1'), 'GET', `/api/badges/${b1.id}/pdf`)).status, 403);
  // Autre école : introuvable (cloisonnement), y compris par l'identifiant.
  assert.equal((await call(await tok('B', 'direction'), 'GET', `/api/badges/${b1.id}/pdf`)).status, 404);
  assert.equal((await call(await tok('B', 'direction'), 'GET', `/api/badges/planche?class_id=${ids.A.classes[0]}`)).status, 404);
});

test('jeton : signé par le secret de l’école, non devinable ; altération ou jeton d’une autre école = INCONNU', async () => {
  const dir = await tok('A', 'direction');
  const b1 = (await call(dir, 'GET', '/api/badges')).json[0];
  const token = await tokenOf(b1.id);
  const flipped = token.slice(0, 26) + (token[26] === 'A' ? 'B' : 'A');
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: flipped })).json.statut, 'inconnu');
  const forged = `B${'A'.repeat(26)}`;
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: forged })).json.statut, 'inconnu');
  // L'aléa seul (lu en base sans le secret) ne permet pas de fabriquer le jeton.
  const nonce = (await db.get('SELECT token_nonce FROM badge WHERE id = ?', b1.id)).token_nonce;
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: `B${nonce}AAAAAA` })).json.statut, 'inconnu');
  // Jeton valide de A présenté à la direction de B : inconnu.
  assert.equal((await call(await tok('B', 'direction'), 'POST', '/api/badges/verifier', { valeur: token })).json.statut, 'inconnu');
  // Le secret ne figure nulle part en clair dans la table des badges.
  const row = await db.get('SELECT * FROM badge WHERE id = ?', b1.id);
  assert.ok(!Object.values(row).includes(token));
});

test('vérification par la direction : VALIDE avec photo et nom, puis RÉVOQUÉ ; réédition', async () => {
  const dir = await tok('A', 'direction');
  const b1 = (await call(dir, 'GET', '/api/badges')).json.find((b) => b.student_id === ids.A.students[0]);
  const token = await tokenOf(b1.id);
  assert.equal((await call(await tok('A', 'secretariat'), 'POST', '/api/badges/verifier', { valeur: token })).status, 403);
  const v = await call(dir, 'POST', '/api/badges/verifier', { valeur: `https://noria.exemple.invalid/#verifier=${token}` });
  assert.equal(v.json.statut, 'valide'); assert.equal(v.json.eleve.first_name, 'Ana'); assert.match(v.json.eleve.photo, /^\/api\/students\/\d+\/photo/);
  // Révocation (perte) : motif obligatoire, réédition d'un nouveau badge.
  assert.equal((await call(dir, 'POST', `/api/badges/${b1.id}/revoquer`, { motif: '' })).status, 400);
  assert.equal((await call(await tok('A', 'biblio'), 'POST', `/api/badges/${b1.id}/revoquer`, { motif: 'perdu' })).status, 403);
  const r = await call(dir, 'POST', `/api/badges/${b1.id}/revoquer`, { motif: 'Badge perdu', reediter: true });
  assert.equal(r.status, 200); assert.ok(r.json.reissued);
  const after1 = await call(dir, 'POST', '/api/badges/verifier', { valeur: token });
  assert.equal(after1.json.statut, 'revoque'); assert.equal(after1.json.badge.revoked_reason, 'Badge perdu');
  assert.equal((await call(dir, 'GET', `/api/badges/${b1.id}/pdf`)).status, 410);
  const fresh = await tokenOf(r.json.reissued);
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: fresh })).json.statut, 'valide');
  assert.equal((await call(dir, 'POST', `/api/badges/${b1.id}/revoquer`, { motif: 'encore' })).status, 409);
  // Page publique : école, prénom + initiale, année, statut. Pas de photo, ni code, ni classe.
  const pub = await call(null, 'GET', `/api/verifier/${token}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.json).sort(), ['annee', 'authentique', 'ecole', 'eleve', 'expire_le', 'statut', 'type']);
  assert.equal(pub.json.statut, 'revoque'); assert.equal(pub.json.eleve, 'Ana F.'); assert.equal(pub.json.annee, '2026-2027');
  assert.ok(!JSON.stringify(pub.json).includes('A-001') && !JSON.stringify(pub.json).includes('photo'));
  assert.equal((await call(null, 'GET', `/api/verifier/${fresh}`)).json.statut, 'valide');
  assert.equal((await call(null, 'GET', `/api/verifier/B${'C'.repeat(26)}`)).status, 404);
  const actions = (await db.all("SELECT action FROM audit_log WHERE action LIKE 'badge.%' AND school_id = ?", ids.A.school)).map((x) => x.action);
  for (const a of ['badge.generate', 'badge.pdf', 'badge.sheet', 'badge.verify', 'badge.revoke', 'badge.reissue']) assert.ok(actions.includes(a), a);
});

test('expiration : fin de l’année passée = EXPIRÉ ; génération de l’année suivante = nouveaux badges, anciens expirés', async () => {
  const dir = await tok('A', 'direction');
  const s = ids.A.school;
  const st2 = ids.A.students[1];
  const old = (await call(dir, 'GET', `/api/badges?student_id=${st2}`)).json[0];
  const oldToken = await tokenOf(old.id);
  // Année suivante : nouvelle année, classe, inscription de l'élève 2.
  const y2 = await db.insert("INSERT INTO school_year (school_id, label, is_current, ends_on) VALUES (?, '2027-2028', 0, '2028-07-15')", s);
  const lv = await db.get('SELECT level_id, campus_id FROM class WHERE id = ?', ids.A.classes[1]);
  const c3 = await db.insert('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', s, '8e A', y2, lv.level_id, lv.campus_id);
  await db.run("UPDATE enrollment SET status = 'transfere' WHERE student_id = ? AND school_id = ?", st2, s);
  await db.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, st2, c3, 'passage en 8e (fictif)');
  const g = await call(dir, 'POST', '/api/badges/generer', { school_year_id: y2 });
  assert.equal(g.status, 200, JSON.stringify(g.json)); assert.equal(g.json.created, 1); assert.equal(g.json.expired, 1);
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: oldToken })).json.statut, 'expire');
  assert.equal((await call(null, 'GET', `/api/verifier/${oldToken}`)).json.statut, 'expire');
  const all = (await call(dir, 'GET', `/api/badges?student_id=${st2}`)).json;
  assert.deepEqual(all.map((b) => [b.year, b.status]), [['2027-2028', 'valide'], ['2026-2027', 'expire']]);
  assert.equal(all[0].expires_on, '2028-07-15'); assert.equal(all[0].class_name, '8e A');
  // Date de fin dépassée : expiré même sans nouvelle génération.
  assert.equal(Bd.badgeStatus({ status: 'valide', expires_on: '2020-08-31' }), 'expire');
  assert.equal(Bd.badgeStatus({ status: 'valide', expires_on: '2999-08-31' }), 'valide');
  assert.equal(Bd.yearEnd({ label: '2026-2027' }), '2027-08-31');
  await db.run("UPDATE badge SET expires_on = '2020-01-01' WHERE id = ?", all[0].id);
  assert.equal((await call(dir, 'POST', '/api/badges/verifier', { valeur: await tokenOf(all[0].id) })).json.statut, 'expire');
  await db.run("UPDATE badge SET expires_on = '2028-07-15' WHERE id = ?", all[0].id);
});

test('recherche et scan : direction, secrétariat, bibliothèque ; fiche selon le rôle ; saisie du code', async () => {
  for (const who of ['prof1', 'parent1', 'eleve1', 'compta']) {
    assert.equal((await call(await tok('A', who), 'GET', '/api/recherche?q=ana')).status, 403, who);
    assert.equal((await call(await tok('A', who), 'POST', '/api/scan', { valeur: 'A-001' })).status, 403, who);
  }
  const sec = await tok('A', 'secretariat');
  const r = (await call(sec, 'GET', '/api/recherche?q=ana')).json;
  assert.equal(r.length, 1); assert.equal(r[0].code, 'A-001');
  assert.equal((await call(sec, 'GET', '/api/recherche?q=a-00')).json.length, 2);
  assert.equal((await call(sec, 'GET', '/api/recherche?q=%25')).json.length, 0); // joker échappé
  assert.equal((await call(await tok('B', 'secretariat'), 'GET', '/api/recherche?q=a-00')).json.length, 0); // autre école
  // Bibliothèque : scan d'un badge → prêts, pas de date de naissance ni de parents ; peut prêter.
  const bib = await tok('A', 'biblio');
  const dir = await tok('A', 'direction');
  const b = (await call(dir, 'GET', `/api/badges?student_id=${ids.A.students[0]}`)).json.find((x) => x.status === 'valide');
  const token = await tokenOf(b.id);
  const loan = await call(bib, 'POST', '/api/loans', { book_id: ids.A.books[0], student_id: ids.A.students[0] });
  assert.equal(loan.status, 200, JSON.stringify(loan.json));
  const s1 = (await call(bib, 'POST', '/api/scan', { valeur: `https://noria.exemple.invalid/#verifier=${token}` })).json;
  assert.equal(s1.statut, 'valide'); assert.equal(s1.eleve.code, 'A-001'); assert.equal(s1.eleve.loans.length, 1);
  assert.equal(s1.eleve.birth_date, undefined); assert.equal(s1.eleve.parents, undefined);
  // Secrétariat : fiche avec naissance et parents.
  const s2 = (await call(sec, 'POST', '/api/scan', { valeur: 'a-001' })).json;
  assert.equal(s2.statut, 'code'); assert.equal(s2.eleve.birth_date, '2014-01-01'); assert.equal(s2.eleve.parents.length, 1);
  assert.equal((await call(sec, 'POST', '/api/scan', { valeur: 'ZZZ-999' })).json.statut, 'inconnu');
  assert.equal((await call(await tok('B', 'secretariat'), 'POST', '/api/scan', { valeur: token })).json.statut, 'inconnu');
  assert.equal((await call(await tok('B', 'secretariat'), 'GET', `/api/fiche/${ids.A.students[0]}`)).status, 404);
  assert.equal((await call(sec, 'GET', `/api/fiche/${ids.A.students[0]}`)).json.code, 'A-001');
  assert.deepEqual(Bd.parseScan(' https://x.invalid/#verifier=' + token.toLowerCase()), { token });
});

test('RLS (PostgreSQL) : photos et badges cloisonnés par école, clés interdites au rôle applicatif', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  const n = await db.asSchool(ids.B.school, async (t) => ({
    photos: (await t.get('SELECT COUNT(*) AS n FROM student_photo')).n,
    badges: (await t.get('SELECT COUNT(*) AS n FROM badge')).n,
  }));
  assert.equal(n.photos, 0); assert.equal(n.badges, 0);
  const a = await db.asSchool(ids.A.school, (t) => t.get('SELECT COUNT(*) AS n FROM badge'));
  assert.ok(a.n >= 3);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.all('SELECT * FROM school_key')), /permission denied/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('DELETE FROM badge')), /permission denied/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run("INSERT INTO student_photo (school_id, student_id, photo, size, updated_by) VALUES (?,?,?,?,?)",
    ids.B.school, ids.B.students[0], 'x', 1, ids.A.users.direction)), /row-level security|foreign key/);
});
