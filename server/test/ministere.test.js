'use strict';
// Bloc 6 : portail du ministère (prototype). Désactivé par défaut (tout répond 404), comptes créés par le super-admin,
// connexion par code, lecture seule et agrégats, consultation nominative motivée et journalisée des deux côtés,
// déclaration annuelle signée (Ed25519) avec accusé de réception / demande de correction, étape ministère des
// transferts signée par la clé du ministère, vérification de documents, règle de l'assistant sécurité, et
// cloisonnement PostgreSQL (rôle noria_ministere, politiques dédiées, pas de contournement global).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, seedMinistere, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const { createSecurity } = require('../src/securite');
const SA = require('../src/securite-actions');
const M = require('../src/ministere');
const T = require('../src/transferts');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
const FX = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let db, server, base, ids, sec; const sent = [];
const env = { NORIA_MINISTERE: '0', NORIA_TRANSFERT_MINISTERE: '0' };
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, json, buf, headers: res.headers };
}
const tokens = {};
const tok = async (k, who) => {
  const key = `${k}:${who}`;
  if (!tokens[key]) {
    const r = await call(null, 'POST', '/api/login', { school: `ecole-${k.toLowerCase()}`, identifier: `${who}@${k.toLowerCase()}.exemple.invalid`, password: DEMO_PASSWORD });
    assert.equal(r.status, 200, `connexion ${who}`); tokens[key] = r.json.token;
  }
  return tokens[key];
};
let ADM = null;
async function admin() {
  if (ADM) return ADM;
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  assert.equal(a.status, 200);
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  ADM = (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
  return ADM;
}
const acall = async (m, p, body) => call(await admin(), m, p, body, { 'x-noria': '1' });
let MIN = null, MIN_ID = null;
async function minLogin(identifier = 'inspection@ministere.exemple.invalid') {
  sent.length = 0;
  const r = await call(null, 'POST', '/api/ministere/login/code', { identifier });
  assert.equal(r.status, 200);
  const m = sent.find((x) => /code (\d{6})/.test(x.text));
  if (!m) return null;
  const l = await call(null, 'POST', '/api/ministere/login', { identifier, code: m.text.match(/code (\d{6})/)[1] });
  assert.equal(l.status, 200, JSON.stringify(l.json));
  return l;
}
const mcall = (m, p, body) => call(MIN, m, p, body);
const pdfText = (buf) => { const zlib = require('node:zlib'); let out = ''; const s = buf.toString('latin1'); let i = 0;
  while ((i = s.indexOf('>>\nstream\n', i)) >= 0) { const e = s.indexOf('\nendstream', i); if (e < 0) break; try { out += zlib.inflateSync(Buffer.from(s.slice(i + 10, e), 'latin1')).toString('latin1'); } catch {} i = e + 10; } return out; };

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  sec = createSecurity({ db, env: { NORIA_TZ: 'America/Port-au-Prince', NODE_TEST_CONTEXT: '1', NORIA_ASSISTANT_SEUILS: JSON.stringify({ ministereNominatifHeure: 3 }) }, notifier, log: () => {} });
  server = createServer(db, { notifier, env, security: sec, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  // Sexe et décisions de fin d'année fictifs pour les agrégats.
  await db.run("UPDATE student SET sex = 'F' WHERE id = ?", ids.A.students[0]);
  await db.run("UPDATE student SET sex = 'M' WHERE id = ?", ids.A.students[1]);
  const yA = (await db.get('SELECT id FROM school_year WHERE school_id = ?', ids.A.school)).id;
  await db.insert('INSERT INTO year_decision (school_id, student_id, school_year_id, decision, decided_by) VALUES (?,?,?,?,?)', ids.A.school, ids.A.students[0], yA, 'admis', ids.A.users.direction);
  await db.insert('INSERT INTO year_decision (school_id, student_id, school_year_id, decision, decided_by) VALUES (?,?,?,?,?)', ids.A.school, ids.A.students[1], yA, 'redouble', ids.A.users.direction);
});
after(async () => { server.close(); await db.cleanup(); });

test('désactivé par défaut (NORIA_MINISTERE=0) : pages, scripts et routes répondent 404, rien dans /api/config', async () => {
  const dA = await tok('A', 'direction');
  for (const [m, p, t] of [['GET', '/api/ministere/me', null], ['POST', '/api/ministere/login/code', null], ['POST', '/api/ministere/login', null], ['GET', '/api/ministere/ecoles', null],
    ['GET', '/api/declarations', dA], ['POST', '/api/declarations', dA], ['GET', '/ministere', null], ['GET', '/src/ministere.js', null], ['GET', '/src/ministere.css', null],
    ['GET', '/src/declaration.js', null], ['GET', '/src/admin-ministere.js', null]]) {
    assert.equal((await call(t, m, p, m === 'POST' ? { identifier: 'x@y.z' } : undefined)).status, 404, `${m} ${p}`);
  }
  assert.equal((await acall('GET', '/api/admin/ministere/comptes')).status, 404);
  assert.equal((await acall('POST', '/api/admin/ministere/comptes', { email: 'a@b.cd', name: 'X', reason: 'essai' })).status, 404);
  const cfg = await call(null, 'GET', '/api/config');
  assert.equal(cfg.json.ministere, undefined);
  // Les routes existantes restent intactes (la vérification publique répond toujours).
  assert.equal((await call(null, 'GET', '/api/verifier/ABCDEFGHJKLM')).status, 404);
  env.NORIA_MINISTERE = '1';
  assert.equal((await call(null, 'GET', '/api/config')).json.ministere, true);
  const page = await call(null, 'GET', '/ministere');
  assert.equal(page.status, 200); assert.match(page.buf.toString(), /src\/ministere\.js/);
  assert.match(page.headers.get('content-security-policy') || '', /script-src 'self'/);
});

test('super-admin : création, liste et désactivation des comptes du ministère (motif, journal)', async () => {
  assert.equal((await acall('POST', '/api/admin/ministere/comptes', { email: 'pas-un-email', name: 'X', reason: 'essai' })).status, 400);
  assert.equal((await acall('POST', '/api/admin/ministere/comptes', { email: 'inspection@ministere.exemple.invalid', name: 'Inspection fictive', reason: '' })).status, 400, 'motif obligatoire');
  const c = await acall('POST', '/api/admin/ministere/comptes', { email: 'inspection@ministere.exemple.invalid', name: 'Inspection fictive', phone: '00000900', title: 'Inspection', reason: 'prototype bloc 6' });
  assert.equal(c.status, 200, JSON.stringify(c.json)); MIN_ID = c.json.id;
  assert.equal((await acall('POST', '/api/admin/ministere/comptes', { email: 'inspection@ministere.exemple.invalid', name: 'Doublon', reason: 'essai' })).status, 409);
  const c2 = await acall('POST', '/api/admin/ministere/comptes', { email: 'second@ministere.exemple.invalid', name: 'Second compte fictif', reason: 'essai de désactivation' });
  const l = await acall('GET', '/api/admin/ministere/comptes');
  assert.equal(l.status, 200); assert.equal(l.json.comptes.length, 2); assert.equal(l.json.comptes[0].phone, '+50900000900');
  assert.ok(await db.get("SELECT id FROM platform_audit WHERE action = 'admin.ministere.compte.creer'"));
  // Un compte d'école ne peut rien faire ici.
  assert.equal((await call(await tok('A', 'direction'), 'GET', '/api/admin/ministere/comptes')).status, 401);
  // Compte désactivé : plus de code, plus de connexion.
  assert.equal((await acall('POST', `/api/admin/ministere/comptes/${c2.json.id}/desactiver`, { reason: 'fin de mission' })).status, 200);
  assert.equal(await minLogin('second@ministere.exemple.invalid'), null, 'aucun code envoyé à un compte désactivé');
});

test('connexion par code à 6 chiffres : réponse générique, code faux refusé, session séparée', async () => {
  const unknown = await call(null, 'POST', '/api/ministere/login/code', { identifier: 'inconnu@ministere.exemple.invalid' });
  assert.equal(unknown.status, 200); assert.match(unknown.json.message, /Si ce compte existe/);
  sent.length = 0;
  const r = await call(null, 'POST', '/api/ministere/login/code', { identifier: '+50900000900' });
  assert.equal(r.json.message, unknown.json.message, 'même réponse que pour un compte inconnu');
  assert.equal(sent[0].channel, 'sms'); assert.equal(sent[0].to, '+50900000900');
  const code = sent[0].text.match(/code (\d{6})/)[1];
  const bad = await call(null, 'POST', '/api/ministere/login', { identifier: '+50900000900', code: code === '000000' ? '111111' : '000000' });
  assert.equal(bad.status, 401);
  const ok = await call(null, 'POST', '/api/ministere/login', { identifier: '+50900000900', code });
  assert.equal(ok.status, 200); MIN = ok.json.token;
  assert.match(ok.headers.get('set-cookie'), /noria_ministere=.*HttpOnly; SameSite=Strict; Path=\/api\/ministere/);
  assert.equal((await call(null, 'POST', '/api/ministere/login', { identifier: '+50900000900', code })).status, 401, 'usage unique');
  const me = await mcall('GET', '/api/ministere/me');
  assert.equal(me.status, 200); assert.equal(me.json.nom, 'Inspection fictive');
  // Session du ministère ≠ session d'école ou d'administration.
  assert.equal((await call(MIN, 'GET', '/api/students')).status, 401);
  assert.equal((await call(MIN, 'GET', '/api/admin/ecoles')).status, 401);
  assert.equal((await call(await tok('A', 'direction'), 'GET', '/api/ministere/ecoles')).status, 401);
  // Cookie sans en-tête x-noria : écriture refusée (falsification de requête).
  const ck = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(null, 'POST', '/api/ministere/verifier', { valeur: 'TABCDEFGHJKLM' }, { cookie: ck })).status, 403);
  assert.ok(await db.get("SELECT id FROM ministry_audit WHERE action = 'ministere.login' AND outcome = 'refuse'"));
  await sec.flush();
  assert.ok(await db.get("SELECT id FROM security_event WHERE kind = 'login.ok' AND role = 'ministere' AND account = ?", `min:${MIN_ID}`));
  assert.ok(await db.get("SELECT id FROM security_event WHERE kind = 'otp.fail' AND account LIKE 'min:%'"));
});

