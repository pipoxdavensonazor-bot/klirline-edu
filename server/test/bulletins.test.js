'use strict';
// Bulletins au format haïtien (MENFP) : règles réglables, moyennes /10, points, rang ex aequo, mentions, décisions
// (admis, sous condition, redouble, promotion automatique 1re–3e AF), préscolaire en appréciations, PDF de classe.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const B = require('../src/bulletins');
const { template, COEF_3E_CYCLE } = require('../src/structure');

let db, server, base, sa, cls, terms, students, me; const tok = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, json: type.includes('json') ? await res.json() : null, buf: type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : null };
}

before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 200 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['parent1', 'a', 'parent1'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
  sa = (await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id;
  me = (await db.get("SELECT id FROM app_user WHERE school_id = ? AND email = 'direction@a.exemple.invalid'", sa)).id;
  cls = await db.get("SELECT id, school_year_id FROM class WHERE school_id = ? AND name = '7e A'", sa);
  terms = await db.all('SELECT id FROM term WHERE school_id = ? AND school_year_id = ? ORDER BY position', sa, cls.school_year_id);
  for (const [code, fn] of [['T-BUL-1', 'Rose'], ['T-BUL-2', 'Jean'], ['T-BUL-3', 'Marc']]) {
    const id = await db.insert('INSERT INTO student (school_id, code, first_name, last_name) VALUES (?,?,?,?)', sa, code, fn, 'Testeur');
    await db.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', sa, id, cls.id, 'test');
  }
  students = await db.all("SELECT student_id AS id FROM enrollment WHERE school_id = ? AND class_id = ? AND status = 'actif' ORDER BY student_id", sa, cls.id);
  const subj = await db.all('SELECT id, name, coefficient FROM subject WHERE school_id = ? AND school_year_id = ? ORDER BY id', sa, cls.school_year_id);
  // Notes publiées (/100) au trimestre 1 : élève 0 = 80, élève 1 = 80 (ex aequo), élève 2 = 47, les autres 30.
  for (const s of subj) {
    const ev = await db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, status, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, sa, cls.id, s.id, terms[0].id, `Contrôle ${s.name}`, '2026-10-10', 100, 1, 'publiee', me);
    for (const [i, st] of students.entries()) {
      await db.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, updated_by, recorded_at) VALUES (?,?,?,?,?,?)',
        sa, ev, st.id, [80, 80, 47][i] ?? 30, me, '2026-10-10T12:00:00Z');
    }
  }
});
after(async () => { server.close(); await db.cleanup(); });

test('fonctions pures : mention, décision, rang ex aequo, moyenne annuelle pondérée', () => {
  const r = B.normalizeRules(null);
  assert.equal(r.echelle, 10); assert.equal(r.moyenne_passage, 5);
  assert.equal(B.mentionFor(9.2, r), 'Excellent'); assert.equal(B.mentionFor(5, r), 'Passable'); assert.equal(B.mentionFor(4.99, r), 'Insuffisant'); assert.equal(B.mentionFor(null, r), null);
  assert.equal(B.decisionFor(6, '7e AF', r).code, 'admis');
  assert.equal(B.decisionFor(4.7, '7e AF', r).code, 'admis_sous_condition');
  assert.equal(B.decisionFor(3, '7e AF', r).code, 'redouble');
  assert.equal(B.decisionFor(2, '2e AF', r).code, 'promotion_automatique', 'pas de redoublement en 1re–3e AF');
  assert.equal(B.decisionFor(null, '8e AF', r).code, 'non_classe');
  assert.deepEqual(B.rankList([7, 9, 7, null, 5]).map((x) => x.rank), [2, 1, 2, null, 4]);
  assert.equal(B.rankList([7, 9, 7]).filter((x) => x.exAequo).length, 2);
  assert.equal(B.annualAverage([6, 8, null]), 7);
  assert.equal(B.annualAverage([6, 9], [1, 2]), 8);
  assert.throws(() => B.normalizeRules({ moyenne_passage: 12 }), /passage/);
  assert.throws(() => B.normalizeRules({ seuil_condition: 6 }), /condition/);
  assert.ok(B.isPrescolaire({ cycle: 'prescolaire', name: 'Préscolaire 1' })); assert.ok(!B.isPrescolaire({ cycle: 'fondamental-1', name: '1re AF' }));
});

