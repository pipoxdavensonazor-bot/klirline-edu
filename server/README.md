# Socle serveur NORIA (étape 2) — démonstration, données fictives

Ce dossier contient le **socle serveur** de NORIA. Il sert aussi la maquette (`index.html`, `src/`) : connexion, rôle imposé, élèves, classes et présences viennent du serveur. Il n'est relié à aucune école réelle (données fictives) et ne vaut ni mise en production ni conformité juridique.

## Contenu

- **Modèle multi-école** (`migrations/`) : école, campus, année scolaire (une seule courante par école), niveaux, classes, matières, utilisateurs (invité / actif / désactivé), rôles, lien parent-enfant (avec motif), affectations enseignant-classe, inscriptions (avec statut et motif), écritures financières, sessions, journal d'audit.
- **Séparation par école dans la base** : chaque table métier porte `school_id`, et les clés étrangères composites `(school_id, id)` refusent qu'une inscription, un lien parent ou une affectation relie deux écoles.
- **Journal d'audit en ajout seul** : auteur, date, école, dossier, action, motif, résultat (`ok` / `refuse`). Des déclencheurs SQL refusent toute modification ou suppression.
- **Connexion** (`src/auth.js`) : mots de passe hachés avec scrypt (module natif de Node), jeton de session opaque (seule son empreinte SHA-256 est stockée), expiration 8 h, déconnexion.
- **Autorisations côté serveur** (`src/policy.js`) : chaque périmètre est une clause SQL ajoutée à la requête, toujours précédée de `school_id = école de la session`.
  - élève : son propre dossier ;
  - parent : seulement les enfants liés (dossier et finances) ;
  - enseignant : élèves inscrits dans ses classes, champs utiles seulement (pas de notes de santé ni de famille) ;
  - bibliothèque : identité minimale de prêt (id, code, nom, prénom) via la classe ;
  - comptabilité : finances de l'école, pas les dossiers ;
  - direction : tout le périmètre de son école, gestion des rôles, corrections sensibles avec motif obligatoire, lecture du journal.
  - Un dossier hors périmètre renvoie **404** (on ne révèle pas son existence) ; une action interdite au rôle renvoie **403**.
- **Exports CSV** : mêmes filtres que la lecture ; chaque export et chaque refus sont journalisés.

## API

| Méthode | Chemin | Rôles |
|---|---|---|
| POST | `/api/login` `{school, email, password}` | public |
| POST | `/api/logout` | connecté |
| GET | `/api/me` | connecté |
| GET | `/api/students`, `/api/students/:id` | direction, secrétariat, enseignant, parent, élève (selon périmètre) |
| PATCH | `/api/students/:id` `{…champs, reason}` | direction, secrétariat (motif obligatoire, journalisé) |
| GET | `/api/classes/:id/students` | direction, secrétariat, bibliothèque, enseignant de la classe |
| GET | `/api/students/:id/finance` | direction, comptabilité, parent lié |
| GET | `/api/export/students[?classId=]` | direction, secrétariat, enseignant (ses classes) |
| GET | `/api/export/finance` | direction, comptabilité |
| PUT | `/api/users/:id/roles` `{roles, reason}` | direction |
| GET | `/api/audit` | direction |

Authentification : en-tête `Authorization: Bearer <jeton>`.

## Choix techniques

- **Node.js ≥ 20, sans framework** (`node:http`, `node:crypto`, `node:test`) : le dépôt est en JavaScript sans outillage ; on limite les dépendances à une seule.
- **Deux bases, une interface** (`src/store.js`) : **PostgreSQL** (production, `pg`) ou **SQLite** (`better-sqlite3`, développement et tests rapides). Le SQL s'écrit une fois avec des `?` ; la couche les convertit pour PostgreSQL.
- Jetons opaques en base plutôt que JWT : révocables immédiatement à la déconnexion ou à la désactivation d'un compte.

## Lancer et tester

```bash
cd server
npm install
npm test                                  # tous les tests, SQLite en mémoire
NORIA_TEST_PG=postgres://admin:…@127.0.0.1/postgres npm test   # les mêmes contre PostgreSQL (+ tests RLS)
NORIA_DEMO=1 npm start                    # http://127.0.0.1:3100, fichier noria-demo.sqlite, données fictives
NORIA_DEMO=1 DATABASE_URL=postgres://noria_admin:…@127.0.0.1/noria npm start   # même chose sur PostgreSQL
```

`NORIA_TEST_PG` doit désigner un compte autorisé à créer des bases et des rôles : chaque fichier de test crée sa base `noria_t_…` et la supprime à la fin. La CI fait tourner les tests sur SQLite puis sur un service PostgreSQL 16.

