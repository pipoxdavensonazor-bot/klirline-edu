-- Alertes de sécurité hors de l'application : Telegram (conversation reliée par le super-admin) et e-mail.
-- Liaison Telegram d'un super-admin : lien profond à usage unique (15 min), puis identifiant de conversation.
CREATE TABLE admin_telegram (
  id {{PK}}, admin_id INTEGER NOT NULL REFERENCES platform_admin(id),
  token_hash TEXT UNIQUE, token_expires_at TEXT,
  chat_id TEXT CHECK (chat_id IS NULL OR length(chat_id) <= 32), linked_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX admin_telegram_chat ON admin_telegram(chat_id);
-- Alerte déjà signalée hors de l'application (immédiatement ou dans un récapitulatif) : jamais deux fois.
ALTER TABLE security_alert ADD COLUMN notified_at TEXT;
