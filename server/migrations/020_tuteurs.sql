-- Lot 2 : responsables (tuteurs) d'un élève, saisis par la direction ou le secrétariat. Simples contacts : ils ne
-- donnent aucun accès (le compte parent reste relié par parent_link). Un seul responsable principal par élève.
CREATE TABLE student_guardian (
  id {{PK}}, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  relation TEXT NOT NULL CHECK (relation IN ('mere','pere','tuteur','grand_parent','frere_soeur','autre')),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 20),
  email TEXT CHECK (email IS NULL OR length(email) <= 254),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  can_pickup INTEGER NOT NULL DEFAULT 1 CHECK (can_pickup IN (0,1)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 300),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE INDEX student_guardian_eleve ON student_guardian(school_id, student_id);
CREATE UNIQUE INDEX student_guardian_principal ON student_guardian(student_id) WHERE is_primary = 1;
