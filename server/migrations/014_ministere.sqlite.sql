CREATE TRIGGER ministry_audit_no_update BEFORE UPDATE ON ministry_audit BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER ministry_audit_no_delete BEFORE DELETE ON ministry_audit BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER declaration_event_no_update BEFORE UPDATE ON declaration_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER declaration_event_no_delete BEFORE DELETE ON declaration_event BEGIN SELECT RAISE(ABORT, 'journal en ajout seul'); END;
CREATE TRIGGER ministry_key_no_update BEFORE UPDATE ON ministry_key BEGIN SELECT RAISE(ABORT, 'clé du ministère : signature figée'); END;
CREATE TRIGGER ministry_key_no_delete BEFORE DELETE ON ministry_key BEGIN SELECT RAISE(ABORT, 'clé du ministère : suppression interdite'); END;
-- Déclaration : jamais supprimée ; contenu signé figé ; seules les transitions envoyee → recue | correction_demandee
-- et correction_demandee → remplacee sont permises.
CREATE TRIGGER annual_declaration_no_delete BEFORE DELETE ON annual_declaration BEGIN SELECT RAISE(ABORT, 'déclaration : suppression interdite'); END;
CREATE TRIGGER annual_declaration_signee BEFORE UPDATE ON annual_declaration WHEN NEW.payload IS NOT OLD.payload OR NEW.payload_sha256 IS NOT OLD.payload_sha256
  OR NEW.pdf IS NOT OLD.pdf OR NEW.pdf_sha256 IS NOT OLD.pdf_sha256 OR NEW.signature IS NOT OLD.signature OR NEW.key_id IS NOT OLD.key_id
  OR NEW.school_id IS NOT OLD.school_id OR NEW.school_year_id IS NOT OLD.school_year_id OR NEW.version IS NOT OLD.version
  OR NEW.sent_by IS NOT OLD.sent_by OR NEW.sent_at IS NOT OLD.sent_at OR NEW.year_label IS NOT OLD.year_label
  BEGIN SELECT RAISE(ABORT, 'déclaration signée : signature figée'); END;
CREATE TRIGGER annual_declaration_statut BEFORE UPDATE ON annual_declaration WHEN NOT (
  (OLD.status = 'envoyee' AND NEW.status IN ('recue','correction_demandee')) OR (OLD.status = 'correction_demandee' AND NEW.status = 'remplacee')
  OR (NEW.status = OLD.status AND NEW.ministry_by IS OLD.ministry_by AND NEW.ministry_at IS OLD.ministry_at AND NEW.ministry_note IS OLD.ministry_note))
  BEGIN SELECT RAISE(ABORT, 'déclaration : lecture seule (transition interdite)'); END;
-- Décision du ministère sur un transfert : figée une fois signée.
CREATE TRIGGER transfer_ministere_signe BEFORE UPDATE ON transfer WHEN OLD.ministry_signature IS NOT NULL AND (NEW.ministry_signature IS NOT OLD.ministry_signature
  OR NEW.ministry_key_id IS NOT OLD.ministry_key_id OR NEW.ministry_payload_sha256 IS NOT OLD.ministry_payload_sha256 OR NEW.ministry_at IS NOT OLD.ministry_at
  OR NEW.ministry_account_id IS NOT OLD.ministry_account_id)
  BEGIN SELECT RAISE(ABORT, 'transfert signé : signature figée'); END;