test('modèle de l’assistant : coefficients MENFP au 3e cycle, préscolaire en appréciations', () => {
  const m = template('2026-2027');
  const l9 = m.cycles.find((c) => c.id === 'fondamental-3').levels.find((l) => l.name === '9e AF');
  assert.equal(l9.coefficients['Mathématiques'], 3); assert.equal(l9.coefficients['Anglais'], 2);
  assert.equal(m.cycles.find((c) => c.id === 'fondamental-1').levels[0].coefficients['Français'], 1);
  assert.equal(m.cycles.find((c) => c.id === 'prescolaire').levels[0].notation, 'appreciations');
  assert.equal(Object.values(COEF_3E_CYCLE).reduce((a, b) => a + b, 0) * 100, 2500, '5 × 300 + 5 × 200 points');
});

test('règles : lecture, modification par la direction seulement, journal, retour aux défauts', async () => {
  assert.equal((await call('direction', 'GET', '/api/bulletins/regles')).json.rules.echelle, 10);
  assert.equal((await call('parent1', 'GET', '/api/bulletins/regles')).status, 403);
  assert.equal((await call('secretariat', 'PUT', '/api/bulletins/regles', { rules: { moyenne_passage: 6 } })).status, 403);
  assert.equal((await call('direction', 'PUT', '/api/bulletins/regles', { rules: { moyenne_passage: 11 } })).status, 400);
  const ok = await call('direction', 'PUT', '/api/bulletins/regles', { rules: { moyenne_passage: 6, seuil_condition: 5 } });
  assert.equal(ok.status, 200); assert.equal(ok.json.rules.moyenne_passage, 6);
  assert.ok((await db.all("SELECT * FROM audit_log WHERE action = 'bulletin.rules'")).length >= 1);
  assert.equal((await call('dirB', 'GET', '/api/bulletins/regles')).json.rules.moyenne_passage, 5, 'règles propres à chaque école');
  assert.equal((await call('direction', 'PUT', '/api/bulletins/regles', { reset: true })).json.rules.moyenne_passage, 5);
});

test('tableau de classe : moyennes /10, points, rang ex aequo, mentions ; bilan annuel avec décisions', async () => {
  const r = await call('direction', 'GET', `/api/bulletins/classes/${cls.id}?term_id=${terms[0].id}`);
  assert.equal(r.status, 200); assert.equal(r.json.mode, 'notes');
  const byId = Object.fromEntries(r.json.students.map((s) => [s.id, s]));
  const a = byId[students[0].id], b = byId[students[1].id], c = byId[students[2].id];
  assert.equal(a.average, 8); assert.equal(a.rank, 1); assert.equal(b.rank, 1); assert.ok(a.ex_aequo);
  assert.equal(a.mention, 'Très bien'); assert.equal(c.average, 4.7); assert.equal(c.rank, 3);
  const fr = a.subjects.find((s) => s.name === 'Français');
  assert.equal(fr.points, 8 * fr.coefficient); assert.equal(fr.max, 10 * fr.coefficient);
  assert.equal(r.json.stats.plus_forte, 8);
  const y = await call('direction', 'GET', `/api/bulletins/classes/${cls.id}?term_id=annuel`);
  const ya = Object.fromEntries(y.json.students.map((s) => [s.id, s]));
  assert.equal(ya[students[0].id].decision.code, 'admis');
  assert.equal(ya[students[2].id].decision.code, 'admis_sous_condition');
  assert.equal(ya[students[3].id].decision.code, 'redouble');
  assert.equal((await call('dirB', 'GET', `/api/bulletins/classes/${cls.id}`)).status, 404, 'autre école');
  assert.equal((await call('parent1', 'GET', `/api/bulletins/classes/${cls.id}`)).status, 403);
  assert.equal((await call('direction', 'GET', `/api/bulletins/classes/${cls.id}?term_id=999999`)).status, 400);
});

