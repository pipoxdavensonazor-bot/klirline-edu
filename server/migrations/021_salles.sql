-- Lot 6 (bases) : salles de cours. Séance planifiée d'une classe, ressources jointes (lien, PDF léger, texte, formule),
-- mains levées et sondages simples. Cloisonnées par école ; la vidéo reste Jitsi (aucune donnée vidéo ici).
CREATE TABLE class_session (
  id {{PK}}, school_id INTEGER NOT NULL, class_id INTEGER NOT NULL, teacher_user_id INTEGER,
  subject TEXT CHECK (subject IS NULL OR length(subject) <= 80),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  agenda TEXT CHECK (agenda IS NULL OR length(agenda) <= 2000),
  starts_at TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 45 CHECK (duration_min BETWEEN 5 AND 240),
  status TEXT NOT NULL DEFAULT 'planifiee' CHECK (status IN ('planifiee','ouverte','terminee')),
  low_data INTEGER NOT NULL DEFAULT 0 CHECK (low_data IN (0,1)),
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, class_id) REFERENCES class(school_id, id),
  FOREIGN KEY (school_id, teacher_user_id) REFERENCES app_user(school_id, id));
CREATE INDEX class_session_classe ON class_session(school_id, class_id, starts_at);
CREATE TABLE class_resource (
  id {{PK}}, school_id INTEGER NOT NULL, session_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lien','pdf','texte','formule')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  url TEXT CHECK (url IS NULL OR length(url) <= 500),
  body TEXT CHECK (body IS NULL OR length(body) <= 4000),
  mime TEXT CHECK (mime IS NULL OR mime = 'application/pdf'),
  size INTEGER CHECK (size IS NULL OR (size > 0 AND size <= 3145728)),
  data TEXT,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id, session_id) REFERENCES class_session(school_id, id));
CREATE INDEX class_resource_seance ON class_resource(school_id, session_id);
CREATE TABLE class_hand (
  id {{PK}}, school_id INTEGER NOT NULL, session_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  raised_at TEXT NOT NULL, lowered_at TEXT,
  FOREIGN KEY (school_id, session_id) REFERENCES class_session(school_id, id));
CREATE INDEX class_hand_seance ON class_hand(school_id, session_id);
CREATE TABLE class_poll (
  id {{PK}}, school_id INTEGER NOT NULL, session_id INTEGER NOT NULL,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 2 AND 200),
  options TEXT NOT NULL, is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0,1)),
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, session_id) REFERENCES class_session(school_id, id));
CREATE TABLE class_poll_vote (
  id {{PK}}, school_id INTEGER NOT NULL, poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  choice INTEGER NOT NULL CHECK (choice BETWEEN 0 AND 5), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_id, user_id),
  FOREIGN KEY (school_id, poll_id) REFERENCES class_poll(school_id, id));
