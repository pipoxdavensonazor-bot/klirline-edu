CREATE TRIGGER transfer_event_no_update BEFORE UPDATE ON transfer_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER transfer_event_no_delete BEFORE DELETE ON transfer_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER student_history_no_update BEFORE UPDATE ON student_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER student_history_no_delete BEFORE DELETE ON student_history BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER transfer_no_delete BEFORE DELETE ON transfer BEGIN SELECT RAISE(ABORT, 'transfert : suppression interdite'); END;
CREATE TRIGGER transfer_clos BEFORE UPDATE ON transfer WHEN OLD.status IN ('transfere','refuse','annule')
  BEGIN SELECT RAISE(ABORT, 'transfert clos : lecture seule'); END;
CREATE TRIGGER transfer_signature BEFORE UPDATE ON transfer WHEN OLD.signature IS NOT NULL AND (NEW.signature IS NOT OLD.signature
  OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.key_id IS NOT OLD.key_id OR NEW.origin_at IS NOT OLD.origin_at)
  BEGIN SELECT RAISE(ABORT, 'transfert signé : signature figée'); END;
CREATE TRIGGER student_archive_guard BEFORE UPDATE ON student WHEN OLD.status = 'transfere' AND NEW.status = 'transfere' AND (NEW.first_name IS NOT OLD.first_name
  OR NEW.last_name IS NOT OLD.last_name OR NEW.birth_date IS NOT OLD.birth_date OR NEW.health_notes IS NOT OLD.health_notes
  OR NEW.family_notes IS NOT OLD.family_notes OR NEW.code IS NOT OLD.code OR NEW.sex IS NOT OLD.sex)
  BEGIN SELECT RAISE(ABORT, 'dossier archivé (élève transféré) : lecture seule'); END;
