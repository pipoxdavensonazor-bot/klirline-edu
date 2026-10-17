-- Portail public, bloc 8 : demandes d'inscription des écoles, comptes grand public (rôle « public », sans école),
-- abonnements aux publications et journal des envois groupés. Commun SQLite / PostgreSQL. Ces tables sont HORS du
-- cloisonnement par école : seul le serveur (connexion système) les lit et les écrit ; voir 016_portail_public.pg.sql.

-- Demande d'inscription déposée sur le portail (e-mail vérifié par code avant l'enregistrement).
CREATE TABLE school_request (
  id {{PK}},
  school_name TEXT NOT NULL CHECK (length(school_name) BETWEEN 2 AND 120),
  department TEXT NOT NULL CHECK (department IN ('artibonite','centre','grand-anse','nippes','nord','nord-est','nord-ouest','ouest','sud','sud-est')),
  commune TEXT NOT NULL CHECK (length(commune) BETWEEN 2 AND 80),
  director_name TEXT NOT NULL CHECK (length(director_name) BETWEEN 2 AND 80),
  email TEXT NOT NULL CHECK (length(email) <= 254),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 20),
  students_approx INTEGER CHECK (students_approx IS NULL OR (students_approx >= 0 AND students_approx <= 100000)),
  message TEXT CHECK (message IS NULL OR length(message) <= 1000),
  lang TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','ht')),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','acceptee','refusee')),
  decided_by INTEGER, decided_at TEXT, decision_reason TEXT CHECK (decision_reason IS NULL OR length(decision_reason) <= 300),
  school_id INTEGER REFERENCES school(id),
  created_at TEXT NOT NULL,
  CHECK (status <> 'acceptee' OR school_id IS NOT NULL),
  CHECK (status <> 'refusee' OR decision_reason IS NOT NULL));
CREATE INDEX school_request_statut ON school_request(status, id);

-- Codes à usage unique du portail (vérification de l'e-mail d'une demande, connexion d'un compte public) : haché
-- (HMAC salé), 10 min, 5 essais, rattaché à un ticket opaque. payload : formulaire de la demande en attente de vérification.
CREATE TABLE public_code (
  id {{PK}}, purpose TEXT NOT NULL CHECK (purpose IN ('demande','compte')),
  identifier TEXT NOT NULL, ticket_hash TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL, payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX public_code_ident ON public_code(purpose, identifier, created_at);

-- Compte grand public : connexion sans mot de passe (code par e-mail, ou téléphone), aucune école, aucune donnée scolaire.
CREATE TABLE public_account (
  id {{PK}}, role TEXT NOT NULL DEFAULT 'public' CHECK (role = 'public'),
  email TEXT UNIQUE CHECK (email IS NULL OR length(email) <= 254), phone TEXT UNIQUE CHECK (phone IS NULL OR length(phone) <= 20),
  lang TEXT NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','ht')),
  sub_annonces INTEGER NOT NULL DEFAULT 0 CHECK (sub_annonces IN (0,1)),
  sub_evenements INTEGER NOT NULL DEFAULT 0 CHECK (sub_evenements IN (0,1)),
  sub_laureats INTEGER NOT NULL DEFAULT 0 CHECK (sub_laureats IN (0,1)),
  department TEXT CHECK (department IS NULL OR department IN ('artibonite','centre','grand-anse','nippes','nord','nord-est','nord-ouest','ouest','sud','sud-est')),
  -- Clé propre au compte pour signer les liens de désinscription (HMAC) : aucun secret serveur supplémentaire.
  link_key TEXT NOT NULL,
  created_at TEXT NOT NULL, last_login_at TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL));

CREATE TABLE public_session (
  token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES public_account(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX public_session_compte ON public_session(account_id);

-- Envoi groupé aux abonnés : une seule fois par contenu (une republication ne renvoie rien).
CREATE TABLE public_digest (
  id {{PK}}, kind TEXT NOT NULL CHECK (kind IN ('annonce','evenement','laureat')), ref_id INTEGER NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE (kind, ref_id));