Comptes fictifs : écoles `ecole-a` et `ecole-b`, adresses `direction@a.exemple.invalid`, `prof1@…`, `parent1@…`, `eleve1@…`, `compta@…`, `biblio@…`, `secretariat@…`, mot de passe de démonstration `demo-fictif-2026` (voir `src/seed.js`). Ne jamais réutiliser ces comptes hors démonstration.

## Durcissement (`test/securite.test.js`)

- **Limitation des connexions :** 5 échecs en 15 min bloquent le compte et l'adresse IP (réponse 429 + `Retry-After`). Les échecs sont journalisés. Le limiteur est **stocké en base** (table `login_attempt`, clés hachées en SHA-256) : il survit au redémarrage et vaut pour tous les processus qui partagent la base.
- **scrypt asynchrone :** le hachage ne bloque plus le serveur.
- **Hachage factice :** un e-mail inconnu déclenche le même calcul qu'un vrai compte, pour ne pas révéler par le temps de réponse quels comptes existent.
- **En-têtes de sécurité :** CSP `default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`, `no-store`.
- **Comptes de démonstration seulement avec `NORIA_DEMO=1`.** Le serveur refuse de démarrer avec `NORIA_DEMO=1` et `NODE_ENV=production`.
- **CSV :** une cellule commençant par `=`, `+`, `-`, `@` (ou tabulation) est préfixée par `'` pour ne pas s'exécuter dans un tableur.

## Ce que prouvent les tests (`test/isolation.test.js`)

- parent refusé sur un enfant non lié (dossier, finances, modification, export) ;
- enseignant refusé sur une autre classe (liste, dossier, export filtré), sans champs sensibles ;
- école A refusée sur l'école B pour tous les rôles (lecture, modification, finances, classes, rôles, export, journal) ;
- la base elle-même refuse une inscription ou un lien parent entre deux écoles ;
- correction sensible : motif obligatoire, journalisée avec auteur, date, dossier ;
- journal non modifiable ; jeton révoqué après déconnexion ; mots de passe hachés.

## Connexion de la maquette (phase 1, `test/comptes.test.js`)

`npm start` sert aussi la maquette : ouvrir http://127.0.0.1:3100/ (avec `NORIA_DEMO=1` pour les comptes fictifs).

- Page de connexion : école, e-mail **ou** téléphone (numéro local à 8 chiffres complété en +509), mot de passe.
  `method: 'code'` répond 501 : la table `login_code` est prête pour le code à 6 chiffres par SMS.
- Session : cookie `noria_session` HttpOnly, SameSite=Strict (Secure si `NODE_ENV=production` ou `NORIA_SECURE_COOKIE=1`),
  jeton stocké haché. Toute écriture par cookie exige l'en-tête `x-noria: 1` (anti-falsification de requête).
  Le jeton Bearer reste accepté pour les scripts et les tests.
- Rôle imposé par le serveur : le sélecteur de rôle n'existe que sans serveur (maquette statique). Élèves et classes
  viennent de `/api/students` et `/api/classes`, gardés en mémoire, jamais écrits dans localStorage.
- `GET /api/config` (public) : `{demo, session, methods, prochainement, ecoles}` ; la liste des écoles seulement en démo.
- Invitations `POST /api/invitations` (direction : tous rôles ; secrétariat : parent et élève), jeton à usage unique
  valable 72 h, haché en base ; `POST /api/invitations/accept` crée le compte, le rôle et le lien parent/élève.
