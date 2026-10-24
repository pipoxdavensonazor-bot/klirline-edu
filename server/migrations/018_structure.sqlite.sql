-- SQLite ne sait pas ajouter une clé étrangère composite à une table existante : déclencheurs équivalents.
CREATE TRIGGER subject_level_ecole_ins BEFORE INSERT ON subject
  WHEN NEW.level_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM level WHERE id = NEW.level_id AND school_id = NEW.school_id)
  BEGIN SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed'); END;
CREATE TRIGGER subject_level_ecole_upd BEFORE UPDATE OF level_id, school_id ON subject
  WHEN NEW.level_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM level WHERE id = NEW.level_id AND school_id = NEW.school_id)
  BEGIN SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed'); END;
