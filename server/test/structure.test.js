'use strict';
// Lot 0 (structure de l'école : assistant, années, niveaux, classes, périodes, matières, affectations) et
// lot 1 (tableau de bord et rapports réels, par rôle, sans donnée de démonstration).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { template, defaultYearLabel } = require('../src/structure');

let db, server, base; const tok = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null };
}
const audits = (action) => db.all('SELECT * FROM audit_log WHERE action = ? ORDER BY id', action);

before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 80 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['parent1', 'a', 'parent1'],
    ['eleve1', 'a', 'eleve1'], ['compta', 'a', 'compta'], ['biblio', 'a', 'biblio'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
});
after(async () => { server.close(); await db.cleanup(); });

test('modèle haïtien : fondamental 1re–9e AF, NS1–NS4, trois trimestres', () => {
  const m = template('2026-2027');
  const names = m.cycles.flatMap((c) => c.levels.map((l) => l.name));
  for (const n of ['1re AF', '6e AF', '9e AF', 'NS1', 'NS4']) assert.ok(names.includes(n), n);
  assert.equal(m.terms.length, 3);
  assert.equal(m.terms[0].starts_on, '2026-09-01');
  assert.ok(m.cycles.find((c) => c.id === 'secondaire').levels.find((l) => l.name === 'NS4').subjects.includes('Philosophie'));
  assert.equal(defaultYearLabel(new Date('2026-10-17T12:00:00Z')), '2026-2027');
  assert.equal(defaultYearLabel(new Date('2027-03-01T12:00:00Z')), '2026-2027');
});

test('structure : lecture direction et secrétariat ; écriture direction seule (refus journalisé)', async () => {
  assert.equal((await call('direction', 'GET', '/api/structure')).status, 200);
  const s = await call('secretariat', 'GET', '/api/structure');
  assert.equal(s.status, 200); assert.equal(s.json.can_manage, false);
  for (const w of ['prof1', 'parent1', 'eleve1', 'compta', 'biblio']) assert.equal((await call(w, 'GET', '/api/structure')).status, 403, w);
  const before = (await audits('structure.write')).length;
  assert.equal((await call('secretariat', 'POST', '/api/structure/niveaux', { name: 'X' })).status, 403);
  assert.equal((await call('prof1', 'POST', '/api/structure/assistant', { year: '2030-2031' })).status, 403);
  assert.ok((await audits('structure.write')).length >= before + 2);
});

test('assistant : crée année, trimestres, niveaux, classes et matières ; relancé il ne duplique rien', async () => {
  const m = template('2030-2031');
  const lv = m.cycles.filter((c) => c.on).flatMap((c) => c.levels.map((l) => ({ name: l.name, cycle: c.fr, position: l.position })));
  const body = { year: '2030-2031', terms: m.terms, levels: lv,
    classes: [{ name: '1re AF A', level: '1re AF', room: 'Salle 1' }, { name: 'NS4 B', level: 'NS4' }],
    subjects: [{ name: 'Mathématiques', level: '1re AF', coefficient: 2 }, { name: 'Philosophie', level: 'NS4', coefficient: '1,5' }] };
  const r1 = await call('direction', 'POST', '/api/structure/assistant', body);
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.equal(r1.json.created.years, 1); assert.equal(r1.json.created.terms, 3); assert.equal(r1.json.created.classes, 2); assert.equal(r1.json.created.subjects, 2);
  const r2 = await call('direction', 'POST', '/api/structure/assistant', body);
  assert.deepEqual(r2.json.created, { years: 0, levels: 0, classes: 0, subjects: 0, terms: 0 });
  assert.equal(r2.json.existing.classes, 2);
  assert.equal((await audits('structure.assistant')).length, 2);
  // Niveau inconnu : rien n'est écrit (transaction).
  const bad = await call('direction', 'POST', '/api/structure/assistant', { year: '2031-2032', classes: [{ name: 'Z', level: 'Inexistant' }] });
  assert.equal(bad.status, 400);
  assert.equal(await db.get("SELECT id FROM school_year WHERE label = '2031-2032'"), undefined);
  // Format d'année refusé.
  assert.equal((await call('direction', 'POST', '/api/structure/assistant', { year: '2030-2032' })).status, 400);
  // L'autre école ne voit rien de tout cela.
  const b = await call('dirB', 'GET', '/api/structure');
  assert.ok(!b.json.years.some((y) => y.label === '2030-2031'));
});

