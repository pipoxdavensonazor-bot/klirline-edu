-- Cloisonnement (voir 004_rls.pg.sql) : chaque école ne voit que ses adresses ; aucune suppression ; journal en ajout
-- seul. Le rôle du ministère (014) n'a aucun droit sur ces tables. Le webhook entrant et le balayage (fin de
-- scolarité, transferts) passent par la connexion système.
ALTER TABLE school_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school_email_settings USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON school_email_settings FROM noria_app;
ALTER TABLE student_email_dest ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_email_dest USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON student_email_dest FROM noria_app;
ALTER TABLE student_email ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_email USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE DELETE ON student_email FROM noria_app;
ALTER TABLE student_email_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole_lire ON student_email_event FOR SELECT USING (school_id = noria_school());
CREATE POLICY ecole_ajouter ON student_email_event FOR INSERT WITH CHECK (school_id = noria_school());
REVOKE UPDATE, DELETE ON student_email_event FROM noria_app;
CREATE TRIGGER student_email_event_append_only BEFORE UPDATE OR DELETE ON student_email_event FOR EACH ROW EXECUTE FUNCTION noria_append_only();
CREATE FUNCTION noria_student_email_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'adresse e-mail : suppression interdite'; END IF;
  IF TG_TABLE_NAME = 'student_email' AND (NEW.address <> OLD.address OR NEW.local_part <> OLD.local_part OR NEW.student_code <> OLD.student_code
     OR (OLD.status = 'desactivee' AND NEW.status <> 'desactivee')) THEN
    RAISE EXCEPTION 'adresse e-mail figée : lecture seule';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER student_email_guard BEFORE UPDATE OR DELETE ON student_email FOR EACH ROW EXECUTE FUNCTION noria_student_email_guard();
CREATE TRIGGER student_email_dest_guard BEFORE DELETE ON student_email_dest FOR EACH ROW EXECUTE FUNCTION noria_student_email_guard();
