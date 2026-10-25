'use strict';
// Facturation : formules, factures numérotées + PDF, paiements manuels avec référence, statuts calculés, rappels
// (e-mail via outbox + notification), essai gratuit, délai de grâce puis lecture seule douce — sans jamais rien supprimer.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const F = require('../src/facturation');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
let db, server, base, sa, sb, admin, dir, compta, prof; const sent = [];
async function call(token, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, json: type.includes('json') ? await res.json() : null, buf: type.includes('pdf') ? Buffer.from(await res.arrayBuffer()) : null };
}
async function schoolLogin(sch, h) {
  const r = await call(null, 'POST', '/api/login', { school: `ecole-${sch}`, identifier: `${h}@${sch}.exemple.invalid`, password: DEMO_PASSWORD });
  return r.json.token;
}
const past = (n) => F.addDays(F.today(), -n);

before(async () => {
  db = await openTestDb(); await seed(db);
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  server = createServer(db, { notifier, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  admin = (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
  dir = await schoolLogin('a', 'direction'); compta = await schoolLogin('a', 'secretariat'); prof = await schoolLogin('a', 'prof1');
  sa = Number((await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id);
  sb = Number((await db.get("SELECT id FROM school WHERE slug = 'ecole-b'")).id);
});
after(async () => { server.close(); await db.cleanup(); });

function pdfText(buf) { // flux FlateDecode → texte brut des opérateurs (assez pour vérifier les libellés)
  const zlib = require('zlib'); const raw = buf.toString('latin1'); let out = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { out += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* non compressé */ } }
  return Buffer.from(out, 'latin1').toString('latin1');
}

test('montants : saisie en unités → centimes, affichage', () => {
  assert.equal(F.cents('1500'), 150000); assert.equal(F.cents('12,5'), 1250); assert.throws(() => F.cents('-3')); assert.throws(() => F.cents('abc'));
  assert.equal(F.money(150000, 'HTG'), '1 500,00 HTG');
});

test('formules : création, validation, désactivation (jamais de suppression) ; réservé au super-admin', async () => {
  assert.equal((await call(dir, 'GET', '/api/admin/facturation/formules')).status, 401);
  assert.equal((await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'X', kind: 'mensuel', currency: 'HTG', amount: '1' })).status, 400);
  assert.equal((await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'Par élève', kind: 'par_eleve', currency: 'EUR', amount: '1' })).status, 400);
  const p = await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'Par élève HTG', kind: 'par_eleve', currency: 'HTG', amount: '500' });
  assert.equal(p.status, 200);
  const f = await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'Forfait USD', kind: 'forfait', currency: 'USD', amount: '300' });
  assert.equal((await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'Forfait USD', kind: 'forfait', currency: 'USD', amount: '1' })).status, 409);
  assert.equal((await call(admin, 'PATCH', `/api/admin/facturation/formules/${f.json.id}`, { active: false })).status, 200);
  const list = (await call(admin, 'GET', '/api/admin/facturation/formules')).json.plans;
  assert.equal(list.length, 2); assert.equal(list.find((x) => x.name === 'Forfait USD').active, false);
  await assert.rejects(db.run('DELETE FROM billing_plan WHERE id = ?', f.json.id).then(() => { throw new Error('suppression interdite'); }), /suppression interdite|permission|interdite/);
});

