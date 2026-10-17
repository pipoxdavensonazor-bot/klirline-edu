-- Socle multi-écoles : profil d'école (en-tête des documents), identité globale (une personne, plusieurs adhésions),
-- registre global des codes élèves, compte administrateur de la plateforme. Commun SQLite / PostgreSQL.
ALTER TABLE school ADD COLUMN initials TEXT;
ALTER TABLE school ADD COLUMN address TEXT;
ALTER TABLE school ADD COLUMN email TEXT;
ALTER TABLE school ADD COLUMN phone TEXT;
ALTER TABLE school ADD COLUMN motto TEXT;
-- Logo : JPEG redimensionné (256 px au plus, 48 Ko au plus), en base64. Validé par le serveur.
ALTER TABLE school ADD COLUMN logo TEXT;
ALTER TABLE school ADD COLUMN logo_updated_at TEXT;
ALTER TABLE school ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspendue'));
ALTER TABLE school ADD COLUMN status_reason TEXT;
ALTER TABLE student ADD COLUMN sex TEXT CHECK (sex IS NULL OR sex IN ('F','M'));

-- Identité globale : une personne (un identifiant de connexion, un mot de passe) ; app_user devient son adhésion à une
-- école (rôles, données de l'école). Aucune donnée scolaire dans person : la table n'est jamais lue sous le rôle noria_app.
CREATE TABLE person (
  id {{PK}}, email TEXT UNIQUE, display_name TEXT NOT NULL, password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE app_user ADD COLUMN person_id INTEGER REFERENCES person(id);
-- Migration sans perte : une personne par adresse e-mail ; les comptes de même adresse dans plusieurs écoles sont réunis.
-- Les mots de passe restent sur chaque adhésion ; le premier mot de passe vérifié à la connexion devient celui de la personne.
INSERT INTO person (email, display_name) SELECT lower(email), MIN(display_name) FROM app_user GROUP BY lower(email);
UPDATE app_user SET person_id = (SELECT p.id FROM person p WHERE p.email = lower(app_user.email));
CREATE UNIQUE INDEX app_user_person ON app_user(school_id, person_id);
CREATE INDEX app_user_person_g ON app_user(person_id);
CREATE INDEX app_user_phone_g ON app_user(phone);

-- Registre global des codes élèves (unicité sur tout le système). Codes existants conservés ; un code déjà pris par une
-- autre école reçoit le suffixe -<id de l'école>.
CREATE TABLE student_code (
  code TEXT PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES school(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
UPDATE student SET code = code || '-' || school_id
  WHERE EXISTS (SELECT 1 FROM student s2 WHERE s2.code = student.code AND s2.school_id < student.school_id);
INSERT INTO student_code (code, school_id) SELECT code, school_id FROM student;

-- Administration de la plateforme : comptes sans école, créés par le script CLI seulement.
CREATE TABLE platform_admin (
  id {{PK}}, email TEXT NOT NULL UNIQUE, phone TEXT, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'actif' CHECK (state IN ('actif','desactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE platform_session (
  token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES platform_admin(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Deuxième facteur : après le mot de passe, un code à 6 chiffres lié à un ticket à usage unique.
CREATE TABLE platform_login (
  id {{PK}}, admin_id INTEGER NOT NULL REFERENCES platform_admin(id), ticket_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE platform_audit (
  id {{PK}}, admin_id INTEGER, action TEXT NOT NULL, target TEXT, detail TEXT,
  outcome TEXT NOT NULL DEFAULT 'ok', ip TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
