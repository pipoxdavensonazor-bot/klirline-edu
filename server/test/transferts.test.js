'use strict';
// Bloc 4 : lien entre écoles. Vérification minimale d'un élève (code + date de naissance), signalements réservés aux
// directions, décision de fin d'année, transfert de dossier (machine à états complète, consentement case ou code,
// approbation signée Ed25519, étape ministère, copie et archivage, certificat vérifiable), journal, assistant sécurité,
// cloisonnement RLS (PostgreSQL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer, createLimiter } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin } = require('../src/plateforme');
const { createSecurity } = require('../src/securite');
const T = require('../src/transferts');
const K = require('../src/cles');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
const FX = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
const BIRTH = '2014-01-01';
let db, server, base, ids, sec; const sent = []; const env = { NORIA_TRANSFERT_MINISTERE: '0' };
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
async function adminLogin() {
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  assert.equal(a.status, 200);
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  return (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
}
const pdfText = (buf) => { const zlib = require('node:zlib'); let out = ''; const s = buf.toString('latin1'); let i = 0;
  while ((i = s.indexOf('>>\nstream\n', i)) >= 0) { const e = s.indexOf('\nendstream', i); if (e < 0) break; try { out += zlib.inflateSync(Buffer.from(s.slice(i + 10, e), 'latin1')).toString('latin1'); } catch {} i = e + 10; } return out; };
const search = async (k, who, body) => call(await tok(k, who), 'POST', '/api/transferts/recherche', body);
const year = async (k) => (await db.get('SELECT id FROM school_year WHERE school_id = ?', ids[k].school)).id;
const events = (id) => db.all('SELECT from_status, to_status, actor FROM transfer_event WHERE transfer_id = ? ORDER BY id', id);

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  sec = createSecurity({ db, env: { NORIA_TZ: 'America/Port-au-Prince', NODE_TEST_CONTEXT: '1' }, notifier, log: () => {} });
  server = createServer(db, { notifier, env, security: sec, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 },
    searchLimit: { user: createLimiter({ max: 12 }), school: createLimiter({ max: 1000 }) } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  // Notes fictives de l'élève A-001 : deux publiées, une en brouillon (jamais transmise).
  const A = ids.A; const s = A.school;
  const ev = async (subj, title, status) => db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, s, A.classes[0], subj, A.terms[0], title, '2026-10-01', 20, 1, status, A.users.prof1);
  const gr = async (e, score) => db.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, updated_by, recorded_at) VALUES (?,?,?,?,?,?)', s, e, A.students[0], score, A.users.prof1, '2026-10-02');
  await gr(await ev(A.subjects.maths, 'Contrôle 1', 'publiee'), 15);
  await gr(await ev(A.subjects.francais, 'Dictée', 'publiee'), 13);
  await gr(await ev(A.subjects.francais, 'Brouillon secret', 'brouillon'), 1);
});
after(async () => { server.close(); await db.cleanup(); });

test('machine à états : transitions permises et interdites (acteurs, ministère activé ou non)', () => {
  const ok = [['demande', 'consentement', 'accueil'], ['demande', 'annule', 'accueil'], ['demande', 'annule', 'systeme'],
    ['consentement', 'approuve_origine', 'origine'], ['consentement', 'refuse', 'origine'], ['consentement', 'annule', 'accueil'],
    ['approuve_origine', 'transfere', 'systeme'], ['approuve_origine', 'annule', 'accueil']];
  for (const [a, b, who] of ok) assert.ok(T.canTransition(a, b, who), `${a} → ${b} (${who})`);
  const ko = [['demande', 'approuve_origine', 'origine'], ['demande', 'transfere', 'systeme'], ['demande', 'consentement', 'origine'], ['demande', 'refuse', 'origine'],
    ['consentement', 'approuve_origine', 'accueil'], ['consentement', 'refuse', 'accueil'], ['consentement', 'transfere', 'systeme'], ['consentement', 'annule', 'origine'],
    ['approuve_origine', 'approuve_ministere', 'ministere'], ['approuve_origine', 'refuse', 'ministere'], ['approuve_origine', 'transfere', 'origine'], ['approuve_origine', 'annule', 'origine'],
    ['approuve_ministere', 'annule', 'accueil'], ['approuve_ministere', 'refuse', 'origine']];
  for (const [a, b, who] of ko) assert.equal(T.canTransition(a, b, who), false, `${a} → ${b} (${who})`);
  for (const end of ['transfere', 'refuse', 'annule']) for (const to of Object.keys(T.MACHINE)) for (const who of ['accueil', 'origine', 'ministere', 'systeme'])
    assert.equal(T.canTransition(end, to, who, { ministere: true }), false, `${end} est terminal`);
  // Étape ministère activée : le ministère doit valider avant la copie.
  assert.equal(T.canTransition('approuve_origine', 'transfere', 'systeme', { ministere: true }), false);
  assert.ok(T.canTransition('approuve_origine', 'approuve_ministere', 'ministere', { ministere: true }));
  assert.ok(T.canTransition('approuve_origine', 'refuse', 'ministere', { ministere: true }));
  assert.ok(T.canTransition('approuve_ministere', 'transfere', 'systeme', { ministere: true }));
});

