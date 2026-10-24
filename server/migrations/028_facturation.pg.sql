-- Facturation : tables de la plateforme, hors RLS école ; aucun accès pour les rôles applicatifs (connexion système seulement).
REVOKE ALL ON billing_plan FROM noria_app;
REVOKE ALL ON billing_plan FROM noria_ministere;
REVOKE ALL ON school_billing FROM noria_app;
REVOKE ALL ON school_billing FROM noria_ministere;
REVOKE ALL ON billing_invoice FROM noria_app;
REVOKE ALL ON billing_invoice FROM noria_ministere;
REVOKE ALL ON billing_payment FROM noria_app;
REVOKE ALL ON billing_payment FROM noria_ministere;
REVOKE ALL ON billing_reminder FROM noria_app;
REVOKE ALL ON billing_reminder FROM noria_ministere;
-- Jamais de suppression (une facture s'annule avec un motif ; un paiement enregistré reste tel quel).
CREATE FUNCTION noria_billing_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'suppression interdite'; END $$;
CREATE TRIGGER billing_invoice_no_delete BEFORE DELETE ON billing_invoice FOR EACH ROW EXECUTE FUNCTION noria_billing_keep();
CREATE TRIGGER billing_payment_no_change BEFORE UPDATE OR DELETE ON billing_payment FOR EACH ROW EXECUTE FUNCTION noria_billing_keep();
CREATE TRIGGER school_billing_no_delete BEFORE DELETE ON school_billing FOR EACH ROW EXECUTE FUNCTION noria_billing_keep();