test('vue d\'ensemble : agrégats par école, filtres département / commune, aucun nom d\'élève, journalisée', async () => {
  // Localisation renseignée par la direction (profil) et par la base.
  const dA = await tok('A', 'direction');
  const prof = await call(dA, 'GET', '/api/ecole');
  const put = await call(dA, 'PUT', '/api/ecole', { ...prof.json, logo: undefined, department: 'ouest', commune: 'Port-au-Prince' });
  assert.equal(put.status, 200, JSON.stringify(put.json)); assert.equal(put.json.department, 'ouest');
  assert.equal((await call(dA, 'PUT', '/api/ecole', { ...prof.json, logo: undefined, department: 'mars' })).status, 400);
  await db.run("UPDATE school SET department = 'nord', commune = 'Cap-Haïtien' WHERE id = ?", ids.B.school);
  const r = await mcall('GET', '/api/ministere/ecoles');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.annee, '2026-2027');
  const a = r.json.ecoles.find((e) => e.id === ids.A.school);
  assert.deepEqual({ effectif: a.effectif, filles: a.filles, garcons: a.garcons, classes: a.classes, admis: a.admis, redouble: a.redouble, taux: a.taux, declaration: a.declaration },
    { effectif: 2, filles: 1, garcons: 1, classes: 2, admis: 1, redouble: 1, taux: 0.5, declaration: null });
  assert.equal(r.json.totaux.ecoles, 2); assert.equal(r.json.totaux.effectif, 4);
  assert.doesNotMatch(r.buf.toString(), /Ana|Bèl|FictifA/, 'aucun nom d\'élève dans la vue d\'ensemble');
  const nord = await mcall('GET', '/api/ministere/ecoles?departement=nord');
  assert.deepEqual(nord.json.ecoles.map((e) => e.id), [ids.B.school]); assert.deepEqual(nord.json.communes, ['Cap-Haïtien']);
  const com = await mcall('GET', `/api/ministere/ecoles?commune=${encodeURIComponent('Port-au-Prince')}`);
  assert.deepEqual(com.json.ecoles.map((e) => e.id), [ids.A.school]);
  assert.equal((await mcall('GET', '/api/ministere/ecoles?statut=aucune')).json.ecoles.length, 2);
  assert.ok(await db.get("SELECT id FROM ministry_audit WHERE action = 'ministere.vue_ensemble' AND account_id = ?", MIN_ID));
  // Fiche école : agrégats par classe, personnel par fonction, pas de nom d'élève.
  const f = await mcall('GET', `/api/ministere/ecoles/${ids.A.school}`);
  assert.equal(f.status, 200);
  assert.equal(f.json.classes.length, 2); assert.equal(f.json.totaux.total, 2);
  assert.equal(f.json.personnel.par_role.enseignant, 2); assert.equal(f.json.personnel.par_role.direction, 1);
  assert.doesNotMatch(f.buf.toString(), /Ana|Bèl|Note santé|Note famille/);
  assert.ok(await db.get("SELECT id FROM ministry_audit WHERE action = 'ministere.fiche_ecole' AND school_id = ?", ids.A.school));
  assert.equal((await mcall('GET', '/api/ministere/ecoles/999999')).status, 404);
});

