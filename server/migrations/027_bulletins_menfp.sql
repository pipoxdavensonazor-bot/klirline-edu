-- Bulletins au format haïtien (MENFP) : règles de l'école (échelle, moyenne de passage, mentions, décisions, pondération
-- des périodes), appréciations non chiffrées pour le préscolaire. Commun SQLite / PostgreSQL. Rien n'est supprimé :
-- les règles par défaut s'appliquent tant que la direction n'a rien enregistré (bulletin_rules NULL).
ALTER TABLE school ADD COLUMN bulletin_rules TEXT CHECK (bulletin_rules IS NULL OR length(bulletin_rules) <= 8000);

-- Préscolaire : une appréciation par élève, période et domaine (pas de note chiffrée). Modifiable, jamais supprimée.
CREATE TABLE bulletin_appreciation (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
  domain TEXT NOT NULL CHECK (length(domain) BETWEEN 1 AND 80),
  level TEXT NOT NULL CHECK (length(level) BETWEEN 1 AND 60),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 300),
  updated_by INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_id, term_id, domain), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, term_id) REFERENCES term(school_id, id),
  FOREIGN KEY (school_id, updated_by) REFERENCES app_user(school_id, id));
