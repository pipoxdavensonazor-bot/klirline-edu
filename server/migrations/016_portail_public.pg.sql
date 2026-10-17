-- Hors RLS école : aucun accès pour les rôles applicatifs (noria_app, noria_ministere) ; connexion système seulement.
REVOKE ALL ON school_request, public_code, public_account, public_session, public_digest FROM noria_app;
REVOKE ALL ON school_request, public_code, public_account, public_session, public_digest FROM noria_ministere;
