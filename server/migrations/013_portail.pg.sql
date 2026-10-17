-- Cloisonnement (voir 004_rls.pg.sql). Une direction ne voit que les propositions et images de SON école ; le rôle
-- applicatif ne peut créer qu'une proposition « en_attente » et ne peut que la retirer : publier, refuser, mettre à
-- la une restent réservés au super-admin (connexion système, routes /api/admin/portail). Annonces et clics : aucun
-- accès pour le rôle applicatif. Le portail public lit par la connexion système, contenus publiés seulement.
ALTER TABLE portal_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole_lire ON portal_item FOR SELECT USING (school_id = noria_school());
CREATE POLICY ecole_proposer ON portal_item FOR INSERT WITH CHECK (school_id = noria_school() AND status = 'en_attente'
  AND featured = 0 AND published_at IS NULL AND moderated_by IS NULL AND created_by_admin IS NULL);
CREATE POLICY ecole_retirer ON portal_item FOR UPDATE USING (school_id = noria_school() AND status = 'en_attente')
  WITH CHECK (school_id = noria_school() AND status IN ('en_attente','retire') AND featured = 0 AND published_at IS NULL AND moderated_by IS NULL);
REVOKE DELETE ON portal_item FROM noria_app;
ALTER TABLE portal_image ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole_lire ON portal_image FOR SELECT USING (school_id = noria_school());
CREATE POLICY ecole_ajouter ON portal_image FOR INSERT WITH CHECK (school_id = noria_school() AND created_by_admin IS NULL);
REVOKE UPDATE, DELETE ON portal_image FROM noria_app;
REVOKE ALL ON portal_ad, portal_ad_click FROM noria_app;
-- Image : contenu figé une fois enregistré (une nouvelle image = une nouvelle ligne, donc une nouvelle adresse en cache).
CREATE TRIGGER portal_image_append_only BEFORE UPDATE OR DELETE ON portal_image FOR EACH ROW EXECUTE FUNCTION noria_append_only();
-- Contenu : jamais supprimé (retiré, refusé ou dépublié reste au journal).
CREATE FUNCTION noria_portal_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'contenu du portail : suppression interdite'; END $$;
CREATE TRIGGER portal_item_no_delete BEFORE DELETE ON portal_item FOR EACH ROW EXECUTE FUNCTION noria_portal_item_guard();
