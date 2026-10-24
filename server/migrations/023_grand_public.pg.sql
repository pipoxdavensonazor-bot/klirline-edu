-- Envoi groupé : les actualités (article, témoignage) s'ajoutent aux types suivis.
ALTER TABLE public_digest DROP CONSTRAINT IF EXISTS public_digest_kind_check;
ALTER TABLE public_digest ADD CONSTRAINT public_digest_kind_check CHECK (kind IN ('annonce','evenement','laureat','article','temoignage'));
-- Hors RLS école : aucun accès pour les rôles applicatifs (connexion système seulement), comme 016.
REVOKE ALL ON public_follow FROM noria_app;
REVOKE ALL ON public_follow FROM noria_ministere;
