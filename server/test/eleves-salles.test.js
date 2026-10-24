'use strict';
// Lot 2 (création manuelle d'élèves, changement de classe, responsables) et lot 6 (salles de cours : séances,
// ressources, mains levées, sondages) : rôles, cloisonnement entre écoles, journal.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let db, server, base; const tok = {}; const who = {};
async function call(w, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(w ? { authorization: `Bearer ${tok[w]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null, headers: res.headers, res };
}
const audits = (action) => db.all('SELECT * FROM audit_log WHERE action = ? ORDER BY id', action);

before(async () => {
  db = await openTestDb(); await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 200 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['prof2', 'a', 'prof2'], ['parent1', 'a', 'parent1'],
    ['eleve1', 'a', 'eleve1'], ['compta', 'a', 'compta'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    const j = await r.json(); tok[k] = j.token; who[k] = j.user || null;
  }
});
after(async () => { server.close(); await db.cleanup(); });

const schoolA = async () => (await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id;
const classesA = async () => db.all('SELECT id, name FROM class WHERE school_id = ? ORDER BY id', await schoolA());

test('lot 2 : la direction et le secrétariat créent un élève avec sa classe et ses responsables ; les autres sont refusés', async () => {
  const [c1] = await classesA();
  const body = { first_name: 'Rose-Marie', last_name: 'Fictive', birth_date: '2014-05-02', sex: 'F', class_id: c1.id, reason: 'inscription au guichet (fictif)',
    guardians: [{ name: 'Mère Fictive', relation: 'mere', phone: '3712 0001', can_pickup: true }, { name: 'Oncle Fictif', relation: 'tuteur', email: 'oncle@exemple.invalid' }] };
  for (const w of ['prof1', 'parent1', 'eleve1', 'compta']) assert.equal((await call(w, 'POST', '/api/students', body)).status, 403, w);
  const r = await call('direction', 'POST', '/api/students', body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.code, /\S/); assert.equal(r.json.class_id, c1.id); assert.equal(r.json.guardians.length, 2);
  assert.equal(r.json.guardians[0].is_primary, 1); assert.equal(r.json.guardians[0].phone, '+50937120001');
  const e = await db.get("SELECT class_id, status FROM enrollment WHERE student_id = ?", r.json.id);
  assert.equal(e.class_id, c1.id); assert.equal(e.status, 'actif');
  assert.ok((await audits('student.create')).some((a) => a.record_id === String(r.json.id)));
  // Doublon probable refusé sauf confirmation ; validation des champs.
  assert.equal((await call('secretariat', 'POST', '/api/students', body)).status, 409);
  assert.equal((await call('secretariat', 'POST', '/api/students', { ...body, confirm_duplicate: true, guardians: [] })).status, 200);
  assert.equal((await call('direction', 'POST', '/api/students', { ...body, first_name: '' })).status, 400);
  assert.equal((await call('direction', 'POST', '/api/students', { ...body, birth_date: '2014-13-40' })).status, 400);
  assert.equal((await call('direction', 'POST', '/api/students', { ...body, birth_date: null, guardians: [{ name: 'X Y', relation: 'cousin' }] })).status, 400);
  // Classe d'une autre école : refusée.
  const otherClass = await db.get("SELECT c.id FROM class c JOIN school s ON s.id = c.school_id WHERE s.slug = 'ecole-b' LIMIT 1");
  assert.equal((await call('direction', 'POST', '/api/students', { ...body, first_name: 'Autre', class_id: otherClass.id })).status, 400);
  // La liste des élèves contient le nouvel élève.
  assert.ok((await call('direction', 'GET', '/api/students')).json.some((s) => s.id === r.json.id));
});

test('lot 2 : changement de classe motivé, journalisé ; responsables modifiables par la direction seule', async () => {
  const [c1, c2] = await classesA();
  const st = (await call('direction', 'POST', '/api/students', { first_name: 'Jean', last_name: 'Changeclasse', class_id: c1.id })).json;
  assert.equal((await call('direction', 'PUT', `/api/students/${st.id}/classe`, { class_id: c2.id })).status, 400, 'motif obligatoire');
  assert.equal((await call('prof1', 'PUT', `/api/students/${st.id}/classe`, { class_id: c2.id, reason: 'essai' })).status, 403);
  const mv = await call('secretariat', 'PUT', `/api/students/${st.id}/classe`, { class_id: c2.id, reason: 'erreur de classe à l’inscription' });
  assert.equal(mv.status, 200); assert.equal(mv.json.changed, true);
  assert.equal((await db.get("SELECT class_id FROM enrollment WHERE student_id = ? AND status = 'actif'", st.id)).class_id, c2.id);
  assert.match((await audits('student.class')).pop().reason, /→/);
  assert.equal((await call('dirB', 'PUT', `/api/students/${st.id}/classe`, { class_id: c1.id, reason: 'autre école' })).status, 404, 'cloisonnement');
  // Responsables.
  const g1 = await call('direction', 'POST', `/api/students/${st.id}/tuteurs`, { name: 'Père Fictif', relation: 'pere', phone: '+509 3712 0002' });
  assert.equal(g1.status, 200, JSON.stringify(g1.json)); assert.equal(g1.json.is_primary, 1, 'premier responsable = principal');
  const g2 = await call('direction', 'POST', `/api/students/${st.id}/tuteurs`, { name: 'Grand-mère Fictive', relation: 'grand_parent', is_primary: true });
  assert.equal(g2.json.is_primary, 1);
  const list = (await call('secretariat', 'GET', `/api/students/${st.id}/tuteurs`)).json;
  assert.equal(list.filter((g) => g.is_primary).length, 1, 'un seul principal');
  assert.equal((await call('parent1', 'GET', `/api/students/${st.id}/tuteurs`)).status, 403);
  assert.equal((await call('dirB', 'GET', `/api/students/${st.id}/tuteurs`)).status, 404);
  assert.equal((await call('prof1', 'POST', `/api/students/${st.id}/tuteurs`, { name: 'X Y', relation: 'autre' })).status, 403);
  const p = await call('direction', 'PATCH', `/api/tuteurs/${g1.json.id}`, { phone: '', email: 'pere@exemple.invalid', can_pickup: true });
  assert.equal(p.status, 200); assert.equal(p.json.phone, null); assert.equal(p.json.can_pickup, 1);
  assert.equal((await call('dirB', 'PATCH', `/api/tuteurs/${g1.json.id}`, { name: 'Intrus' })).status, 404);
  assert.equal((await call('direction', 'DELETE', `/api/tuteurs/${g2.json.id}`, {})).status, 400, 'motif obligatoire');
  assert.equal((await call('direction', 'DELETE', `/api/tuteurs/${g2.json.id}`, { reason: 'erreur de saisie' })).status, 200);
  const after = (await call('direction', 'GET', `/api/students/${st.id}/tuteurs`)).json;
  assert.equal(after.length, 1); assert.equal(after[0].is_primary, 1, 'le principal est réattribué');
  for (const a of ['guardian.create', 'guardian.update', 'guardian.delete']) assert.ok((await audits(a)).length, a);
});

test('lot 6 : salle de cours — séance, ressources, PDF, mains levées, sondage ; rôles et cloisonnement', async () => {
  const sid = await schoolA();
  const ta = await db.get('SELECT ta.class_id, ta.teacher_user_id FROM teacher_assignment ta JOIN app_user u ON u.id = ta.teacher_user_id WHERE ta.school_id = ? AND u.email = ? LIMIT 1', sid, 'prof1@a.exemple.invalid');
  assert.ok(ta, 'prof1 a une classe');
  const body = { class_id: ta.class_id, title: 'Fractions — révision', subject: 'Mathématiques', agenda: '1. Rappel\n2. Exercices', starts_at: '2026-10-26T13:00:00Z', duration_min: 45, low_data: true };
  for (const w of ['parent1', 'eleve1', 'compta', 'secretariat']) assert.equal((await call(w, 'POST', '/api/salles', body)).status, 403, w);
  const s = await call('prof1', 'POST', '/api/salles', body);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  const id = s.json.session.id; assert.equal(s.json.session.teacher_user_id, ta.teacher_user_id); assert.equal(s.json.session.low_data, true); assert.equal(s.json.host, true);
  assert.equal((await call('prof1', 'POST', '/api/salles', { ...body, duration_min: 999 })).status, 400);
  // Ressources.
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/ressources`, { kind: 'lien', title: 'Khan', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/ressources`, { kind: 'lien', title: 'Exercices', url: 'https://fr.khanacademy.org/math' })).status, 200);
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/ressources`, { kind: 'formule', title: 'Somme', body: '\\frac{a}{b}+\\frac{c}{d}' })).status, 200);
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/ressources`, { kind: 'pdf', title: 'Faux', data: Buffer.from('<html>').toString('base64') })).status, 400);
  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  const rp = await call('prof1', 'POST', `/api/salles/${id}/ressources`, { kind: 'pdf', title: 'Fiche élève', data: pdf.toString('base64') });
  assert.equal(rp.status, 200);
  assert.equal((await call('eleve1', 'POST', `/api/salles/${id}/ressources`, { kind: 'texte', title: 'x', body: 'y' })).status, 403);
  // L'élève de la classe voit la séance et télécharge le PDF ; l'autre école non.
  const el = await db.get("SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id JOIN app_user u ON u.id = st.user_id WHERE u.email = 'eleve1@a.exemple.invalid' AND e.status = 'actif'");
  const visible = el && el.class_id === ta.class_id;
  const ve = await call('eleve1', 'GET', `/api/salles/${id}`);
  assert.equal(ve.status, visible ? 200 : 404);
  assert.equal((await call('dirB', 'GET', `/api/salles/${id}`)).status, 404);
  assert.equal((await call('direction', 'GET', `/api/salles/${id}`)).json.resources.length, 3);
  const f = await call('direction', 'GET', `/api/salles/${id}/ressources/${rp.json.id}/fichier?voir=1`);
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'application/pdf'); assert.equal(f.headers.get('content-disposition'), 'inline');
  // Mains levées : séance ouverte requise.
  assert.equal((await call('direction', 'POST', `/api/salles/${id}/main`, { raised: true })).status, 409);
  assert.equal((await call('prof1', 'PATCH', `/api/salles/${id}`, { status: 'ouverte' })).json.session.status, 'ouverte');
  const h = await call('direction', 'POST', `/api/salles/${id}/main`, { raised: true });
  assert.equal(h.json.my_hand, true);
  const hp = await call('prof1', 'GET', `/api/salles/${id}`);
  assert.equal(hp.json.hands.length, 1); assert.ok(hp.json.hands[0].name);
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/mains/baisser`, {})).json.hands.length, 0);
  // Sondage.
  assert.equal((await call('prof1', 'POST', `/api/salles/${id}/sondages`, { question: 'Compris ?', options: ['Oui'] })).status, 400);
  const po = await call('prof1', 'POST', `/api/salles/${id}/sondages`, { question: 'Avez-vous compris ?', options: ['Oui', 'Un peu', 'Non'] });
  const pid = po.json.polls[0].id;
  const v1 = await call('direction', 'POST', `/api/salles/${id}/sondages/${pid}/vote`, { choice: 1 });
  assert.equal(v1.status, 200); assert.equal(v1.json.polls[0].mine, 1); assert.deepEqual(v1.json.polls[0].counts, [0, 1, 0]);
  assert.equal((await call('direction', 'POST', `/api/salles/${id}/sondages/${pid}/vote`, { choice: 9 })).status, 400);
  await call('prof1', 'POST', `/api/salles/${id}/sondages/${pid}/fermer`, {});
  assert.equal((await call('direction', 'POST', `/api/salles/${id}/sondages/${pid}/vote`, { choice: 0 })).status, 409);
  // Liste et fin de séance.
  assert.ok((await call('prof1', 'GET', '/api/salles')).json.some((x) => x.id === id));
  assert.equal((await call('dirB', 'GET', '/api/salles')).json.some((x) => x.id === id), false);
  assert.equal((await call('prof1', 'PATCH', `/api/salles/${id}`, { status: 'terminee' })).json.session.status, 'terminee');
  assert.ok((await audits('salle.create')).length);
});
