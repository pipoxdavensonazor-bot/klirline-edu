-- Cloisonnement par école dans la base (PostgreSQL) : chaque requête d'un utilisateur connecté passe par le rôle
-- noria_app, soumis aux politiques RLS ; l'école vient du réglage de transaction app.school_id
-- (SELECT set_config('app.school_id', '<id>', true)). Sans réglage, aucune ligne n'est visible ni modifiable.
-- Le propriétaire des tables (compte de migration) n'est pas soumis aux politiques : il ne sert qu'à
-- l'authentification (recherche du compte, session, jetons, limiteur) et aux migrations.
DO $$ BEGIN
  CREATE ROLE noria_app NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE format('GRANT noria_app TO %I', current_user);
EXCEPTION WHEN others THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO noria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO noria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO noria_app;
REVOKE ALL ON schema_migrations, login_attempt FROM noria_app;
-- Tables futures : droits accordés automatiquement, mais toute nouvelle table doit recevoir sa politique RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO noria_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO noria_app;
CREATE FUNCTION noria_school() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.school_id', true), '')::integer $$;
ALTER TABLE school ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school USING (id = noria_school()) WITH CHECK (id = noria_school());
ALTER TABLE campus ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON campus USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE school_year ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON school_year USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE level ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON level USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE class ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON class USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE subject ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON subject USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON app_user USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON user_role USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE student ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON student USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE parent_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON parent_link USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE teacher_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON teacher_assignment USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE enrollment ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON enrollment USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE finance_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON finance_entry USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE session ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON session USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE account_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON account_token USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE login_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON login_code USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON outbox USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON audit_log USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON attendance USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE attendance_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON attendance_history USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE sync_op ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON sync_op USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE sync_conflict ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON sync_conflict USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
