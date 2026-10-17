-- Cloisonnement par école (voir 004_rls.pg.sql) : décisions, signalements et dossier antérieur ne sont visibles que de
-- leur école. Les transferts (deux écoles) sont refusés au rôle applicatif : routes dédiées, connexion système.
ALTER TABLE year_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON year_decision USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE student_flag ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_flag USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE student_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_history USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
GRANT SELECT, INSERT, UPDATE ON year_decision, student_flag TO noria_app;
REVOKE DELETE ON year_decision, student_flag FROM noria_app;
REVOKE INSERT, UPDATE, DELETE ON student_history FROM noria_app;
REVOKE ALL ON transfer, transfer_event FROM noria_app;
CREATE TRIGGER transfer_event_append_only BEFORE UPDATE OR DELETE ON transfer_event FOR EACH ROW EXECUTE FUNCTION noria_append_only();
CREATE TRIGGER student_history_append_only BEFORE UPDATE OR DELETE ON student_history FOR EACH ROW EXECUTE FUNCTION noria_append_only();
-- Transfert clos (transféré, refusé, annulé) : figé. Signature de l'école d'origine : figée une fois posée.
CREATE FUNCTION noria_transfer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'transfert : suppression interdite'; END IF;
  IF OLD.status IN ('transfere','refuse','annule') THEN RAISE EXCEPTION 'transfert clos : lecture seule'; END IF;
  IF OLD.signature IS NOT NULL AND (NEW.signature IS DISTINCT FROM OLD.signature OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
    OR NEW.key_id IS DISTINCT FROM OLD.key_id OR NEW.origin_at IS DISTINCT FROM OLD.origin_at) THEN RAISE EXCEPTION 'transfert signé : signature figée'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transfer_guard BEFORE UPDATE OR DELETE ON transfer FOR EACH ROW EXECUTE FUNCTION noria_transfer_guard();
-- Dossier archivé (élève transféré) : identité et notes de suivi en lecture seule.
CREATE FUNCTION noria_student_archive_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'transfere' AND NEW.status = 'transfere' AND (NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name
    OR NEW.birth_date IS DISTINCT FROM OLD.birth_date OR NEW.health_notes IS DISTINCT FROM OLD.health_notes OR NEW.family_notes IS DISTINCT FROM OLD.family_notes
    OR NEW.code IS DISTINCT FROM OLD.code OR NEW.sex IS DISTINCT FROM OLD.sex) THEN
    RAISE EXCEPTION 'dossier archivé (élève transféré) : lecture seule';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER student_archive_guard BEFORE UPDATE ON student FOR EACH ROW EXECUTE FUNCTION noria_student_archive_guard();