test('détail nominatif : motif obligatoire, journal du ministère ET de l\'école, jamais santé / famille / notes', async () => {
  const cls = ids.A.classes[0];
  assert.equal((await mcall('POST', `/api/ministere/ecoles/${ids.A.school}/classes/${cls}/eleves`, {})).status, 400);
  assert.equal((await mcall('POST', `/api/ministere/ecoles/${ids.A.school}/classes/${cls}/eleves`, { motif: 'ok' })).status, 400, 'motif trop court');
  const r = await mcall('POST', `/api/ministere/ecoles/${ids.A.school}/classes/${cls}/eleves`, { motif: 'Inspection pédagogique fictive' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.eleves.map((e) => [e.code, e.prenom, e.decision]), [['A-001', 'Ana', 'admis']]);
  assert.equal((await mcall('POST', `/api/ministere/ecoles/${ids.B.school}/classes/${cls}/eleves`, { motif: 'Classe d\'une autre école' })).status, 404, 'classe et école doivent correspondre');
  const st = await mcall('POST', `/api/ministere/eleves/${ids.A.students[0]}`, { motif: 'Vérification d\'un dossier fictif' });
  assert.equal(st.status, 200);
  assert.equal(st.json.eleve.code, 'A-001'); assert.equal(st.json.decisions[0].decision, 'admis');
  assert.doesNotMatch(st.buf.toString(), /Note santé|Note famille|health|family|parent/);
  const m = await db.all("SELECT action, detail FROM ministry_audit WHERE account_id = ? AND action IN ('ministere.liste_nominative','ministere.fiche_eleve') ORDER BY id", MIN_ID);
  assert.equal(m.length, 2); assert.match(m[0].detail, /Inspection pédagogique fictive/);
  const s = await db.all("SELECT actor_user_id, record_type, reason FROM audit_log WHERE school_id = ? AND action = 'ministere.consultation' ORDER BY id", ids.A.school);
  assert.equal(s.length, 2); assert.equal(s[0].actor_user_id, null); assert.match(s[0].reason, /par le ministère : Inspection fictive/); assert.match(s[1].reason, /A-001/);
});

test('déclaration annuelle : aperçu, envoi signé (Ed25519) avec PDF, accusé / correction, nouvelle version, historique', async () => {
  const dA = await tok('A', 'direction'), sA = await tok('A', 'secretariat'), pA = await tok('A', 'prof1');
  await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', FX('signature-fictive.jpg'), 'Direction fictive A', ids.A.school);
  const g = await call(dA, 'GET', '/api/declarations');
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal(g.json.peut_envoyer, true); assert.equal(g.json.apercu.effectifs.total, 2); assert.equal(g.json.apercu.resultats.taux_reussite, 0.5);
  assert.equal(g.json.apercu.personnel.par_role.enseignant, 2);
  assert.equal((await call(sA, 'GET', '/api/declarations')).json.peut_envoyer, false, 'secrétariat : lecture seule');
  assert.equal((await call(pA, 'GET', '/api/declarations')).status, 403);
  assert.equal((await call(sA, 'POST', '/api/declarations', { confirmer: true })).status, 403);
  assert.equal((await call(dA, 'POST', '/api/declarations', {})).status, 400, 'confirmation explicite');
  const s1 = await call(dA, 'POST', '/api/declarations', { confirmer: true });
  assert.equal(s1.status, 200, JSON.stringify(s1.json)); assert.equal(s1.json.version, 1);
  assert.equal((await call(dA, 'POST', '/api/declarations', { confirmer: true })).status, 409, 'une seule version active');
  const row = await db.get('SELECT * FROM annual_declaration WHERE id = ?', s1.json.id);
  assert.ok((await M.verifyDeclaration(db, row)).valide);
  assert.equal((await M.verifyDeclaration(db, { ...row, payload: row.payload.replace('"total":2', '"total":3') })).valide, false, 'dossier modifié détecté');
  await assert.rejects(db.run("UPDATE annual_declaration SET payload = '{}' WHERE id = ?", row.id), /signature figée/);
  await assert.rejects(db.run("UPDATE annual_declaration SET status = 'remplacee' WHERE id = ?", row.id), /lecture seule/);
  await assert.rejects(db.run('DELETE FROM annual_declaration WHERE id = ?', row.id), /suppression interdite/);
  const pdf = await call(dA, 'GET', `/api/declarations/${row.id}/pdf`);
  assert.equal(pdf.status, 200); assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  const txt = pdfText(pdf.buf);
  assert.ok(txt.includes('cole fictive A') && txt.includes('claration annuelle') && txt.includes(row.key_id), 'en-tête, titre et clé dans le PDF');
  // Côté ministère.
  const list = await mcall('GET', '/api/ministere/declarations');
  assert.equal(list.json.declarations.length, 1); assert.equal(list.json.declarations[0].statut, 'envoyee');
  const det = await mcall('GET', `/api/ministere/declarations/${row.id}`);
  assert.equal(det.status, 200); assert.equal(det.json.signature.valide, true); assert.equal(det.json.dossier.effectifs.total, 2);
  assert.equal((await mcall('GET', `/api/ministere/declarations/${row.id}/pdf`)).buf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await mcall('POST', `/api/ministere/declarations/${row.id}/correction`, {})).status, 400, 'correction : précision obligatoire');
  const c = await mcall('POST', `/api/ministere/declarations/${row.id}/correction`, { note: 'Merci de compléter les décisions de 7e B.' });
  assert.equal(c.status, 200); assert.equal(c.json.statut, 'correction_demandee');
  assert.equal((await mcall('POST', `/api/ministere/declarations/${row.id}/accuser`, {})).status, 409, 'déjà traitée');
  assert.ok(await db.get("SELECT id FROM notification WHERE school_id = ? AND kind = 'declaration.correction_demandee'", ids.A.school));
  assert.ok(await db.get("SELECT id FROM audit_log WHERE school_id = ? AND action = 'ministere.declaration.correction'", ids.A.school));
  // Nouvelle version : la précédente devient « remplacee ».
  const g2 = await call(dA, 'GET', '/api/declarations');
  assert.equal(g2.json.peut_envoyer, true); assert.match(g2.json.active.note_ministere, /7e B/);
  const s2 = await call(dA, 'POST', '/api/declarations', { confirmer: true });
  assert.equal(s2.status, 200); assert.equal(s2.json.version, 2);
  assert.equal((await db.get('SELECT status FROM annual_declaration WHERE id = ?', row.id)).status, 'remplacee');
  const ack = await mcall('POST', `/api/ministere/declarations/${s2.json.id}/accuser`, { note: 'Reçu, merci.' });
  assert.equal(ack.json.statut, 'recue');
  assert.equal((await call(dA, 'POST', '/api/declarations', { confirmer: true })).status, 409, 'déjà reçue');
  const h = (await call(dA, 'GET', '/api/declarations')).json.historique;
  assert.deepEqual(h.map((x) => [x.version, x.statut]), [[2, 'recue'], [1, 'remplacee']]);
  assert.deepEqual(h[1].evenements.map((e) => e.kind), ['envoi', 'correction', 'remplacement']);
  assert.deepEqual(h[0].evenements.map((e) => e.kind), ['envoi', 'accuse']);
  const ov = await mcall('GET', '/api/ministere/ecoles');
  assert.equal(ov.json.ecoles.find((e) => e.id === ids.A.school).declaration.statut, 'recue');
  // Journal du ministère en ajout seul.
  await assert.rejects(db.run("UPDATE ministry_audit SET detail = 'x' WHERE account_id = ?", MIN_ID), /ajout seul/);
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'noria-declaration-test.pdf'), pdf.buf);
});