test('PDF de classe : un bulletin par élève, en-tête et signatures ; réservé direction / secrétariat', async () => {
  const r = await call('secretariat', 'GET', `/api/bulletins/classes/${cls.id}/pdf?term_id=annuel`);
  assert.equal(r.status, 200); assert.ok(r.type.includes('pdf'));
  const s = r.buf.toString('latin1');
  assert.ok(s.startsWith('%PDF')); assert.equal((s.match(/\/Type\s*\/Page\b/g) || []).length, students.length);
  assert.equal((await call('prof1', 'GET', `/api/bulletins/classes/${cls.id}/pdf`)).status, 403);
  const one = await call('direction', 'GET', `/api/bulletins/classes/${cls.id}/pdf?term_id=${terms[0].id}&student_id=${students[0].id}`);
  assert.equal((one.buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
});

test('bulletin émis : rang et mention figés dans le bulletin vérifiable', async () => {
  const r = await call('direction', 'POST', '/api/report-cards', { student_id: students[0].id, term_id: terms[0].id });
  assert.equal(r.status, 200);
  const snap = JSON.parse((await db.get('SELECT snapshot FROM report_card WHERE id = ?', r.json.id)).snapshot);
  assert.equal(snap.menfp.rank, 1); assert.equal(snap.menfp.mention, 'Très bien'); assert.equal(snap.menfp.echelle, 10);
  assert.equal((await call('direction', 'GET', `/api/report-cards/${r.json.id}/pdf`)).status, 200);
});

test('préscolaire : appréciations sans note, refusées hors préscolaire, valeurs contrôlées', async () => {
  const campus = (await db.get('SELECT campus_id FROM class WHERE id = ?', cls.id)).campus_id;
  const lv = await db.insert('INSERT INTO level (school_id, name, cycle, position) VALUES (?,?,?,?)', sa, 'Préscolaire 3', 'prescolaire', 5);
  const pc = await db.insert('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', sa, 'Préscolaire 3 A', cls.school_year_id, lv, campus);
  const kid = await db.insert('INSERT INTO student (school_id, code, first_name, last_name) VALUES (?,?,?,?)', sa, 'PS3-001', 'Nadège', 'Pierre');
  await db.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', sa, kid, pc, 'test');
  const items = [{ domain: 'Langage et communication', level: 'Acquis' }, { domain: 'Motricité', level: "En voie d'acquisition", comment: 'Progrès réguliers' }];
  assert.equal((await call('direction', 'POST', '/api/bulletins/appreciations', { student_id: kid, term_id: terms[0].id, items })).status, 200);
  assert.equal((await call('direction', 'POST', '/api/bulletins/appreciations', { student_id: kid, term_id: terms[0].id, items: [{ domain: 'Motricité', level: '9/10' }] })).status, 400);
  assert.equal((await call('direction', 'POST', '/api/bulletins/appreciations', { student_id: students[0].id, term_id: terms[0].id, items })).status, 409);
  assert.equal((await call('parent1', 'POST', '/api/bulletins/appreciations', { student_id: kid, term_id: terms[0].id, items })).status, 403);
  // Mise à jour (pas de doublon, rien supprimé)
  await call('direction', 'POST', '/api/bulletins/appreciations', { student_id: kid, term_id: terms[0].id, items: [{ domain: 'Motricité', level: 'Acquis' }] });
  const t = await call('direction', 'GET', `/api/bulletins/classes/${pc}?term_id=${terms[0].id}`);
  assert.equal(t.json.mode, 'appreciations');
  const k = t.json.students.find((s) => s.id === kid);
  assert.equal(k.appreciations.length, 2); assert.equal(k.appreciations.find((x) => x.domain === 'Motricité').level, 'Acquis');
  assert.equal(k.average, undefined, 'aucune moyenne chiffrée');
  assert.equal((await call('direction', 'GET', `/api/bulletins/classes/${pc}/pdf?term_id=${terms[0].id}`)).status, 200);
});
