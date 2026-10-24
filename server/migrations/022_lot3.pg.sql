-- Cloisonnement par école pour les tables du lot 3 (mêmes règles que le socle). Le ministère n'y a aucun accès.
ALTER TABLE school_thread ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school_thread USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE school_message ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school_message USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE school_thread_read ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school_thread_read USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE parent_meeting ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON parent_meeting USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE parent_meeting_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON parent_meeting_attendance USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE parent_meeting_question ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON parent_meeting_question USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE enrolment_campaign ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON enrolment_campaign USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE enrolment_application ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON enrolment_application USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE enrolment_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON enrolment_document USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON school_thread, school_message, school_thread_read, parent_meeting, parent_meeting_attendance, parent_meeting_question,
  enrolment_campaign, enrolment_application, enrolment_document FROM noria_ministere;
