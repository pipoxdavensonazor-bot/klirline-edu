-- TCA 10 % sur les factures NORIA (validé par Philippe). amount_cents reste le montant dû (TTC) ; on ajoute le détail.
-- Factures antérieures : tax_cents = 0 (émises sans TCA, montant inchangé).
ALTER TABLE billing_invoice ADD COLUMN tax_rate_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_invoice ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
