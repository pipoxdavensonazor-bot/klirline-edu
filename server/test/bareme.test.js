'use strict';
// Barème : défaut /100, barème par évaluation (100, 200, 300 ou personnalisé), modifiable en brouillon seulement,
// 0 ≤ note ≤ max côté serveur, moyennes normalisées sur le barème de référence, bulletins anciens conservés.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { migrationList } = require('../src/store');

let db, server, base, ids; const tok = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[who]}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
}
let seq = 0;
const op = (o) => ({ op_id: `op-bar-${++seq}-${Date.now()}`, base_version: 0, ...o });
const grades = (who, ops) => call(who, 'POST', '/api/grades/sync', { ops });

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 50 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, h] of [['direction', 'direction'], ['prof1', 'prof1'], ['prof2', 'prof2']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: `${h}@a.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
});
after(async () => { server.close(); await db.cleanup(); });

const evBody = (o) => ({ class_id: ids.A.classes[0], subject_id: ids.A.subjects.maths, term_id: ids.A.terms[0], title: 'Contrôle (fictif)', day: '2026-10-06', ...o });

test('migration 006 : barème de référence /100 par école, bulletins existants gardés sur 10', async () => {
  assert.ok(migrationList(db.kind === 'sqlite' ? 'sqlite' : 'pg').some((m) => m.version === '006'));
  const s = await db.get('SELECT grade_scale FROM school WHERE id = ?', ids.A.school);
  assert.equal(Number(s.grade_scale), 100);
});

test('création : /100 par défaut ; 200, 300 et personnalisé acceptés ; valeurs invalides refusées', async () => {
  const d = await call('prof1', 'POST', '/api/evaluations', evBody({}));
  assert.equal(d.status, 200); assert.equal(d.json.max_score, 100);
  for (const m of [200, 300, 40, 12.5]) assert.equal((await call('prof1', 'POST', '/api/evaluations', evBody({ max_score: m }))).json.max_score, m);
  for (const m of [0, -5, 1001, 'abc', 10.123]) assert.equal((await call('prof1', 'POST', '/api/evaluations', evBody({ max_score: m }))).status, 400, `max ${m}`);
});

test('saisie : 0 ≤ note ≤ max imposé par le serveur', async () => {
  const id = (await call('prof1', 'POST', '/api/evaluations', evBody({ max_score: 200 }))).json.id;
  const s = ids.A.students[0];
  const r = (await grades('prof1', [op({ evaluation_id: id, student_id: s, score: 201 }), op({ evaluation_id: id, student_id: s, score: -1 }),
    op({ evaluation_id: id, student_id: s, score: 'x' }), op({ evaluation_id: id, student_id: s, score: 200 })])).json.results;
  assert.deepEqual(r.map((x) => x.result), ['refuse', 'refuse', 'refuse', 'applique']);
  assert.match(r[0].error, /entre 0 et 200/);
});

test('barème modifiable en brouillon seulement, jamais sous une note saisie', async () => {
  const id = (await call('prof1', 'POST', '/api/evaluations', evBody({ max_score: 100 }))).json.id;
  const s = ids.A.students[0];
  assert.equal((await call('prof1', 'PATCH', `/api/evaluations/${id}`, { max_score: 300 })).json.max_score, 300);
  assert.equal((await grades('prof1', [op({ evaluation_id: id, student_id: s, score: 250 })])).json.results[0].result, 'applique');
  assert.equal((await call('prof1', 'PATCH', `/api/evaluations/${id}`, { max_score: 200 })).status, 409, 'note 250 > 200');
  assert.equal((await call('prof1', 'PATCH', `/api/evaluations/${id}`, { max_score: 0 })).status, 400);
  assert.equal((await call('prof2', 'PATCH', `/api/evaluations/${id}`, { max_score: 400 })).status, 404, 'hors périmètre');
  assert.equal((await call('prof1', 'POST', `/api/evaluations/${id}/soumettre`)).status, 200);
  assert.equal((await call('prof1', 'PATCH', `/api/evaluations/${id}`, { max_score: 400 })).status, 409, 'verrouillé après soumission');
  assert.equal((await call('direction', 'PATCH', `/api/evaluations/${id}`, { max_score: 400 })).status, 409);
  assert.equal(Number((await call('prof1', 'GET', `/api/evaluations/${id}`)).json.max_score), 300);
});

test('moyennes normalisées sur /100 quels que soient les barèmes ; le bulletin garde son barème', async () => {
  const s = ids.A.students[0];
  const sub = ids.A.subjects.francais;
  const a = (await call('prof1', 'POST', '/api/evaluations', evBody({ subject_id: sub, max_score: 200, coefficient: 1 }))).json.id;
  const b = (await call('prof1', 'POST', '/api/evaluations', evBody({ subject_id: sub, max_score: 300, coefficient: 1 }))).json.id;
  await grades('prof1', [op({ evaluation_id: a, student_id: s, score: 150 }), op({ evaluation_id: b, student_id: s, score: 150 })]);
  for (const e of [a, b]) { await call('prof1', 'POST', `/api/evaluations/${e}/soumettre`); await call('direction', 'POST', `/api/evaluations/${e}/publier`); }
  const avg = (await call('direction', 'GET', `/api/students/${s}/averages?term_id=${ids.A.terms[0]}`)).json;
  assert.equal(avg.scale, 100);
  assert.deepEqual(avg.subjects.find((x) => x.name === 'Français').average, 62.5); // (75 + 50) / 2
  const rc = await call('direction', 'POST', '/api/report-cards', { student_id: s, term_id: ids.A.terms[0] });
  assert.equal(rc.status, 200); assert.equal(rc.json.scale, 100);
  const list = (await call('direction', 'GET', `/api/report-cards?student_id=${s}`)).json;
  assert.equal(Number(list[0].scale), 100);
});

test('barème de référence configurable par école (ex. /20)', async () => {
  await db.run('UPDATE school SET grade_scale = 20 WHERE id = ?', ids.A.school);
  try {
    const avg = (await call('direction', 'GET', `/api/students/${ids.A.students[0]}/averages?term_id=${ids.A.terms[0]}`)).json;
    assert.equal(avg.scale, 20); assert.equal(avg.subjects.find((x) => x.name === 'Français').average, 12.5);
  } finally { await db.run('UPDATE school SET grade_scale = 100 WHERE id = ?', ids.A.school); }
});

test('hors ligne : une note saisie sur un ancien barème est refusée après changement de barème', async () => {
  const id = (await call('prof1', 'POST', '/api/evaluations', evBody({ max_score: 100 }))).json.id;
  await call('prof1', 'PATCH', `/api/evaluations/${id}`, { max_score: 200 });
  const r = (await grades('prof1', [op({ evaluation_id: id, student_id: ids.A.students[0], score: 80, max_score: 100, offline: true }),
    op({ evaluation_id: id, student_id: ids.A.students[0], score: 160, max_score: 200, offline: true })])).json.results;
  assert.equal(r[0].result, 'refuse'); assert.match(r[0].error, /barème modifié/);
  assert.equal(r[1].result, 'applique');
});
