'use strict';
// Bibliothèque (catalogue, prêts, retours, retards) et finances (frais, paiements MonCash/NatCash, reçus vérifiables, annulation).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { isbn, cents } = require('../src/gestion');
const { register, adapterFor } = require('../src/paiement-adaptateurs');

let db, server, base, ids; const tok = {};
async function call(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null, buf: type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : null };
}
const audits = (action) => db.all('SELECT * FROM audit_log WHERE action = ? ORDER BY id', action);

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  server = createServer(db, { publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 50 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, sch, h] of [['direction', 'a', 'direction'], ['secretariat', 'a', 'secretariat'], ['prof1', 'a', 'prof1'], ['parent1', 'a', 'parent1'],
    ['parent2', 'a', 'parent2'], ['eleve1', 'a', 'eleve1'], ['compta', 'a', 'compta'], ['biblio', 'a', 'biblio'], ['dirB', 'b', 'direction']]) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
});
after(async () => { server.close(); await db.cleanup(); });

test('ISBN et montants : validation', () => {
  assert.equal(isbn(''), null); assert.equal(isbn('978-0-306-40615-7'), '9780306406157'); assert.equal(isbn('0-306-40615-2'), '0306406152');
  assert.throws(() => isbn('9780306406158'), /ISBN/); assert.throws(() => isbn('12345'), /ISBN/);
  assert.equal(cents('1500'), 150000); assert.equal(cents('12,5'), 1250);
  for (const v of ['0', '-3', 'abc', '1.234']) assert.throws(() => cents(v), /montant/);
});

let book;
test('catalogue : direction et secrétariat gèrent ; les autres lisent ; cloisonné par école', async () => {
  const r = await call('secretariat', 'POST', '/api/books', { title: 'Lekti fiktif', author: 'Otè fiktif', isbn: '978-0-306-40615-7', copies: 1 });
  assert.equal(r.status, 200); book = r.json.id;
  assert.equal((await call('direction', 'POST', '/api/books', { title: 'Sans ISBN (fictif)', author: 'X', copies: 2 })).status, 200);
  assert.equal((await call('direction', 'POST', '/api/books', { title: 'Mauvais', author: 'X', isbn: '123' })).status, 400);
  assert.equal((await call('direction', 'POST', '/api/books', { title: '', author: 'X' })).status, 400);
  for (const who of ['prof1', 'parent1', 'eleve1', 'compta']) assert.equal((await call(who, 'POST', '/api/books', { title: 'x', author: 'y' })).status, 403, who);
  assert.ok((await audits('book.create')).some((a) => a.outcome === 'refuse'));
  const list = (await call('eleve1', 'GET', '/api/books')).json;
  assert.ok(list.find((b) => b.id === book && b.available === 1 && b.isbn === '9780306406157'));
  assert.ok(!(await call('dirB', 'GET', '/api/books')).json.some((b) => b.id === book));
  assert.equal((await call('dirB', 'PATCH', `/api/books/${book}`, { copies: 5 })).status, 404);
  assert.equal((await call('eleve1', 'GET', '/api/books?q=lekti')).json.length, 1);
  const bw = await call('biblio', 'GET', '/api/library/borrowers');
  assert.equal(bw.status, 200); assert.deepEqual(Object.keys(bw.json[0]).sort(), ['code', 'first_name', 'id', 'last_name']);
  assert.equal((await call('parent1', 'GET', '/api/library/borrowers')).status, 403);
});

