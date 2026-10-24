-- Lot école : document officiel joint à la demande d'inscription (autorisation ou licence MENFP, patente…).
-- PDF, JPEG ou PNG, 5 Mo au plus, type vérifié par signature (octets magiques) côté serveur. Contenu en base64 dans la
-- base : il suit donc les sauvegardes (pg_dump chiffré envoyé sur R2, sauvegarde logique) et n'est jamais servi en public.
-- Déposé avant la vérification de l'e-mail : rattaché au ticket du code (ticket_hash), puis à la demande (request_id).
CREATE TABLE school_request_document (
  id {{PK}},
  request_id INTEGER REFERENCES school_request(id),
  ticket_hash TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('autorisation_menfp','licence','patente','autre')),
  filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 120),
  mime TEXT NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (request_id IS NOT NULL OR ticket_hash IS NOT NULL));
CREATE INDEX school_request_document_demande ON school_request_document(request_id);
CREATE INDEX school_request_document_ticket ON school_request_document(ticket_hash);
