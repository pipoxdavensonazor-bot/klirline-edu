-- Codes de connexion gratuits, bloc 9 (sans SMS payant) : WhatsApp « inversé » (la personne envoie le code affiché à
-- l'écran au numéro NORIA), bot Telegram (codes reçus gratuitement après liaison du compte), appareils de confiance
-- (30 jours) et codes d'activation imprimés par l'école. Commun SQLite / PostgreSQL ; cloisonnement RLS dans
-- 017_codes_gratuits.pg.sql. Aucun secret en clair : jetons et codes ne sont conservés que sous forme d'empreinte.

-- WhatsApp inversé : demande de connexion en attente. Le navigateur garde le ticket (secret, 256 bits) ; le webhook de
-- Meta marque la demande « vérifiée » quand le message « NORIA <code> » arrive DU téléphone du compte.
CREATE TABLE login_challenge (
  id {{PK}}, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  ticket_hash TEXT NOT NULL UNIQUE, phone TEXT NOT NULL CHECK (length(phone) <= 20), code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','verifie','utilise')),
  trust INTEGER NOT NULL DEFAULT 0 CHECK (trust IN (0,1)),
  school_given INTEGER NOT NULL DEFAULT 0 CHECK (school_given IN (0,1)),
  expires_at TEXT NOT NULL, verified_at TEXT, used_at TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE INDEX login_challenge_phone ON login_challenge(phone, status, expires_at);

-- Liaison Telegram : jeton de lien profond t.me/<bot>?start=<jeton> (15 min, usage unique), puis identifiant de
-- conversation privée où le bot envoie les codes. Une liaison active par compte ; « /stop » la révoque.
CREATE TABLE telegram_link (
  id {{PK}}, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE, token_expires_at TEXT,
  chat_id TEXT CHECK (chat_id IS NULL OR length(chat_id) <= 32), linked_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE INDEX telegram_link_user ON telegram_link(school_id, user_id);
CREATE INDEX telegram_link_chat ON telegram_link(chat_id);

-- Appareil de confiance : cookie HttpOnly « noria_appareil » (30 jours), empreinte SHA-256 du jeton en base, jeton
-- renouvelé à chaque usage ; révocable (paramètres du compte, déconnexion, récupération du mot de passe).
CREATE TABLE trusted_device (
  id {{PK}}, school_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL CHECK (length(label) <= 80),
  created_at TEXT NOT NULL, last_used_at TEXT, expires_at TEXT NOT NULL, revoked_at TEXT,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id));
CREATE INDEX trusted_device_user ON trusted_device(school_id, user_id);

-- Code d'activation imprimé par l'école (direction, secrétariat) pour un élève ou un parent sans e-mail ni messagerie :
-- usage unique, 30 jours par défaut (90 au plus), empreinte HMAC liée à l'école ; un nouveau code annule l'ancien.
CREATE TABLE activation_code (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), user_id INTEGER NOT NULL, student_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('parent','eleve')),
  batch TEXT NOT NULL CHECK (length(batch) <= 40), code_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT,
  FOREIGN KEY (school_id, user_id) REFERENCES app_user(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id));
CREATE INDEX activation_code_user ON activation_code(school_id, user_id);
CREATE INDEX activation_code_batch ON activation_code(school_id, batch);
