'use strict';
// Sauvegarde logique, indépendante de la base (SQLite ou PostgreSQL) : toutes les tables métier en JSON compressé,
// avec empreinte SHA-256 vérifiée à la restauration, et chiffrement AES-256-GCM (format NORIAGCM1 de
// scripts/chiffrer.js) quand NORIA_BACKUP_KEY est fournie. En production PostgreSQL, la sauvegarde de référence reste
// pg_dump chiffré (deploy/sauvegarde) ; ce format sert aux migrations SQLite ↔ PostgreSQL et aux vérifications.
//
// Chaque table du schéma est soit sauvegardée (TABLES), soit exclue avec une raison (EXCLUDED) :
// test/sauvegarde-couverture.test.js échoue si une nouvelle table n'est dans aucune des deux listes.
const crypto = require('node:crypto');
const zlib = require('node:zlib');

// Ordre compatible avec les clés étrangères (vérifié par le test de couverture, SQLite et PostgreSQL).
const TABLES = ['school', 'campus', 'school_year', 'term', 'level', 'class', 'subject', 'person', 'app_user', 'user_role', 'student',
  'parent_link', 'teacher_assignment', 'enrollment', 'finance_entry', 'account_token', 'login_code', 'audit_log',
  'attendance', 'attendance_history', 'sync_op', 'sync_conflict',
  'evaluation', 'grade', 'grade_history', 'grade_conflict', 'report_card', 'announcement', 'school_event',
  'book', 'loan', 'payment', 'student_code', 'platform_admin', 'platform_audit',
  // Phase 6 : photos, badges, relevés, notifications, clés Ed25519 des écoles.
  'student_photo', 'badge', 'transcript', 'notification', 'school_key',
  // Assistant sécurité : événements, alertes, actions (journal), blocages d'IP, anti-répétition des notifications.
  'security_event', 'security_alert', 'security_action', 'ip_block', 'security_notice',
  // Bloc 4 : décisions de fin d'année, signalements, transferts et leur journal, historique scolaire.
  'year_decision', 'student_flag', 'transfer', 'transfer_event', 'student_history',
  // Bloc 5 : portail public (images, propositions, lauréats, annonces, publicités et leurs clics).
  'portal_image', 'portal_item', 'portal_ad', 'portal_ad_click',
  // Bloc 6 : comptes, journal et clé du ministère, déclarations annuelles et leur historique.
  'ministry_account', 'ministry_audit', 'ministry_key', 'annual_declaration', 'declaration_event',
  // Bloc 7 : adresses e-mail des élèves (réglages par école, destinations vérifiées, adresses, journal).
  'school_email_settings', 'student_email_dest', 'student_email', 'student_email_event',
  // Bloc 8 : demandes d'inscription des écoles, comptes grand public et leurs abonnements, journal des envois groupés.
  'school_request', 'public_account', 'public_digest'];

// Tables volontairement exclues : rien de métier, et rien qu'il soit souhaitable de remettre en service.
const EXCLUDED = {
  schema_migrations: 'version du schéma : enregistrée à part (champ migrations) et vérifiée avant restauration',
  session: 'sessions des écoles, éphémères : reconnexion obligatoire après restauration',
  platform_session: 'sessions du super-admin, éphémères : reconnexion obligatoire',
  ministry_session: 'sessions du ministère, éphémères : reconnexion obligatoire',
  platform_login: 'codes de connexion à usage unique du super-admin (10 min)',
  ministry_login: 'codes de connexion à usage unique du ministère (10 min)',
  security_pending: 'actions de l’assistant en attente de confirmation par code (quelques minutes)',
  login_attempt: 'compteurs de tentatives pour la limite de débit (fenêtres de 15 min)',
  public_session: 'sessions des comptes grand public, éphémères : reconnexion par code',
  public_code: 'codes à usage unique du portail (10 min) et formulaires non vérifiés',
  outbox: 'boîte d’envoi simulée : contient des liens et codes en clair',
};

// Tables sans colonne id : ordre de sortie stable par clé primaire.
const ORDER = { user_role: 'user_id, role', sync_op: 'school_id, op_id', student_code: 'school_id, code', student_photo: 'school_id, student_id',
  school_key: 'school_id', security_notice: 'rule', portal_ad_click: 'ad_id, day', school_email_settings: 'school_id' };
const WITH_ID = new Set(TABLES.filter((t) => !ORDER[t]));
const orderOf = (t) => (WITH_ID.has(t) ? 'id' : ORDER[t]);
const digest = (tables) => crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');

async function dump(db) {
  const tables = {};
  for (const t of TABLES) tables[t] = await db.all(`SELECT * FROM ${t} ORDER BY ${orderOf(t)}`);
  const migrations = (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
  return { format: 'noria-sauvegarde', version: 1, created_at: new Date().toISOString(), source: db.kind, migrations, tables, sha256: digest(tables) };
}

async function restore(db, data) {
  if (!data || data.format !== 'noria-sauvegarde' || data.version !== 1) throw new Error('fichier de sauvegarde inconnu');
  if (digest(data.tables) !== data.sha256) throw new Error('empreinte SHA-256 incorrecte : sauvegarde altérée ou incomplète');
  const have = (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
  const missing = data.migrations.filter((v) => !have.includes(v));
  if (missing.length) throw new Error(`base cible trop ancienne (migrations manquantes : ${missing.join(', ')})`);
  if (Number((await db.get('SELECT COUNT(*) AS n FROM school')).n)) throw new Error('base cible non vide : restauration refusée');
  const unknown = Object.keys(data.tables).filter((t) => !TABLES.includes(t));
  if (unknown.length) throw new Error(`tables inconnues dans la sauvegarde : ${unknown.join(', ')}`);
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

// Chiffrement facultatif, même format que scripts/chiffrer.js (NORIAGCM1 + IV + chiffré + étiquette GCM).
const MAGIC = Buffer.from('NORIAGCM1');
const encrypted = (buf) => buf.length > MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
function encrypt(buf, key) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([MAGIC, iv, c.update(buf), c.final(), c.getAuthTag()]);
}
function decrypt(buf, key) {
  if (!encrypted(buf) || buf.length < MAGIC.length + 12 + 16) throw new Error('format inconnu (en-tête NORIAGCM1 absent)');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(MAGIC.length, MAGIC.length + 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  try { return Buffer.concat([d.update(buf.subarray(MAGIC.length + 12, buf.length - 16)), d.final()]); }
  catch { throw new Error('authentification échouée : clé incorrecte ou fichier altéré'); }
}

const toFile = (data, key) => { const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }); return key ? encrypt(gz, key) : gz; };
function fromFile(buf, key) {
  if (encrypted(buf)) {
    if (!key) throw new Error('sauvegarde chiffrée : NORIA_BACKUP_KEY nécessaire');
    buf = decrypt(buf, key);
  }
  return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
}

module.exports = { dump, restore, toFile, fromFile, encrypt, decrypt, TABLES, EXCLUDED };
