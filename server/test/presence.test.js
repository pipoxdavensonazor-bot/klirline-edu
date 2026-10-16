'use strict';
// Présences : autorisations, idempotence, corrections avec motif, règle de conflit journalisée.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, ids; const tok = {};
async function call(token, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Port-au-Prince' });
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/Port-au-Prince' });
let seq = 0;
const op = (o) => ({ op_id: `op-test-${++seq}-${Date.now()}`, base_version: 0, offline: true, recorded_at: new Date().toISOString(), ...o });
const sync = async (who, ops) => call(tok[who], 'POST', '/api/attendance/sync', { ops });

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const h of ['direction', 'secretariat', 'prof1', 'prof2', 'parent1', 'compta']) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: `${h}@a.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[h] = (await r.json()).token;
  }
  const rb = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-b', identifier: 'prof1@b.exemple.invalid', password: DEMO_PASSWORD }) });
  tok.profB = (await rb.json()).token;
});
after(async () => { server.close(); await db.cleanup(); });

test('autorisations : enseignant sur sa classe seulement, parent et comptabilité refusés, autre école invisible', async () => {
  const [c1, c2] = ids.A.classes; const [s1, s2] = ids.A.students;
  const ok = await sync('prof1', [op({ class_id: c1, student_id: s1, day: today(), status: 'present' })]);
  assert.equal(ok.status, 200); assert.equal(ok.json.results[0].result, 'applique');
  const other = await sync('prof1', [op({ class_id: c2, student_id: s2, day: today(), status: 'absent' })]);
  assert.equal(other.json.results[0].result, 'refuse');
  // Élève qui n'est pas dans la classe déclarée.
  assert.equal((await sync('prof1', [op({ class_id: c1, student_id: s2, day: today(), status: 'absent' })])).json.results[0].result, 'refuse');
  assert.equal((await sync('parent1', [op({ class_id: c1, student_id: s1, day: today(), status: 'absent' })])).status, 403);
  assert.equal((await sync('compta', [])).status, 403);
  assert.equal((await sync('profB', [op({ class_id: c1, student_id: s1, day: today(), status: 'absent' })])).json.results[0].result, 'refuse');
  assert.equal((await call(tok.profB, 'GET', `/api/attendance?class_id=${c1}&day=${today()}`)).status, 404);
  const list = await call(tok.prof1, 'GET', `/api/attendance?class_id=${c1}&day=${today()}`);
  assert.deepEqual(list.json.map((r) => [r.student_id, r.status, r.version]), [[s1, 'present', 1]]);
  // Parent : lecture des présences de son enfant uniquement.
  assert.equal((await call(tok.parent1, 'GET', `/api/students/${s1}/attendance`)).json[0].status, 'present');
  assert.equal((await call(tok.parent1, 'GET', `/api/students/${s2}/attendance`)).status, 404);
});

test('idempotence : le même op_id rejoué ne crée rien de plus ; op_id d’un autre compte refusé', async () => {
  const [c1] = ids.A.classes; const [s1] = ids.A.students;
  const o = op({ class_id: c1, student_id: s1, day: daysAgo(1), status: 'retard' });
  const a = await sync('prof1', [o]); const b = await sync('prof1', [o, o]);
  assert.equal(a.json.results[0].result, 'applique');
  assert.deepEqual(b.json.results.map((r) => r.deja), [true, true]);
  const n = (await db.get('SELECT COUNT(*) AS n FROM attendance_history WHERE op_id = ?', o.op_id)).n;
  assert.equal(n, 1);
  assert.equal((await sync('direction', [o])).json.results[0].result, 'refuse');
});

test('corrections : motif obligatoire (sauf l’auteur le jour même), historique en ajout seul', async () => {
  const [c1] = ids.A.classes; const [s1] = ids.A.students;
  // L'auteur corrige sa saisie du jour : permis sans motif.
  const self = await sync('prof1', [op({ class_id: c1, student_id: s1, day: today(), status: 'retard', base_version: 1 })]);
  assert.equal(self.json.results[0].result, 'applique'); assert.equal(self.json.results[0].version, 2);
  // Un autre compte : motif obligatoire.
  const noReason = await sync('direction', [op({ class_id: c1, student_id: s1, day: today(), status: 'excuse', base_version: 2 })]);
  assert.match(noReason.json.results[0].error, /motif/);
  const withReason = await sync('direction', [op({ class_id: c1, student_id: s1, day: today(), status: 'excuse', base_version: 2, reason: 'Certificat médical (fictif)' })]);
  assert.equal(withReason.json.results[0].version, 3);
  const hist = await call(tok.direction, 'GET', `/api/students/${s1}/attendance/history`);
  const todays = hist.json.filter((h) => h.day === today());
  assert.deepEqual(todays.map((h) => [h.old_status, h.new_status, h.version]), [[null, 'present', 1], ['present', 'retard', 2], ['retard', 'excuse', 3]]);
  assert.equal(todays[2].reason, 'Certificat médical (fictif)');
  assert.equal(todays[0].source, 'hors_ligne');
  await assert.rejects(db.run('DELETE FROM attendance_history'), /ajout seul/);
  await assert.rejects(db.run("UPDATE attendance_history SET reason = 'x'"), /ajout seul/);
});

test('conflit : la fiche a changé depuis la version vue par l’appareil → valeur du serveur conservée, conflit journalisé', async () => {
  const [, c2] = ids.A.classes; const [, s2] = ids.A.students;
  const day = today();
  // Deux appareils hors ligne ont fait l'appel sans connaître de version (base 0). Le premier arrivé l'emporte.
  const first = await sync('prof2', [op({ class_id: c2, student_id: s2, day, status: 'absent' })]);
  assert.equal(first.json.results[0].result, 'applique');
  const second = await sync('direction', [op({ class_id: c2, student_id: s2, day, status: 'present' })]);
  assert.equal(second.json.results[0].result, 'conflit');
  assert.equal(second.json.results[0].status, 'absent');
  // Même valeur : pas de conflit.
  assert.equal((await sync('secretariat', [op({ class_id: c2, student_id: s2, day, status: 'absent' })])).json.results[0].result, 'identique');
  const cf = await call(tok.direction, 'GET', '/api/attendance/conflicts');
  assert.equal(cf.json.length, 1);
  assert.equal(cf.json[0].client_status, 'present'); assert.equal(cf.json[0].server_status, 'absent');
  assert.equal(cf.json[0].resolution, 'valeur du serveur conservée');
  assert.equal((await call(tok.prof2, 'GET', '/api/attendance/conflicts')).json.length, 0, 'l’enseignant ne voit que ses conflits');
  const au = await db.get("SELECT outcome FROM audit_log WHERE action = 'attendance.conflict'");
  assert.equal(au.outcome, 'conflit');
  await assert.rejects(db.run('DELETE FROM sync_conflict'), /ajout seul/);
});

test('fenêtre de saisie : enseignant limité à 7 jours, direction sans limite ; données invalides refusées', async () => {
  const [c1] = ids.A.classes; const [s1] = ids.A.students;
  assert.equal((await sync('prof1', [op({ class_id: c1, student_id: s1, day: daysAgo(10), status: 'absent' })])).json.results[0].result, 'refuse');
  assert.equal((await sync('direction', [op({ class_id: c1, student_id: s1, day: daysAgo(10), status: 'absent' })])).json.results[0].result, 'applique');
  assert.equal((await sync('direction', [op({ class_id: c1, student_id: s1, day: '2026-13', status: 'absent' })])).json.results[0].result, 'refuse');
  assert.equal((await sync('direction', [op({ class_id: c1, student_id: s1, day: today(), status: 'malade' })])).json.results[0].result, 'refuse');
  assert.equal((await sync('direction', [{ op_id: 'x', class_id: c1 }])).json.results[0].result, 'refuse');
  assert.equal((await call(tok.direction, 'POST', '/api/attendance/sync', { ops: 'x' })).status, 400);
});
