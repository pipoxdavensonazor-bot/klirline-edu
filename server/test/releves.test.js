'use strict';
// Bloc 2 : relevés de notes officiels. Demande (élève, parent), décision de la direction (approbation, refus motivé),
// PDF signé (signature du directeur, sceau, Ed25519 par école sur l'empreinte), dépôt au portail et notification,
// vérification publique (authentique / modifié), annulation, journal, droits et cloisonnement RLS.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');

const FX = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
let db, server, base, ids; const sent = [];
async function call(token, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
const pdfText = (buf) => { const zlib = require('node:zlib'); let out = ''; const s = buf.toString('latin1'); let i = 0;
  while ((i = s.indexOf('>>\nstream\n', i)) >= 0) { const e = s.indexOf('\nendstream', i); if (e < 0) break; try { out += zlib.inflateSync(Buffer.from(s.slice(i + 10, e), 'latin1')).toString('latin1'); } catch {} i = e + 10; } return out; };

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  server = createServer(db, { notifier, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  // Notes publiées fictives (élève A-001, trimestres 1 et 2) et une note non publiée qui ne doit jamais apparaître.
  const A = ids.A; const s = A.school;
  const ev = async (term, subj, title, max, coef, status) => db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, s, A.classes[0], subj, term, title, '2026-10-01', max, coef, status, A.users.prof1);
  const gr = async (e, score) => db.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, updated_by, recorded_at) VALUES (?,?,?,?,?,?)', s, e, A.students[0], score, A.users.prof1, '2026-10-02');
  await gr(await ev(A.terms[0], A.subjects.maths, 'Contrôle 1', 20, 1, 'publiee'), 15);
  await gr(await ev(A.terms[0], A.subjects.maths, 'Contrôle 2', 20, 1, 'publiee'), 17);
  await gr(await ev(A.terms[0], A.subjects.francais, 'Dictée', 10, 1, 'publiee'), 6);
  await gr(await ev(A.terms[0], A.subjects.francais, 'Brouillon secret', 20, 1, 'brouillon'), 1);
  await gr(await ev(A.terms[1], A.subjects.maths, 'Contrôle T2', 20, 1, 'publiee'), 12);
});
after(async () => { server.close(); await db.cleanup(); });

let reqId, yearReq, code, pdf;

