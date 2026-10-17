'use strict';
// Couverture de la sauvegarde logique : chaque table du schéma (SQLite et PostgreSQL) est sauvegardée ou exclue avec
// une raison ; ordre compatible avec les clés étrangères ; aller-retour complet sur une base vide (blocs 4 à 6 inclus)
// avec signatures des déclarations et des transferts toujours valides, journaux intacts et toujours en ajout seul ;
// chiffrement AES-256-GCM (format NORIAGCM1) facultatif.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, seedPortal, seedMinistere, DEMO_PASSWORD } = require('../src/seed');
const { createSecurity } = require('../src/securite');
const B = require('../src/backup');
const M = require('../src/ministere');
const T = require('../src/transferts');

let src;
before(async () => { src = await openTestDb(); });
after(async () => { await src.cleanup(); });

async function schemaTables(db) {
  if (db.kind === 'pg') return (await db.all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")).map((r) => r.name);
  return (await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).map((r) => r.name);
}
async function foreignKeys(db) { // [[table, table référencée]]
  if (db.kind === 'pg') return (await db.all(`SELECT c.conrelid::regclass::text AS t, c.confrelid::regclass::text AS r FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = current_schema()`)).map((x) => [x.t.replace(/^.*\./, ''), x.r.replace(/^.*\./, '')]);
  const out = [];
  for (const t of await schemaTables(db)) for (const f of await db.all(`PRAGMA foreign_key_list(${t})`)) out.push([t, f.table]);
  return out;
}

test(`chaque table du schéma est sauvegardée ou exclue avec une raison (${PG ? 'PostgreSQL' : 'SQLite'})`, async () => {
  const tables = await schemaTables(src);
  const saved = new Set(B.TABLES), excluded = new Set(Object.keys(B.EXCLUDED));
  const orphan = tables.filter((t) => !saved.has(t) && !excluded.has(t));
  assert.deepEqual(orphan, [], `tables ni sauvegardées ni exclues (ajoutez-les à TABLES ou à EXCLUDED avec une raison) : ${orphan.join(', ')}`);
  assert.deepEqual(B.TABLES.filter((t) => excluded.has(t)), [], 'une table ne peut pas être à la fois sauvegardée et exclue');
  assert.deepEqual([...saved, ...excluded].filter((t) => !tables.includes(t)), [], 'listes à jour (aucune table disparue)');
  assert.equal(saved.size, B.TABLES.length, 'pas de doublon');
  for (const [t, why] of Object.entries(B.EXCLUDED)) assert.ok(why && why.length >= 15, `raison d'exclusion pour ${t}`);
  // Clés étrangères : la table référencée est sauvegardée et restaurée avant.
  for (const [t, r] of await foreignKeys(src)) {
    if (!saved.has(t) || t === r) continue;
    assert.ok(saved.has(r), `${t} référence ${r}, qui n'est pas sauvegardée`);
    assert.ok(B.TABLES.indexOf(r) < B.TABLES.indexOf(t), `${r} doit précéder ${t} dans TABLES`);
  }
});

test('aller-retour complet (blocs 1 à 6) sur une base vide : contenu identique, signatures et journaux valides, chiffrement', async () => {
  const ids = await seedMulti(src, await seed(src)); await seedPortal(src, ids); await seedMinistere(src, ids);
  // Image du portail (vignette fictive) liée à une publicité, et un clic.
  const img = await src.insert('INSERT INTO portal_image (school_id, mime, data, width, height, bytes, sha256, created_by) VALUES (?,?,?,?,?,?,?,?)',
    ids.A.school, 'image/jpeg', fs.readFileSync(path.join(__dirname, 'fixtures', 'signature-fictive.jpg')).toString('base64'), 10, 10, 100, 'f'.repeat(64), ids.A.users.direction);
  const ad = await src.get('SELECT id FROM portal_ad ORDER BY id LIMIT 1');
  if (ad) await src.run('UPDATE portal_ad SET image_id = ? WHERE id = ?', img, ad.id);
  // Activité réelle par HTTP : transfert avec étape ministère signée, consultation nominative, assistant sécurité.
  const sent = []; const env = { NORIA_MINISTERE: '1', NORIA_TRANSFERT_MINISTERE: '1' };
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  const sec = createSecurity({ db: src, env: { NORIA_TZ: 'America/Port-au-Prince', NODE_TEST_CONTEXT: '1', NORIA_ASSISTANT_SEUILS: JSON.stringify({ ministereNominatifHeure: 1 }) }, notifier, log: () => {} });
  const server = createServer(src, { notifier, env, security: sec, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (token, method, p, body) => { const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-noria': '1', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch {} return { status: res.status, json }; };
  const login = async (k, who) => (await call(null, 'POST', '/api/login', { school: `ecole-${k}`, identifier: `${who}@${k}.exemple.invalid`, password: DEMO_PASSWORD })).json.token;
  let code;
  try {
    const sA = await login('a', 'secretariat'), dB = await login('b', 'direction');
    const sig = fs.readFileSync(path.join(__dirname, 'fixtures', 'signature-fictive.jpg')).toString('base64');
    await src.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', sig, 'Direction fictive B', ids.B.school);
    const c = await call(sA, 'POST', '/api/transferts', { code: 'B-002', birth_date: '2014-01-01', consentement: { mode: 'case', parent: 'Parent fictif 2 B', accord: true } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.equal((await call(dB, 'POST', `/api/transferts/${c.json.id}/approuver`, {})).json.statut, 'approuve_origine');
    await call(null, 'POST', '/api/ministere/login/code', { identifier: 'inspection@ministere.exemple.invalid' });
    const m = (await call(null, 'POST', '/api/ministere/login', { identifier: 'inspection@ministere.exemple.invalid', code: sent.at(-1).text.match(/code (\d{6})/)[1] })).json.token;
    assert.equal((await call(m, 'POST', `/api/ministere/transferts/${c.json.id}`, { decision: 'approuver', motif: 'Conforme (fictif)' })).json.statut, 'transfere');
    assert.equal((await call(m, 'POST', `/api/ministere/eleves/${ids.A.students[0]}`, { motif: 'Contrôle fictif de sauvegarde' })).status, 200);
    assert.equal((await call(m, 'POST', `/api/ministere/eleves/${ids.A.students[1]}`, { motif: 'Contrôle fictif de sauvegarde' })).status, 200);
    await sec.flush(); await sec.analyse({ backups: () => [], dbSize: async () => 0 });
    code = (await src.get('SELECT code FROM transfer WHERE id = ?', c.json.id)).code;
  } finally { server.close(); }

  const data = B.fromFile(B.toFile(await B.dump(src)));
  for (const t of ['transfer', 'transfer_event', 'student_history', 'year_decision', 'school_key', 'portal_item', 'portal_image', 'portal_ad', 'ministry_account', 'ministry_key',
    'ministry_audit', 'annual_declaration', 'declaration_event', 'security_event', 'security_alert', 'notification', 'audit_log'])
    assert.ok(data.tables[t].length > 0, `données présentes dans ${t}`);

  const dst = await openTestDb();
  try {
    const counts = await B.restore(dst, data);
    assert.equal(counts.annual_declaration, data.tables.annual_declaration.length);
    assert.deepEqual((await B.dump(dst)).tables, data.tables, 'contenu identique après restauration');
    // Signatures Ed25519 des déclarations (clés des écoles restaurées).
    const decl = await dst.all('SELECT * FROM annual_declaration ORDER BY id');
    assert.ok(decl.length >= 3);
    for (const d of decl) assert.equal((await M.verifyDeclaration(dst, d)).valide, true, `déclaration ${d.id}`);
    // Transfert : signature de l'école et du ministère, vérification publique sur la base restaurée.
    const t = await dst.get('SELECT * FROM transfer WHERE code = ?', code);
    assert.equal(await T.verifyMinistry(dst, t), true);
    for (const x of ['session', 'ministry_session', 'ministry_login', 'platform_session']) assert.equal(Number((await dst.get(`SELECT COUNT(*) AS n FROM ${x}`)).n), 0, `${x} non restaurée`);
    const srv = createServer(dst, { env: { NORIA_MINISTERE: '1' }, staticRoot: false }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const v = await (await fetch(`http://127.0.0.1:${srv.address().port}/api/verifier/${code}`)).json();
      assert.equal(v.authentique, true); assert.equal(v.ministere.valide, true);
      // Connexion possible après restauration (mot de passe), sessions non restaurées.
      const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }) });
      assert.equal(r.status, 200);
    } finally { srv.close(); }
    // Journaux : historiques cohérents (dernier événement = statut), toujours en ajout seul, compteurs repartis.
    const ev = await dst.all('SELECT to_status FROM transfer_event WHERE transfer_id = ? ORDER BY id', t.id);
    assert.deepEqual(ev.map((e) => e.to_status), ['demande', 'consentement', 'approuve_origine', 'approuve_ministere', 'transfere']);
    for (const d of decl) {
      const k = (await dst.all('SELECT kind FROM declaration_event WHERE declaration_id = ? ORDER BY id', d.id)).map((e) => e.kind);
      assert.equal(k[0], 'envoi'); if (d.status === 'recue') assert.equal(k.at(-1), 'accuse');
    }
    await assert.rejects(dst.run("UPDATE ministry_audit SET detail = 'x'"), /ajout seul/);
    await assert.rejects(dst.run("UPDATE transfer_event SET reason = 'x'"), /ajout seul|lecture seule/);
    await assert.rejects(dst.run("UPDATE annual_declaration SET payload = '{}'"), /signature figée|lecture seule/);
    const maxA = Math.max(...data.tables.ministry_audit.map((r) => Number(r.id)));
    const nid = await dst.insert("INSERT INTO ministry_audit (account_id, action) VALUES (?, 'test.apres_restauration')", data.tables.ministry_account[0].id);
    assert.ok(Number(nid) > maxA, 'identifiants repartis après le plus grand restauré');
  } finally { await dst.cleanup(); }

  // Chiffrement facultatif (même format que scripts/chiffrer.js) : illisible sans clé, altération détectée.
  const key = crypto.randomBytes(32);
  const enc = B.toFile(data, key);
  assert.equal(enc.subarray(0, 9).toString(), 'NORIAGCM1');
  assert.ok(!enc.includes(Buffer.from('ministry_audit')), 'aucun nom de table en clair');
  assert.throws(() => B.fromFile(enc), /NORIA_BACKUP_KEY nécessaire/);
  assert.throws(() => B.fromFile(enc, crypto.randomBytes(32)), /authentification échouée/);
  const bad = Buffer.from(enc); bad[40] ^= 1;
  assert.throws(() => B.fromFile(bad, key), /authentification échouée/);
  assert.equal(B.fromFile(enc, key).sha256, data.sha256);
  // Compatible avec l'outil en flux (déchiffrement par scripts/chiffrer.js).
  const { decryptStream } = require('../scripts/chiffrer');
  const out = await new Promise((res, rej) => { const parts = []; const d = decryptStream(key); d.on('data', (x) => parts.push(x)); d.on('end', () => res(Buffer.concat(parts))); d.on('error', rej); d.end(enc); });
  assert.equal(B.fromFile(out).sha256, data.sha256);
});
