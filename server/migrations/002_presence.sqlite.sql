CREATE TRIGGER att_hist_no_update BEFORE UPDATE ON attendance_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER att_hist_no_delete BEFORE DELETE ON attendance_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER conflict_no_update BEFORE UPDATE ON sync_conflict BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER conflict_no_delete BEFORE DELETE ON sync_conflict BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