test('demande : élève ou parent pour son enfant seulement ; motif facultatif ; doublon refusé', async () => {
  const A = ids.A;
  for (const who of ['direction', 'secretariat', 'prof1', 'biblio']) assert.equal((await call(await tok('A', who), 'POST', '/api/releves', { student_id: A.students[0], term_id: A.terms[0] })).status, 403, who);
  assert.equal((await call(await tok('A', 'parent2'), 'POST', '/api/releves', { student_id: A.students[0], term_id: A.terms[0] })).status, 404);
  assert.equal((await call(await tok('B', 'parent2'), 'POST', '/api/releves', { student_id: A.students[0], term_id: A.terms[0] })).status, 404);
  const r = await call(await tok('A', 'eleve1'), 'POST', '/api/releves', { student_id: A.students[0], term_id: A.terms[0], motif: 'Inscription au lycée' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); reqId = r.json.id;
  assert.equal((await call(await tok('A', 'parent1'), 'POST', '/api/releves', { student_id: A.students[0], term_id: A.terms[0] })).status, 409);
  const y = await call(await tok('A', 'parent1'), 'POST', '/api/releves', { student_id: A.students[0], school_year_id: (await db.get('SELECT id FROM school_year WHERE school_id = ?', A.school)).id });
  assert.equal(y.status, 200); yearReq = y.json.id;
  // Lecture : l'élève et le parent voient leurs demandes ; parent2 ne voit rien ; la direction voit tout.
  assert.equal((await call(await tok('A', 'eleve1'), 'GET', '/api/releves')).json.length, 2);
  assert.equal((await call(await tok('A', 'parent2'), 'GET', '/api/releves')).json.length, 0);
  const all = (await call(await tok('A', 'direction'), 'GET', '/api/releves?statut=demande')).json;
  assert.equal(all.length, 2); assert.equal(all.find((x) => x.id === reqId).motive, 'Inscription au lycée');
  assert.equal((await call(await tok('A', 'prof1'), 'GET', '/api/releves')).status, 403);
  assert.equal((await call(await tok('B', 'direction'), 'GET', '/api/releves')).json.length, 0);
});

test('approbation : direction seulement, signature du directeur requise ; refus motivé', async () => {
  const dir = await tok('A', 'direction');
  assert.equal((await call(await tok('A', 'secretariat'), 'POST', `/api/releves/${reqId}/approuver`)).status, 403);
  const noSig = await call(dir, 'POST', `/api/releves/${reqId}/approuver`);
  assert.equal(noSig.status, 409); assert.match(noSig.json.error, /signature/);
  // Signature (une fois, par la direction) et sceau (profil de l'école).
  assert.equal((await call(await tok('A', 'secretariat'), 'PUT', '/api/ecole/signature', { image: FX('signature-fictive.jpg'), name: 'Directrice fictive' })).status, 403);
  assert.equal((await call(dir, 'PUT', '/api/ecole/signature', { image: 'xx', name: 'Directrice fictive' })).status, 400);
  assert.equal((await call(dir, 'PUT', '/api/ecole/signature', { image: FX('signature-fictive.jpg'), name: 'Mme Directrice Fictive' })).status, 200);
  assert.equal((await call(dir, 'PUT', '/api/ecole/sceau', { image: FX('sceau-fictif.jpg') })).status, 200);
  const info = (await call(dir, 'GET', '/api/ecole/signature')).json;
  assert.equal(info.signature, true); assert.equal(info.seal, true);
  // Refus : motif obligatoire.
  assert.equal((await call(dir, 'POST', `/api/releves/${yearReq}/refuser`, {})).status, 400);
});

test('émission : PDF signé (en-tête, notes publiées seulement, moyennes, barème, signature, sceau, QR), portail et notification', async () => {
  const dir = await tok('A', 'direction');
  const r = await call(dir, 'POST', `/api/releves/${reqId}/approuver`);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.status, 'emis'); code = r.json.code;
  assert.match(code, /^R-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await call(dir, 'POST', `/api/releves/${reqId}/approuver`)).status, 409);
  // L'élève et le parent téléchargent ; parent2 et l'autre école non.
  const d = await call(await tok('A', 'parent1'), 'GET', `/api/releves/${reqId}/pdf`);
  assert.equal(d.status, 200); assert.equal(d.headers.get('content-type'), 'application/pdf'); pdf = d.buf;
  assert.equal((await call(await tok('A', 'eleve1'), 'GET', `/api/releves/${reqId}/pdf`)).status, 200);
  assert.equal((await call(await tok('A', 'parent2'), 'GET', `/api/releves/${reqId}/pdf`)).status, 404);
  assert.equal((await call(await tok('B', 'direction'), 'GET', `/api/releves/${reqId}/pdf`)).status, 404);
  assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), r.json.sha256);
  const txt = pdfText(pdf);
  for (const x of ['Relev', 'cole fictive A', 'Trimestre 1', 'Math', '15/20', '17/20', '6/10', 'Bar', 'Mme Directrice Fictive', 'Ed25519', code]) assert.ok(txt.includes(x), x);
  assert.ok(!txt.includes('1/20') || !/\b1\/20\b/.test(txt), 'note en brouillon absente');
  assert.equal((pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length, 2); // signature + sceau (pas de logo dans l'école fictive)
  // Notifications : élève (compte élève et auteur) et parents.
  const nE = (await call(await tok('A', 'eleve1'), 'GET', '/api/notifications')).json;
  const nP = (await call(await tok('A', 'parent1'), 'GET', '/api/notifications')).json;
  assert.equal(nE[0].kind, 'releve.emis'); assert.equal(nP[0].kind, 'releve.emis'); assert.equal(nE[0].title_ht, 'Relve nòt la disponib');
  assert.equal((await call(await tok('A', 'parent2'), 'GET', '/api/notifications')).json.length, 0);
  assert.equal((await call(await tok('A', 'eleve1'), 'POST', '/api/notifications/lues')).json.count, 1);
  assert.ok(sent.some((m) => /Relev/.test(m.text || m.subject || '') && !/15\/20/.test(m.text || '')));
});

