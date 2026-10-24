-- Hors RLS école, comme school_request : connexion système seulement (super-admin), aucun rôle applicatif.
REVOKE ALL ON school_request_document FROM noria_app;
REVOKE ALL ON school_request_document FROM noria_ministere;
