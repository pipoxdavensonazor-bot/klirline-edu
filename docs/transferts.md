# Bloc 4 — Lien entre écoles (vérification, signalements, transferts)

Données 100 % fictives dans les tests et les démonstrations. Module serveur `server/src/transferts.js`, certificat
`server/src/pdf-transfert.js`, migration `012_transferts`, interface `src/transferts.js` (chargée à la demande),
tests `server/test/transferts.test.js`, vérification navigateur `scripts/verif-transferts.js`.

## 1. Vérifier un élève qui s'inscrit

`POST /api/transferts/recherche` `{ code, birth_date }` — direction et secrétariat seulement.

- **Date de naissance obligatoire** (400 sinon). Un code inconnu et une mauvaise date donnent la même réponse
  `{ existe: false }` : la base ne s'énumère pas.
- **Résultat minimal**, jamais de note ni de moyenne : prénom + initiale du nom, école actuelle (ou dernière),
  statut (`inscrit`, `sorti`, `transfere`), dernière classe et année, décision de fin d'année (`admis`, `redouble`,
  `echec`), signalements actifs posés par d'autres écoles (catégorie, date, école ; **texte court pour les directions
  seulement**), école précédente, transfert en cours.
- **Limite de débit dédiée** : 15 vérifications par compte et 40 par école sur 15 minutes (429 + `Retry-After`).
- **Journal** : `transfert.recherche` dans l'école qui cherche (code saisi, trouvé ou non) et
  `transfert.consultation` dans l'école d'origine (« par l'école X, compte n° N »).
- **Assistant sécurité** : règle `recherches_eleves` (voir `docs/securite-assistant.md`).

## 2. Signalements et décisions de fin d'année

- `POST /api/signalements` `{ code, categorie, date, texte }` (direction) ; catégories `disciplinaire`, `dette`,
  `document_manquant`, `autre` ; texte ≤ 200 caractères ; date passée ou du jour.
  `POST /api/signalements/:id/lever` `{ motif, date }`. Liste `GET /api/signalements` (texte masqué au secrétariat).
- `PUT /api/students/:id/decision` `{ school_year_id, decision }` (direction) ; `GET /api/decisions?class_id=`.
- Poser, lever, décider : tout au journal. Les signalements ne sont **pas** copiés lors d'un transfert.

## 3. Transfert de dossier

| Statut | Signification | Acteur suivant |
|---|---|---|
| `demande` | créée par l'école d'accueil, en attente du code du parent | accueil (code) ; accueil ou système (annulation) |
| `consentement` | consentement recueilli (case + nom, ou code) | origine (approuver ou refuser) ; accueil (annuler) |
| `approuve_origine` | signée par la direction d'origine | système (copie) ; ministère si l'étape est active |
| `approuve_ministere` | autorisée par le ministère (étape facultative) | système (copie) |
| `transfere` | dossier copié, certificat émis | — (clos, lecture seule) |
| `refuse` | refus motivé (origine ou ministère) | — |
| `annule` | annulation motivée par l'accueil, ou délai expiré | — |

La machine à états (`MACHINE`, `canTransition`) est testée transition par transition, y compris les transitions
interdites. Chaque transition : mise à jour conditionnelle (`WHERE status = ?`), ligne `transfer_event` (ajout seul),
journal des deux écoles, notification du portail (direction et secrétariat de l'accueil ; direction de l'origine dès
le consentement). Le parent rattaché est prévenu par SMS ou e-mail du transfert et du refus.

- **Consentement** : case cochée + nom du parent, ou code à 6 chiffres envoyé au premier parent rattaché à l'élève
  dans l'école d'origine (15 min, 5 essais, 3 envois au plus, destinataire masqué).
- **Approbation** (direction d'origine) : exige l'image de signature du directeur (Relevés de notes). La demande est
  signée en Ed25519 avec la clé de l'école (`NORIA-TRANSFERT|v1|id|code|écoles|élève|consentement|dates`).
  La signature est revérifiée avant l'autorisation du ministère et avant la copie : une donnée signée altérée bloque
  le transfert (409, `transfert.signature_invalide` au journal).
- **Copie** vers l'accueil : identité (sans notes de santé ni de famille), historique des classes, décisions de fin
  d'année, notes **publiées**, relevés **émis** (PDF, empreinte, signature et clé d'origine, revérifiés à chaque
  lecture), et le dossier déjà reçu d'une école précédente. **Badges exclus** (révoqués à l'origine). Le code élève
  passe à l'école d'accueil ; un élève qui revient retrouve sa fiche.
- **Origine** : l'élève est marqué « transféré », l'inscription close ; la fiche reste lisible mais en lecture seule
  (contrôle applicatif + déclencheur en base).
- **Certificat de transfert** (PDF) : en-têtes des deux écoles, élève, étapes, contenu transmis, signatures des deux
  directions, clé Ed25519, QR vers la page publique `/#verifier=T…` (authentique / modifié, contrôle du fichier).
- **Délais** (jours, `NORIA_TRANSFERT_DELAIS`) : `demande` 3, `consentement` 14, `approuve_origine` 30. Au-delà, la
  demande passe en `annule` (« délai expiré »), vérifié à chaque consultation.
- **Ministère** : `NORIA_TRANSFERT_MINISTERE=0` par défaut. À `1`, l'approbation de l'origine ne copie rien ;
  l'autorisation se donne depuis la session super-admin (`GET /api/admin/transferts`,
  `POST /api/admin/transferts/:id/ministere` `{ decision: approuver|refuser, motif }`, journal de la plateforme), en
  attendant un vrai rôle ministère. Le choix est figé dans chaque transfert au moment de l'approbation.

## 4. Cloisonnement

- `transfer` et `transfer_event` : aucun droit pour le rôle applicatif `noria_app` (PostgreSQL) ; seules les routes
  de ce module y accèdent, par la connexion système, et ne renvoient que le minimum.
- `year_decision`, `student_flag`, `student_history` : politique RLS par école ; pas de suppression ; `student_history`
  en ajout seul et non modifiable par l'application.
- Déclencheurs : transfert clos immuable, signature figée, pas de suppression, archive d'un élève transféré figée.
- Tests d'isolation explicites (PostgreSQL) dans `server/test/transferts.test.js`.
