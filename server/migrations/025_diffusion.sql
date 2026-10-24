-- Diffusion audio des réunions de parents (WHIP → MediaMTX → HLS → R2) : clé secrète par réunion (chemin des segments
-- impossible à deviner, renouvelée à chaque démarrage) et état de la diffusion (active / arretee).
ALTER TABLE parent_meeting ADD COLUMN direct_key TEXT;
ALTER TABLE parent_meeting ADD COLUMN direct_state TEXT;
ALTER TABLE parent_meeting ADD COLUMN direct_started_at TEXT;
