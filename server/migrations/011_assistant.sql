-- Assistant sécurité (bloc 3) : événements observés par le serveur, alertes, actions confirmées par le super-admin,
-- blocages d'IP, regroupement des notifications. Tables globales (hors école), lues par la connexion système seulement.
-- Événements : connexions (réussies, échouées), réponses 4xx/5xx, refus RLS, exports, PDF, consultations de fiches.
-- Jamais de mot de passe, de code ni de contenu de requête ; l'identifiant de compte est tronqué à 120 caractères.
CREATE TABLE security_event (
  id {{PK}}, at_ms BIGINT NOT NULL, kind TEXT NOT NULL, ip TEXT, account TEXT, school_id INTEGER, user_id INTEGER,
  role TEXT, status INTEGER, path TEXT, ua_hash TEXT, detail TEXT);
CREATE INDEX security_event_at ON security_event(at_ms);
CREATE INDEX security_event_kind ON security_event(kind, at_ms);
CREATE TABLE security_alert (
  id {{PK}}, rule TEXT NOT NULL, fingerprint TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('info','attention','critique')),
  title_fr TEXT NOT NULL, title_ht TEXT NOT NULL, explain_fr TEXT NOT NULL, explain_ht TEXT NOT NULL,
  reco_fr TEXT NOT NULL, reco_ht TEXT NOT NULL, evidence TEXT NOT NULL, actions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte','traitee','faux_positif')),
  hits INTEGER NOT NULL DEFAULT 1, first_at TEXT NOT NULL, last_at TEXT NOT NULL, closed_at TEXT, closed_by INTEGER);
CREATE INDEX security_alert_fp ON security_alert(fingerprint, status);
-- Demande d'action en attente de confirmation (jeton à usage unique, 10 min ; code à 6 chiffres pour les actions critiques).
CREATE TABLE security_pending (
  id {{PK}}, token_hash TEXT NOT NULL UNIQUE, admin_id INTEGER NOT NULL, type TEXT NOT NULL, params TEXT NOT NULL,
  alert_id INTEGER, critical INTEGER NOT NULL DEFAULT 0, code_hash TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Historique des actions, en ajout seul : une annulation est une nouvelle ligne (undo_of = action annulée).
CREATE TABLE security_action (
  id {{PK}}, admin_id INTEGER NOT NULL, type TEXT NOT NULL, target TEXT, params TEXT, alert_id INTEGER, reason TEXT,
  undo_data TEXT, undo_of INTEGER, otp INTEGER NOT NULL DEFAULT 0, ip TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE ip_block (
  id {{PK}}, ip TEXT NOT NULL, until_at TEXT NOT NULL, action_id INTEGER, lifted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ip_block_ip ON ip_block(ip);
-- Verrouillage d'une personne par le super-admin (toutes ses écoles) ; distinct de l'état géré par l'école.
ALTER TABLE person ADD COLUMN locked_at TEXT;
CREATE TABLE security_notice (rule TEXT PRIMARY KEY, last_ms BIGINT NOT NULL, suppressed INTEGER NOT NULL DEFAULT 0);
