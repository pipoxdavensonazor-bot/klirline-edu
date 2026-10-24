-- Cloisonnement par école (même règle que student, 004_rls.pg.sql).
ALTER TABLE student_guardian ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_guardian USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON student_guardian FROM noria_ministere;
