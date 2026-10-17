-- Bloc 7 : adresses e-mail professionnelles des élèves (désactivées par défaut, NORIA_EMAIL_ELEVES=0).
-- Une adresse = un transfert (« synchronisation ») vers l'adresse personnelle vérifiée de l'élève ou d'un parent.
-- Une adresse n'est jamais réattribuée à quelqu'un d'autre (unicité globale, même désactivée).
CREATE TABLE school_email_settings (
  school_id INTEGER PRIMARY KEY REFERENCES school(id),
  subdomain TEXT CHECK (subdomain IS NULL OR (length(subdomain) BETWEEN 2 AND 30)),
  prefix TEXT CHECK (prefix IS NULL OR (length(prefix) BETWEEN 2 AND 20)),
  updated_by INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Adresses personnelles de destination : vérifiées par lien (bouton) ou par code à 6 chiffres.
CREATE TABLE student_email_dest (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), student_id INTEGER NOT NULL,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 6 AND 254),
  owner TEXT NOT NULL CHECK (owner IN ('eleve','parent')), user_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, verified_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE INDEX student_email_dest_eleve ON student_email_dest (school_id, student_id);
CREATE TABLE student_email (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), student_id INTEGER NOT NULL, student_code TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE CHECK (length(address) BETWEEN 6 AND 254), local_part TEXT NOT NULL, scoped INTEGER NOT NULL DEFAULT 0 CHECK (scoped IN (0,1)),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','active','suspendue','redirigee','desactivee')),
  minor INTEGER NOT NULL DEFAULT 1 CHECK (minor IN (0,1)),
  consent_at TEXT, consent_mode TEXT CHECK (consent_mode IS NULL OR consent_mode IN ('parent','ecrit')), consent_name TEXT, consent_by INTEGER,
  destination_id INTEGER REFERENCES student_email_dest(id),
  provider_ref TEXT, provider_state TEXT NOT NULL DEFAULT 'aucun' CHECK (provider_state IN ('aucun','ok','echec','simule')), provider_error TEXT,
  forwarded INTEGER NOT NULL DEFAULT 0, last_forward_at TEXT,
  reason TEXT, ends_on TEXT CHECK (ends_on IS NULL OR length(ends_on) = 10), deactivated_at TEXT, replaced_by INTEGER, -- adresse suivante (autre école) ; sans clé étrangère : restauration dans l'ordre des id
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
-- Une seule adresse en cours par élève et par école (une adresse « redirigee » peut coexister après un transfert).
CREATE UNIQUE INDEX student_email_courante ON student_email (school_id, student_id) WHERE status IN ('en_attente','active','suspendue');
-- Journal propre à chaque adresse (en ajout seul) ; les actions de la direction vont aussi dans audit_log.
CREATE TABLE student_email_event (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), email_id INTEGER NOT NULL REFERENCES student_email(id), student_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (length(kind) <= 40), actor TEXT NOT NULL CHECK (actor IN ('direction','eleve','parent','systeme')),
  user_id INTEGER, detail TEXT CHECK (detail IS NULL OR length(detail) <= 300), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX student_email_event_adresse ON student_email_event (email_id);
