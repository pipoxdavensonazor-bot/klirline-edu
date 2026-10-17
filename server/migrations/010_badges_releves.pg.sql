-- Cloisonnement par école (voir 004_rls.pg.sql).
ALTER TABLE student_photo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_photo USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE badge ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON badge USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE transcript ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON transcript USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON notification USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
GRANT SELECT, INSERT, UPDATE ON student_photo, badge, transcript, notification TO noria_app;
REVOKE DELETE ON badge, transcript FROM noria_app;
-- Clés : connexion système seulement (signature, vérification publique).
REVOKE ALL ON school_key FROM noria_app;
-- Relevé émis figé : document, empreinte et signature ne changent plus ; seule l'annulation est permise.
CREATE FUNCTION noria_transcript_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('emis','annule','refuse') AND (NEW.pdf IS DISTINCT FROM OLD.pdf OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.signature IS DISTINCT FROM OLD.signature OR NEW.code IS DISTINCT FROM OLD.code OR NEW.student_id <> OLD.student_id) THEN
    RAISE EXCEPTION 'relevé figé : seule une annulation motivée est permise';
  END IF;
  IF OLD.status = 'annule' OR OLD.status = 'refuse' THEN RAISE EXCEPTION 'relevé clos'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transcript_guard BEFORE UPDATE ON transcript FOR EACH ROW EXECUTE FUNCTION noria_transcript_guard();
