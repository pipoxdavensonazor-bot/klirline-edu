-- Prise de parole audio des parents pendant une diffusion : seule la direction l'accorde (main levée → « Donner la
-- parole »), pour un parent et une réunion, avec un jeton de publication court et à usage unique (used_at).
-- state : accordee (jeton remis, pas encore utilisé) → publie (MediaMTX a accepté la publication) → terminee.
CREATE TABLE parent_meeting_speaker (
  id {{PK}}, school_id INTEGER NOT NULL, meeting_id INTEGER NOT NULL REFERENCES parent_meeting(id),
  user_id INTEGER NOT NULL, granted_by INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('accordee', 'publie', 'terminee')),
  granted_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, ended_at TEXT,
  ended_by TEXT CHECK (ended_by IS NULL OR ended_by IN ('moderateur', 'parent', 'fin', 'expire')));
CREATE INDEX parent_meeting_speaker_meeting ON parent_meeting_speaker(meeting_id, state);
