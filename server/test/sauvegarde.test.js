'use strict';
// Sauvegarde puis restauration dans une base neuve : contenu identique, connexion possible, empreinte vérifiée.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { openTestDb } = require('./helpers');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { dump, restore, toFile, fromFile } = require('../src/backup');
const { createServer } = require('../src/app');

test('sauvegarde + restauration : données, journal, présences, compteurs d’identifiants', async () => {
  const src = await openTestDb(); const dst = await openTestDb();
  try {
    const ids = await seed(src);
    await src.run(`INSERT INTO attendance (school_id, class_id, student_id, day, status, recorded_by, recorded_at) VALUES (?,?,?,?,?,?,?)`,
      ids.A.school, ids.A.classes[0], ids.A.students[0], '2026-10-15', 'absent', ids.A.users.prof1, '2026-10-15T12:00:00Z');
    await src.run(`INSERT INTO audit_log (school_id, actor_user_id, action, record_type) VALUES (?,?,?,?)`, ids.A.school, ids.A.users.direction, 'test', 'x');
    const data = fromFile(toFile(await dump(src)));
    const counts = await restore(dst, data);
    assert.equal(counts.student, 4); assert.equal(counts.attendance, 1); assert.equal(counts.audit_log, 1);
    const again = await dump(dst);
    assert.deepEqual(again.tables, data.tables, 'contenu identique après restauration');
    // Les identifiants repartent après le plus grand restauré.
    const next = await dst.insert('INSERT INTO school (slug, name) VALUES (?,?)', 'ecole-c', 'École fictive C');
    assert.ok(next > ids.B.school);
    // Les mots de passe restaurés fonctionnent ; les sessions, elles, ne sont pas sauvegardées.
    assert.equal((await dst.get('SELECT COUNT(*) AS n FROM session')).n, 0);
    const server = createServer(dst, { staticRoot: false }); await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }) });
      assert.equal(r.status, 200);
    } finally { server.close(); }
    // Base cible non vide, fichier altéré : refus.
    await assert.rejects(restore(dst, data), /non vide/);
    const bad = JSON.parse(JSON.stringify(data)); bad.tables.student[0].first_name = 'Pirate';
    await assert.rejects(restore(src, bad), /empreinte/);
  } finally { await src.cleanup(); await dst.cleanup(); }
});

test('script en ligne de commande : sauver puis restaurer (SQLite)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-sauv-'));
  const env = { PATH: process.env.PATH };
  const run = (db, ...args) => execFileSync(process.execPath, [path.join(__dirname, '../scripts/sauvegarde.js'), ...args], { env: { ...env, NORIA_DB: db }, encoding: 'utf8' });
  const a = path.join(dir, 'a.sqlite'); const b = path.join(dir, 'b.sqlite'); const f = path.join(dir, 's.json.gz');
  // Base source remplie par le serveur de démonstration (migrations + données fictives).
  execFileSync(process.execPath, ['-e', `require('${path.join(__dirname, '../src/store').replace(/\\/g, '/')}').openStore('${a}').then(async d=>{await require('${path.join(__dirname, '../src/seed').replace(/\\/g, '/')}').seed(d);await d.close();})`]);
  assert.match(run(a, 'sauver', f), /Sauvegarde écrite/);
  assert.equal((fs.statSync(f).mode & 0o777), 0o600, 'fichier lisible par son propriétaire seulement');
  assert.match(run(b, 'restaurer', f), /Restauration terminée/);
  assert.throws(() => run(b, 'restaurer', f), /non vide/);
});
