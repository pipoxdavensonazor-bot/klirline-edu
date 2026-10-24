-- Hors RLS école : aucun accès pour les rôles applicatifs (connexion système seulement), comme 009 et 023.
REVOKE ALL ON admin_telegram FROM noria_app;
REVOKE ALL ON admin_telegram FROM noria_ministere;