test('classes : création, salle, nom unique, archivage refusé tant que des élèves sont inscrits', async () => {
  const st = (await call('direction', 'GET', '/api/structure')).json;
  const y = st.years.find((x) => x.label === '2030-2031');
  const lvl = st.levels.find((l) => l.name === '1re AF');
  const c = await call('direction', 'POST', '/api/structure/classes', { name: '1re AF C', level_id: lvl.id, school_year_id: y.id, room: 'B2' });
  assert.equal(c.status, 200);
  const dup = await call('direction', 'POST', '/api/structure/classes', { name: '1RE af c', level_id: lvl.id, school_year_id: y.id });
  assert.ok([400, 409].includes(dup.status), String(dup.status));
  assert.equal((await call('direction', 'PATCH', `/api/structure/classes/${c.json.id}`, { room: 'B3' })).json.room, 'B3');
  assert.equal((await call('direction', 'PATCH', `/api/structure/classes/${c.json.id}`, { archived: true })).status, 200);
  // Classe de l'année courante avec des élèves (seed) : archivage refusé.
  const cur = (await call('direction', 'GET', '/api/classes')).json[0];
  assert.equal((await call('direction', 'PATCH', `/api/structure/classes/${cur.id}`, { archived: true })).status, 409);
  // Classe d'une autre école : introuvable.
  assert.equal((await call('dirB', 'PATCH', `/api/structure/classes/${cur.id}`, { room: 'x' })).status, 404);
  // Saisie hostile.
  assert.equal((await call('direction', 'POST', '/api/structure/classes', { name: '<script>', level_id: lvl.id, school_year_id: y.id })).status, 400);
});

test('affectations : enseignant de l’école seulement, matière du bon niveau, sans doublon', async () => {
  const st = (await call('direction', 'GET', '/api/structure')).json;
  const teacher = st.teachers[0]; assert.ok(teacher, 'un enseignant dans le seed');
  const y = st.years.find((x) => x.label === '2030-2031');
  const cls = st.classes.find((c) => c.name === '1re AF A' && c.school_year_id === y.id);
  const subj = await db.get("SELECT id FROM subject WHERE school_year_id = ? AND name = 'Mathématiques'", y.id);
  const philo = await db.get("SELECT id FROM subject WHERE school_year_id = ? AND name = 'Philosophie'", y.id);
  const a = await call('direction', 'POST', '/api/structure/affectations', { teacher_user_id: teacher.id, class_id: cls.id, subject_id: subj.id });
  assert.equal(a.status, 200, JSON.stringify(a.json));
  assert.ok([400, 409].includes((await call('direction', 'POST', '/api/structure/affectations', { teacher_user_id: teacher.id, class_id: cls.id, subject_id: subj.id })).status));
  assert.equal((await call('direction', 'POST', '/api/structure/affectations', { teacher_user_id: teacher.id, class_id: cls.id, subject_id: philo.id })).status, 400);
  const dirB = await db.get("SELECT u.id FROM app_user u JOIN school s ON s.id = u.school_id WHERE s.slug = 'ecole-b' LIMIT 1");
  assert.equal((await call('direction', 'POST', '/api/structure/affectations', { teacher_user_id: dirB.id, class_id: cls.id })).status, 404);
  assert.equal((await call('direction', 'DELETE', `/api/structure/affectations/${a.json.id}`)).status, 200);
  assert.equal((await audits('structure.affectation.delete')).length, 1);
});

test('tableau de bord : périmètre par rôle, aucun chiffre inventé', async () => {
  const d = (await call('direction', 'GET', '/api/tableau-de-bord')).json;
  assert.ok(d.structure && d.finance && d.library && d.attendance);
  assert.equal(typeof d.structure.students, 'number');
  const p = (await call('prof1', 'GET', '/api/tableau-de-bord')).json;
  assert.equal(p.structure, undefined); assert.equal(p.finance, undefined); assert.ok(Array.isArray(p.classes));
  const c = (await call('compta', 'GET', '/api/tableau-de-bord')).json;
  assert.ok(c.finance); assert.equal(c.classes, undefined); assert.equal(c.library, undefined);
  const b = (await call('biblio', 'GET', '/api/tableau-de-bord')).json;
  assert.ok(b.library); assert.equal(b.finance, undefined);
  const par = (await call('parent1', 'GET', '/api/tableau-de-bord')).json;
  assert.ok(Array.isArray(par.kids) && par.kids.length >= 1); assert.equal(par.finance, undefined);
  assert.ok(par.kids.every((k) => typeof k.balance_htg === 'number'));
});

test('rapports : par rôle ; parent et élève refusés ; exports journalisés listés pour la direction', async () => {
  assert.equal((await call('parent1', 'GET', '/api/rapports')).status, 403);
  assert.equal((await call('eleve1', 'GET', '/api/rapports')).status, 403);
  await fetch(base + '/api/export/students', { headers: { authorization: `Bearer ${tok.direction}` } });
  const r = (await call('direction', 'GET', '/api/rapports?du=2020-01-01')).json;
  assert.equal(r.from, '2020-01-01'); assert.ok(Array.isArray(r.classes)); assert.ok(r.finance);
  assert.ok(r.exports.some((e) => e.action === 'export.students'));
  assert.deepEqual(r.can_export, { students: true, finance: true });
  const c = (await call('compta', 'GET', '/api/rapports')).json;
  assert.equal(c.classes, undefined); assert.ok(c.finance);
});
