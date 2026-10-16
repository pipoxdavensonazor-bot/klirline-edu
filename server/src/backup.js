'use strict';
// Sauvegarde logique, indépendante de la base (SQLite ou PostgreSQL) : toutes les tables métier en JSON compressé,
// avec empreinte SHA-256 vérifiée à la restauration. Exclus volontairement : sessions (reconnexion obligatoire après
// restauration), tentatives de connexion, boîte d'envoi simulée (elle contient des liens en clair).
// En production PostgreSQL, compléter par pg_dump (voir README).
const crypto = require('node:crypto');
const zlib = require('node:zlib');

// Ordre compatible avec les clés étrangères.
const TABLES = ['school', 'campus', 'school_year', 'term', 'level', 'class', 'subject', 'app_user', 'user_role', 'student',
  'parent_link', 'teacher_assignment', 'enrollment', 'finance_entry', 'account_token', 'login_code', 'audit_log',
  'attendance', 'attendance_history', 'sync_op', 'sync_conflict',
  'evaluation', 'grade', 'grade_history', 'grade_conflict', 'report_card', 'announcement', 'school_event'];
const WITH_ID = new Set(TABLES.filter((t) => !['user_role', 'sync_op'].includes(t)));
const digest = (tables) => crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');

async function dump(db) {
  const tables = {};
  for (const t of TABLES) tables[t] = await db.all(`SELECT * FROM ${t}${WITH_ID.has(t) ? ' ORDER BY id' : ''}`);
  const migrations = (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
  return { format: 'noria-sauvegarde', version: 1, created_at: new Date().toISOString(), source: db.kind, migrations, tables, sha256: digest(tables) };
}

async function restore(db, data) {
  if (!data || data.format !== 'noria-sauvegarde' || data.version !== 1) throw new Error('fichier de sauvegarde inconnu');
  if (digest(data.tables) !== data.sha256) throw new Error('empreinte SHA-256 incorrecte : sauvegarde altérée ou incomplète');
  const have = (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
  const missing = data.migrations.filter((v) => !have.includes(v));
  if (missing.length) throw new Error(`base cible trop ancienne (migrations manquantes : ${missing.join(', ')})`);
  if ((await db.get('SELECT COUNT(*) AS n FROM school')).n) throw new Error('base cible non vide : restauration refusée');
  const counts = {};
  await db.tx(async (t) => {
    for (const name of TABLES) {
      const rows = data.tables[name] || [];
      for (const r of rows) {
        const cols = Object.keys(r);
        await t.run(`INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => r[c]));
      }
      counts[name] = rows.length;
      // PostgreSQL : les compteurs d'identifiants repartent après le plus grand id restauré.
      if (db.kind === 'pg' && WITH_ID.has(name)) {
        await t.exec(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), COALESCE((SELECT MAX(id) FROM ${name}), 0) + 1, false)`);
      }
    }
  });
  return counts;
}

const toFile = (data) => zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
const fromFile = (buf) => JSON.parse(zlib.gunzipSync(buf).toString('utf8'));

module.exports = { dump, restore, toFile, fromFile, TABLES };
