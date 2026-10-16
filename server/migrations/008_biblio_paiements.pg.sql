CREATE FUNCTION noria_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'reçu conservé : suppression interdite'; END IF;
  IF OLD.cancelled_at IS NOT NULL OR NEW.amount_cents <> OLD.amount_cents OR NEW.method <> OLD.method
    OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.receipt_no <> OLD.receipt_no OR NEW.receipt_code <> OLD.receipt_code
    OR NEW.student_id <> OLD.student_id OR NEW.paid_on <> OLD.paid_on OR NEW.school_id <> OLD.school_id THEN
    RAISE EXCEPTION 'reçu figé : seule une annulation motivée est permise';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_guard BEFORE UPDATE OR DELETE ON payment FOR EACH ROW EXECUTE FUNCTION noria_payment_guard();
-- Cloisonnement par école (voir 004_rls.pg.sql).
ALTER TABLE book ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON book USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE loan ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON loan USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecole ON payment USING (school_id = noria_school()) WITH CHECK (school_id = noria_school());
GRANT SELECT, INSERT, UPDATE ON book, loan, payment TO noria_app;
REVOKE DELETE ON payment FROM noria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO noria_app;
