-- Limiteur de tentatives persistant : survit au redémarrage et peut être partagé par plusieurs processus (PostgreSQL).
CREATE TABLE login_attempt (id {{PK}}, key TEXT NOT NULL, at_ms BIGINT NOT NULL);
CREATE INDEX login_attempt_key ON login_attempt(key, at_ms);
