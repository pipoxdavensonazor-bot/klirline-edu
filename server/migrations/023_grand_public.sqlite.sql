-- Envoi groupé : les actualités (article, témoignage) s'ajoutent aux types suivis (table recréée : contrainte CHECK).
CREATE TABLE public_digest_n (
  id {{PK}}, kind TEXT NOT NULL CHECK (kind IN ('annonce','evenement','laureat','article','temoignage')), ref_id INTEGER NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE (kind, ref_id));
INSERT INTO public_digest_n (id, kind, ref_id, recipients, failures, created_at) SELECT id, kind, ref_id, recipients, failures, created_at FROM public_digest;
DROP TABLE public_digest;
ALTER TABLE public_digest_n RENAME TO public_digest;
