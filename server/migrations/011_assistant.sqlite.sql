CREATE TRIGGER security_action_no_update BEFORE UPDATE ON security_action BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER security_action_no_delete BEFORE DELETE ON security_action BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
