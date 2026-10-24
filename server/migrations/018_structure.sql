-- Structure de l'école (lot 0) : la direction crée elle-même années (courante, archivées), niveaux ordonnés par cycle,
-- classes (avec salle), périodes, matières par niveau (coefficient) et affectations des enseignants. Commun SQLite /
-- PostgreSQL ; clé étrangère composite de subject.level_id dans 018_structure.pg.sql (déclencheurs en SQLite).
-- On archive au lieu de supprimer : les notes, présences et bulletins déjà liés restent intacts.
ALTER TABLE school_year ADD COLUMN archived_at TEXT;
ALTER TABLE level ADD COLUMN cycle TEXT CHECK (cycle IS NULL OR length(cycle) <= 40);
ALTER TABLE level ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE level ADD COLUMN archived_at TEXT;
ALTER TABLE class ADD COLUMN room TEXT CHECK (room IS NULL OR length(room) <= 40);
ALTER TABLE class ADD COLUMN archived_at TEXT;
-- Matière propre à un niveau (coefficient par niveau) ; NULL = toutes les classes de l'année.
ALTER TABLE subject ADD COLUMN level_id INTEGER;
ALTER TABLE subject ADD COLUMN archived_at TEXT;
-- Unicité (les lignes archivées ne bloquent pas la réutilisation d'un nom).
CREATE UNIQUE INDEX school_year_label ON school_year(school_id, label);
CREATE UNIQUE INDEX level_name ON level(school_id, (lower(name))) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX class_name ON class(school_id, school_year_id, (lower(name))) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX subject_name ON subject(school_id, school_year_id, (COALESCE(level_id, 0)), (lower(name))) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX teacher_assignment_unique ON teacher_assignment(school_id, teacher_user_id, class_id, (COALESCE(subject_id, 0)));
CREATE INDEX subject_level ON subject(school_id, level_id);
CREATE INDEX teacher_assignment_class ON teacher_assignment(school_id, class_id);
