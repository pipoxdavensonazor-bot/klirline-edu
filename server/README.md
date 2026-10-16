# Socle serveur NORIA (étape 2) — démonstration, données fictives

Ce dossier contient un **premier socle serveur**. Il n'est relié à aucune école et la maquette (`index.html`, `src/`) ne l'utilise pas encore : elle reste une démonstration locale, sans synchronisation. Ce socle ne vaut pas mise en production ni conformité juridique.

## Contenu

- **Modèle multi-école** (`src/db.js`) : école, campus, année scolaire (une seule courante par école), niveaux, classes, matières, utilisateurs (invité / actif / désactivé), rôles, lien parent-enfant (avec motif), affectations enseignant-classe, inscriptions (avec statut et motif), écritures financières, sessions, journal d'audit.
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
- **SQLite via `better-sqlite3`** : un fichier, rien à installer, tests en mémoire rapides. Le schéma reste du SQL standard (clés composites, `CHECK`, index partiel) transposable à **PostgreSQL**, où l'on ajoutera la sécurité au niveau des lignes (RLS) par `school_id` avant toute donnée réelle.
- Jetons opaques en base plutôt que JWT : révocables immédiatement à la déconnexion ou à la désactivation d'un compte.

## Lancer et tester

```bash
cd server
npm install
npm test          # tests d'isolation (node --test)
NORIA_DEMO=1 npm start   # API sur http://127.0.0.1:3100, base noria-demo.sqlite, données fictives
npm start                # même chose, mais sans créer de comptes de démonstration
```

Comptes fictifs : écoles `ecole-a` et `ecole-b`, adresses `direction@a.exemple.invalid`, `prof1@…`, `parent1@…`, `eleve1@…`, `compta@…`, `biblio@…`, `secretariat@…`, mot de passe de démonstration `demo-fictif-2026` (voir `src/seed.js`). Ne jamais réutiliser ces comptes hors démonstration.

## Durcissement (`test/securite.test.js`)

- **Limitation des connexions :** 5 échecs en 15 min bloquent le compte et l'adresse IP (réponse 429 + `Retry-After`). Les échecs sont journalisés. Le limiteur est en mémoire (un seul processus) : à déplacer en base ou dans Redis en production.
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

## Reste à faire avant toute donnée réelle

Invitation et récupération de compte, limiteur partagé entre plusieurs processus, passage PostgreSQL + RLS, sauvegarde et **restauration essayée**, procédure d'incident, HTTPS/déploiement, présence/notes/annonces (étape 3), branchement de la maquette avec le cache `noria_cache_v1`.
