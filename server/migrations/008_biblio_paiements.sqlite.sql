CREATE TRIGGER payment_no_delete BEFORE DELETE ON payment BEGIN SELECT RAISE(ABORT, 'reçu conservé : suppression interdite'); END;
-- Seule l'annulation (une fois) modifie un paiement ; montant, mode, référence et numéro restent figés.
CREATE TRIGGER payment_frozen BEFORE UPDATE ON payment
  WHEN OLD.cancelled_at IS NOT NULL OR NEW.amount_cents <> OLD.amount_cents OR NEW.method <> OLD.method
    OR NEW.reference IS NOT OLD.reference OR NEW.receipt_no <> OLD.receipt_no OR NEW.receipt_code <> OLD.receipt_code
    OR NEW.student_id <> OLD.student_id OR NEW.paid_on <> OLD.paid_on OR NEW.school_id <> OLD.school_id
  BEGIN SELECT RAISE(ABORT, 'reçu figé : seule une annulation motivée est permise'); END;