let loan1;
test('prêts : disponibilité, échéance par défaut, retard, retour, périmètres élève et parent', async () => {
  const [s1, s2] = ids.A.students;
  const ok = await call('direction', 'POST', '/api/loans', { book_id: book, student_id: s1, loaned_on: '2026-09-01', due_on: '2026-09-15' });
  assert.equal(ok.status, 200); loan1 = ok.json.id;
  assert.equal((await call('direction', 'POST', '/api/loans', { book_id: book, student_id: s2 })).status, 409, 'aucun exemplaire');
  assert.equal((await call('direction', 'PATCH', `/api/books/${book}`, { copies: 0 })).status, 409, 'exemplaire en prêt');
  assert.equal((await call('parent1', 'POST', '/api/loans', { book_id: book, student_id: s1 })).status, 403);
  assert.equal((await call('dirB', 'POST', '/api/loans', { book_id: book, student_id: s1 })).status, 404);
  const other = await call('secretariat', 'POST', '/api/loans', { book_id: ids.A.books[0], student_id: s2 });
  assert.equal(other.status, 200); assert.match(other.json.due_on, /^\d{4}-\d{2}-\d{2}$/);
  const late = (await call('direction', 'GET', '/api/loans?status=retard')).json;
  assert.deepEqual(late.map((l) => l.id), [loan1]); assert.ok(late[0].late && late[0].days_late > 0);
  // Élève : ses prêts seulement ; parent : ceux de ses enfants.
  assert.deepEqual((await call('eleve1', 'GET', '/api/loans')).json.map((l) => l.id), [loan1]);
  assert.deepEqual((await call('parent1', 'GET', '/api/loans')).json.map((l) => l.id), [loan1]);
  assert.deepEqual((await call('parent2', 'GET', '/api/loans')).json.map((l) => l.id), [other.json.id]);
  assert.equal((await call('parent1', 'GET', `/api/loans?student_id=${s2}`)).json.length, 0);
  assert.equal((await call('prof1', 'GET', '/api/loans')).status, 403);
  // Retour en retard : journalisé, l'exemplaire redevient disponible.
  assert.equal((await call('eleve1', 'POST', `/api/loans/${loan1}/retour`)).status, 403);
  const back = await call('direction', 'POST', `/api/loans/${loan1}/retour`);
  assert.equal(back.status, 200); assert.equal(back.json.late, true);
  assert.equal((await call('direction', 'POST', `/api/loans/${loan1}/retour`)).status, 409);
  assert.match((await audits('loan.return')).at(-1).reason, /retard/);
  assert.equal((await call('direction', 'GET', '/api/books')).json.find((b) => b.id === book).available, 1);
  const all = (await call('eleve1', 'GET', '/api/loans?status=tous')).json;
  assert.ok(all[0].returned_late);
});

let pay1, pay2, code1;
test('paiements : modes, référence obligatoire et unique, numéros séquentiels par école', async () => {
  const [s1, s2] = ids.A.students;
  assert.equal((await call('compta', 'POST', '/api/fees', { student_id: s1, label: 'Scolarité T1 (fictif)', amount_htg: 5000, due_on: '2026-10-31' })).status, 200);
  assert.equal((await call('parent1', 'POST', '/api/fees', { student_id: s1, label: 'x', amount_htg: 1 })).status, 403);
  const a = await call('compta', 'POST', '/api/payments', { student_id: s1, amount_htg: 2500, method: 'moncash', reference: 'mc 8812 3456' });
  assert.equal(a.status, 200); pay1 = a.json.id; code1 = a.json.code;
  assert.equal(a.json.number, 'R-000001');
  assert.equal((await call('compta', 'POST', '/api/payments', { student_id: s1, amount_htg: 10, method: 'moncash', reference: 'MC88123456' })).status, 409, 'référence déjà saisie');
  assert.equal((await call('compta', 'POST', '/api/payments', { student_id: s1, amount_htg: 10, method: 'natcash' })).status, 400, 'référence obligatoire');
  assert.equal((await call('compta', 'POST', '/api/payments', { student_id: s1, amount_htg: 10, method: 'carte' })).status, 400);
  assert.equal((await call('compta', 'POST', '/api/payments', { student_id: s1, amount_htg: 0, method: 'especes' })).status, 400);
  const b = await call('direction', 'POST', '/api/payments', { student_id: s2, amount_htg: '750,50', method: 'especes' });
  assert.equal(b.json.number, 'R-000002'); pay2 = b.json.id;
  assert.equal((await call('direction', 'POST', '/api/payments', { student_id: s1, amount_htg: 100, method: 'natcash', reference: 'NC-77001' })).json.number, 'R-000003');
  // Autre école : sa propre séquence.
  assert.equal((await call('dirB', 'POST', '/api/payments', { student_id: ids.B.students[0], amount_htg: 100, method: 'virement', reference: 'BNC-1' })).json.number, 'R-000001');
  assert.equal((await call('dirB', 'POST', '/api/payments', { student_id: s1, amount_htg: 100, method: 'especes' })).status, 404);
  for (const who of ['secretariat', 'prof1', 'parent1', 'eleve1', 'biblio']) assert.equal((await call(who, 'POST', '/api/payments', { student_id: s1, amount_htg: 1, method: 'especes' })).status, 403, who);
});

