-- Présences : une ligne par élève et par jour, versionnée ; chaque saisie ou correction laisse une trace (motif obligatoire
-- pour une correction). sync_op garantit l'idempotence des envois hors ligne ; sync_conflict journalise les conflits.
CREATE TABLE attendance (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), class_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (length(day) = 10),
  status TEXT NOT NULL CHECK (status IN ('present','absent','retard','excuse')),
  version INTEGER NOT NULL DEFAULT 1,
  recorded_by INTEGER NOT NULL, recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, student_id, day), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, recorded_by) REFERENCES app_user(school_id, id));
CREATE INDEX attendance_class_day ON attendance(school_id, class_id, day);
CREATE TABLE attendance_history (
  id {{PK}}, school_id INTEGER NOT NULL, attendance_id INTEGER NOT NULL,
  old_status TEXT, new_status TEXT NOT NULL, version INTEGER NOT NULL, reason TEXT,
  changed_by INTEGER NOT NULL, source TEXT NOT NULL CHECK (source IN ('en_ligne','hors_ligne')),
  op_id TEXT, client_recorded_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, attendance_id) REFERENCES attendance(school_id, id),
  FOREIGN KEY (school_id, changed_by) REFERENCES app_user(school_id, id));
CREATE TABLE sync_op (
  school_id INTEGER NOT NULL REFERENCES school(id), op_id TEXT NOT NULL, user_id INTEGER NOT NULL, result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (school_id, op_id),
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE TABLE sync_conflict (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), op_id TEXT NOT NULL, attendance_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, client_status TEXT NOT NULL, server_status TEXT NOT NULL,
  base_version INTEGER NOT NULL, server_version INTEGER NOT NULL, client_recorded_at TEXT, resolution TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, attendance_id) REFERENCES attendance(school_id, id));
