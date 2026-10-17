# Bloc 5 — Portail public (grand public, sans connexion)

Données 100 % fictives dans les tests et les démonstrations. Données et routes `server/src/portail.js`, pages
`server/src/portail-pages.js`, migration `013_portail`, feuille et script du portail `src/portail.css`, `src/portail.js`,
écrans `src/portail-ecole.js` (direction) et `src/admin-portail.js` (super-admin), chargés à la demande, tests
`server/test/portail.test.js`, vérification navigateur `scripts/verif-portail.js`.

## 1. Adresses : portail sur `/`, application sur `/app`

| Adresse | Contenu |
|---|---|
| `/` et `/ht` | Accueil (français, kreyòl) |
| `/evenements`, `/evenements/<id>` | Événements à venir (`?passes=1` : passés ; `?categorie=`), détail |
| `/laureats` | Lauréats par année, examen ou concours, département (`?annee=&type=&departement=`) |
| `/communaute`, `/communaute/<id>` | Articles et témoignages des écoles, détail |
| `/annonces` | Annonces officielles et encarts « Sponsorisé » |
| `/ht/…` | Mêmes pages en kreyòl (sélecteur FR / HT sur chaque page, même adresse) |
| `/sitemap.xml`, `/robots.txt` | Plan du site (FR + HT, `hreflang`) ; `Disallow: /app`, `/api/`, `/p/clic/` |
| `/p/img/<id>` (`-v` : vignette) | Images publiques (contenu publié, annonce en cours, logo d'école partenaire) |
| `/p/clic/<id>` | Clic sur une annonce : compteur du jour, puis redirection 302 vers son lien https |
| `/app` (et `/index.html`) | Application des écoles (inchangée) ; `/app/` → 301 `/app` |
| `/public`, `/public/…` | 301 vers `/…` (adresse prévue dans la demande, gardée comme alias) |

**Pourquoi ce choix.** Le portail est la page d'entrée du grand public (référencement de la racine du domaine) ;
l'application garde exactement ses fichiers et son fonctionnement, servie sur `/app` (sans barre finale, pour que les
chemins relatifs `src/…` restent `/src/…`). Rien ne casse :

- **Liens existants** (`/#verifier=…` des badges, QR codes et relevés déjà imprimés, `/#invitation=…`,
  `/#recuperation=…` des messages déjà envoyés, `/#admin`) : la page `/` charge d'abord `src/portail.js` (quelques
  lignes, synchrone) qui renvoie toute adresse avec un fragment vers `/app#…`. Les liens générés par le serveur gardent
  donc leur format (tests inchangés) et fonctionnent comme avant.
- **Application installée** (ancien manifeste, `start_url: "/"`) : ouverte en mode « standalone » sur `/`, elle est
  renvoyée vers `/app` par le même script. Le nouveau manifeste garde `"id": "/"` (même identité d'application : pas
  de réinstallation) avec `"start_url": "/app"`.
- **Service worker** (portée `/` inchangée) : il met `/app` en cache au lieu de `/` ; navigation vers `/app` : réseau
  d'abord (3,5 s) puis cache ; pages du portail : réseau seul, et hors ligne `/` affiche l'application en cache. Une
  nouvelle version du service worker remplace l'ancien cache à l'installation (version = empreinte des fichiers).
- **Une seule origine** : aucun cookie n'est posé par le portail ; la session des écoles (`Path=/`, `SameSite=Strict`)
  n'est jamais lue par les pages publiques, qui sont les mêmes pour tout le monde (cache public possible).

## 2. Légèreté (mobile d'abord)

HTML rendu par le serveur (aucun cadriciel), une feuille de style (`src/portail.css`, ~4 Ko compressée) et un script de
quelques centaines d'octets, versionnés par empreinte (`?v=`), polices du système, aucune ressource externe.
L'accueil n'affiche aucune grande image (vignettes de logos ≤ 16 Ko, chargées à la demande) ; les listes utilisent les
vignettes (`loading="lazy"`), le détail l'image complète (≤ 80 Ko). Cache : pages `public, max-age=60,
stale-while-revalidate=600` + ETag/304 + gzip, cache mémoire côté serveur (60 s, invalidé à chaque publication) ;
images `max-age=86400` (une image n'est jamais modifiée : une nouvelle image a un nouvel identifiant).

**Poids mesurés** (Chrome headless, cache vide, octets transférés) : voir le rapport du bloc 5 et
`scripts/verif-portail.js` (accueil ≈ 8 Ko en 5 requêtes contre ≈ 150 Ko en 23 requêtes pour l'application).

**SEO** : `title`, `description`, `canonical`, `hreflang` fr / ht / x-default, Open Graph (`og:title`, `og:description`,
`og:image` absolue, `og:locale`), Twitter card, `sitemap.xml`, `robots.txt`. Adresse absolue : `NORIA_PUBLIC_URL`
(sinon l'en-tête `Host` validé). Pas de JSON-LD (il exigerait un script en ligne, interdit par la CSP).

**CSP du portail** (plus stricte que celle de l'application) : `default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.

