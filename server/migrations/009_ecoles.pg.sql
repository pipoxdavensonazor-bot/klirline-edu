CREATE TRIGGER platform_audit_no_update BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION noria_append_only();
-- Tables globales : jamais accessibles au rôle applicatif (soumis à la RLS par école).
REVOKE ALL ON person, platform_admin, platform_session, platform_login, platform_audit FROM noria_app;
-- Registre des codes : chaque école voit ses codes ; l'unicité (clé primaire) vaut pour tout le système.
ALTER TABLE student_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student_code USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
REVOKE UPDATE, DELETE ON student_code FROM noria_app;
-- Rattachement d'un parent existant lors d'un import (par téléphone) : seule l'identité (un entier) sort de la fonction,
-- jamais l'e-mail, le nom ni l'école d'origine. Ambiguïté (plusieurs personnes) : NULL.
CREATE FUNCTION noria_person_by_phone(p text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN COUNT(DISTINCT person_id) = 1 THEN MIN(person_id) END FROM app_user
  WHERE phone = p AND state = 'actif' AND person_id IS NOT NULL $$;
REVOKE ALL ON FUNCTION noria_person_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION noria_person_by_phone(text) TO noria_app;