test('recherche : date de naissance obligatoire, réservée à la direction et au secrétariat, résultat minimal', async () => {
  for (const body of [{ code: 'A-001' }, { code: 'A-001', birth_date: '' }]) {
    const r = await search('B', 'secretariat', body); assert.equal(r.status, 400); assert.match(r.json.error, /date de naissance obligatoire/);
  }
  assert.equal((await search('B', 'secretariat', { code: 'A-001', birth_date: '01/01/2014' })).status, 400);
  for (const who of ['prof1', 'parent1', 'eleve1', 'compta', 'biblio']) assert.equal((await search('B', who, { code: 'A-001', birth_date: BIRTH })).status, 403, who);
  // Code inconnu et mauvaise date : même réponse (pas d'énumération).
  assert.deepEqual((await search('B', 'secretariat', { code: 'ZZ-999', birth_date: BIRTH })).json, { existe: false });
  assert.deepEqual((await search('B', 'secretariat', { code: 'A-001', birth_date: '2014-01-02' })).json, { existe: false });
  const r = await search('B', 'secretariat', { code: 'a-001', birth_date: BIRTH });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['annee', 'decision', 'derniere_classe', 'ecole', 'eleve', 'existe', 'meme_ecole', 'precedente', 'signalements', 'statut', 'transfert_en_cours']);
  assert.deepEqual(r.json.eleve, { prenom: 'Ana', nom: 'F.' });
  assert.equal(r.json.ecole.nom, 'École fictive A'); assert.equal(r.json.statut, 'inscrit');
  assert.equal(r.json.derniere_classe, '7e A'); assert.equal(r.json.annee, '2026-2027'); assert.equal(r.json.decision, null);
  const raw = JSON.stringify(r.json);
  for (const leak of ['FictifA', '15', 'santé', 'famille', 'Contrôle', 'birth', '2014', 'parent', String(ids.A.students[0]) + ',']) assert.ok(!raw.includes(leak), `fuite : ${leak}`);
  // Journal : l'école qui cherche et l'école d'origine (sans nom de compte de B).
  assert.ok(await db.get("SELECT id FROM audit_log WHERE school_id = ? AND action = 'transfert.recherche' AND record_id = 'A-001'", ids.B.school));
  const o = await db.get("SELECT actor_user_id, reason FROM audit_log WHERE school_id = ? AND action = 'transfert.consultation' ORDER BY id DESC", ids.A.school);
  assert.equal(o.actor_user_id, null); assert.match(o.reason, /École fictive B/);
});

test('décision de fin d\'année : saisie par la direction seulement, visible dans la vérification', async () => {
  const y = await year('A');
  assert.equal((await call(await tok('A', 'secretariat'), 'PUT', `/api/students/${ids.A.students[0]}/decision`, { school_year_id: y, decision: 'admis' })).status, 403);
  assert.equal((await call(await tok('A', 'direction'), 'PUT', `/api/students/${ids.A.students[0]}/decision`, { school_year_id: y, decision: 'passe' })).status, 400);
  assert.equal((await call(await tok('B', 'direction'), 'PUT', `/api/students/${ids.A.students[0]}/decision`, { school_year_id: y, decision: 'admis' })).status, 404);
  assert.equal((await call(await tok('A', 'direction'), 'PUT', `/api/students/${ids.A.students[0]}/decision`, { school_year_id: y, decision: 'redouble' })).status, 200);
  assert.equal((await call(await tok('A', 'direction'), 'PUT', `/api/students/${ids.A.students[0]}/decision`, { school_year_id: y, decision: 'admis' })).status, 200);
  const l = await call(await tok('A', 'secretariat'), 'GET', `/api/decisions?class_id=${ids.A.classes[0]}`);
  assert.equal(l.json.eleves[0].decision, 'admis');
  assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'decision.fin_annee' AND reason LIKE '%redouble → admis%'"));
  assert.deepEqual((await search('B', 'direction', { code: 'A-001', birth_date: BIRTH })).json.decision, { valeur: 'admis', annee: '2026-2027' });
});

