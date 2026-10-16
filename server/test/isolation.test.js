'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, ids;
const tokens = {};

async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}
async function login(school, handle) {
  const r = await call(null, 'POST', '/api/login', { school: `ecole-${school.toLowerCase()}`, email: `${handle}@${school.toLowerCase()}.exemple.invalid`, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, `connexion ${handle}@${school}`);
  return r.json.token;
}
const T = (school, handle) => tokens[`${school}.${handle}`];

before(async () => {
  db = openDb(':memory:');
  ids = seed(db);
  server = createServer(db);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const s of ['A', 'B']) for (const h of Object.keys(ids[s].users)) tokens[`${s}.${h}`] = await login(s, h);
});
after(() => server.close());

test('authentification : sans jeton, mauvais mot de passe, mot de passe haché', async () => {
  assert.equal((await call(null, 'GET', '/api/students')).status, 401);
  assert.equal((await call('faux', 'GET', '/api/students')).status, 401);
  const bad = await call(null, 'POST', '/api/login', { school: 'ecole-a', email: 'direction@a.exemple.invalid', password: 'x' });
  assert.equal(bad.status, 401);
  // Un compte de l'école A ne se connecte pas via l'école B.
  const cross = await call(null, 'POST', '/api/login', { school: 'ecole-b', email: 'direction@a.exemple.invalid', password: DEMO_PASSWORD });
  assert.equal(cross.status, 401);
  const h = db.prepare('SELECT password_hash FROM app_user LIMIT 1').get().password_hash;
  assert.match(h, /^scrypt\$/);
  assert.ok(!h.includes(DEMO_PASSWORD));
});

test('parent : voit son enfant, pas un enfant non lié', async () => {
  const [mine, other] = ids.A.students;
  assert.equal((await call(T('A', 'parent1'), 'GET', `/api/students/${mine}`)).status, 200);
  assert.equal((await call(T('A', 'parent1'), 'GET', `/api/students/${other}`)).status, 404);
  const list = await call(T('A', 'parent1'), 'GET', '/api/students');
  assert.deepEqual(list.json.map((s) => s.id), [mine]);
  assert.equal((await call(T('A', 'parent1'), 'GET', `/api/students/${other}/finance`)).status, 404);
  assert.equal((await call(T('A', 'parent1'), 'GET', `/api/students/${mine}/finance`)).status, 200);
  assert.equal((await call(T('A', 'parent1'), 'PATCH', `/api/students/${mine}`, { first_name: 'X', reason: 'test' })).status, 403);
  assert.equal((await call(T('A', 'parent1'), 'GET', '/api/export/students')).status, 403);
});

test('enseignant : ses classes seulement, champs utiles seulement', async () => {
  const [c1, c2] = ids.A.classes;
  const [s1, s2] = ids.A.students;
  const t = T('A', 'prof1');
  assert.equal((await call(t, 'GET', `/api/classes/${c1}/students`)).status, 200);
  assert.equal((await call(t, 'GET', `/api/classes/${c2}/students`)).status, 404);
  const own = await call(t, 'GET', `/api/students/${s1}`);
  assert.equal(own.status, 200);
  assert.equal(own.json.health_notes, undefined, 'pas de notes de santé pour l’enseignant');
  assert.equal((await call(t, 'GET', `/api/students/${s2}`)).status, 404);
  assert.equal((await call(t, 'PATCH', `/api/students/${s2}`, { first_name: 'X', reason: 'test' })).status, 403);
  assert.equal((await call(t, 'GET', `/api/students/${s1}/finance`)).status, 403);
});

test('export : un enseignant n’exporte pas une autre classe, l’export suit le périmètre', async () => {
  const [c1, c2] = ids.A.classes;
  const t = T('A', 'prof1');
  assert.equal((await call(t, 'GET', `/api/export/students?classId=${c2}`)).status, 404);
  const all = await call(t, 'GET', '/api/export/students');
  assert.equal(all.status, 200);
  assert.match(all.text, /A-001/);
  assert.doesNotMatch(all.text, /A-002/);
  assert.doesNotMatch(all.text, /health_notes|Note santé/);
  assert.equal((await call(t, 'GET', `/api/export/students?classId=${c1}`)).status, 200);
  // Un export inter-écoles est refusé : la classe de B n'existe pas pour A.
  assert.equal((await call(T('A', 'direction'), 'GET', `/api/export/students?classId=${ids.B.classes[0]}`)).status, 404);
  const dirExport = await call(T('A', 'direction'), 'GET', '/api/export/students');
  assert.doesNotMatch(dirExport.text, /B-00/);
  assert.equal((await call(T('A', 'compta'), 'GET', '/api/export/students')).status, 403);
  assert.equal((await call(T('A', 'biblio'), 'GET', '/api/export/finance')).status, 403);
  const fin = await call(T('A', 'compta'), 'GET', '/api/export/finance');
  assert.equal(fin.status, 200);
  assert.doesNotMatch(fin.text, /B-00/);
  const logs = db.prepare(`SELECT action, outcome FROM audit_log WHERE school_id = ? AND action LIKE 'export.%'`).all(ids.A.school);
  assert.ok(logs.some((l) => l.outcome === 'ok') && logs.some((l) => l.outcome === 'refuse'), 'exports et refus journalisés');
});

