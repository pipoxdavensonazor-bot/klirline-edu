-- Cloisonnement par école (mêmes règles que 022) ; le ministère n'y a aucun accès.
ALTER TABLE parent_meeting_speaker ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON parent_meeting_speaker USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON parent_meeting_speaker FROM noria_ministere;