test('signalement : posé et levé par la direction d\'origine ; texte visible seulement par les directions', async () => {
  const dA = await tok('A', 'direction');
  assert.equal((await call(await tok('A', 'secretariat'), 'POST', '/api/signalements', { code: 'A-001', categorie: 'dette', date: '2026-10-01' })).status, 403);
  assert.equal((await call(dA, 'POST', '/api/signalements', { code: 'A-001', categorie: 'vol', date: '2026-10-01' })).status, 400);
  assert.equal((await call(dA, 'POST', '/api/signalements', { code: 'A-001', categorie: 'dette', date: '2999-01-01' })).status, 400);
  const f = await call(dA, 'POST', '/api/signalements', { code: 'A-001', categorie: 'dette', date: '2026-10-01', texte: 'Frais du 1er trimestre impayés (fictif)' });
  assert.equal(f.status, 200);
  const dir = await search('B', 'direction', { code: 'A-001', birth_date: BIRTH });
  assert.deepEqual(dir.json.signalements, [{ categorie: 'dette', date: '2026-10-01', ecole: 'École fictive A', texte: 'Frais du 1er trimestre impayés (fictif)' }]);
  const secr = await search('B', 'secretariat', { code: 'A-001', birth_date: BIRTH });
  assert.deepEqual(secr.json.signalements, [{ categorie: 'dette', date: '2026-10-01', ecole: 'École fictive A' }]);
  // Dans l'école d'origine : le secrétariat voit la liste sans le texte.
  assert.equal((await call(await tok('A', 'secretariat'), 'GET', '/api/signalements')).json[0].texte, undefined);
  assert.equal((await call(dA, 'GET', '/api/signalements')).json[0].texte, 'Frais du 1er trimestre impayés (fictif)');
  assert.equal((await call(await tok('B', 'direction'), 'GET', '/api/signalements')).json.length, 0);
  // Une autre école ne peut ni lever ni voir ce signalement.
  assert.equal((await call(await tok('B', 'direction'), 'POST', `/api/signalements/${f.json.id}/lever`, { motif: 'x' })).status, 404);
  const g = await call(dA, 'POST', '/api/signalements', { code: 'A-001', categorie: 'document_manquant', date: '2026-10-02' });
  assert.equal((await call(dA, 'POST', `/api/signalements/${g.json.id}/lever`, {})).status, 400, 'motif obligatoire');
  assert.equal((await call(dA, 'POST', `/api/signalements/${g.json.id}/lever`, { motif: 'Acte de naissance reçu', date: '2026-10-03' })).status, 200);
  assert.equal((await call(dA, 'POST', `/api/signalements/${g.json.id}/lever`, { motif: 'encore' })).status, 409);
  assert.equal((await search('B', 'direction', { code: 'A-001', birth_date: BIRTH })).json.signalements.length, 1, 'signalement levé : plus affiché');
  for (const a of ['signalement.poser', 'signalement.lever']) assert.ok(await db.get('SELECT id FROM audit_log WHERE school_id = ? AND action = ?', ids.A.school, a), a);
});