test('école A contre école B : lecture, modification, rôles, journal', async () => {
  const bStudent = ids.B.students[0];
  for (const h of ['direction', 'secretariat', 'prof1', 'parent1', 'eleve1', 'compta']) {
    assert.equal((await call(T('A', h), 'GET', `/api/students/${bStudent}`)).status === 200, false, h);
  }
  assert.equal((await call(T('A', 'direction'), 'PATCH', `/api/students/${bStudent}`, { first_name: 'Pirate', reason: 'test' })).status, 404);
  assert.equal(db.prepare('SELECT first_name FROM student WHERE id = ?').get(bStudent).first_name, 'Ana');
  assert.equal((await call(T('A', 'compta'), 'GET', `/api/students/${bStudent}/finance`)).status, 404);
  assert.equal((await call(T('A', 'direction'), 'GET', `/api/classes/${ids.B.classes[0]}/students`)).status, 404);
  assert.equal((await call(T('A', 'direction'), 'PUT', `/api/users/${ids.B.users.prof1}/roles`, { roles: ['direction'], reason: 'test' })).status, 404);
  const list = await call(T('A', 'direction'), 'GET', '/api/students');
  assert.ok(list.json.every((s) => s.code.startsWith('A-')));
  const audit = await call(T('A', 'direction'), 'GET', '/api/audit');
  assert.ok(audit.json.every((l) => l.school_id === ids.A.school));
});

test('la base refuse une ligne qui mélange deux écoles', () => {
  assert.throws(() => db.prepare('INSERT INTO enrollment (school_id, student_id, class_id) VALUES (?,?,?)')
    .run(ids.A.school, ids.A.students[0], ids.B.classes[0]), /FOREIGN KEY/);
  assert.throws(() => db.prepare('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)')
    .run(ids.A.school, ids.A.users.parent1, ids.B.students[0], 'x'), /FOREIGN KEY/);
});

test('élève, bibliothèque, comptabilité : périmètres minimaux', async () => {
  const [s1, s2] = ids.A.students;
  assert.equal((await call(T('A', 'eleve1'), 'GET', `/api/students/${s1}`)).status, 200);
  assert.equal((await call(T('A', 'eleve1'), 'GET', `/api/students/${s2}`)).status, 404);
  assert.equal((await call(T('A', 'biblio'), 'GET', `/api/students/${s1}`)).status, 403);
  const loan = await call(T('A', 'biblio'), 'GET', `/api/classes/${ids.A.classes[0]}/students`);
  assert.deepEqual(Object.keys(loan.json[0]).sort(), ['code', 'first_name', 'id', 'last_name']);
  assert.equal((await call(T('A', 'compta'), 'GET', `/api/students/${s1}`)).status, 403);
  assert.equal((await call(T('A', 'compta'), 'GET', `/api/students/${s1}/finance`)).status, 200);
  assert.equal((await call(T('A', 'compta'), 'GET', '/api/audit')).status, 403);
});

test('direction : correction sensible avec motif obligatoire, journalisée ; journal non modifiable', async () => {
  const s1 = ids.A.students[0];
  const t = T('A', 'direction');
  assert.equal((await call(t, 'PATCH', `/api/students/${s1}`, { first_name: 'Anaïs' })).status, 400);
  const ok = await call(t, 'PATCH', `/api/students/${s1}`, { first_name: 'Anaïs', reason: 'Correction orthographe (fictif)' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.first_name, 'Anaïs');
  const row = db.prepare(`SELECT * FROM audit_log WHERE action = 'student.update' AND outcome = 'ok' ORDER BY id DESC`).get();
  assert.equal(row.actor_user_id, ids.A.users.direction);
  assert.equal(row.record_id, String(s1));
  assert.match(row.reason, /Correction orthographe/);
  assert.ok(row.created_at);
  assert.equal((await call(T('A', 'secretariat'), 'PUT', `/api/users/${ids.A.users.prof1}/roles`, { roles: ['direction'], reason: 'x' })).status, 403);
  assert.equal((await call(t, 'PUT', `/api/users/${ids.A.users.biblio}/roles`, { roles: ['bibliotheque', 'secretariat'], reason: 'Renfort (fictif)' })).status, 200);
  assert.throws(() => db.prepare('DELETE FROM audit_log').run(), /ajout seul/);
  assert.throws(() => db.prepare("UPDATE audit_log SET reason = 'x'").run(), /ajout seul/);
});

test('déconnexion : le jeton n’est plus accepté', async () => {
  const t = await login('B', 'parent2');
  assert.equal((await call(t, 'POST', '/api/logout')).status, 200);
  assert.equal((await call(t, 'GET', '/api/me')).status, 401);
});
