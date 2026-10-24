-- Portail grand public : abonnement « actualités » (articles et témoignages des écoles) et écoles suivies par un compte
-- public. Un compte public reste hors de toute école : il ne donne aucun accès aux portails des écoles.
ALTER TABLE public_account ADD COLUMN sub_actualites INTEGER NOT NULL DEFAULT 0 CHECK (sub_actualites IN (0,1));
CREATE TABLE public_follow (
  account_id INTEGER NOT NULL REFERENCES public_account(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, school_id));
CREATE INDEX public_follow_ecole ON public_follow(school_id);
