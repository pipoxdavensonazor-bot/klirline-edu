-- Facturation : jamais de suppression (une facture s'annule avec un motif ; un paiement enregistré reste).
CREATE TRIGGER billing_invoice_no_delete BEFORE DELETE ON billing_invoice BEGIN SELECT RAISE(ABORT, 'suppression interdite'); END;
CREATE TRIGGER billing_payment_no_delete BEFORE DELETE ON billing_payment BEGIN SELECT RAISE(ABORT, 'suppression interdite'); END;
CREATE TRIGGER billing_payment_no_update BEFORE UPDATE ON billing_payment BEGIN SELECT RAISE(ABORT, 'suppression interdite'); END;
CREATE TRIGGER school_billing_no_delete BEFORE DELETE ON school_billing BEGIN SELECT RAISE(ABORT, 'suppression interdite'); END;
