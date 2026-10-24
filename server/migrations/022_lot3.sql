-- Lot 3 : messagerie école ↔ familles, réunions de parents en mode diffusion (500+), inscriptions en ligne,
-- format et création automatique des adresses e-mail des élèves. Commun SQLite / PostgreSQL ; cloisonnement par
-- école dans 022_lot3.pg.sql. Toutes les tables portent school_id.

-- Messagerie : un fil = une conversation entre une famille (parent, ou élève) et l'accueil de l'école
-- (direction / secrétariat). Pièce jointe petite (≤ 200 Ko) stockée en base64 pour rester simple et sauvegardée.
CREATE TABLE school_thread (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 140),
  family_user_id INTEGER NOT NULL, student_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert','clos')),
  last_side TEXT NOT NULL DEFAULT 'famille' CHECK (last_side IN ('famille','ecole')),
  created_at TEXT NOT NULL, last_at TEXT NOT NULL,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, family_user_id) REFERENCES app_user(school_id, id));
CREATE INDEX school_thread_ecole ON school_thread(school_id, last_at);
CREATE INDEX school_thread_famille ON school_thread(school_id, family_user_id);
CREATE TABLE school_message (
  id {{PK}}, school_id INTEGER NOT NULL, thread_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL, side TEXT NOT NULL CHECK (side IN ('famille','ecole')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  att_name TEXT CHECK (att_name IS NULL OR length(att_name) <= 120), att_type TEXT, att_size INTEGER CHECK (att_size IS NULL OR att_size <= 204800),
  att_data TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (school_id, thread_id) REFERENCES school_thread(school_id, id));
CREATE INDEX school_message_fil ON school_message(school_id, thread_id, id);
CREATE TABLE school_thread_read (
  school_id INTEGER NOT NULL, thread_id INTEGER NOT NULL, user_id INTEGER NOT NULL, last_message_id INTEGER NOT NULL, read_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  FOREIGN KEY (school_id, thread_id) REFERENCES school_thread(school_id, id));

-- Réunion de parents en mode diffusion : seuls les intervenants rejoignent la salle vidéo ; les parents suivent un flux
-- audio (ou vidéo basse définition) et passent par NORIA pour les questions, la main levée et la présence.
CREATE TABLE parent_meeting (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 140),
  starts_at TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'ecole' CHECK (audience IN ('ecole','classe')), class_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'audio' CHECK (mode IN ('audio','video_basse')),
  stream_url TEXT CHECK (stream_url IS NULL OR length(stream_url) <= 300),
  room TEXT NOT NULL, speakers TEXT,
  status TEXT NOT NULL DEFAULT 'prevue' CHECK (status IN ('prevue','en_cours','terminee')),
  qa_open INTEGER NOT NULL DEFAULT 1 CHECK (qa_open IN (0,1)),
  replay_url TEXT CHECK (replay_url IS NULL OR length(replay_url) <= 300),
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
  CHECK ((audience = 'classe') = (class_id IS NOT NULL)),
  UNIQUE (school_id, id));
CREATE INDEX parent_meeting_ecole ON parent_meeting(school_id, starts_at);
CREATE TABLE parent_meeting_attendance (
  school_id INTEGER NOT NULL, meeting_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  first_at TEXT NOT NULL, last_at TEXT NOT NULL, pings INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (meeting_id, user_id),
  FOREIGN KEY (school_id, meeting_id) REFERENCES parent_meeting(school_id, id));
CREATE TABLE parent_meeting_question (
  id {{PK}}, school_id INTEGER NOT NULL, meeting_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('question','main')),
  body TEXT CHECK (body IS NULL OR length(body) <= 500),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','repondue','ecartee')),
  answer TEXT CHECK (answer IS NULL OR length(answer) <= 500),
  created_at TEXT NOT NULL, answered_at TEXT,
  FOREIGN KEY (school_id, meeting_id) REFERENCES parent_meeting(school_id, id));
CREATE INDEX parent_meeting_question_r ON parent_meeting_question(school_id, meeting_id, id);

-- Inscriptions en ligne : une campagne « inscriptions ouvertes » par école à la fois ; le public dépose un dossier,
-- l'école l'examine et l'accepte (création de l'élève) ou le refuse.
CREATE TABLE enrolment_campaign (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 140),
  info TEXT CHECK (info IS NULL OR length(info) <= 2000),
  levels TEXT CHECK (levels IS NULL OR length(levels) <= 400),
  opens_on TEXT NOT NULL CHECK (length(opens_on) = 10), closes_on TEXT NOT NULL CHECK (length(closes_on) = 10),
  status TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte','fermee')),
  announcement_id INTEGER,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (school_id, id));
CREATE INDEX enrolment_campaign_ecole ON enrolment_campaign(school_id, status);
CREATE TABLE enrolment_application (
  id {{PK}}, school_id INTEGER NOT NULL, campaign_id INTEGER NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 60), last_name TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 60),
  birth_date TEXT CHECK (birth_date IS NULL OR length(birth_date) = 10), sex TEXT CHECK (sex IS NULL OR sex IN ('F','M')),
  level TEXT CHECK (level IS NULL OR length(level) <= 60), previous_school TEXT CHECK (previous_school IS NULL OR length(previous_school) <= 120),
  guardian_name TEXT NOT NULL CHECK (length(guardian_name) BETWEEN 2 AND 80),
  guardian_relation TEXT NOT NULL CHECK (guardian_relation IN ('mere','pere','tuteur','grand_parent','frere_soeur','autre')),
  guardian_phone TEXT CHECK (guardian_phone IS NULL OR length(guardian_phone) <= 20), guardian_email TEXT CHECK (guardian_email IS NULL OR length(guardian_email) <= 254),
  message TEXT CHECK (message IS NULL OR length(message) <= 1000),
  lang TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','ht')),
  status TEXT NOT NULL DEFAULT 'recue' CHECK (status IN ('recue','liste_attente','acceptee','refusee')),
  decided_by INTEGER, decided_at TEXT, decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 300),
  student_id INTEGER, created_at TEXT NOT NULL,
  CHECK (guardian_phone IS NOT NULL OR guardian_email IS NOT NULL),
  CHECK (status <> 'acceptee' OR student_id IS NOT NULL),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, campaign_id) REFERENCES enrolment_campaign(school_id, id));
CREATE INDEX enrolment_application_ecole ON enrolment_application(school_id, status, id);
CREATE TABLE enrolment_document (
  id {{PK}}, school_id INTEGER NOT NULL, application_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(name) <= 120), type TEXT NOT NULL, size INTEGER NOT NULL CHECK (size <= 1048576), data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (school_id, application_id) REFERENCES enrolment_application(school_id, id));

-- E-mails des élèves : format de la partie locale et création automatique à l'inscription (désactivée par défaut).
ALTER TABLE school_email_settings ADD COLUMN local_format TEXT NOT NULL DEFAULT 'code' CHECK (local_format IN ('code','prenom.nom','p.nom','prenom.nom.annee'));
ALTER TABLE school_email_settings ADD COLUMN auto_on_enrol INTEGER NOT NULL DEFAULT 0 CHECK (auto_on_enrol IN (0,1));
