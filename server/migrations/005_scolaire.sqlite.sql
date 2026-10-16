CREATE TRIGGER grade_hist_no_update BEFORE UPDATE ON grade_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER grade_hist_no_delete BEFORE DELETE ON grade_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER grade_conflict_no_update BEFORE UPDATE ON grade_conflict BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER grade_conflict_no_delete BEFORE DELETE ON grade_conflict BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