test('solde et reçus : le parent voit ses enfants seulement ; PDF avec QR vérifiable publiquement', async () => {
  const [s1, s2] = ids.A.students;
  const acc = (await call('parent1', 'GET', `/api/students/${s1}/account`)).json;
  assert.equal(acc.due_htg, 6000); assert.equal(acc.paid_htg, 2600); assert.equal(acc.balance_htg, 3400);
  assert.equal(acc.payments.length, 2);
  assert.equal((await call('parent1', 'GET', `/api/students/${s2}/account`)).status, 404);
  assert.equal((await call('eleve1', 'GET', `/api/students/${s1}/account`)).status, 403);
  assert.equal((await call('parent2', 'GET', `/api/payments/${pay1}/pdf`)).status, 404);
  const pdf = await call('parent1', 'GET', `/api/payments/${pay1}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.buf.slice(0, 5).toString(), '%PDF-'); assert.ok(pdf.buf.length < 12000, `reçu léger (${pdf.buf.length} o)`);
  const v = await call(null, 'GET', `/api/verifier/${code1}`);
  assert.equal(v.status, 200); assert.equal(v.json.type, 'recu'); assert.equal(v.json.statut, 'valide'); assert.equal(v.json.montant, '2500.00 HTG');
  assert.equal(v.json.eleve, 'Ana F.'); assert.equal(v.json.numero, 'R-000001');
  const ov = (await call('compta', 'GET', '/api/finance/overview')).json;
  assert.ok(ov.students.length === 2 && ov.recent.length === 3);
  assert.equal((await call('parent1', 'GET', '/api/finance/overview')).status, 403);
});

test('annulation : motif obligatoire, direction seulement, reçu conservé et marqué annulé', async () => {
  assert.equal((await call('compta', 'POST', `/api/payments/${pay1}/annuler`, { reason: 'erreur' })).status, 403);
  assert.equal((await call('direction', 'POST', `/api/payments/${pay1}/annuler`, {})).status, 400);
  assert.equal((await call('direction', 'POST', `/api/payments/${pay1}/annuler`, { reason: 'Référence MonCash erronée (fictif)' })).status, 200);
  assert.equal((await call('direction', 'POST', `/api/payments/${pay1}/annuler`, { reason: 'encore' })).status, 404);
  const acc = (await call('parent1', 'GET', `/api/students/${ids.A.students[0]}/account`)).json;
  assert.equal(acc.paid_htg, 100); assert.equal(acc.payments.length, 2, 'le reçu annulé reste listé');
  assert.ok(acc.payments.find((p) => p.id === pay1).cancelled_at);
  assert.equal((await call('parent1', 'GET', `/api/payments/${pay1}/pdf`)).status, 200);
  const v = (await call(null, 'GET', `/api/verifier/${code1}`)).json;
  assert.equal(v.statut, 'annule'); assert.match(v.motif, /MonCash/);
  // Dans la base : ni suppression ni modification du montant, même sans passer par l'API.
  await assert.rejects(db.run('DELETE FROM payment WHERE id = ?', pay2), /suppression interdite/);
  await assert.rejects(db.run('UPDATE payment SET amount_cents = 1 WHERE id = ?', pay2), /reçu figé/);
  await assert.rejects(db.run("UPDATE payment SET cancel_reason = 'x' WHERE id = ?", pay1), /reçu figé/);
  assert.equal((await audits('payment.cancel')).filter((a) => a.outcome === 'ok').length, 1);
});

test('adaptateur de paiement : interface prête pour MonCash, saisie manuelle par défaut', async () => {
  assert.equal(adapterFor('moncash').id, 'manuel');
  assert.deepEqual(await adapterFor('moncash').verify({ method: 'moncash', reference: 'X' }), { status: 'non_verifie' });
  assert.throws(() => register({ id: 'x' }), /invalide/);
  assert.throws(() => adapterFor('especes', 'inconnu'), /inconnu/);
});
