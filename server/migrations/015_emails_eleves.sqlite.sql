CREATE TRIGGER student_email_event_no_update BEFORE UPDATE ON student_email_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER student_email_event_no_delete BEFORE DELETE ON student_email_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER student_email_no_delete BEFORE DELETE ON student_email BEGIN SELECT RAISE(ABORT, 'adresse e-mail : suppression interdite'); END;
CREATE TRIGGER student_email_dest_no_delete BEFORE DELETE ON student_email_dest BEGIN SELECT RAISE(ABORT, 'adresse e-mail : suppression interdite'); END;
-- Adresse figée ; une adresse désactivée ne revient jamais.
CREATE TRIGGER student_email_guard BEFORE UPDATE ON student_email
WHEN NEW.address <> OLD.address OR NEW.local_part <> OLD.local_part OR NEW.student_code <> OLD.student_code OR (OLD.status = 'desactivee' AND NEW.status <> 'desactivee')
BEGIN SELECT RAISE(ABORT, 'adresse e-mail figée : lecture seule'); END;
