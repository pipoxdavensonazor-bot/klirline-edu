'use strict';
// Titulaire (« Toutes les matières ») : l'affectation sans matière donne accès à toutes les matières de la classe
// (communes ou propres à son niveau) pour la liste des matières, les évaluations et la saisie des notes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, ids, tok, c1, c2, sid, subjLevel, subjOther;
async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
}

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 50 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  [c1, c2] = ids.A.classes;
  const cls = await db.get('SELECT school_id, school_year_id, level_id FROM class WHERE id = ?', c1); sid = cls.school_id;
  const prof2 = (await db.get("SELECT id FROM app_user WHERE school_id = ? AND email = 'prof2@a.exemple.invalid'", sid)).id;
  const otherLevel = await db.insert('INSERT INTO level (school_id, name) VALUES (?,?)', sid, '8e année fondamentale (fictive)');
  subjLevel = await db.insert('INSERT INTO subject (school_id, name, school_year_id, coefficient, level_id) VALUES (?,?,?,?,?)', sid, 'Sciences 7e (fictive)', cls.school_year_id, 1, cls.level_id);
  subjOther = await db.insert('INSERT INTO subject (school_id, name, school_year_id, coefficient, level_id) VALUES (?,?,?,?,?)', sid, 'Physique 8e (fictive)', cls.school_year_id, 1, otherLevel);
  // prof2 : titulaire de la 7e A (aucune matière précise), en plus de son affectation existante.
  await db.insert('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,NULL)', sid, prof2, c1);
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: DEMO_PASSWORD }) });
  tok = (await r.json()).token;
});
after(async () => { server.close(); await db.cleanup(); });

test('titulaire : la liste des matières contient toutes les matières de la classe, pas celles d’un autre niveau', async () => {
  const r = await call('GET', '/api/subjects'); assert.equal(r.status, 200);
  const inC1 = new Set(r.json.filter((s) => s.class_id === c1).map((s) => s.id));
  for (const s of Object.values(ids.A.subjects)) assert.ok(inC1.has(s), `matière ${s} attendue pour la classe titulaire`);
  assert.ok(inC1.has(subjLevel));
  assert.ok(!inC1.has(subjOther), 'une matière d’un autre niveau ne doit pas apparaître');
});

test('titulaire : crée des évaluations et saisit des notes dans toute matière de la classe', async () => {
  const T1 = ids.A.terms[0];
  const ev = await call('POST', '/api/evaluations', { class_id: c1, subject_id: ids.A.subjects.francais, term_id: T1, title: 'Dictée titulaire (fictive)', day: '2026-10-06', max_score: 10 });
  assert.equal(ev.status, 200);
  assert.equal((await call('POST', '/api/evaluations', { class_id: c1, subject_id: subjLevel, term_id: T1, title: 'Sciences (fictive)', day: '2026-10-07', max_score: 10 })).status, 200);
  assert.equal((await call('POST', '/api/evaluations', { class_id: c1, subject_id: subjOther, term_id: T1, title: 'x', day: '2026-10-07', max_score: 10 })).status, 403);
  // Pas titulaire de la 7e B : seulement la matière affectée.
  assert.equal((await call('POST', '/api/evaluations', { class_id: c2, subject_id: ids.A.subjects.francais, term_id: T1, title: 'x', day: '2026-10-07', max_score: 10 })).status, 403);
  const st = await db.get("SELECT student_id FROM enrollment WHERE class_id = ? AND status = 'actif' LIMIT 1", c1);
  const g = await call('POST', '/api/grades/sync', { ops: [{ op_id: `op-tit-${Date.now()}`, base_version: 0, evaluation_id: ev.json.id, student_id: st.student_id, score: 8 }] });
  assert.equal(g.status, 200);
  assert.deepEqual(g.json.results.map((x) => x.result), ['applique']);
});
