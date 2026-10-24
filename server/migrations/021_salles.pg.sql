-- Cloisonnement par école pour les salles de cours (mêmes règles que les autres tables du socle).
ALTER TABLE class_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class_session USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE class_resource ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class_resource USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE class_hand ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class_hand USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE class_poll ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class_poll USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE class_poll_vote ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class_poll_vote USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON class_session, class_resource, class_hand, class_poll, class_poll_vote FROM noria_ministere;
