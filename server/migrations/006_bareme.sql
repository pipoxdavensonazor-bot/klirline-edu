-- Barème : référence des moyennes par école (/100 par défaut) et barème figé dans chaque bulletin.
-- Les bulletins déjà émis ont été calculés sur 10 : on le conserve tel quel (données existantes intactes).
ALTER TABLE school ADD COLUMN grade_scale REAL NOT NULL DEFAULT 100 CHECK (grade_scale > 0 AND grade_scale <= 1000);
ALTER TABLE report_card ADD COLUMN scale REAL NOT NULL DEFAULT 10;
