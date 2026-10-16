'use strict';
// Schéma SQLite. Les types et contraintes restent compatibles avec un passage à PostgreSQL.
const Database = require('better-sqlite3');

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS school (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  default_lang TEXT NOT NULL DEFAULT 'fr',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS campus (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id), name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id));
CREATE TABLE IF NOT EXISTS school_year (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id), label TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id));
CREATE UNIQUE INDEX IF NOT EXISTS one_current_year ON school_year(school_id) WHERE is_current = 1;
CREATE TABLE IF NOT EXISTS level (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id), name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id));
-- Les clés étrangères composites (school_id, x_id) empêchent en base de lier une ligne à un objet d'une autre école.
CREATE TABLE IF NOT EXISTS class (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id), name TEXT NOT NULL,
  school_year_id INTEGER NOT NULL, level_id INTEGER NOT NULL, campus_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id),
  FOREIGN KEY (school_id, level_id) REFERENCES level(school_id, id),
  FOREIGN KEY (school_id, campus_id) REFERENCES campus(school_id, id));
CREATE TABLE IF NOT EXISTS subject (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id), name TEXT NOT NULL,
  school_year_id INTEGER NOT NULL, coefficient REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id));
CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id),
  email TEXT NOT NULL, phone TEXT, display_name TEXT NOT NULL, password_hash TEXT,
  state TEXT NOT NULL DEFAULT 'actif' CHECK (state IN ('invite','actif','desactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, email), UNIQUE (school_id, id));
CREATE TABLE IF NOT EXISTS user_role (
  school_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('direction','secretariat','enseignant','comptabilite','bibliotheque','parent','eleve')),
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE TABLE IF NOT EXISTS student (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id),
  user_id INTEGER, code TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  birth_date TEXT, health_notes TEXT, family_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, code), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE TABLE IF NOT EXISTS parent_link (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, parent_user_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (parent_user_id, student_id),
  FOREIGN KEY (school_id, parent_user_id) REFERENCES app_user(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE TABLE IF NOT EXISTS teacher_assignment (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, teacher_user_id INTEGER NOT NULL, class_id INTEGER NOT NULL,
  subject_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, teacher_user_id) REFERENCES app_user(school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES subject(school_id, id));
CREATE TABLE IF NOT EXISTS enrollment (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, class_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','transfere','retire')),
  reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id));
CREATE TABLE IF NOT EXISTS finance_entry (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  label TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'HTG',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE TABLE IF NOT EXISTS session (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_user(id),
  school_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS user_phone ON app_user(school_id, phone) WHERE phone IS NOT NULL;
-- Jetons à usage unique (invitation de compte, récupération). Seule l'empreinte SHA-256 est stockée.
CREATE TABLE IF NOT EXISTS account_token (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id),
  kind TEXT NOT NULL CHECK (kind IN ('invitation','recuperation')),
  token_hash TEXT NOT NULL UNIQUE, user_id INTEGER, email TEXT, phone TEXT, display_name TEXT,
  role TEXT CHECK (role IS NULL OR role IN ('direction','secretariat','enseignant','comptabilite','bibliotheque','parent','eleve')),
  student_id INTEGER, created_by INTEGER, expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
-- Prévu pour la connexion par code à 6 chiffres (phase suivante) : code haché, essais comptés, expiration courte.
CREATE TABLE IF NOT EXISTS login_code (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
-- Boîte d'envoi simulée : les messages (invitation, récupération) y sont déposés ; aucun envoi réel n'existe encore.
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  recipient TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Journal en ajout seul : les déclencheurs refusent toute modification ou suppression.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, school_id INTEGER NOT NULL, actor_user_id INTEGER,
  action TEXT NOT NULL, record_type TEXT NOT NULL, record_id TEXT, reason TEXT,
  outcome TEXT NOT NULL DEFAULT 'ok', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
`;

function openDb(file = ':memory:') {
  const db = new Database(file);
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb, SCHEMA };