let trA; // transfert complet de A-001 (A → B)
test('transfert : consentement par case, approbation signée, copie complète, archivage, certificat vérifiable', async () => {
  const sB = await tok('B', 'secretariat'), dA = await tok('A', 'direction');
  // Relevé émis pour A-001 avant le transfert (signature d'origine conservée).
  await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', FX('signature-fictive.jpg'), 'Direction fictive A', ids.A.school);
  const rq = await call(await tok('A', 'eleve1'), 'POST', '/api/releves', { student_id: ids.A.students[0], term_id: ids.A.terms[0] });
  const em = await call(dA, 'POST', `/api/releves/${rq.json.id}/approuver`, {});
  assert.equal(em.status, 200, JSON.stringify(em.json));
  const tr = await db.get('SELECT code, pdf, key_id FROM transcript WHERE id = ?', rq.json.id);
  // Badge valide qui doit être révoqué (jamais copié).
  await db.insert('INSERT INTO badge (school_id, student_id, school_year_id, token_hash, token_nonce, class_name, expires_on, issued_by) VALUES (?,?,?,?,?,?,?,?)',
    ids.A.school, ids.A.students[0], await year('A'), 'hash-fictif-1', 'nonce-fictif-1', '7e A', '2027-08-31', ids.A.users.direction);

  assert.equal((await call(sB, 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH })).status, 400, 'consentement obligatoire');
  assert.equal((await call(sB, 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif', accord: false } })).status, 400);
  assert.equal((await call(sB, 'POST', '/api/transferts', { code: 'A-001', consentement: { mode: 'case', parent: 'Parent fictif', accord: true } })).status, 400, 'date obligatoire');
  assert.equal((await call(await tok('B', 'prof1'), 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif', accord: true } })).status, 403);
  assert.equal((await call(dA, 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif', accord: true } })).status, 409, 'même école');
  const c = await call(sB, 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH, class_id: ids.B.classes[0], motif: 'Déménagement (fictif)', consentement: { mode: 'case', parent: 'Parent fictif 1 A', accord: true } });
  assert.equal(c.status, 200, JSON.stringify(c.json)); trA = c.json.id;
  assert.equal(c.json.statut, 'consentement'); assert.equal(c.json.sens, 'envoye'); assert.equal(c.json.eleve, 'Ana F.');
  assert.equal((await call(sB, 'POST', '/api/transferts', { code: 'A-001', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif', accord: true } })).status, 409, 'un seul transfert en cours');
  assert.equal((await search('B', 'direction', { code: 'A-001', birth_date: BIRTH })).json.transfert_en_cours, true);
  // Vu de l'origine : élève nommé en entier, sens « reçu ».
  const l = await call(dA, 'GET', '/api/transferts');
  assert.equal(l.json.ministere, false); assert.equal(l.json.items[0].sens, 'recu'); assert.equal(l.json.items[0].eleve, 'Ana FictifA');
  // Interdits : secrétariat d'origine, école d'accueil, annulation par l'origine.
  assert.equal((await call(await tok('A', 'secretariat'), 'POST', `/api/transferts/${trA}/approuver`, {})).status, 403);
  assert.equal((await call(await tok('B', 'direction'), 'POST', `/api/transferts/${trA}/approuver`, {})).status, 404);
  assert.equal((await call(dA, 'POST', `/api/transferts/${trA}/annuler`, { motif: 'non' })).status, 403);
  assert.equal((await call(dA, 'POST', `/api/transferts/${trA}/consentement`, { code: '123456' })).status, 404);
  assert.equal((await call(sB, 'GET', `/api/transferts/${trA}/certificat`)).status, 409);
  // Sans signature téléversée : refus.
  const keep = await db.get('SELECT signature FROM school WHERE id = ?', ids.A.school);
  await db.run('UPDATE school SET signature = NULL WHERE id = ?', ids.A.school);
  assert.equal((await call(dA, 'POST', `/api/transferts/${trA}/approuver`, {})).status, 409);
  await db.run('UPDATE school SET signature = ? WHERE id = ?', keep.signature, ids.A.school);

  const ap = await call(dA, 'POST', `/api/transferts/${trA}/approuver`, {});
  assert.equal(ap.status, 200, JSON.stringify(ap.json));
  assert.equal(ap.json.statut, 'transfere'); assert.match(ap.json.certificat, /^T-/);
  assert.deepEqual(await events(trA), [
    { from_status: null, to_status: 'demande', actor: 'accueil' }, { from_status: 'demande', to_status: 'consentement', actor: 'accueil' },
    { from_status: 'consentement', to_status: 'approuve_origine', actor: 'origine' }, { from_status: 'approuve_origine', to_status: 'transfere', actor: 'systeme' }]);
  const row = await db.get('SELECT * FROM transfer WHERE id = ?', trA);
  assert.equal(row.ministry_required, 0); assert.ok(await T.verifyRequest(db, row));

  // Copie vers B : identité, classes, décision, notes publiées, relevé avec signature d'origine ; code élève déplacé.
  const nb = await db.get('SELECT * FROM student WHERE school_id = ? AND code = ?', ids.B.school, 'A-001');
  assert.equal(nb.status, 'actif'); assert.equal(nb.first_name, 'Ana'); assert.equal(nb.birth_date, BIRTH);
  assert.equal(nb.health_notes, null, 'santé non copiée'); assert.equal(nb.family_notes, null, 'famille non copiée');
  assert.equal((await db.get('SELECT school_id FROM student_code WHERE code = ?', 'A-001')).school_id, ids.B.school);
  assert.ok(await db.get("SELECT id FROM enrollment WHERE school_id = ? AND student_id = ? AND class_id = ? AND status = 'actif'", ids.B.school, nb.id, ids.B.classes[0]));
  assert.deepEqual(JSON.parse(row.summary), { classes: 1, decisions: 1, notes: 2, releves: 1 });
  const h = await call(await tok('B', 'direction'), 'GET', `/api/students/${nb.id}/historique`);
  assert.equal(h.status, 200);
  assert.equal(h.json.classes[0].libelle, '7e A'); assert.equal(h.json.decisions[0].libelle, 'admis');
  assert.deepEqual(h.json.notes.map((n) => n.evaluation).sort(), ['Contrôle 1', 'Dictée']);
  assert.ok(!JSON.stringify(h.json).includes('Brouillon secret'), 'notes non publiées exclues');
  assert.equal(h.json.releves.length, 1); assert.equal(h.json.releves[0].signature_valide, true); assert.equal(h.json.releves[0].cle, tr.key_id);
  const rp = await call(await tok('B', 'direction'), 'GET', `/api/historique/${h.json.releves[0].id}/pdf`);
  assert.equal(rp.status, 200); assert.equal(rp.buf.toString('base64'), tr.pdf, 'relevé d’origine identique');
  assert.ok(!(await db.get('SELECT id FROM badge WHERE school_id = ?', ids.B.school)), 'badges exclus');
  // Origine : archive en lecture, élève « transféré », inscription close, badges révoqués.
  const old = await db.get('SELECT * FROM student WHERE id = ?', ids.A.students[0]);
  assert.equal(old.status, 'transfere'); assert.equal(old.transfer_id, trA);
  assert.equal((await db.get('SELECT status FROM enrollment WHERE student_id = ? AND school_id = ?', old.id, ids.A.school)).status, 'transfere');
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM badge WHERE school_id = ? AND student_id = ? AND status = 'valide'", ids.A.school, old.id)).n, 0);
  assert.equal((await call(dA, 'GET', `/api/students/${old.id}`)).status, 200, 'lecture conservée');
  assert.equal((await call(dA, 'PATCH', `/api/students/${old.id}`, { first_name: 'Autre', reason: 'test' })).status, 409, 'archive en lecture seule');
  assert.equal((await call(dA, 'PUT', `/api/students/${old.id}/decision`, { school_year_id: await year('A'), decision: 'echec' })).status, 409);
  await assert.rejects(db.run("UPDATE student SET first_name = 'X' WHERE id = ?", old.id), /lecture seule/);
  // Après la clôture, plus aucune transition.
  assert.equal((await call(dA, 'POST', `/api/transferts/${trA}/refuser`, { motif: 'trop tard' })).status, 409);
  assert.equal((await call(sB, 'POST', `/api/transferts/${trA}/annuler`, { motif: 'trop tard' })).status, 409);
  await assert.rejects(db.run("UPDATE transfer SET status = 'annule' WHERE id = ?", trA), /lecture seule/);
  await assert.rejects(db.run('DELETE FROM transfer WHERE id = ?', trA), /suppression interdite/);
  // Notifications à chaque étape (accueil et origine) ; journal des deux écoles.
  for (const st of ['demande', 'consentement', 'approuve_origine', 'transfere'])
    assert.ok(await db.get('SELECT id FROM notification WHERE school_id = ? AND kind = ? AND ref = ?', ids.B.school, `transfert.${st}`, String(trA)), st);
  assert.ok(await db.get("SELECT id FROM notification WHERE school_id = ? AND kind = 'transfert.transfere'", ids.A.school));
  for (const sid of [ids.A.school, ids.B.school]) assert.ok(await db.get("SELECT id FROM audit_log WHERE school_id = ? AND action = 'transfert.transfere' AND record_id = ?", sid, String(trA)));
  assert.ok(sent.some((m) => /dossier est maintenant à École fictive B/.test(m.text || m.sms || m.body || '')), 'parent informé');

  // Certificat : deux en-têtes, signatures, QR ; vérification publique authentique / modifié.
  const pdf = await call(sB, 'GET', `/api/transferts/${trA}/certificat`);
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const txt = pdfText(pdf.buf);
  for (const s of ['Certificat de transfert', 'cole fictive A', 'cole fictive B', 'Ana FictifA', 'A-001', 'Ed25519']) assert.ok(txt.includes(s), s);
  assert.ok(!txt.includes('15') || !txt.includes('Contrôle 1'), 'aucune note');
  const code = row.code;
  const v = await call(null, 'GET', `/api/verifier/${code}`);
  assert.equal(v.status, 200); assert.equal(v.json.type, 'transfert'); assert.equal(v.json.statut, 'valide'); assert.equal(v.json.eleve, 'Ana F.'); assert.equal(v.json.ecole_accueil, 'École fictive B');
  assert.equal((await call(null, 'POST', `/api/verifier/${code}/fichier`, { pdf: pdf.buf.toString('base64') })).json.resultat, 'authentique');
  const bad = Buffer.from(pdf.buf); bad[bad.length - 40] ^= 1;
  assert.equal((await call(null, 'POST', `/api/verifier/${code}/fichier`, { pdf: bad.toString('base64') })).json.resultat, 'modifie');
  // Nouvelle vérification : élève désormais à B ; l'école A apparaît comme école précédente.
  const s2 = await search('A', 'direction', { code: 'A-001', birth_date: BIRTH });
  assert.equal(s2.json.ecole.nom, 'École fictive B'); assert.equal(s2.json.statut, 'inscrit'); assert.equal(s2.json.precedente.ecole, 'École fictive A');
  assert.equal((await search('B', 'direction', { code: 'A-001', birth_date: BIRTH })).json.meme_ecole, true);
});

test('transfert : consentement par code au parent rattaché, puis refus motivé de l\'origine', async () => {
  const sB = await tok('B', 'secretariat'), dA = await tok('A', 'direction');
  sent.length = 0;
  const c = await call(sB, 'POST', '/api/transferts', { code: 'A-002', birth_date: BIRTH, consentement: { mode: 'otp' } });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal(c.json.statut, 'demande'); assert.equal(c.json.code_envoye.destinataire, '+509****08');
  const msg = sent.find((m) => /demande le dossier/.test(m.text || ''));
  assert.ok(msg, 'code envoyé au parent rattaché'); const code = msg.text.match(/école : (\d{6})/)[1];
  // L'origine n'a rien à examiner tant que le parent n'a pas consenti.
  assert.equal((await call(dA, 'GET', '/api/transferts')).json.items.filter((x) => x.id === c.json.id).length, 0);
  assert.equal((await call(dA, 'POST', `/api/transferts/${c.json.id}/approuver`, {})).status, 404);
  assert.equal((await call(sB, 'POST', `/api/transferts/${c.json.id}/consentement`, { code: code === '000000' ? '111111' : '000000' })).status, 400);
  const ok = await call(sB, 'POST', `/api/transferts/${c.json.id}/consentement`, { code });
  assert.equal(ok.status, 200); assert.equal(ok.json.statut, 'consentement'); assert.match(ok.json.consentement.parent, /Parent rattaché/);
  assert.equal((await call(sB, 'POST', `/api/transferts/${c.json.id}/consentement`, { code })).status, 409, 'usage unique');
  assert.equal((await call(sB, 'POST', `/api/transferts/${c.json.id}/code`, {})).status, 409);
  assert.equal((await call(dA, 'POST', `/api/transferts/${c.json.id}/refuser`, {})).status, 400, 'motif obligatoire');
  const r = await call(dA, 'POST', `/api/transferts/${c.json.id}/refuser`, { motif: 'Dossier incomplet (fictif)' });
  assert.equal(r.status, 200); assert.equal(r.json.statut, 'refuse'); assert.equal(r.json.motif_refus, 'Dossier incomplet (fictif)');
  assert.equal((await call(dA, 'POST', `/api/transferts/${c.json.id}/approuver`, {})).status, 409);
  assert.equal((await db.get('SELECT status FROM student WHERE id = ?', ids.A.students[1])).status, 'actif', 'rien n’est copié');
  assert.ok(sent.some((m) => /refusé par l’école d’origine/.test(m.text || '')));
});

test('transfert : annulation par l\'école d\'accueil et expiration automatique', async () => {
  const sB = await tok('B', 'secretariat');
  const c = await call(sB, 'POST', '/api/transferts', { code: 'A-002', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif 2 A', accord: true } });
  assert.equal(c.status, 200);
  assert.equal((await call(sB, 'POST', `/api/transferts/${c.json.id}/annuler`, {})).status, 400);
  const a = await call(sB, 'POST', `/api/transferts/${c.json.id}/annuler`, { motif: 'Famille restée à A (fictif)' });
  assert.equal(a.json.statut, 'annule');
  const d = await call(sB, 'POST', '/api/transferts', { code: 'A-002', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif 2 A', accord: true } });
  await db.run("UPDATE transfer SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", d.json.id);
  const l = await call(sB, 'GET', '/api/transferts');
  const it = l.json.items.find((x) => x.id === d.json.id);
  assert.equal(it.statut, 'annule'); assert.match(it.motif_annulation, /Délai expiré/);
  assert.deepEqual((await events(d.json.id)).at(-1), { from_status: 'consentement', to_status: 'annule', actor: 'systeme' });
});

test('étape ministère : désactivée par défaut (404), activée elle bloque la copie jusqu\'à l\'autorisation', async () => {
  const sA = await tok('A', 'secretariat'), dB = await tok('B', 'direction');
  const adm = await adminLogin();
  const H = { 'x-noria': '1' };
  const acall = async (m, p, body) => { const res = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${adm}`, ...H }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch {} return { status: res.status, json }; };
  assert.equal((await acall('GET', '/api/admin/transferts')).status, 404);
  assert.equal((await acall('POST', `/api/admin/transferts/${trA}/ministere`, { decision: 'approuver' })).status, 404);
  assert.equal((await call(dB, 'GET', '/api/admin/transferts')).status, 401);

  env.NORIA_TRANSFERT_MINISTERE = '1';
  try {
    await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', FX('signature-fictive.jpg'), 'Direction fictive B', ids.B.school);
    const c = await call(sA, 'POST', '/api/transferts', { code: 'B-002', birth_date: BIRTH, consentement: { mode: 'case', parent: 'Parent fictif 2 B', accord: true } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    const ap = await call(dB, 'POST', `/api/transferts/${c.json.id}/approuver`, {});
    assert.equal(ap.json.statut, 'approuve_origine'); assert.equal(ap.json.ministere, true);
    assert.equal((await db.get('SELECT status FROM student WHERE id = ?', ids.B.students[1])).status, 'actif', 'pas de copie avant le ministère');
    assert.equal((await call(dB, 'POST', `/api/transferts/${c.json.id}/approuver`, {})).status, 409);
    const list = await acall('GET', '/api/admin/transferts');
    assert.equal(list.status, 200); assert.equal(list.json.length, 1); assert.equal(list.json[0].eleve, 'Bèl F.');
    assert.equal((await acall('POST', `/api/admin/transferts/${c.json.id}/ministere`, { decision: 'refuser' })).status, 400, 'motif obligatoire');
    // Signature altérée : une donnée signée (nom du parent) modifiée en base → autorisation impossible.
    const orig = (await db.get('SELECT consent_parent FROM transfer WHERE id = ?', c.json.id)).consent_parent;
    await db.run("UPDATE transfer SET consent_parent = 'Parent falsifié' WHERE id = ?", c.json.id);
    const bad = await acall('POST', `/api/admin/transferts/${c.json.id}/ministere`, { decision: 'approuver' });
    assert.equal(bad.status, 409); assert.match(bad.json.error, /signature/);
    assert.equal((await db.get('SELECT status FROM transfer WHERE id = ?', c.json.id)).status, 'approuve_origine');
    assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'transfert.signature_invalide' AND school_id = ?", ids.B.school));
    await assert.rejects(db.run("UPDATE transfer SET signature = 'AAAA' WHERE id = ?", c.json.id), /signature figée/);
    await db.run('UPDATE transfer SET consent_parent = ? WHERE id = ?', orig, c.json.id);
    const ok = await acall('POST', `/api/admin/transferts/${c.json.id}/ministere`, { decision: 'approuver', motif: 'Conforme (fictif)' });
    assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.statut, 'transfere');
    assert.deepEqual((await events(c.json.id)).map((e) => e.to_status), ['demande', 'consentement', 'approuve_origine', 'approuve_ministere', 'transfere']);
    assert.equal((await db.get('SELECT status FROM student WHERE id = ?', ids.B.students[1])).status, 'transfere');
    assert.ok(await db.get("SELECT id FROM student WHERE school_id = ? AND code = 'B-002' AND status = 'actif'", ids.A.school));
    assert.ok(await db.get("SELECT id FROM platform_audit WHERE action = 'admin.transfert.ministere'"));
    const pdf = await call(sA, 'GET', `/api/transferts/${c.json.id}/certificat`);
    assert.ok(pdfText(pdf.buf).includes('Approuv'), 'étape ministère sur le certificat');
    fs.writeFileSync(path.join(require('node:os').tmpdir(), 'noria-certificat-test.pdf'), pdf.buf);
  } finally { env.NORIA_TRANSFERT_MINISTERE = '0'; }
});

test('limite de débit dédiée à la vérification et règle de l\'assistant sécurité', async () => {
  let n = 0, r;
  do { r = await search('B', 'secretariat', { code: `ZZ-${100 + n}`, birth_date: BIRTH }); n++; } while (r.status === 200 && n < 40);
  assert.equal(r.status, 429); assert.ok(n <= 13, `bloqué après ${n} recherches`); assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.ok(await db.get("SELECT id FROM audit_log WHERE action = 'transfert.recherche' AND outcome = 'refuse'"));
  await sec.flush();
  const evs = await db.get("SELECT COUNT(*) AS n, SUM(CASE WHEN detail = 'introuvable' THEN 1 ELSE 0 END) AS miss FROM security_event WHERE kind = 'recherche' AND school_id = ?", ids.B.school);
  assert.ok(Number(evs.n) >= 10 && Number(evs.miss) >= 10, JSON.stringify(evs));
  await sec.analyse({ backups: () => [], dbSize: () => 0 });
  const al = await db.get("SELECT * FROM security_alert WHERE rule = 'recherches_eleves' AND status = 'ouverte'");
  assert.ok(al, 'alerte « recherches_eleves »'); assert.match(al.explain_fr, /vérifications d’élèves/); assert.ok(al.explain_ht.length > 20);
  assert.match(al.fingerprint, new RegExp(`e:${ids.B.school}$`));
});

test('cloisonnement : signature Ed25519 altérée refusée ; aucune lecture directe d\'une autre école (RLS)', async (t) => {
  const keys = await K.schoolKeys(db, ids.A.school);
  const row = await db.get('SELECT * FROM transfer WHERE id = ?', trA);
  const msg = Buffer.from(T.requestPayload(row), 'utf8');
  assert.ok(K.verify(keys.publicKey, msg, row.signature));
  const sig = Buffer.from(row.signature, 'base64'); sig[5] ^= 0xff;
  assert.equal(K.verify(keys.publicKey, msg, sig.toString('base64')), false);
  assert.equal(K.verify(keys.publicKey, Buffer.from(T.requestPayload({ ...row, to_school_id: 999 })), row.signature), false);
  if (!PG) { t.diagnostic('PostgreSQL requis (NORIA_TEST_PG) pour les politiques RLS'); return; }
  const nb = await db.get("SELECT id FROM student WHERE school_id = ? AND code = 'A-001'", ids.B.school);
  const asA = (f) => db.asSchool(ids.A.school, f), asB = (f) => db.asSchool(ids.B.school, f);
  // Chaque refus dans sa propre transaction (PostgreSQL annule la transaction après une erreur).
  await assert.rejects(asA((x) => x.all('SELECT id FROM transfer')), /permission denied/);
  await assert.rejects(asB((x) => x.all('SELECT id FROM transfer_event')), /permission denied/);
  await assert.rejects(asB((x) => x.run("UPDATE transfer SET status = 'annule'")), /permission denied/);
  assert.equal((await asA((x) => x.all('SELECT id FROM student_history WHERE student_id = ?', nb.id))).length, 0);
  assert.equal((await asA((x) => x.all('SELECT id FROM student WHERE id = ?', nb.id))).length, 0);
  assert.equal((await asB((x) => x.all('SELECT id FROM student_flag'))).length, 0, 'signalements de A invisibles');
  assert.equal((await asB((x) => x.all('SELECT id FROM year_decision'))).length, 0, 'décisions de A invisibles');
  assert.ok((await asB((x) => x.all('SELECT id FROM student_history'))).length > 0);
  await assert.rejects(asB((x) => x.run('INSERT INTO student_history (school_id, student_id, kind, source_school, data) VALUES (?,?,?,?,?)', ids.B.school, nb.id, 'note', 'Faux', '{}')), /permission denied/);
  await assert.rejects(asB((x) => x.run('DELETE FROM student_history')), /permission denied/);
  await assert.rejects(asA((x) => x.run('DELETE FROM student_flag')), /permission denied/);
  await assert.rejects(asA((x) => x.run('INSERT INTO year_decision (school_id, student_id, school_year_id, decision, decided_by) VALUES (?,?,?,?,?)', ids.B.school, nb.id, 1, 'admis', 1)), /row-level security/);
  assert.equal((await asB((x) => x.run("UPDATE student SET first_name = 'X' WHERE id = ?", ids.A.students[1]))).changes, 0, 'élève de A hors d’atteinte');
});