test('vérification publique : école, nom abrégé, type, date, statut ; fichier authentique ou modifié', async () => {
  const raw = code.replace(/-/g, '');
  const v = await call(null, 'GET', `/api/verifier/${code}`);
  assert.equal(v.status, 200);
  assert.equal(v.json.type, 'releve'); assert.equal(v.json.statut, 'valide'); assert.equal(v.json.eleve, 'Ana F.');
  assert.equal(v.json.ecole, 'École fictive A'); assert.equal(v.json.signature.valide, true);
  assert.deepEqual(Object.keys(v.json).sort(), ['authentique', 'document', 'ecole', 'eleve', 'emis_le', 'signature', 'statut', 'type']); // aucune note
  assert.ok(!/15\/20|17\/20|moyenne|average/i.test(JSON.stringify(v.json)));
  const sha = crypto.createHash('sha256').update(pdf).digest('hex');
  assert.equal((await call(null, 'POST', `/api/verifier/${raw}/fichier`, { sha256: sha })).json.resultat, 'authentique');
  assert.equal((await call(null, 'POST', `/api/verifier/${code}/fichier`, { pdf: pdf.toString('base64') })).json.resultat, 'authentique');
  // Un seul octet modifié dans le PDF : signature invalide.
  const bad = Buffer.from(pdf); bad[Math.floor(bad.length / 2)] ^= 1;
  assert.equal((await call(null, 'POST', `/api/verifier/${code}/fichier`, { pdf: bad.toString('base64') })).json.resultat, 'modifie');
  // Base altérée (empreinte remplacée sans la clé privée) : la page publique l'indique.
  const real = await db.get('SELECT sha256 FROM transcript WHERE id = ?', reqId);
  await db.run('DROP TRIGGER IF EXISTS transcript_guard').catch(() => {});
  if (db.kind === 'pg') await db.exec('ALTER TABLE transcript DISABLE TRIGGER transcript_guard');
  await db.run('UPDATE transcript SET sha256 = ? WHERE id = ?', '0'.repeat(64), reqId);
  const alt = await call(null, 'GET', `/api/verifier/${code}`);
  assert.equal(alt.json.statut, 'modifie'); assert.equal(alt.json.authentique, false);
  await db.run('UPDATE transcript SET sha256 = ? WHERE id = ?', real.sha256, reqId);
  if (db.kind === 'pg') await db.exec('ALTER TABLE transcript ENABLE TRIGGER transcript_guard');
  else await db.exec(`CREATE TRIGGER transcript_guard BEFORE UPDATE ON transcript
    WHEN OLD.status IN ('annule','refuse') OR (OLD.status = 'emis' AND (NEW.pdf IS NOT OLD.pdf OR NEW.sha256 IS NOT OLD.sha256
      OR NEW.signature IS NOT OLD.signature OR NEW.code IS NOT OLD.code OR NEW.student_id <> OLD.student_id))
    BEGIN SELECT RAISE(ABORT, 'relevé figé : seule une annulation motivée est permise'); END`);
  assert.equal((await call(null, 'GET', `/api/verifier/${code}`)).json.statut, 'valide');
  assert.equal((await call(null, 'GET', '/api/verifier/R-AAAA-AAAA-AAAA')).status, 404);
});