test('transferts : avec le portail actif, l\'étape ministère passe par le compte du ministère (signée Ed25519)', async () => {
  assert.deepEqual((await mcall('GET', '/api/ministere/transferts')).json, { actif: false, transferts: [] });
  env.NORIA_TRANSFERT_MINISTERE = '1';
  try {
    const sA = await tok('A', 'secretariat'), dB = await tok('B', 'direction');
    await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', FX('signature-fictive.jpg'), 'Direction fictive B', ids.B.school);
    const c = await call(sA, 'POST', '/api/transferts', { code: 'B-002', birth_date: '2014-01-01', consentement: { mode: 'case', parent: 'Parent fictif 2 B', accord: true } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.equal((await call(dB, 'POST', `/api/transferts/${c.json.id}/approuver`, {})).json.statut, 'approuve_origine');
    // Le super-admin ne joue plus l'étape : elle passe par le portail du ministère.
    assert.equal((await acall('GET', '/api/admin/transferts')).status, 409);
    assert.equal((await acall('POST', `/api/admin/transferts/${c.json.id}/ministere`, { decision: 'approuver' })).status, 409);
    const l = await mcall('GET', '/api/ministere/transferts');
    assert.equal(l.json.actif, true); assert.equal(l.json.transferts.length, 1); assert.equal(l.json.transferts[0].eleve, 'Bèl F.');
    assert.equal((await mcall('POST', `/api/ministere/transferts/${c.json.id}`, { decision: 'refuser' })).status, 400, 'motif obligatoire pour un refus');
    const ok = await mcall('POST', `/api/ministere/transferts/${c.json.id}`, { decision: 'approuver', motif: 'Conforme (fictif)' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.statut, 'transfere'); assert.match(ok.json.cle, /^M[0-9a-f]{15}$/);
    const t = await db.get('SELECT * FROM transfer WHERE id = ?', c.json.id);
    assert.equal(t.ministry_account_id, MIN_ID); assert.ok(t.ministry_signature); assert.equal(t.ministry_by, null);
    assert.equal(await T.verifyMinistry(db, t), true);
    assert.equal(await T.verifyMinistry(db, { ...t, ministry_account_id: 999 }), false, 'signature liée au compte');
    await assert.rejects(db.run("UPDATE transfer SET ministry_signature = 'AAAA' WHERE id = ?", t.id), /signature figée|lecture seule/);
    const ev = await db.get("SELECT reason FROM transfer_event WHERE transfer_id = ? AND to_status = 'approuve_ministere'", t.id);
    assert.match(ev.reason, /signée Ed25519/);
    assert.ok(await db.get("SELECT id FROM audit_log WHERE school_id = ? AND action = 'transfert.approuve_ministere' AND reason LIKE '%ministère (Inspection fictive%'", ids.B.school));
    // Vérification publique du certificat : signature du ministère contrôlée aussi.
    const pub = await call(null, 'GET', `/api/verifier/${t.code}`);
    assert.equal(pub.status, 200); assert.equal(pub.json.authentique, true); assert.equal(pub.json.ministere.valide, true);
    const cert = await call(sA, 'GET', `/api/transferts/${t.id}/certificat`);
    assert.ok(pdfText(cert.buf).includes(t.ministry_key_id), 'clé du ministère sur le certificat');
    // Vérification par le ministère, à partir du lien complet du QR ou du code.
    const v = await mcall('POST', '/api/ministere/verifier', { valeur: `https://noria.exemple.invalid/#verifier=${t.code}` });
    assert.equal(v.status, 200); assert.equal(v.json.trouve, true); assert.equal(v.json.type, 'transfert'); assert.equal(v.json.authentique, true);
    const v2 = await mcall('POST', '/api/ministere/verifier', { valeur: `T-${t.code.slice(1, 5)}-${t.code.slice(5, 9)}-${t.code.slice(9)}` });
    assert.equal(v2.json.trouve, true);
    assert.equal((await mcall('POST', '/api/ministere/verifier', { valeur: 'RABCDEFGHJKLM' })).json.trouve, false);
    assert.equal((await mcall('POST', '/api/ministere/verifier', { valeur: '<script>' })).status, 400);
    assert.ok(await db.get("SELECT id FROM ministry_audit WHERE action = 'ministere.verification' AND outcome = 'introuvable'"));
  } finally { env.NORIA_TRANSFERT_MINISTERE = '0'; }
});

test('assistant sécurité : consultation nominative en masse → alerte « ministere_consultations » et actions dédiées', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await mcall('POST', `/api/ministere/eleves/${ids.B.students[0]}`, { motif: `Contrôle fictif n° ${i + 1}` })).status, 200);
  await sec.flush();
  await sec.analyse({ backups: () => [], dbSize: async () => 0 });
  const a = await db.get("SELECT * FROM security_alert WHERE rule = 'ministere_consultations' AND status = 'ouverte'");
  assert.ok(a, 'alerte ouverte');
  assert.match(a.explain_fr, /ministère n° \d+/); assert.match(a.explain_ht, /ministè n° \d+/);
  const acts = JSON.parse(a.actions).map((x) => x.type);
  assert.deepEqual(acts, ['ministere.deconnecter', 'ministere.desactiver']);
  assert.equal(JSON.parse(a.actions)[1].critical, true);
  const g = await sec.guide(a, 'pourquoi', 'fr');
  assert.match(g.reponse, /motif/);
  // Action critique (après confirmation dans l'interface) : désactive et déconnecte ; annulable.
  const d = await SA.describe(db, { ip: '192.0.2.1' }, 'ministere.desactiver', { ministry_id: MIN_ID });
  assert.equal(d.target, `min:${MIN_ID}`);
  const r = await db.tx((t) => SA.execute(t, 'ministere.desactiver', d.params, { id: 1 }, 'test'));
  assert.ok(r.undo); assert.match(r.result, /désactivé/);
  assert.equal((await mcall('GET', '/api/ministere/me')).status, 401, 'session fermée');
  await db.run("UPDATE ministry_account SET state = 'actif' WHERE id = ?", MIN_ID);
  await db.run('UPDATE ministry_login SET created_at = ? WHERE account_id = ?', new Date(Date.now() - 3600e3).toISOString(), MIN_ID);
  MIN = (await minLogin('inspection@ministere.exemple.invalid')).json.token;
});

