'use strict';
// Invitations aux réunions de parents : e-mail d'abord, sinon lien wa.me ; les parents sans contact sont listés.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb } = require('./helpers');
const app = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const I = require('../src/reunions-invitations');

let db, server, base; const tok = {}; const sent = [];
const notifier = { simulated: { sms: true, email: false }, sms: { name: 'x' }, email: { name: 'x' },
  adapter: () => ({ async send(m) { if (m.to === 'echec@exemple.com') throw new Error('refusé'); sent.push(m); return { id: 'x' }; } }) };
async function call(w, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[w]}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
before(async () => {
  db = await openTestDb(); await seed(db);
  server = app.createServer(db, { publicUrl: 'https://noria.exemple.invalid', notifier, rateLimit: { max: 400 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const k of ['direction', 'prof1', 'parent1']) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: `${k}@a.exemple.invalid`, password: DEMO_PASSWORD }) });
    tok[k] = (await r.json()).token;
  }
});
after(async () => { server.close(); await db.cleanup(); });

test('numéros pour wa.me : Haïti normalisé en 509, international gardé, le reste refusé', () => {
  assert.equal(I.waPhone('3712-3456'), '50937123456');
  assert.equal(I.waPhone('+509 37 12 34 56'), '50937123456');
  assert.equal(I.waPhone('509 4712 3456'), '50947123456');
  assert.equal(I.waPhone('+1 (305) 555-0100'), '13055550100');
  assert.equal(I.waPhone('0037123456'), null);
  assert.equal(I.waPhone('+50900000100'), null);
  assert.equal(I.waPhone('12345'), null);
  assert.equal(I.waPhone('abc'), null);
  assert.equal(I.validEmail('tel37123456@telephone.invalid'), null);
  assert.equal(I.validEmail(' Parent@Exemple.com '), 'parent@exemple.com');
  assert.match(I.waLink('50937123456', 'Réunion : https://x/#reunion=1'), /^https:\/\/wa\.me\/50937123456\?text=R%C3%A9union/);
});

test('inviter : e-mail, WhatsApp, sans contact ; réservé à la direction et au secrétariat', async () => {
  const sid = (await db.get("SELECT id FROM school WHERE slug = 'ecole-a'")).id;
  const m = await call('direction', 'POST', '/api/reunions-parents', { titre: 'Réunion générale', debut: '2026-11-01T14:00:00Z' });
  assert.equal(m.status, 200);
  const parents = await db.all("SELECT au.id FROM app_user au JOIN user_role ur ON ur.user_id = au.id AND ur.role = 'parent' WHERE au.school_id = ? ORDER BY au.id", sid);
  assert.ok(parents.length >= 1);
  await db.run('UPDATE app_user SET email = ? WHERE id = ?', 'parent.reel@exemple.com', parents[0].id);
  // Parents de test supplémentaires : WhatsApp, e-mail en échec, sans contact.
  const mk = async (email, phone, name) => { const id = await db.insert('INSERT INTO app_user (school_id, email, phone, display_name) VALUES (?,?,?,?)', sid, email, phone, name);
    await db.run("INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,'parent')", sid, id); return id; };
  await mk('tel37123456@telephone.invalid', '3712 3456', 'Parent WhatsApp');
  await mk('echec@exemple.com', '+509 4000 0001', 'Parent échec');
  await mk('tel0@telephone.invalid', '0000', 'Parent sans contact');

  assert.equal((await call('parent1', 'POST', `/api/reunions-parents/${m.json.id}/inviter`)).status, 403);
  assert.equal((await call('prof1', 'POST', `/api/reunions-parents/${m.json.id}/inviter`)).status, 403);
  const pv = await call('direction', 'GET', `/api/reunions-parents/${m.json.id}/invitations`);
  assert.equal(pv.status, 200);
  const r = await call('direction', 'POST', `/api/reunions-parents/${m.json.id}/inviter`, {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.lien, `https://noria.exemple.invalid/#reunion=${m.json.id}`);
  assert.ok(sent.some((x) => x.to === 'parent.reel@exemple.com' && x.text.includes(r.json.lien) && x.subject.includes('Réunion générale')));
  assert.equal(r.json.recap.emails_echec, 1);
  const wa = r.json.whatsapp.find((x) => x.nom === 'Parent WhatsApp');
  assert.ok(wa && wa.lien.startsWith('https://wa.me/50937123456?text=') && decodeURIComponent(wa.lien).includes(r.json.lien));
  assert.ok(r.json.whatsapp.find((x) => x.nom === 'Parent échec' && x.apres_echec_email));
  assert.ok(r.json.sans_contact.find((x) => x.nom === 'Parent sans contact' && x.motif === 'numéro invalide'));
  assert.equal(r.json.recap.emails_envoyes + r.json.recap.emails_echec + (r.json.recap.whatsapp - 1) + r.json.recap.sans_contact, pv.json.email + pv.json.whatsapp + pv.json.sans_contact);
});
