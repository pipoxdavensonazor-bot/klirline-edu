-- Bloc 5 : portail public (grand public, sans connexion). Événements nationaux, lauréats, communauté (articles et
-- témoignages), annonces et encarts sponsorisés, écoles partenaires. Rien n'est public avant la validation du
-- super-admin : les directions proposent (statut « en_attente »), le super-admin publie, refuse ou dépublie.
-- Commun SQLite / PostgreSQL.

-- École partenaire : elle accepte d'apparaître sur le portail (nom et vignette du logo seulement).
ALTER TABLE school ADD COLUMN portal_partner INTEGER NOT NULL DEFAULT 0 CHECK (portal_partner IN (0,1));
ALTER TABLE school ADD COLUMN portal_partner_at TEXT;
ALTER TABLE school ADD COLUMN portal_logo_id INTEGER;

-- Images téléversées : redimensionnées et compressées par le navigateur, vérifiées par le serveur (WebP ou JPEG,
-- 80 Ko au plus, métadonnées EXIF/XMP retirées), avec une vignette légère pour les listes. Jamais modifiées.
CREATE TABLE portal_image (
  id {{PK}}, school_id INTEGER REFERENCES school(id),
  mime TEXT NOT NULL CHECK (mime IN ('image/webp','image/jpeg')), data TEXT NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 81920),
  thumb_mime TEXT CHECK (thumb_mime IS NULL OR thumb_mime IN ('image/webp','image/jpeg')), thumb TEXT,
  thumb_width INTEGER, thumb_height INTEGER, thumb_bytes INTEGER CHECK (thumb_bytes IS NULL OR thumb_bytes <= 16384),
  sha256 TEXT NOT NULL, created_by INTEGER, created_by_admin INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((school_id IS NULL) = (created_by_admin IS NOT NULL)));
CREATE INDEX portal_image_ecole ON portal_image(school_id);

-- Contenus du portail : un événement, un article, un témoignage ou un lauréat. school_id NULL = contenu créé par le
-- super-admin. Texte brut seulement (nettoyé à l'entrée, échappé à l'affichage).
CREATE TABLE portal_item (
  id {{PK}}, kind TEXT NOT NULL CHECK (kind IN ('evenement','article','temoignage','laureat')),
  school_id INTEGER REFERENCES school(id),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','publie','refuse','retire','depublie')),
  title_fr TEXT CHECK (title_fr IS NULL OR length(title_fr) <= 140), title_ht TEXT CHECK (title_ht IS NULL OR length(title_ht) <= 140),
  body_fr TEXT CHECK (body_fr IS NULL OR length(body_fr) <= 4000), body_ht TEXT CHECK (body_ht IS NULL OR length(body_ht) <= 4000),
  category TEXT CHECK (category IS NULL OR category IN ('examens','concours','culture','sport','science','autre')),
  event_date TEXT CHECK (event_date IS NULL OR length(event_date) = 10), event_end TEXT CHECK (event_end IS NULL OR length(event_end) = 10),
  place TEXT CHECK (place IS NULL OR length(place) <= 120),
  department TEXT CHECK (department IS NULL OR department IN ('artibonite','centre','grand-anse','nippes','nord','nord-est','nord-ouest','ouest','sud','sud-est')),
  author TEXT CHECK (author IS NULL OR length(author) <= 80),
  person_name TEXT CHECK (person_name IS NULL OR length(person_name) <= 80), school_name TEXT CHECK (school_name IS NULL OR length(school_name) <= 120),
  year INTEGER CHECK (year IS NULL OR (year >= 1990 AND year <= 2100)), exam TEXT CHECK (exam IS NULL OR length(exam) <= 80),
  exam_type TEXT CHECK (exam_type IS NULL OR exam_type IN ('examen','concours')), mention TEXT CHECK (mention IS NULL OR length(mention) <= 40),
  -- Lauréat mineur : publié en entier seulement avec le consentement de l'école ET du parent ; sinon initiales seules.
  minor INTEGER NOT NULL DEFAULT 0 CHECK (minor IN (0,1)),
  consent_school INTEGER NOT NULL DEFAULT 0 CHECK (consent_school IN (0,1)), consent_parent INTEGER NOT NULL DEFAULT 0 CHECK (consent_parent IN (0,1)),
  consent_parent_name TEXT CHECK (consent_parent_name IS NULL OR length(consent_parent_name) <= 80), consent_at TEXT, consent_by TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  image_id INTEGER REFERENCES portal_image(id),
  created_by INTEGER, created_by_admin INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_by INTEGER, moderated_at TEXT, moderation_reason TEXT, published_at TEXT,
  CHECK (school_id IS NOT NULL OR created_by_admin IS NOT NULL),
  CHECK (title_fr IS NOT NULL OR title_ht IS NOT NULL OR person_name IS NOT NULL),
  CHECK (consent_parent = 0 OR (consent_parent_name IS NOT NULL AND consent_at IS NOT NULL)),
  CHECK (status <> 'publie' OR published_at IS NOT NULL),
  CHECK (kind <> 'laureat' OR (person_name IS NOT NULL AND year IS NOT NULL AND exam IS NOT NULL)),
  CHECK (kind <> 'evenement' OR (event_date IS NOT NULL AND category IS NOT NULL)));
CREATE INDEX portal_item_public ON portal_item(status, kind, published_at);
CREATE INDEX portal_item_ecole ON portal_item(school_id, status);

-- Annonces (officielles) et encarts sponsorisés : dates de début et de fin (jour civil d'Haïti), lien https facultatif.
CREATE TABLE portal_ad (
  id {{PK}}, sponsored INTEGER NOT NULL DEFAULT 1 CHECK (sponsored IN (0,1)), sponsor TEXT CHECK (sponsor IS NULL OR length(sponsor) <= 80),
  title_fr TEXT CHECK (title_fr IS NULL OR length(title_fr) <= 140), title_ht TEXT CHECK (title_ht IS NULL OR length(title_ht) <= 140),
  text_fr TEXT CHECK (text_fr IS NULL OR length(text_fr) <= 600), text_ht TEXT CHECK (text_ht IS NULL OR length(text_ht) <= 600),
  url TEXT CHECK (url IS NULL OR (url LIKE 'https://%' AND length(url) <= 300)),
  image_id INTEGER REFERENCES portal_image(id),
  starts_on TEXT NOT NULL CHECK (length(starts_on) = 10), ends_on TEXT NOT NULL CHECK (length(ends_on) = 10),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by_admin INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on >= starts_on), CHECK (title_fr IS NOT NULL OR title_ht IS NOT NULL),
  CHECK (sponsored = 0 OR sponsor IS NOT NULL));
CREATE INDEX portal_ad_dates ON portal_ad(active, starts_on, ends_on);

-- Suivi simple des clics : un compteur par encart et par jour. Aucune adresse IP, aucun cookie, aucun traceur tiers.
CREATE TABLE portal_ad_click (
  ad_id INTEGER NOT NULL REFERENCES portal_ad(id), day TEXT NOT NULL CHECK (length(day) = 10), clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day));