test('données de démonstration : écoles fictives, déclarations signées, compte du ministère', async () => {
  const d2 = await openTestDb();
  try {
    const ids2 = await seedMulti(d2, await seed(d2));
    const out = await seedMinistere(d2, ids2);
    assert.equal(out.schools.length, 5);
    assert.equal(Number((await d2.get('SELECT COUNT(*) AS n FROM school WHERE department IS NOT NULL')).n), 7);
    const dec = await d2.all('SELECT * FROM annual_declaration ORDER BY id');
    assert.deepEqual(dec.map((x) => x.status), ['recue', 'envoyee', 'envoyee']);
    for (const x of dec) assert.ok((await M.verifyDeclaration(d2, x)).valide);
    assert.ok(await d2.get("SELECT id FROM ministry_account WHERE email = 'inspection@ministere.exemple.invalid'"));
  } finally { await d2.cleanup(); }
});

test('PostgreSQL : rôle noria_ministere en lecture par colonnes, politiques dédiées, aucun accès aux tables sensibles', { skip: !PG }, async () => {
  const { Client } = require('pg');
  const c = new Client({ connectionString: db.url }); await c.connect();
  const as = async (role, key, value, sql, params = []) => {
    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL ROLE ${role}`);
      if (key) await c.query('SELECT set_config($1, $2, true)', [key, String(value)]);
      return (await c.query(sql, params));
    } finally { await c.query('ROLLBACK'); }
  };
  const MINI = (sql, p) => as('noria_ministere', 'app.ministere_id', MIN_ID, sql, p);
  try {
    // Lecture transversale contrôlée : colonnes autorisées, toutes les écoles.
    assert.ok((await MINI('SELECT id, first_name, sex FROM student')).rowCount >= 4);
    assert.equal((await MINI('SELECT DISTINCT school_id FROM student')).rowCount, 2);
    // Sans compte réglé (app.ministere_id) : rien.
    assert.equal((await as('noria_ministere', null, null, 'SELECT id FROM school')).rowCount, 0);
    // Colonnes et tables sensibles : refusées par la base.
    for (const sql of ['SELECT health_notes FROM student', 'SELECT family_notes FROM student', 'SELECT email FROM app_user', 'SELECT password_hash FROM app_user',
      'SELECT * FROM grade', 'SELECT * FROM finance_entry', 'SELECT * FROM attendance', 'SELECT * FROM session', 'SELECT * FROM school_key', 'SELECT signature FROM school',
      'SELECT * FROM ministry_account', 'SELECT * FROM ministry_session', 'SELECT * FROM ministry_key', 'SELECT * FROM transfer', 'SELECT * FROM parent_link', 'SELECT * FROM login_code'])
      await assert.rejects(MINI(sql), /permission denied/, sql);
    // Écritures : refusées, sauf celles prévues.
    for (const sql of ["UPDATE student SET first_name = 'x'", "DELETE FROM enrollment", "INSERT INTO year_decision (school_id, student_id, school_year_id, decision, decided_by) VALUES (1,1,1,'admis',1)",
      "UPDATE annual_declaration SET payload = '{}'"])
      await assert.rejects(MINI(sql), /permission denied/, sql);
    await assert.rejects(MINI("INSERT INTO audit_log (school_id, actor_user_id, action, record_type) VALUES ($1, NULL, 'note.modifier', 'x')", [ids.A.school]), /row-level security/);
    assert.equal((await MINI("INSERT INTO audit_log (school_id, actor_user_id, action, record_type) VALUES ($1, NULL, 'ministere.essai', 'x')", [ids.A.school])).rowCount, 1);
    await assert.rejects(MINI("INSERT INTO ministry_audit (account_id, action) VALUES ($1, 'usurpation')", [MIN_ID + 1000]), /row-level security/);
    // Statut : seulement une déclaration « envoyee » (la seule ici est « recue » ou « remplacee » → aucune ligne).
    assert.equal((await MINI("UPDATE annual_declaration SET status = 'correction_demandee', ministry_by = $1", [MIN_ID])).rowCount, 0);
    // Portail : seulement les lauréats.
    assert.equal((await MINI("SELECT id FROM portal_item WHERE kind <> 'laureat'")).rowCount, 0);
    // Rôle des écoles : aucune table du ministère, déclarations de sa propre école seulement, jamais de statut « recue ».
    const APP = (sql, p) => as('noria_app', 'app.school_id', ids.B.school, sql, p);
    for (const sql of ['SELECT * FROM ministry_audit', 'SELECT * FROM ministry_account', 'SELECT * FROM ministry_session', 'SELECT * FROM ministry_key'])
      await assert.rejects(APP(sql), /permission denied/, sql);
    assert.equal((await APP('SELECT id FROM annual_declaration')).rowCount, 0, 'déclarations de l\'école A invisibles pour B');
    const A = (sql, p) => as('noria_app', 'app.school_id', ids.A.school, sql, p);
    assert.equal((await A('SELECT id FROM annual_declaration')).rowCount, 2);
    assert.equal((await A("UPDATE annual_declaration SET status = 'remplacee'")).rowCount, 0, 'aucune version en correction');
    await assert.rejects(A("UPDATE annual_declaration SET ministry_note = 'x'"), /permission denied/);
    await assert.rejects(A("INSERT INTO declaration_event (declaration_id, school_id, kind, actor) SELECT id, school_id, 'accuse', 'ministere' FROM annual_declaration LIMIT 1"), /row-level security/);
    // Aucun contournement global : le rôle n'a ni BYPASSRLS ni droit de connexion.
    const r = (await c.query("SELECT rolbypassrls, rolcanlogin, rolsuper FROM pg_roles WHERE rolname = 'noria_ministere'")).rows[0];
    assert.deepEqual(r, { rolbypassrls: false, rolcanlogin: false, rolsuper: false });
  } finally { await c.end(); }
});
