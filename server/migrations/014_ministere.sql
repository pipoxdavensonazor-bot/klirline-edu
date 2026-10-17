-- Bloc 6 : portail du ministère de l'Éducation (PROTOTYPE, désactivé par défaut : NORIA_MINISTERE=0). Commun SQLite /
-- PostgreSQL. Comptes du ministère (créés par le super-admin, connexion par code à 6 chiffres), journal de chaque
-- consultation, déclaration annuelle de fin d'année signée par l'école (Ed25519), étape ministère des transferts
-- signée par la clé du ministère. Aucune de ces tables n'est lue tant que NORIA_MINISTERE vaut 0.

-- Localisation de l'école (filtres de la vue d'ensemble du ministère).
ALTER TABLE school ADD COLUMN department TEXT CHECK (department IS NULL OR department IN ('artibonite','centre','grand-anse','nippes','nord','nord-est','nord-ouest','ouest','sud','sud-est'));
ALTER TABLE school ADD COLUMN commune TEXT CHECK (commune IS NULL OR length(commune) <= 80);

-- Compte du ministère : hors école, créé par le super-admin (jamais par l'interface du ministère), désactivable.
CREATE TABLE ministry_account (
  id {{PK}}, email TEXT NOT NULL UNIQUE, phone TEXT UNIQUE, display_name TEXT NOT NULL, title TEXT,
  state TEXT NOT NULL DEFAULT 'actif' CHECK (state IN ('actif','desactive')), state_reason TEXT,
  created_by_admin INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Code de connexion à 6 chiffres (même mécanisme que les écoles : HMAC salé, 10 min, 5 essais, usage unique).
CREATE TABLE ministry_login (
  id {{PK}}, account_id INTEGER NOT NULL REFERENCES ministry_account(id), code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX ministry_login_compte ON ministry_login(account_id, id);
CREATE TABLE ministry_session (
  id {{PK}}, token_hash TEXT NOT NULL UNIQUE, account_id INTEGER NOT NULL REFERENCES ministry_account(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Journal de chaque consultation et décision du ministère (ajout seul) : compte, action, école, dossier, motif, IP.
CREATE TABLE ministry_audit (
  id {{PK}}, account_id INTEGER NOT NULL REFERENCES ministry_account(id), action TEXT NOT NULL, school_id INTEGER,
  record_type TEXT, record_id TEXT, detail TEXT, outcome TEXT NOT NULL DEFAULT 'ok', ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ministry_audit_compte ON ministry_audit(account_id, id);
-- Clé Ed25519 du ministère (signature de l'étape ministère des transferts), chiffrée par NORIA_CLE_MAITRE.
CREATE TABLE ministry_key (
  id {{PK}}, key_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, private_key TEXT NOT NULL, private_enc INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Déclaration annuelle de fin d'année : dossier (effectifs, résultats, personnel, lauréats) figé, PDF à l'en-tête de
-- l'école, signature Ed25519 de l'école. Une version active par école et par année ; après une demande de correction,
-- l'école envoie une nouvelle version et la précédente devient « remplacee ».
CREATE TABLE annual_declaration (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), school_year_id INTEGER NOT NULL, year_label TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'envoyee' CHECK (status IN ('envoyee','recue','correction_demandee','remplacee')),
  payload TEXT NOT NULL, payload_sha256 TEXT NOT NULL, pdf TEXT NOT NULL, pdf_sha256 TEXT NOT NULL, signature TEXT NOT NULL, key_id TEXT NOT NULL,
  sent_by INTEGER NOT NULL, signer_name TEXT, sent_at TEXT NOT NULL,
  ministry_by INTEGER, ministry_at TEXT, ministry_note TEXT CHECK (ministry_note IS NULL OR length(ministry_note) <= 500),
  UNIQUE (school_id, school_year_id, version), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id),
  FOREIGN KEY (school_id, sent_by) REFERENCES app_user(school_id, id));
CREATE UNIQUE INDEX annual_declaration_active ON annual_declaration(school_id, school_year_id) WHERE status <> 'remplacee';
CREATE INDEX annual_declaration_annee ON annual_declaration(year_label, status);
-- Historique de la déclaration (ajout seul) : envoi, accusé de réception, demande de correction, remplacement.
CREATE TABLE declaration_event (
  id {{PK}}, declaration_id INTEGER NOT NULL, school_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('envoi','accuse','correction','remplacement')),
  actor TEXT NOT NULL CHECK (actor IN ('direction','ministere')), user_id INTEGER, ministry_account_id INTEGER,
  note TEXT CHECK (note IS NULL OR length(note) <= 500), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, declaration_id) REFERENCES annual_declaration(school_id, id));
CREATE INDEX declaration_event_d ON declaration_event(declaration_id);

-- Transferts : décision du ministère signée par la clé du ministère (quand NORIA_MINISTERE=1).
ALTER TABLE transfer ADD COLUMN ministry_account_id INTEGER;
ALTER TABLE transfer ADD COLUMN ministry_signature TEXT;
ALTER TABLE transfer ADD COLUMN ministry_key_id TEXT;
ALTER TABLE transfer ADD COLUMN ministry_payload_sha256 TEXT;
