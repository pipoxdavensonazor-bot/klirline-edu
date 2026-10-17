-- Cloisonnement du bloc 6 (PostgreSQL). Le ministère a un rôle de base dédié, noria_ministere, distinct de noria_app :
--   * aucun contournement global (pas de BYPASSRLS, pas de compte propriétaire) : chaque table qu'il lit porte une
--     politique « ministere_lecture » réservée à ce rôle, active seulement si app.ministere_id est réglé dans la
--     transaction (db.asMinistry) ;
--   * lecture seule par colonnes : jamais les notes de santé ni de famille, les mots de passe, les contacts des comptes,
--     les signatures ni les clés ; aucune table de notes, finances, présences, sessions ou jetons ;
--   * seules écritures permises : le statut d'une déclaration « envoyee » (accusé de réception ou demande de
--     correction), l'historique de la déclaration, son propre journal, et la trace « ministere.* » dans le journal de
--     l'école consultée.
DO $$ BEGIN
  CREATE ROLE noria_ministere NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE format('GRANT noria_ministere TO %I', current_user);
EXCEPTION WHEN others THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO noria_ministere;
CREATE FUNCTION noria_ministere() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.ministere_id', true), '')::integer $$;

-- Tables du ministère : aucun droit pour le rôle des écoles (les droits par défaut de 004 sont retirés).
REVOKE ALL ON ministry_account, ministry_login, ministry_session, ministry_audit, ministry_key FROM noria_app;
ALTER TABLE ministry_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON ministry_audit TO noria_ministere;
CREATE POLICY ministere_journal ON ministry_audit FOR INSERT TO noria_ministere WITH CHECK (account_id = noria_ministere());
CREATE POLICY ministere_lecture ON ministry_audit FOR SELECT TO noria_ministere USING (account_id = noria_ministere());
CREATE TRIGGER ministry_audit_append_only BEFORE UPDATE OR DELETE ON ministry_audit FOR EACH ROW EXECUTE FUNCTION noria_append_only();
CREATE FUNCTION noria_ministry_key_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'clé du ministère : signature figée'; END $$;
CREATE TRIGGER ministry_key_guard BEFORE UPDATE OR DELETE ON ministry_key FOR EACH ROW EXECUTE FUNCTION noria_ministry_key_guard();

-- Lecture transversale contrôlée (colonnes choisies).
GRANT SELECT (id, slug, name, initials, address, email, phone, motto, status, department, commune, logo_updated_at, default_lang, created_at) ON school TO noria_ministere;
GRANT SELECT (id, school_id, label, is_current) ON school_year TO noria_ministere;
GRANT SELECT (id, school_id, name) ON level TO noria_ministere;
GRANT SELECT (id, school_id, name, school_year_id, level_id) ON class TO noria_ministere;
GRANT SELECT (id, school_id, student_id, class_id, status, created_at) ON enrollment TO noria_ministere;
GRANT SELECT (id, school_id, code, first_name, last_name, birth_date, sex, status, transferred_at) ON student TO noria_ministere;
GRANT SELECT (id, school_id, student_id, school_year_id, decision, decided_at) ON year_decision TO noria_ministere;
GRANT SELECT (id, school_id, state) ON app_user TO noria_ministere;
GRANT SELECT (school_id, user_id, role) ON user_role TO noria_ministere;
GRANT SELECT (id, school_id, kind, status, person_name, year, exam, exam_type, mention, minor, consent_school, consent_parent, department) ON portal_item TO noria_ministere;
CREATE POLICY ministere_lecture ON school FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON school_year FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON level FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON class FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON enrollment FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON student FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON year_decision FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON app_user FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_lecture ON user_role FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
-- Lauréats seulement (jamais les propositions d'articles ou d'événements en attente de modération).
CREATE POLICY ministere_lecture ON portal_item FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL AND kind = 'laureat');
-- Trace de la consultation dans le journal de l'école consultée (transparence pour la direction).
GRANT INSERT (school_id, actor_user_id, action, record_type, record_id, reason, outcome) ON audit_log TO noria_ministere;
CREATE POLICY ministere_trace ON audit_log FOR INSERT TO noria_ministere WITH CHECK (noria_ministere() IS NOT NULL AND actor_user_id IS NULL AND action LIKE 'ministere.%');