test('facture par élève : numéro NOR-AAAA-0001, montant = élèves actifs × prix, PDF, paiement partiel puis soldé', async () => {
  const plan = (await call(admin, 'GET', '/api/admin/facturation/formules')).json.plans.find((x) => x.kind === 'par_eleve');
  assert.equal((await call(admin, 'PUT', `/api/admin/facturation/ecoles/${sa}`, { plan_id: plan.id, grace_days: 15, billing_email: 'compta@a.exemple.invalid' })).status, 200);
  const n = Number((await db.get("SELECT COUNT(DISTINCT student_id) AS n FROM enrollment WHERE school_id = ? AND status = 'actif'", sa)).n);
  const inv = await call(admin, 'POST', '/api/admin/facturation/factures', { school_id: sa, periode: '2026-2027' });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  assert.match(inv.json.number, /^NOR-\d{4}-0001$/);
  assert.equal(inv.json.students, n); assert.equal(inv.json.ht_cents, n * 50000); assert.equal(inv.json.tax_cents, n * 5000); assert.equal(inv.json.amount_cents, n * 55000); assert.equal(inv.json.statut, 'a_payer');
  const inv2 = await call(admin, 'POST', '/api/admin/facturation/factures', { school_id: sa, students: 3 });
  assert.match(inv2.json.number, /-0002$/); assert.equal(inv2.json.amount_cents, 165000); assert.equal(inv2.json.tax_rate_bp, 1000);
  const pdf = await call(admin, 'GET', `/api/admin/facturation/factures/${inv.json.id}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  const txt = pdfText(pdf.buf);
  assert.match(txt, /Total HT/); assert.match(txt, /TCA 10 %/); assert.match(txt, /Total TTC/); assert.match(txt, /Mentions légales : à compléter/);
  // Paiement : méthode et référence obligatoires ; référence unique par méthode.
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'cheque', reference: 'ABC123' })).status, 400);
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'moncash', reference: '' })).status, 400);
  const p1 = await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'moncash', reference: 'MC-0001', amount: '1000' });
  assert.equal(p1.json.statut, 'a_payer'); assert.equal(p1.json.reste_cents, 65000);
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'moncash', reference: 'MC-0001', amount: '500' })).status, 409);
  const p2 = await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'natcash', reference: 'NC-77', amount: '650' });
  assert.equal(p2.json.statut, 'payee'); assert.equal(p2.json.payments.length, 2);
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv2.json.id}/paiements`, { method: 'especes', reference: 'REC-1' })).status, 409);
  // Paiements immuables.
  await assert.rejects(db.run('DELETE FROM billing_payment WHERE invoice_id = ?', inv2.json.id).then(() => { throw new Error('x'); }), /interdite|permission/);
  await assert.rejects(db.run('DELETE FROM billing_invoice WHERE id = ?', inv2.json.id).then(() => { throw new Error('x'); }), /interdite|permission/);
});

test('en retard (calculé), rappel e-mail + notification, puis lecture seule après la grâce ; données intactes', async () => {
  const inv = (await call(admin, 'GET', `/api/admin/facturation/factures?ecole=${sa}&statut=a_payer`)).json.invoices[0];
  await db.run('UPDATE billing_invoice SET issued_on = ?, due_on = ? WHERE id = ?', past(40), past(10), inv.id);
  assert.equal((await call(admin, 'GET', `/api/admin/facturation/factures/${inv.id}`)).json.statut, 'en_retard');
  sent.length = 0;
  const r = await call(admin, 'POST', `/api/admin/facturation/factures/${inv.id}/rappel`);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.ok(r.json.emails >= 1); assert.ok(r.json.notifications >= 1);
  assert.ok(sent.some((m) => m.to === 'compta@a.exemple.invalid' && /en retard/.test(m.subject || m.text)));
  assert.ok(await db.get("SELECT 1 AS x FROM notification WHERE school_id = ? AND kind = 'facturation.rappel'", sa));
  // Grâce de 15 jours non écoulée : écriture permise.
  assert.equal((await call(dir, 'POST', '/api/announcements', { title: 'Avant', body: 'ok', audience: 'ecole' })).status, 200);
  await db.run('UPDATE billing_invoice SET due_on = ? WHERE id = ?', past(20), inv.id);
  const ab = await call(dir, 'GET', '/api/abonnement');
  assert.equal(ab.status, 200); assert.equal(ab.json.read_only, true); assert.equal(ab.json.reason, 'facture_en_retard');
  const w = await call(dir, 'POST', '/api/announcements', { title: 'Après', body: 'refusé', audience: 'ecole' });
  assert.equal(w.status, 423); assert.match(w.json.error, /lecture seule/);
  assert.equal((await call(dir, 'GET', '/api/students')).status, 200, 'lecture permise');
  assert.equal((await call(dir, 'GET', `/api/abonnement/factures/${inv.id}/pdf`)).status, 200);
  assert.equal((await call(prof, 'GET', '/api/abonnement')).status, 403);
  // L'école B (sans abonnement) n'est pas concernée.
  const dirB = await schoolLogin('b', 'direction');
  assert.equal((await call(dirB, 'POST', '/api/announcements', { title: 'B', body: 'ok', audience: 'ecole' })).status, 200);
  // Mode « jamais » : levée manuelle ; paiement : levée automatique.
  await call(admin, 'PUT', `/api/admin/facturation/ecoles/${sa}`, { read_only_mode: 'jamais' });
  assert.equal((await call(dir, 'POST', '/api/announcements', { title: 'Dérogation', body: 'ok', audience: 'ecole' })).status, 200);
  await call(admin, 'PUT', `/api/admin/facturation/ecoles/${sa}`, { read_only_mode: 'auto' });
  assert.equal((await call(dir, 'POST', '/api/announcements', { title: 'x', body: 'x', audience: 'ecole' })).status, 423);
  await call(admin, 'POST', `/api/admin/facturation/factures/${inv.id}/paiements`, { method: 'virement', reference: 'VIR-2026-1' });
  assert.equal((await call(dir, 'POST', '/api/announcements', { title: 'Payé', body: 'ok', audience: 'ecole' })).status, 200);
  assert.equal((await call(dir, 'GET', '/api/abonnement')).json.read_only, false);
});