- Récupération `POST /api/recovery/request` (même réponse si le compte n'existe pas, limitée en débit), jeton 60 min ;
  `POST /api/recovery/reset` change le mot de passe et révoque toutes les sessions du compte.
- Envoi : aucun SMS ni e-mail réel ; les messages vont dans la table `outbox` (boîte d'envoi simulée).
- Fichiers statiques : seulement `/`, `/index.html`, `/src/*` (liste blanche d'extensions), gzip, ETag/304, CSP.
- Premier chargement mesuré (cache vide, Chrome) : environ 118 Ko transférés en 19 requêtes.
- Vérification navigateur : `node scripts/verif-connexion.js http://127.0.0.1:3100` (iPhone SE, Pixel 7, iPad Mini, ordinateur).
- Limite connue : les modules additionnels (`addons.js`) restent des démonstrations locales ; ils lisent le rôle et
  les élèves du serveur mais leurs propres saisies restent sur l'appareil.

## PostgreSQL, migrations et cloisonnement (RLS)

- **Migrations** : `migrations/NNN_nom.sql` (commun) + `NNN_nom.sqlite.sql` / `NNN_nom.pg.sql` (propre au dialecte), appliquées dans l'ordre au démarrage et notées dans `schema_migrations`, dans une transaction protégée par un verrou consultatif (deux processus ne migrent pas en même temps). `{{PK}}` devient la clé primaire adaptée.
- **RLS** (`004_rls.pg.sql`) : toutes les tables ont une politique `school_id = noria_school()`, où `noria_school()` lit le réglage de transaction `app.school_id`. Chaque requête d'un utilisateur connecté s'exécute dans une transaction `SET LOCAL ROLE noria_app` + `set_config('app.school_id', …, true)` (`db.asSchool`). Même une requête sans filtre (`SELECT * FROM student`) ne voit que l'école de la session ; une écriture au nom d'une autre école est refusée ; sans réglage, rien n'est visible (`test/rls.test.js`).
- Le compte propriétaire (celui de `DATABASE_URL`) n'est pas soumis aux politiques : il ne sert qu'aux migrations et à l'authentification (recherche du compte, session, jetons, limiteur), avant que l'école soit connue. Le rôle `noria_app` n'a accès ni au limiteur ni aux migrations.
- Toute **nouvelle table** doit recevoir sa politique RLS dans sa migration (les droits, eux, sont accordés automatiquement).
- En SQLite, pas de RLS : le cloisonnement repose sur les clauses de `policy.js` et les clés étrangères composites, toujours appliquées dans les deux cas.

## Présences (`test/presence.test.js`)

| Méthode | Chemin | Rôles |
|---|---|---|
| GET | `/api/attendance?class_id=&day=AAAA-MM-JJ` | direction, secrétariat, enseignant de la classe |
| POST | `/api/attendance/sync` `{ops:[{op_id, class_id, student_id, day, status, base_version, reason?, recorded_at, offline}]}` | idem |
| GET | `/api/students/:id/attendance` | selon le périmètre élève (parent : ses enfants) |
| GET | `/api/students/:id/attendance/history` | direction, secrétariat, enseignant |
| GET | `/api/attendance/conflicts` | direction et secrétariat (tous), enseignant (les siens) |

- Statuts : `present`, `absent`, `retard`, `excuse`. Une ligne par élève et par jour, avec un numéro de **version**.
- **Historique** `attendance_history` en ajout seul : ancien et nouveau statut, version, motif, auteur, source (`en_ligne` / `hors_ligne`), op_id, heure de saisie sur l'appareil.
- **Corrections** : motif obligatoire, sauf si l'auteur corrige sa propre saisie le jour même (fuseau `NORIA_TZ`, Haïti par défaut). Un enseignant saisit ou corrige jusqu'à 7 jours en arrière ; la direction et le secrétariat sans limite.
- **Idempotence** : chaque opération porte un `op_id` (UUID de l'appareil) ; rejouée, elle renvoie le même résultat (`deja: true`) sans rien écrire. Un `op_id` d'un autre compte est refusé.
- **Règle de conflit** : l'appareil envoie la version qu'il a vue (`base_version`, 0 s'il n'a rien vu). Si la fiche a changé sur le serveur depuis, **la valeur du serveur est conservée** ; la saisie de l'appareil est inscrite dans `sync_conflict` (ajout seul) et dans l'audit (`attendance.conflict`), et l'interface l'affiche. Même statut des deux côtés : `identique`, pas de conflit.

## Hors ligne (maquette)

- **Application installable** : `manifest.webmanifest`, icônes, `sw.js`. Le service worker met l'interface en cache (liste lue dans `index.html`, version = empreinte des fichiers : toute modification remplace le cache). Les réponses `/api/` ne sont **jamais** mises en cache par le service worker. Page : réseau d'abord (3,5 s au plus), puis cache.
- **File de saisie** (`src/offline.js`, IndexedDB `noria_offline`) : l'appel est enregistré sur l'appareil puis envoyé dès que le réseau revient (événement `online`, retour sur l'onglet, toutes les 30 s s'il reste des saisies). Les saisies restent attachées au compte qui les a faites.
- **Cache de lecture `noria_cache_v1`** : profil, élèves, classes, feuilles d'appel déjà vues, pour rouvrir l'application sans réseau ; effacé à la déconnexion ou quand la session a expiré.
- **Indicateur** : « Hors ligne · X en attente », « X en attente », « Synchronisé à HH:MM », « N conflit(s) », « Reconnectez-vous pour envoyer X saisies » (session expirée).
- Vérification : `node scripts/verif-hors-ligne.js http://127.0.0.1:3100` (relais TCP qui coupe vraiment le réseau et compte les octets).
- Mesures (Chrome, octets réels sur le réseau, en-têtes compris) : **premier chargement ≈ 145 Ko** (page + mise en cache par le service worker, revalidée par ETag) ; **rechargement avec l'interface en cache ≈ 3,5 Ko** reçus.

## Sauvegarde et restauration (`test/sauvegarde.test.js`)

```bash
DATABASE_URL=postgres://… node scripts/sauvegarde.js sauver noria-2026-10-16.json.gz
DATABASE_URL=postgres://… node scripts/sauvegarde.js restaurer noria-2026-10-16.json.gz   # base cible neuve et vide
```

Sauvegarde logique (JSON compressé, fichier en droits 600) de toutes les tables métier, avec **empreinte SHA-256 vérifiée** à la restauration ; fonctionne entre SQLite et PostgreSQL dans les deux sens. Exclus : sessions (reconnexion obligatoire), tentatives de connexion, boîte d'envoi simulée. La restauration refuse une base non vide ou une base trop ancienne, puis recale les compteurs d'identifiants. Le test restaure dans une base neuve, compare tout le contenu et se reconnecte. En production, ajouter `pg_dump -Fc` quotidien hors de la machine, chiffré, et un essai de restauration régulier.

## Cœur scolaire (phase 3, `test/scolaire.test.js`)

- **Évaluations et notes** : un enseignant crée une évaluation pour ses classes **et** matières attribuées, dans les dates de la période ; il saisit et corrige tant qu'elle est en brouillon, puis la **soumet**. Seule la **direction publie** (depuis « soumise ») et **rouvre** (motif obligatoire) ; elle peut corriger une note publiée avec motif. Historique en ajout seul (`grade_history`), publication journalisée.
- **Familles** : parents et élèves ne voient que les notes **publiées** de leurs enfants (ou d'eux-mêmes) ; tout autre élève → 404.
- **Saisie hors ligne** : `POST /api/grades/sync`, même file IndexedDB que l'appel (kind « grade »), clé d'idempotence `op_id`, version de base ; en conflit, **la valeur du serveur est conservée** et journalisée (`grade_conflict` + audit).
- **Barème** : chaque évaluation a son barème maximal (`max_score`) choisi à la création — 100 par défaut, 200 et 300 proposés, ou une valeur personnalisée positive (≤ 1000, 2 décimales). Il se change par `PATCH /api/evaluations/:id` tant que l'évaluation est en brouillon, jamais en dessous d'une note déjà saisie (409). Le serveur impose 0 ≤ note ≤ max ; une note saisie hors ligne porte le barème vu à la saisie et est refusée s'il a changé depuis.
- **Moyennes** : notes publiées seulement, ramenées sur le barème de référence de l'école (`school.grade_scale`, 100 par défaut — migration 006 ; `NORIA_GRADE_SCALE` n'est plus lu ; les bulletins déjà émis gardent leur barème /10 dans `report_card.scale` et leur instantané), pondérées par le coefficient de l'évaluation puis de la matière ; absent / dispensé non comptés ; une matière sans note ne pèse pas.
- **Bulletins** : émis par la direction ou le secrétariat (instantané figé) ; PDF imprimable d'environ 3 Ko (Helvetica, sans image) avec **QR** vers `NORIA_PUBLIC_URL/#verifier=CODE` (code de 60 bits, alphabet sans 0/O/1/I). Un nouveau bulletin pour la même période **annule** le précédent (PDF → 410).
- **Vérification publique** `GET /api/verifier/:code` : confirme seulement l'école, l'élève (prénom + initiale), la période, la date et le statut (valide / annulé) ; jamais de note ni de moyenne. Échecs limités (429).
- **Annonces et calendrier** : audiences `ecole`, `classe`, `parents`, `enseignants`. Direction/secrétariat : toute audience ; enseignant : ses classes seulement. Chacun ne lit que ce qui le concerne (filtrage SQL + RLS par école).
- **Comptes** : `GET /api/invitations`, `POST /api/invitations/:id/annuler` ; la création renvoie un **lien copiable** (`/#invitation=…`), l'envoi SMS / e-mail reste **simulé**. Secrétariat limité aux comptes parent et élève.
- Vérification dans le navigateur : `node scripts/verif-coeur.js http://127.0.0.1:3100` (puppeteer-core, jsqr, pngjs, pdftoppm).

## Reste à faire avant toute donnée réelle

Code à 6 chiffres par SMS et envoi réel (SMS, e-mail), finances, bibliothèque et rapports côté serveur (encore locaux), validation par Philippe des règles de notes (barème /10, publication par la direction seule, annulation du bulletin précédent), chiffrement et rotation des sauvegardes hors site, procédure d'incident, HTTPS et déploiement, retrait de `'unsafe-inline'` (migration des `onclick`).