## 3. Contenus et règles

- **Événements** : titre FR / HT, date (et fin), lieu, département, catégorie (`examens` = examens officiels,
  `concours`, `culture`, `sport`, `science`, `autre`), description, image légère.
- **Lauréats** : nom, école, année, examen ou concours, mention, département, photo facultative. **Mineur** : la
  réponse « mineur oui / non » est obligatoire ; nom complet et photo publiés **seulement** si le consentement de
  l'école **et** celui du parent (nom du parent, date, auteur de la saisie) sont enregistrés. Sinon : **initiales
  seules** (« A. F. »), sans photo (la photo n'est même pas servie par `/p/img`). Le nom du parent n'est jamais public.
- **Communauté** : articles et témoignages proposés par les écoles, publiés après modération.
- **Annonces** : annonce officielle ou encart **« Sponsorisé »** (« Sponsorize » en kreyòl) avec le nom de l'annonceur,
  dates de début et de fin (jour civil d'Haïti, `NORIA_TZ`), lien https facultatif (`rel="sponsored nofollow noopener"`),
  activation / désactivation. **Clics** : un compteur par annonce et par jour (`portal_ad_click`) ; un même visiteur
  n'est compté qu'une fois par jour grâce à une empreinte HMAC à sel quotidien aléatoire gardée **en mémoire** (jamais
  écrite) ; aucune adresse IP, aucun cookie, aucun traceur tiers.
- **Écoles partenaires** : la direction accepte d'apparaître (nom et vignette du logo, 256 px / 16 Ko) et peut arrêter
  à tout moment. Une école suspendue disparaît du portail (contenus, logo).

## 4. Proposition et modération

- **Direction** (menu « Portail public ») : propose un événement, un article, un témoignage ou un lauréat de **son**
  école (case de consentement pour un mineur) ; suit ses propositions (statut, motif de refus) ; peut retirer une
  proposition encore en attente. Limite : 30 propositions par heure et par école (429).
- **Super-admin** (onglet « Portail public ») : file de modération (aperçu des images), **publier**, **refuser**
  (motif obligatoire), **dépublier** (motif obligatoire), mettre à la une, corriger (motif obligatoire), créer
  directement un contenu (publié, ou brouillon en attente), gérer les annonces (clics totaux et sur 30 jours) et voir
  les partenaires.
- **Rien n'est public avant validation** : seules les lignes `status = 'publie'` d'écoles actives sont lues.
- **Cloisonnement** (PostgreSQL, RLS) : une école ne voit que ses propositions et ses images ; elle ne peut insérer
  qu'une proposition `en_attente` (ni à la une, ni publiée) et ne peut que la retirer ; annonces et clics lui sont
  refusés ; pas de suppression (garde-fou en base : contenus jamais supprimés, images jamais modifiées).
- **Journal** : `portail.proposer`, `portail.retirer`, `portail.partenaire` (journal de l'école, refus compris) ;
  `admin.portail.*` (journal de la plateforme) pour chaque publication, refus, dépublication, mise à la une,
  correction, annonce.
- **Assistant sécurité** : règle `propositions_masse` (≥ 10 propositions en 1 h ou ≥ 30 en 24 h pour une école ;
  critique à 3 fois un seuil), avec actions proposées sur le compte en cause.

## 5. Texte et images

- **Texte brut seulement** : à l'entrée, blocs `script`/`style`/`iframe`/`svg`…, commentaires, balises et chevrons
  sont retirés, ainsi que les caractères de contrôle et d'inversion bidirectionnelle ; longueurs bornées (titre 140,
  texte 4 000). À l'affichage, tout est échappé. Liens d'annonces : `https://` seulement, sans identifiants.
- **Images** : redimensionnées et compressées **dans le navigateur** (WebP si disponible, sinon JPEG ; 1 200 px et
  80 Ko au plus, vignette 360 px et 16 Ko). Le serveur vérifie la signature (JPEG ou WebP seulement, WebP animé
  refusé), les dimensions et le poids, et **retire les métadonnées** (EXIF, XMP, ICC, commentaires : position GPS
  d'une photo de téléphone, par exemple).

## 6. Décisions prises par défaut

- Portail sur `/`, application sur `/app` (voir § 1) ; `/public` gardé comme alias.
- Mineur sans double consentement : initiales de chaque mot du nom et aucune photo (plus protecteur que le prénom seul).
- Un contenu refusé ou dépublié reste en base (journal) ; seule une proposition « en attente » peut être retirée par
  l'école ; le super-admin peut republier un contenu dépublié ou refusé.
- Accueil : lauréats « à la une » seulement (choix du super-admin), trois événements (à venir d'abord, puis les plus
  récents), trois annonces, trois contenus de la communauté, toutes les écoles partenaires.
- Démonstration (`NORIA_DEMO=1`) : contenus fictifs publiés (`seedPortal`), dont un encart expiré qui ne doit pas
  apparaître et un lauréat mineur sans double consentement (initiales).
