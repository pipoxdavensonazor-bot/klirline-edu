CREATE TRIGGER platform_audit_no_update BEFORE UPDATE ON platform_audit BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER platform_audit_no_delete BEFORE DELETE ON platform_audit BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
