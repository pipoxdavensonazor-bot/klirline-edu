-- Journal en ajout seul : les déclencheurs refusent toute modification ou suppression.
CREATE FUNCTION noria_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'journal en ajout seul'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION noria_append_only();
