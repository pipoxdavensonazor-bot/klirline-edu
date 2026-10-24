-- Cloisonnement par école (mêmes règles que 022) ; le ministère n'y a aucun accès.
ALTER TABLE bulletin_appreciation ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON bulletin_appreciation USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE ALL ON bulletin_appreciation FROM noria_ministere;