test('relevé émis figé ; refus et annulation motivés, notifiés, journalisés', async () => {
  await assert.rejects(db.run("UPDATE transcript SET pdf = 'x' WHERE id = ?", reqId), /figé/);
  const dir = await tok('A', 'direction');
  const ref = await call(dir, 'POST', `/api/releves/${yearReq}/refuser`, { motif: 'Notes du trimestre 3 non publiées' });
  assert.equal(ref.status, 200);
  assert.equal((await call(dir, 'POST', `/api/releves/${yearReq}/approuver`)).status, 409);
  assert.equal((await call(await tok('A', 'parent1'), 'GET', '/api/releves')).json.find((x) => x.id === yearReq).decision_reason, 'Notes du trimestre 3 non publiées');
  // L'élève ne peut pas annuler un relevé émis ; la direction le peut, avec un motif.
  assert.equal((await call(await tok('A', 'eleve1'), 'POST', `/api/releves/${reqId}/annuler`, { motif: 'x' })).status, 403);
  assert.equal((await call(dir, 'POST', `/api/releves/${reqId}/annuler`, {})).status, 400);
  assert.equal((await call(dir, 'POST', `/api/releves/${reqId}/annuler`, { motif: 'Erreur de saisie' })).status, 200);
  assert.equal((await call(await tok('A', 'parent1'), 'GET', `/api/releves/${reqId}/pdf`)).status, 410);
  const v = (await call(null, 'GET', `/api/verifier/${code}`)).json;
  assert.equal(v.statut, 'annule'); assert.equal(v.motif, 'Erreur de saisie');
  const kinds = (await call(await tok('A', 'parent1'), 'GET', '/api/notifications')).json.map((n) => n.kind);
  assert.deepEqual(kinds.slice(0, 3), ['releve.annule', 'releve.refuse', 'releve.emis']);
  // Retrait de sa propre demande non traitée par l'élève.
  const again = await call(await tok('A', 'eleve1'), 'POST', '/api/releves', { student_id: ids.A.students[0], term_id: ids.A.terms[1] });
  assert.equal((await call(await tok('A', 'eleve1'), 'POST', `/api/releves/${again.json.id}/annuler`, {})).status, 200);
  // Période sans note publiée : approbation refusée (rien à certifier).
  const empty = await call(await tok('A', 'eleve1'), 'POST', '/api/releves', { student_id: ids.A.students[0], term_id: ids.A.terms[2] });
  assert.equal((await call(dir, 'POST', `/api/releves/${empty.json.id}/approuver`)).status, 409);
  const actions = (await db.all("SELECT action, outcome FROM audit_log WHERE action LIKE 'transcript.%' AND school_id = ?", ids.A.school)).map((x) => x.action);
  for (const a of ['transcript.request', 'transcript.approve', 'transcript.issue', 'transcript.download', 'transcript.refuse', 'transcript.cancel']) assert.ok(actions.includes(a), a);
});

test('clés : une paire Ed25519 par école ; clé privée chiffrée si NORIA_CLE_MAITRE', async () => {
  const K = require('../src/cles');
  const a = await K.schoolKeys(db, ids.A.school); const b = await K.schoolKeys(db, ids.B.school);
  assert.notEqual(a.keyId, b.keyId);
  // La signature d'une école ne se vérifie pas avec la clé d'une autre.
  const msg = K.transcriptMessage('RAAAA', 'f'.repeat(64)); const sig = K.sign(a.privateKey(), msg);
  assert.equal(K.verify(a.publicKey, msg, sig), true); assert.equal(K.verify(b.publicKey, msg, sig), false);
  process.env.NORIA_CLE_MAITRE = crypto.randomBytes(32).toString('hex');
  try {
    const sealed = K.seal('secret de test'); assert.equal(sealed.enc, 1); assert.ok(!sealed.value.includes('secret'));
    assert.equal(K.unseal(sealed.value, 1), 'secret de test');
  } finally { delete process.env.NORIA_CLE_MAITRE; }
});

test('RLS (PostgreSQL) : relevés et notifications cloisonnés par école', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  const n = await db.asSchool(ids.B.school, async (t) => ({
    tr: (await t.get('SELECT COUNT(*) AS n FROM transcript')).n, no: (await t.get('SELECT COUNT(*) AS n FROM notification')).n }));
  assert.equal(n.tr, 0); assert.equal(n.no, 0);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('DELETE FROM transcript')), /permission denied/);
  await assert.rejects(db.asSchool(ids.B.school, (t) => t.run("INSERT INTO notification (school_id, user_id, kind, title_fr, title_ht) VALUES (?,?,?,?,?)",
    ids.A.school, ids.A.users.parent1, 'x', 'x', 'x')), /row-level security/);
  const upd = await db.asSchool(ids.B.school, (t) => t.run("UPDATE transcript SET status = 'annule'"));
  assert.equal(upd.changes, 0);
});