test('essai gratuit puis lecture seule ; annulation avec motif ; rappel groupé', async () => {
  await call(admin, 'PUT', `/api/admin/facturation/ecoles/${sb}`, { trial_days: 30 });
  let st = (await call(admin, 'GET', '/api/admin/facturation/ecoles')).json.schools.find((s) => s.id === sb).abonnement;
  assert.equal(st.in_trial, true); assert.equal(st.read_only, false);
  await call(admin, 'PUT', `/api/admin/facturation/ecoles/${sb}`, { trial_ends_on: past(31), grace_days: 30 });
  st = (await call(admin, 'GET', '/api/admin/facturation/ecoles')).json.schools.find((s) => s.id === sb).abonnement;
  assert.equal(st.read_only, true); assert.equal(st.reason, 'essai_termine');
  const forf = await call(admin, 'POST', '/api/admin/facturation/formules', { name: 'Forfait HTG', kind: 'forfait', currency: 'HTG', amount: '25000' });
  const inv = await call(admin, 'POST', '/api/admin/facturation/factures', { school_id: sb, plan_id: forf.json.id });
  assert.equal(inv.json.amount_cents, 2750000); assert.equal(inv.json.tax_cents, 250000); assert.equal(inv.json.ht_cents, 2500000); assert.equal(inv.json.students, null);
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv.json.id}/annuler`, { reason: '' })).status, 400);
  assert.equal((await call(admin, 'POST', `/api/admin/facturation/factures/${inv.json.id}/annuler`, { reason: 'erreur de formule' })).json.statut, 'annulee');
  const late = await call(admin, 'POST', '/api/admin/facturation/factures', { school_id: sb, plan_id: forf.json.id });
  await db.run('UPDATE billing_invoice SET due_on = ? WHERE id = ?', past(2), late.json.id);
  const bulk = await call(admin, 'POST', '/api/admin/facturation/rappels');
  assert.equal(bulk.status, 200); assert.equal(bulk.json.relances.length, 1);
  assert.equal((await call(admin, 'POST', '/api/admin/facturation/rappels')).json.relances.length, 0, 'un rappel par jour au plus');
  assert.ok(await db.get("SELECT 1 AS x FROM platform_audit WHERE action = 'admin.facturation.rappels'"));
});
