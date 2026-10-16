-- Envoi réel des messages : la boîte d'envoi garde l'état de chaque envoi (adaptateur, identifiant, erreur).
-- Les messages déjà présents ont été simulés. Hors mode simulé, le corps stocké est masqué (ni lien ni code).
ALTER TABLE outbox ADD COLUMN status TEXT NOT NULL DEFAULT 'simule' CHECK (status IN ('simule','en_attente','envoye','echec'));
ALTER TABLE outbox ADD COLUMN provider TEXT;
ALTER TABLE outbox ADD COLUMN provider_id TEXT;
ALTER TABLE outbox ADD COLUMN error TEXT;
ALTER TABLE outbox ADD COLUMN lang TEXT;
ALTER TABLE outbox ADD COLUMN sent_at TEXT;
-- Code de connexion à 6 chiffres : recherche du dernier code d'un compte, comptage des renvois.
CREATE INDEX login_code_user ON login_code(school_id, user_id, created_at);