-- Déclaration annuelle : l'école crée (statut « envoyee ») et ne peut que marquer « remplacee » une version dont la
-- correction est demandée ; le ministère lit tout et ne change que le statut d'une version « envoyee ».
ALTER TABLE annual_declaration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON annual_declaration FROM noria_app;
GRANT SELECT, INSERT ON annual_declaration TO noria_app;
GRANT UPDATE (status) ON annual_declaration TO noria_app;
CREATE POLICY ecole_lire ON annual_declaration FOR SELECT TO noria_app USING (school_id = noria_school());
CREATE POLICY ecole_envoyer ON annual_declaration FOR INSERT TO noria_app WITH CHECK (school_id = noria_school() AND status = 'envoyee'
  AND ministry_by IS NULL AND ministry_at IS NULL AND ministry_note IS NULL);
CREATE POLICY ecole_remplacer ON annual_declaration FOR UPDATE TO noria_app USING (school_id = noria_school() AND status = 'correction_demandee')
  WITH CHECK (school_id = noria_school() AND status = 'remplacee');
GRANT SELECT ON annual_declaration TO noria_ministere;
GRANT UPDATE (status, ministry_by, ministry_at, ministry_note) ON annual_declaration TO noria_ministere;
CREATE POLICY ministere_lecture ON annual_declaration FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_statut ON annual_declaration FOR UPDATE TO noria_ministere USING (noria_ministere() IS NOT NULL AND status = 'envoyee')
  WITH CHECK (status IN ('recue','correction_demandee') AND ministry_by = noria_ministere());
ALTER TABLE declaration_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON declaration_event FROM noria_app;
GRANT SELECT, INSERT ON declaration_event TO noria_app;
CREATE POLICY ecole_lire ON declaration_event FOR SELECT TO noria_app USING (school_id = noria_school());
CREATE POLICY ecole_ajouter ON declaration_event FOR INSERT TO noria_app WITH CHECK (school_id = noria_school() AND actor = 'direction' AND ministry_account_id IS NULL);
GRANT SELECT, INSERT ON declaration_event TO noria_ministere;
CREATE POLICY ministere_lecture ON declaration_event FOR SELECT TO noria_ministere USING (noria_ministere() IS NOT NULL);
CREATE POLICY ministere_ajouter ON declaration_event FOR INSERT TO noria_ministere WITH CHECK (actor = 'ministere' AND ministry_account_id = noria_ministere() AND user_id IS NULL);
CREATE TRIGGER declaration_event_append_only BEFORE UPDATE OR DELETE ON declaration_event FOR EACH ROW EXECUTE FUNCTION noria_append_only();
CREATE FUNCTION noria_declaration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'déclaration : suppression interdite'; END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR NEW.pdf IS DISTINCT FROM OLD.pdf
    OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256 OR NEW.signature IS DISTINCT FROM OLD.signature OR NEW.key_id IS DISTINCT FROM OLD.key_id
    OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.school_year_id IS DISTINCT FROM OLD.school_year_id OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.sent_by IS DISTINCT FROM OLD.sent_by OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.year_label IS DISTINCT FROM OLD.year_label THEN
    RAISE EXCEPTION 'déclaration signée : signature figée';
  END IF;
  IF NOT ((OLD.status = 'envoyee' AND NEW.status IN ('recue','correction_demandee')) OR (OLD.status = 'correction_demandee' AND NEW.status = 'remplacee')
    OR (NEW.status = OLD.status AND NEW.ministry_by IS NOT DISTINCT FROM OLD.ministry_by AND NEW.ministry_at IS NOT DISTINCT FROM OLD.ministry_at
      AND NEW.ministry_note IS NOT DISTINCT FROM OLD.ministry_note)) THEN
    RAISE EXCEPTION 'déclaration : lecture seule (transition interdite)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER annual_declaration_guard BEFORE UPDATE OR DELETE ON annual_declaration FOR EACH ROW EXECUTE FUNCTION noria_declaration_guard();

-- Transfert : décision du ministère figée une fois signée (table toujours refusée aux deux rôles applicatifs).
CREATE FUNCTION noria_transfer_ministry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ministry_signature IS NOT NULL AND (NEW.ministry_signature IS DISTINCT FROM OLD.ministry_signature OR NEW.ministry_key_id IS DISTINCT FROM OLD.ministry_key_id
    OR NEW.ministry_payload_sha256 IS DISTINCT FROM OLD.ministry_payload_sha256 OR NEW.ministry_at IS DISTINCT FROM OLD.ministry_at
    OR NEW.ministry_account_id IS DISTINCT FROM OLD.ministry_account_id) THEN RAISE EXCEPTION 'transfert signé : signature figée'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transfer_ministry_guard BEFORE UPDATE ON transfer FOR EACH ROW EXECUTE FUNCTION noria_transfer_ministry_guard();
