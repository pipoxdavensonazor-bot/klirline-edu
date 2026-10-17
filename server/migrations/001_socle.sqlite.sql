-- Journal en ajout seul : les déclencheurs refusent toute modification ou suppression.
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
