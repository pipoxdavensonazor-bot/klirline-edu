-- Cœur scolaire : périodes, évaluations et notes (avec historique), bulletins vérifiables, annonces et calendrier.
CREATE TABLE term (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), school_year_id INTEGER NOT NULL,
  name TEXT NOT NULL, position INTEGER NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id), UNIQUE (school_id, school_year_id, position),
  FOREIGN KEY (school_id, school_year_id) REFERENCES school_year(school_id, id));
-- Évaluation : brouillon (l'enseignant saisit) → soumise (verrouillée pour l'enseignant) → publiée (visible des familles).
CREATE TABLE evaluation (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), class_id INTEGER NOT NULL, subject_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL, title TEXT NOT NULL, day TEXT NOT NULL CHECK (length(day) = 10),
  max_score REAL NOT NULL CHECK (max_score > 0 AND max_score <= 1000), coefficient REAL NOT NULL DEFAULT 1 CHECK (coefficient > 0 AND coefficient <= 20),
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','soumise','publiee')),
  created_by INTEGER NOT NULL, submitted_at TEXT, published_at TEXT, published_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, subject_id) REFERENCES subject(school_id, id),
  FOREIGN KEY (school_id, term_id) REFERENCES term(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES app_user(school_id, id));
CREATE INDEX evaluation_class_term ON evaluation(school_id, class_id, term_id);
-- Note : score NULL = non noté (absent, dispensé) ; exclue des moyennes.
CREATE TABLE grade (
  id {{PK}}, school_id INTEGER NOT NULL, evaluation_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  score REAL CHECK (score IS NULL OR score >= 0), mention TEXT CHECK (mention IS NULL OR mention IN ('absent','dispense')),
  version INTEGER NOT NULL DEFAULT 1, updated_by INTEGER NOT NULL, recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, evaluation_id, student_id), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, evaluation_id) REFERENCES evaluation(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, updated_by) REFERENCES app_user(school_id, id));
CREATE TABLE grade_history (
  id {{PK}}, school_id INTEGER NOT NULL, grade_id INTEGER NOT NULL,
  old_score REAL, new_score REAL, old_mention TEXT, new_mention TEXT, version INTEGER NOT NULL, reason TEXT,
  changed_by INTEGER NOT NULL, source TEXT NOT NULL CHECK (source IN ('en_ligne','hors_ligne')), op_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, grade_id) REFERENCES grade(school_id, id));
CREATE TABLE grade_conflict (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), op_id TEXT NOT NULL, grade_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, client_score REAL, server_score REAL, base_version INTEGER NOT NULL, server_version INTEGER NOT NULL,
  resolution TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, grade_id) REFERENCES grade(school_id, id));
-- Bulletin émis : instantané figé des moyennes ; code de vérification aléatoire imprimé en QR.
CREATE TABLE report_card (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), student_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE, average REAL, snapshot TEXT NOT NULL, issued_by INTEGER NOT NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT, revoked_reason TEXT,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, term_id) REFERENCES term(school_id, id));
-- Audience : ecole (tous), classe (enseignants, élèves et parents de la classe), parents, enseignants.
CREATE TABLE announcement (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), title TEXT NOT NULL, body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('ecole','classe','parents','enseignants')), class_id INTEGER,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((audience = 'classe') = (class_id IS NOT NULL)),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES app_user(school_id, id));
CREATE TABLE school_event (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), title TEXT NOT NULL,
  starts_on TEXT NOT NULL CHECK (length(starts_on) = 10), ends_on TEXT NOT NULL CHECK (length(ends_on) = 10),
  audience TEXT NOT NULL CHECK (audience IN ('ecole','classe','parents','enseignants')), class_id INTEGER,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((audience = 'classe') = (class_id IS NOT NULL)), CHECK (ends_on >= starts_on),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES app_user(school_id, id));
