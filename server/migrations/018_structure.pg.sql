-- Matière d'un niveau : le niveau appartient à la même école (clé composite, comme les autres liens du socle).
-- Les tables concernées ont déjà leur politique RLS (004_rls.pg.sql) ; le rôle du ministère garde ses colonnes (014).
ALTER TABLE subject ADD CONSTRAINT subject_level_fk FOREIGN KEY (school_id, level_id) REFERENCES level(school_id, id);
