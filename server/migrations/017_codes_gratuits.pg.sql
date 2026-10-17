-- Cloisonnement (voir 004_rls.pg.sql) : chaque école ne voit que ses lignes. Les webhooks (Meta, Telegram), la
-- connexion et la reprise d'un appareil de confiance passent par la connexion système (avant toute session).
-- Le rôle du ministère (014) n'a aucun droit sur ces tables ; aucune suppression par le rôle applicatif.
ALTER TABLE login_challenge ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON login_challenge USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON login_challenge FROM noria_app; -- demandes avant connexion : connexion système seulement
ALTER TABLE telegram_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON telegram_link USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON telegram_link FROM noria_app;
ALTER TABLE trusted_device ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON trusted_device USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON trusted_device FROM noria_app;
ALTER TABLE activation_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON activation_code USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON activation_code FROM noria_app;
REVOKE ALL ON login_challenge, telegram_link, trusted_device, activation_code FROM noria_ministere;
