-- Bloc 4 : lien entre écoles. Décision de fin d'année, signalements posés par l'école, demandes de transfert de dossier
-- (machine à états, consentement du parent, signature Ed25519 de l'école d'origine, étape ministère prévue), dossier
-- antérieur copié dans l'école d'accueil, certificat de transfert vérifiable. Commun SQLite / PostgreSQL.

-- Élève : « transfere » = dossier archivé en lecture seule dans l'école d'origine (déclencheur par dialecte).
ALTER TABLE student ADD COLUMN status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','transfere'));
ALTER TABLE student ADD COLUMN transferred_at TEXT;
ALTER TABLE student ADD COLUMN transfer_id INTEGER;

-- Décision de fin d'année, une par élève et par année scolaire, saisie par la direction.
CREATE TABLE year_decision (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, school_year_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('admis','redouble','echec')), note TEXT CHECK (note IS NULL OR length(note) <= 200),
  decided_by INTEGER NOT NULL, decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_id, school_year_id), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id),
  FOREIGN KEY (school_id, decided_by) REFERENCES app_user(school_id, id));

-- Signalement posé par l'école sur son élève : catégorie (seule visible des autres écoles lors d'une vérification),
-- date, texte court réservé aux directions. Levée motivée et datée. Jamais supprimé.
CREATE TABLE student_flag (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('disciplinaire','dette','document_manquant','autre')),
  note TEXT CHECK (note IS NULL OR length(note) <= 200), flagged_on TEXT NOT NULL CHECK (length(flagged_on) = 10),
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lifted_on TEXT CHECK (lifted_on IS NULL OR length(lifted_on) = 10), lifted_by INTEGER, lift_reason TEXT,
  CHECK ((lifted_on IS NULL) = (lift_reason IS NULL)),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES app_user(school_id, id));
CREATE INDEX student_flag_eleve ON student_flag(school_id, student_id);

-- Transfert : demande → consentement → approuvé origine → (approuvé ministère) → transféré ; ou refusé, annulé.
-- Table hors école (deux écoles concernées) : lue et écrite par la connexion système seulement, à travers les routes
-- dédiées de src/transferts.js (jamais par le rôle applicatif soumis à la RLS).
CREATE TABLE transfer (
  id {{PK}}, student_code TEXT NOT NULL,
  from_school_id INTEGER NOT NULL REFERENCES school(id), from_student_id INTEGER NOT NULL,
  to_school_id INTEGER NOT NULL REFERENCES school(id), to_student_id INTEGER, to_class_id INTEGER,
  status TEXT NOT NULL DEFAULT 'demande' CHECK (status IN ('demande','consentement','approuve_origine','approuve_ministere','transfere','refuse','annule')),
  motive TEXT, requested_by INTEGER NOT NULL,
  consent_mode TEXT NOT NULL CHECK (consent_mode IN ('case','otp')), consent_parent TEXT, consent_to TEXT, consent_at TEXT, consent_by INTEGER,
  otp_hash TEXT, otp_attempts INTEGER NOT NULL DEFAULT 0, otp_expires_at TEXT, otp_sent INTEGER NOT NULL DEFAULT 0,
  origin_by INTEGER, origin_at TEXT, origin_name TEXT, origin_signature_image TEXT, payload_sha256 TEXT, signature TEXT, key_id TEXT,
  ministry_required INTEGER NOT NULL DEFAULT 0, ministry_by INTEGER, ministry_at TEXT, ministry_reason TEXT,
  decision_reason TEXT, cancel_reason TEXT, closed_at TEXT,
  code TEXT UNIQUE, certificate TEXT, certificate_sha256 TEXT, certificate_signature TEXT, summary TEXT,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_school_id <> to_school_id),
  FOREIGN KEY (from_school_id, from_student_id) REFERENCES student(school_id, id));
-- Un seul transfert en cours par élève.
CREATE UNIQUE INDEX transfer_en_cours ON transfer(student_code) WHERE status IN ('demande','consentement','approuve_origine','approuve_ministere');
CREATE INDEX transfer_origine ON transfer(from_school_id, status);
CREATE INDEX transfer_accueil ON transfer(to_school_id, status);
-- Historique des transitions (ajout seul) : qui, quand, depuis quel statut, motif.
CREATE TABLE transfer_event (
  id {{PK}}, transfer_id INTEGER NOT NULL REFERENCES transfer(id), from_status TEXT, to_status TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('accueil','origine','ministere','systeme')), school_id INTEGER, user_id INTEGER, reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX transfer_event_t ON transfer_event(transfer_id);

-- Dossier antérieur reçu par transfert (école d'accueil) : classes, décisions de fin d'année, notes publiées, relevés
-- émis (PDF, empreinte et signature d'origine). Copie figée : jamais modifiée.
CREATE TABLE student_history (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, transfer_id INTEGER NOT NULL REFERENCES transfer(id),
  kind TEXT NOT NULL CHECK (kind IN ('classe','decision','note','releve')),
  source_school TEXT NOT NULL, source_school_id INTEGER, year_label TEXT, label TEXT, data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE INDEX student_history_eleve ON student_history(school_id, student_id, kind);
