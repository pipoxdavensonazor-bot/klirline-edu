'use strict';
// Cœur scolaire : notes (saisie → soumission → publication → familles), moyennes, bulletins vérifiables,
// annonces et calendrier par audience, invitations depuis l'interface.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base, ids; const tok = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, json: type.includes('json') ? await res.json() : null, buf: type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : null };
}
let seq = 0;
const op = (o) => ({ op_id: `op-sco-${++seq}-${Date.now()}`, base_version: 0, ...o });
const grades = (who, ops) => call(who, 'POST', '/api/grades/sync', { ops });

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 5 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['prof2', 'a', 'prof2'], ['parent1', 'a', 'parent1'],
    ['parent2', 'a', 'parent2'], ['eleve1', 'a', 'eleve1'], ['compta', 'a', 'compta'], ['dirB', 'b', 'direction'], ['parentB', 'b', 'parent1']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
});
after(async () => { server.close(); await db.cleanup(); });

let evMath, evMath2, evFr;
test('évaluations : l’enseignant crée pour ses classes et matières seulement, dans la période', async () => {
  const [c1, c2] = ids.A.classes; const T1 = ids.A.terms[0]; const S = ids.A.subjects;
  const ok = await call('prof1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.maths, term_id: T1, title: 'Interrogation fractions (fictive)', day: '2026-10-05', max_score: 20, coefficient: 1 });
  assert.equal(ok.status, 200); evMath = ok.json.id;
  evMath2 = (await call('prof1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.maths, term_id: T1, title: 'Devoir (fictif)', day: '2026-10-12', max_score: 10, coefficient: 2 })).json.id;
  evFr = (await call('prof1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.francais, term_id: T1, title: 'Dictée (fictive)', day: '2026-10-08', max_score: 10 })).json.id;
  assert.equal((await call('prof1', 'POST', '/api/evaluations', { class_id: c2, subject_id: S.maths, term_id: T1, title: 'x', day: '2026-10-05' })).status, 403);
  assert.equal((await call('prof1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.sciences, term_id: T1, title: 'x', day: '2026-10-05' })).status, 403);
  assert.equal((await call('prof1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.maths, term_id: T1, title: 'x', day: '2027-02-01' })).status, 400);
  assert.equal((await call('parent1', 'POST', '/api/evaluations', { class_id: c1, subject_id: S.maths, term_id: T1, title: 'x', day: '2026-10-05' })).status, 403);
  assert.equal((await call('dirB', 'GET', `/api/evaluations?class_id=${c1}`)).status, 404);
  assert.equal((await call('prof2', 'GET', `/api/evaluations/${evMath}`)).status, 404);
});

test('parcours : saisie enseignant → soumission → publication direction → le parent voit', async () => {
  const s1 = ids.A.students[0];
  const r = await grades('prof1', [op({ evaluation_id: evMath, student_id: s1, score: 15 }), op({ evaluation_id: evMath2, student_id: s1, score: 6 }), op({ evaluation_id: evFr, student_id: s1, mention: 'absent' })]);
  assert.deepEqual(r.json.results.map((x) => x.result), ['applique', 'applique', 'applique']);
  assert.equal((await grades('prof1', [op({ evaluation_id: evMath, student_id: s1, score: 25 })])).json.results[0].result, 'refuse', 'note au-delà du barème');
  assert.equal((await grades('prof2', [op({ evaluation_id: evMath, student_id: s1, score: 1 })])).json.results[0].result, 'refuse');
  assert.equal((await grades('secretariat', [])).status, 403);
  // Avant publication : rien pour la famille.
  assert.deepEqual((await call('parent1', 'GET', `/api/students/${s1}/grades`)).json, []);
  assert.equal((await call('prof1', 'GET', `/api/students/${s1}/grades`)).json.length, 3);
  // Soumission : l'enseignant ne peut plus modifier ; seule la direction publie.
  for (const e of [evMath, evMath2, evFr]) assert.equal((await call('prof1', 'POST', `/api/evaluations/${e}/soumettre`)).status, 200);
  assert.equal((await grades('prof1', [op({ evaluation_id: evMath, student_id: s1, score: 16, base_version: 1 })])).json.results[0].result, 'refuse');
  assert.equal((await call('prof1', 'POST', `/api/evaluations/${evMath}/publier`)).status, 403);
  assert.equal((await call('secretariat', 'POST', `/api/evaluations/${evMath}/publier`)).status, 403);
  for (const e of [evMath, evMath2]) assert.equal((await call('direction', 'POST', `/api/evaluations/${e}/publier`)).status, 200);
  const seen = (await call('parent1', 'GET', `/api/students/${s1}/grades`)).json;
  assert.deepEqual(seen.map((g) => [g.title, g.score]).sort(), [['Devoir (fictif)', 6], ['Interrogation fractions (fictive)', 15]]);
  assert.equal((await call('eleve1', 'GET', `/api/students/${s1}/grades`)).json.length, 2);
  assert.equal((await call('parent2', 'GET', `/api/students/${s1}/grades`)).status, 404);
  assert.equal((await call('parentB', 'GET', `/api/students/${s1}/grades`)).status, 404);
  const pubLog = await db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'evaluation.publier'");
  assert.equal(pubLog.n, 2);
});

test('moyennes : notes publiées, ramenées sur 100, pondérées ; absence non comptée', async () => {
  const s1 = ids.A.students[0];
  // Maths : 15/20 → 75 (coef 1) ; 6/10 → 60 (coef 2) → (75 + 120) / 3 = 65. Français non publié : absent du calcul.
  const avg = (await call('parent1', 'GET', `/api/students/${s1}/averages?term_id=${ids.A.terms[0]}`)).json;
  assert.equal(avg.scale, 100);
  assert.deepEqual(avg.subjects.map((s) => [s.name, s.average]), [['Mathématiques', 65]]);
  assert.equal(avg.general, 65);
  assert.equal((await call('direction', 'POST', `/api/evaluations/${evFr}/publier`)).status, 200);
  const avg2 = (await call('direction', 'GET', `/api/students/${s1}/averages?term_id=${ids.A.terms[0]}`)).json;
  assert.deepEqual(avg2.subjects.map((s) => [s.name, s.average, s.count]).sort(), [['Français', null, 0], ['Mathématiques', 65, 2]]);
  assert.equal(avg2.general, 65, 'la matière sans note ne pèse pas');
});

test('note publiée : correction direction avec motif, historique ; idempotence et conflit', async () => {
  const s1 = ids.A.students[0];
  assert.match((await grades('direction', [op({ evaluation_id: evMath, student_id: s1, score: 16, base_version: 1 })])).json.results[0].error, /motif/);
  const o = op({ evaluation_id: evMath, student_id: s1, score: 16, base_version: 1, reason: 'Erreur de report (fictif)' });
  assert.equal((await grades('direction', [o])).json.results[0].version, 2);
  assert.equal((await grades('direction', [o])).json.results[0].deja, true);
  const c = await grades('direction', [op({ evaluation_id: evMath, student_id: s1, score: 12, base_version: 1, reason: 'autre appareil' })]);
  assert.equal(c.json.results[0].result, 'conflit'); assert.equal(c.json.results[0].score, 16);
  assert.equal((await call('direction', 'GET', '/api/grades/conflicts')).json.length, 1);
  const h = await db.all('SELECT old_score, new_score, reason FROM grade_history WHERE school_id = ? ORDER BY id', ids.A.school);
  assert.deepEqual(h.find((x) => x.old_score === 15), { old_score: 15, new_score: 16, reason: 'Erreur de report (fictif)' });
  await assert.rejects(db.run('DELETE FROM grade_history'), /ajout seul/);
  // Réouverture : motif obligatoire, l'évaluation disparaît pour la famille.
  assert.equal((await call('direction', 'POST', `/api/evaluations/${evMath2}/rouvrir`, {})).status, 400);
  assert.equal((await call('direction', 'POST', `/api/evaluations/${evMath2}/rouvrir`, { reason: 'Barème à revoir (fictif)' })).status, 200);
  assert.equal((await call('parent1', 'GET', `/api/students/${s1}/grades`)).json.length, 2);
});

test('bulletin : émis par le secrétariat, PDF léger, QR vérifiable publiquement sans détails, remplacement annule l’ancien', async () => {
  const s1 = ids.A.students[0]; const T1 = ids.A.terms[0];
  assert.equal((await call('prof1', 'POST', '/api/report-cards', { student_id: s1, term_id: T1 })).status, 403);
  assert.equal((await call('secretariat', 'POST', '/api/report-cards', { student_id: ids.A.students[1], term_id: T1 })).status, 409, 'pas de note publiée');
  const r = await call('secretariat', 'POST', '/api/report-cards', { student_id: s1, term_id: T1 });
  assert.equal(r.status, 200);
  assert.match(r.json.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(r.json.verifyUrl, /^https:\/\/noria\.exemple\.invalid\/#verifier=[A-Z2-9]{12}$/);
  const pdf = await call('parent1', 'GET', `/api/report-cards/${r.json.id}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.buf.length < 12000, `PDF léger (${pdf.buf.length} o)`);
  assert.equal((await call('parent2', 'GET', `/api/report-cards/${r.json.id}/pdf`)).status, 404);
  assert.equal((await call('dirB', 'GET', `/api/report-cards/${r.json.id}/pdf`)).status, 404);
  // Vérification publique : école, élève (prénom + initiale), période, date ; ni notes, ni moyenne, ni code élève.
  const v = await call(null, 'GET', `/api/verifier/${r.json.code}`);
  assert.equal(v.status, 200);
  assert.deepEqual(Object.keys(v.json).filter((k) => v.json[k] !== undefined).sort(), ['authentique', 'ecole', 'eleve', 'emis_le', 'periode', 'statut', 'type']);
  assert.deepEqual([v.json.ecole, v.json.eleve, v.json.periode, v.json.statut], ['École fictive A', 'Ana F.', 'Trimestre 1 2026-2027', 'valide']);
  // Nouveau bulletin pour la même période : l'ancien code devient « annulé ».
  const r2 = await call('direction', 'POST', '/api/report-cards', { student_id: s1, term_id: T1 });
  assert.equal((await call(null, 'GET', `/api/verifier/${r.json.code}`)).json.statut, 'annule');
  assert.equal((await call(null, 'GET', `/api/verifier/${r2.json.code}`)).json.statut, 'valide');
  assert.equal((await call('parent1', 'GET', `/api/report-cards/${r.json.id}/pdf`)).status, 410);
  assert.equal((await call('parent1', 'GET', `/api/report-cards?student_id=${s1}`)).json.length, 2);
  // Code inconnu : 404 ; essais répétés : bloqués.
  assert.equal((await call(null, 'GET', '/api/verifier/AAAA-BBBB-CCCC')).status, 404);
  for (let i = 0; i < 5; i++) await call(null, 'GET', '/api/verifier/ZZZZ-ZZZZ-ZZZZ');
  assert.equal((await call(null, 'GET', `/api/verifier/${r2.json.code}`)).status, 429);
});

test('annonces et calendrier : chacun ne voit que son audience', async () => {
  const [c1, c2] = ids.A.classes;
  const post = (who, audience, extra = {}) => call(who, 'POST', '/api/announcements', { title: `Annonce ${audience}${extra.class_id || ''} (fictive)`, body: 'Texte fictif.', audience, ...extra });
  for (const [a, x] of [['ecole', {}], ['parents', {}], ['enseignants', {}], ['classe', { class_id: c1 }]]) assert.equal((await post('direction', a, x)).status, 200);
  assert.equal((await post('prof2', 'classe', { class_id: c2 })).status, 200);
  assert.equal((await post('prof1', 'parents')).status, 403);
  assert.equal((await post('prof1', 'classe', { class_id: c2 })).status, 403);
  assert.equal((await post('parent1', 'ecole')).status, 403);
  assert.equal((await post('direction', 'classe')).status, 400);
  assert.equal((await post('dirB', 'classe', { class_id: c1 })).status, 404);
  const seen = async (who) => (await call(who, 'GET', '/api/announcements')).json.map((a) => a.title.replace(/^Annonce | \(fictive\)$/g, '')).sort();
  assert.deepEqual(await seen('parent1'), ['classe' + c1, 'ecole', 'parents'].sort());
  assert.deepEqual(await seen('parent2'), ['classe' + c2, 'ecole', 'parents'].sort());
  assert.deepEqual(await seen('prof1'), ['classe' + c1, 'ecole', 'enseignants'].sort());
  assert.deepEqual(await seen('prof2'), ['classe' + c2, 'ecole', 'enseignants'].sort());
  assert.deepEqual(await seen('eleve1'), ['classe' + c1, 'ecole'].sort());
  assert.deepEqual(await seen('compta'), ['ecole']);
  assert.equal((await seen('direction')).length, 5);
  assert.deepEqual(await seen('dirB'), []);
  // Calendrier : même règle.
  assert.equal((await call('direction', 'POST', '/api/events', { title: 'Réunion parents (fictive)', starts_on: '2026-11-05', audience: 'parents' })).status, 200);
  assert.equal((await call('direction', 'POST', '/api/events', { title: 'Conseil de classe (fictif)', starts_on: '2026-12-10', audience: 'enseignants' })).status, 200);
  assert.equal((await call('direction', 'POST', '/api/events', { title: 'x', starts_on: '2026-12-10', ends_on: '2026-12-01', audience: 'ecole' })).status, 400);
  assert.deepEqual((await call('parent1', 'GET', '/api/events')).json.map((e) => e.title), ['Réunion parents (fictive)']);
  assert.deepEqual((await call('prof1', 'GET', '/api/events')).json.map((e) => e.title), ['Conseil de classe (fictif)']);
});

test('invitations depuis l’interface : lien copiable, liste, annulation', async () => {
  const r = await call('secretariat', 'POST', '/api/invitations', { display_name: 'Parent invité (fictif)', phone: '+509 0000 0177', role: 'parent', student_id: ids.A.students[1] });
  assert.equal(r.status, 200); assert.match(r.json.link, /^\/#invitation=[\w-]{40,}$/); assert.equal(r.json.envoi, 'simulé'); assert.equal(r.json.channel, 'sms');
  const list = (await call('secretariat', 'GET', '/api/invitations')).json;
  assert.ok(list.some((i) => i.id === r.json.id && i.phone === '+50900000177'));
  assert.ok(list.every((i) => !('token_hash' in i)), 'jamais l’empreinte du jeton');
  assert.equal((await call('prof1', 'GET', '/api/invitations')).status, 403);
  assert.equal((await call('secretariat', 'POST', `/api/invitations/${r.json.id}/annuler`)).status, 200);
  const token = r.json.link.split('=')[1];
  assert.equal((await call(null, 'POST', '/api/invitations/accept', { token, password: 'mot-de-passe-fictif' })).status, 400);
});

test('RLS : les tables scolaires sont cloisonnées par école dans la base', { skip: !process.env.NORIA_TEST_PG && 'NORIA_TEST_PG non défini' }, async () => {
  const tables = ['term', 'evaluation', 'grade', 'grade_history', 'grade_conflict', 'report_card', 'announcement', 'school_event'];
  const totalA = {};
  await db.asSchool(ids.A.school, async (t) => { for (const x of tables) totalA[x] = (await t.get(`SELECT COUNT(*) AS n FROM ${x}`)).n; });
  assert.ok(totalA.grade > 0 && totalA.report_card > 0 && totalA.announcement > 0);
  await db.asSchool(ids.B.school, async (t) => {
    for (const x of tables) assert.equal((await t.get(`SELECT COUNT(*) AS n FROM ${x} WHERE school_id = ?`, ids.A.school)).n, 0, x);
    await assert.rejects(t.run("INSERT INTO announcement (school_id, title, body, audience, created_by) VALUES (?, 'x', 'x', 'ecole', 1)", ids.A.school));
  });
});
