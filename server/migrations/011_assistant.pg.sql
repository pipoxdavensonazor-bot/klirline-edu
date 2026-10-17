CREATE TRIGGER security_action_no_update BEFORE UPDATE OR DELETE ON security_action FOR EACH ROW EXECUTE FUNCTION noria_append_only();
-- Tables globales : jamais accessibles au rôle applicatif (soumis à la RLS par école).
REVOKE ALL ON security_event, security_alert, security_pending, security_action, ip_block, security_notice FROM noria_app;
