-- Bibliothèque (catalogue, prêts, retours, retards) et paiements avec reçus numérotés par école.
-- finance_entry devient la table des frais dus (libellé, montant en centimes de gourde, échéance facultative).
ALTER TABLE finance_entry ADD COLUMN due_on TEXT CHECK (due_on IS NULL OR length(due_on) = 10);
ALTER TABLE finance_entry ADD COLUMN created_by INTEGER;
CREATE TABLE book (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), title TEXT NOT NULL, author TEXT NOT NULL,
  isbn TEXT, copies INTEGER NOT NULL CHECK (copies >= 0 AND copies <= 1000),
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, created_by) REFERENCES app_user(school_id, id));
CREATE INDEX book_school_title ON book(school_id, title);
-- Prêt : un exemplaire ; rendu quand returned_on est renseigné. En retard : non rendu et échéance dépassée.
CREATE TABLE loan (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), book_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  loaned_on TEXT NOT NULL CHECK (length(loaned_on) = 10), due_on TEXT NOT NULL CHECK (length(due_on) = 10),
  returned_on TEXT CHECK (returned_on IS NULL OR length(returned_on) = 10),
  loaned_by INTEGER NOT NULL, returned_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (due_on >= loaned_on), CHECK (returned_on IS NULL OR returned_on >= loaned_on),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, book_id) REFERENCES book(school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, loaned_by) REFERENCES app_user(school_id, id));
CREATE INDEX loan_open ON loan(school_id, book_id, returned_on);
CREATE INDEX loan_student ON loan(school_id, student_id);
-- Paiement : jamais supprimé. Une annulation garde le reçu et son numéro, avec motif, auteur et date.
CREATE TABLE payment (
  id {{PK}}, school_id INTEGER NOT NULL REFERENCES school(id), student_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000), currency TEXT NOT NULL DEFAULT 'HTG' CHECK (currency = 'HTG'),
  method TEXT NOT NULL CHECK (method IN ('especes','moncash','natcash','virement')), reference TEXT,
  paid_on TEXT NOT NULL CHECK (length(paid_on) = 10), label TEXT,
  receipt_no INTEGER NOT NULL CHECK (receipt_no > 0), receipt_code TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'manuel', provider_status TEXT NOT NULL DEFAULT 'non_verifie' CHECK (provider_status IN ('non_verifie','confirme','refuse')),
  recorded_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT, cancelled_by INTEGER, cancel_reason TEXT,
  CHECK (method = 'especes' OR reference IS NOT NULL),
  CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL)),
  UNIQUE (school_id, receipt_no), UNIQUE (school_id, id),
  FOREIGN KEY (school_id, student_id) REFERENCES student(school_id, id),
  FOREIGN KEY (school_id, recorded_by) REFERENCES app_user(school_id, id));
-- Une même transaction MonCash, NatCash ou bancaire ne peut pas être saisie deux fois dans une école.
CREATE UNIQUE INDEX payment_reference ON payment(school_id, method, reference) WHERE reference IS NOT NULL;
CREATE INDEX payment_student ON payment(school_id, student_id);
