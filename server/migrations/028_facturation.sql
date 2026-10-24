-- Facturation des écoles par la plateforme (super-admin). Paiements manuels uniquement (MonCash, NatCash, virement,
-- espèces) : aucune passerelle de paiement. Rien n'est jamais supprimé : une facture se paie ou s'annule (motif).
CREATE TABLE billing_plan (
  id {{PK}}, name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('par_eleve','forfait')),
  currency TEXT NOT NULL CHECK (currency IN ('HTG','USD')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 100000000000),
  period TEXT NOT NULL DEFAULT 'annuel' CHECK (period IN ('annuel')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- Abonnement d'une école : formule, essai gratuit, délai de grâce, lecture seule automatique (jamais de suppression).
CREATE TABLE school_billing (
  school_id INTEGER PRIMARY KEY REFERENCES school(id),
  plan_id INTEGER REFERENCES billing_plan(id),
  trial_ends_on TEXT CHECK (trial_ends_on IS NULL OR length(trial_ends_on) = 10),
  grace_days INTEGER NOT NULL DEFAULT 30 CHECK (grace_days BETWEEN 0 AND 365),
  read_only_mode TEXT NOT NULL DEFAULT 'auto' CHECK (read_only_mode IN ('auto','jamais','force')),
  billing_email TEXT CHECK (billing_email IS NULL OR length(billing_email) <= 254),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE billing_invoice (
  id {{PK}}, number TEXT NOT NULL UNIQUE CHECK (length(number) <= 20), school_id INTEGER NOT NULL REFERENCES school(id),
  plan_id INTEGER REFERENCES billing_plan(id), label TEXT NOT NULL CHECK (length(label) <= 160),
  kind TEXT NOT NULL CHECK (kind IN ('par_eleve','forfait')), currency TEXT NOT NULL CHECK (currency IN ('HTG','USD')),
  students INTEGER CHECK (students IS NULL OR students >= 0), unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  issued_on TEXT NOT NULL CHECK (length(issued_on) = 10), due_on TEXT NOT NULL CHECK (length(due_on) = 10),
  status TEXT NOT NULL DEFAULT 'a_payer' CHECK (status IN ('a_payer','payee','annulee')),
  paid_on TEXT, cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  created_by INTEGER REFERENCES platform_admin(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX billing_invoice_school ON billing_invoice(school_id, status);
CREATE TABLE billing_payment (
  id {{PK}}, invoice_id INTEGER NOT NULL REFERENCES billing_invoice(id),
  method TEXT NOT NULL CHECK (method IN ('moncash','natcash','virement','especes')),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 80),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), paid_on TEXT NOT NULL CHECK (length(paid_on) = 10),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  recorded_by INTEGER NOT NULL REFERENCES platform_admin(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (method, reference));
CREATE TABLE billing_reminder (
  id {{PK}}, invoice_id INTEGER NOT NULL REFERENCES billing_invoice(id),
  channel TEXT NOT NULL CHECK (channel IN ('email','app')), recipients INTEGER NOT NULL DEFAULT 0,
  sent_by INTEGER REFERENCES platform_admin(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
