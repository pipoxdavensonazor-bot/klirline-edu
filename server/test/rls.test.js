'use strict';
// Cloisonnement dans la base (PostgreSQL seulement) : même une requête sans filtre school_id ne voit que l'école réglée.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openTestDb, PG } = require('./helpers');
const { seed } = require('../src/seed');

let db, ids;
before(async () => { if (!PG) return; db = await openTestDb(); ids = await seed(db); });
after(async () => { if (db) await db.cleanup(); });

test('RLS : lecture et écriture limitées à l’école de la transaction', { skip: !PG && 'NORIA_TEST_PG non défini' }, async () => {
  const codes = await db.asSchool(ids.A.school, (t) => t.all('SELECT code FROM student ORDER BY code'));
  assert.deepEqual(codes.map((r) => r.code), ['A-001', 'A-002']);
  const all = await db.asSchool(ids.A.school, async (t) => ({
    users: (await t.get('SELECT COUNT(*) AS n FROM app_user')).n,
    schools: (await t.all('SELECT slug FROM school')).map((r) => r.slug),
    audit: (await t.get('SELECT COUNT(*) AS n FROM audit_log WHERE school_id <> ?', ids.A.school)).n,
  }));
  assert.equal(all.users, 9); assert.deepEqual(all.schools, ['ecole-a']); assert.equal(all.audit, 0);
  // Modifier ou supprimer une ligne de l'école B : aucune ligne touchée.
  const upd = await db.asSchool(ids.A.school, (t) => t.run("UPDATE student SET first_name = 'X' WHERE school_id = ?", ids.B.school));
  assert.equal(upd.changes, 0);
  // Insérer une ligne au nom de l'école B : refusé par la politique.
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('INSERT INTO outbox (school_id, channel, recipient, kind, body) VALUES (?,?,?,?,?)', ids.B.school, 'sms', '+50900000000', 'x', 'x')), /row-level security/);
  // Sans école réglée : rien n'est visible.
  const none = await db.tx(async (t) => { await t.exec('SET LOCAL ROLE noria_app'); return (await t.get('SELECT COUNT(*) AS n FROM student')).n; });
  assert.equal(none, 0);
  // Le rôle applicatif n'accède ni au limiteur ni aux migrations.
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.all('SELECT * FROM login_attempt')), /permission denied/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.exec('DROP TABLE student')), /must be owner|permission denied/);
});
