-- Bloc 2 : photo de l'élève, badges par année scolaire (QR signé, révocation, expiration), relevés de notes officiels
-- (demande, décision, PDF signé Ed25519 par école), notifications du portail. Commun SQLite / PostgreSQL.

-- Fin de l'année scolaire : date d'expiration des badges (à défaut : 31 août de la seconde année du libellé).
ALTER TABLE school_year ADD COLUMN ends_on TEXT;
-- Sceau ou cachet de l'école (profil) et signature du directeur (téléversée une fois par la direction). JPEG en base64.
ALTER TABLE school ADD COLUMN seal TEXT;
ALTER TABLE school ADD COLUMN signature TEXT;
ALTER TABLE school ADD COLUMN signature_name TEXT;
ALTER TABLE school ADD COLUMN signature_at TEXT;

-- Photo d'identité : JPEG carré, 40 Ko au plus. Table séparée : jamais lue par les listes d'élèves.
CREATE TABLE student_photo (
  school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, photo TEXT NOT NULL, size INTEGER NOT NULL,
  updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, student_id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));

-- Badge : un par élève et par année scolaire (hors réédition). Jeton du QR = « B » + aléa (100 bits) + HMAC de l'aléa par le
-- secret de l'école (school_key) : la base ne garde que l'aléa et le hachage du jeton ; sans le secret, l'aléa ne suffit pas.
CREATE TABLE badge (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, school_year_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, token_nonce TEXT NOT NULL, class_name TEXT, expires_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valide' CHECK (status IN ('valide','expire','revoque')),
  issued_by INTEGER NOT NULL, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT, revoked_by INTEGER, revoked_reason TEXT, replaces_id INTEGER,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id));
CREATE UNIQUE INDEX badge_un_valide ON badge(school_id, student_id, school_year_id) WHERE status = 'valide';
CREATE INDEX badge_eleve ON badge(school_id, student_id);

-- Relevé de notes officiel : demandé → approuvé → émis ; ou refusé ; émis → annulé.
CREATE TABLE transcript (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, requested_by INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('periode','annee')), term_id INTEGER, school_year_id INTEGER, motive TEXT,
  status TEXT NOT NULL DEFAULT 'demande' CHECK (status IN ('demande','approuve','refuse','emis','annule')),
  decided_by INTEGER, decided_at TEXT, decision_reason TEXT,
  code TEXT UNIQUE, pdf TEXT, sha256 TEXT, signature TEXT, key_id TEXT, issued_at TEXT,
  cancelled_at TEXT, cancelled_by INTEGER, cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((scope = 'periode' AND term_id IS NOT NULL) OR (scope = 'annee' AND school_year_id IS NOT NULL)),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, requested_by) REFERENCES app_user(school_id, id));
CREATE INDEX transcript_eleve ON transcript(school_id, student_id);

-- Notifications du portail (relevé émis, refusé…).
CREATE TABLE notification (
  id {{PK}}, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT,
  title_fr TEXT NOT NULL, title_ht TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE INDEX notification_user ON notification(school_id, user_id, id);

-- Clés de l'école : Ed25519 (signature des relevés) et secret des jetons de badge. Jamais lisibles par le rôle applicatif.
-- Clé privée chiffrée (AES-256-GCM) quand NORIA_CLE_MAITRE est réglée.
CREATE TABLE school_key (
  school_id INTEGER PRIMARY KEY REFERENCES school(id), key_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL,
  private_key TEXT NOT NULL, private_enc INTEGER NOT NULL DEFAULT 0, badge_secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
