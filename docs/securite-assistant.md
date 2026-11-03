# Assistant sécurité / Asistan sekirite (bloc 3)

L'assistant sécurité vit dans le compte super-admin (`/#admin` → onglet **Assistant sécurité**). Il aide à repérer
les failles, les intrusions et les problèmes de serveur.

**Règle absolue : l'assistant détecte, explique et propose ; il n'agit jamais seul.** Aucune action n'est exécutée
sans une confirmation explicite du super-admin dans l'interface. Les actions critiques exigent en plus un **nouveau
code à 6 chiffres** (SMS ou e-mail). Chaque action est inscrite au journal en ajout seul (`security_action` et
`platform_audit`), avec l'auteur, l'adresse IP, le motif et l'usage d'un code. Les seules choses que l'assistant fait
de lui-même sont : observer, créer ou mettre à jour des alertes, et envoyer des notifications.

## Fonctionnement

- **Observation** (`server/src/securite.js`, appelée par `app.js`) : connexions réussies et échouées (mot de passe et
  code), réponses 4xx/5xx de l'API, refus de la base (RLS), exports, téléchargements de PDF, consultations de fiches
  d'élèves. Table `security_event`, conservée 35 jours. Jamais de mot de passe, de code ni de contenu de requête.
- **Analyse** : un job interne (`setInterval`, toutes les 5 min par défaut, `NORIA_ASSISTANT_INTERVALLE_MIN`) et un
  bouton « Analyser maintenant ». Aucune dépendance ajoutée.
- **Alertes** (`security_alert`) : gravité (info, attention, critique), titre et explication en langage simple en
  français et en kreyòl, preuves (extraits du journal, IP masquée partiellement : `203.0.113.x` ; comptes masqués :
  `di***@a.***`), recommandation, actions proposées. Une alerte ouverte est mise à jour (compteur « vue N fois ») au
  lieu d'être dupliquée. Une alerte marquée **faux positif** n'est pas recréée pendant 7 jours ; une alerte
  **traitée** ne revient pas pendant 1 h.
- **Score de santé** : 100, moins 25 par alerte critique, 8 par alerte « attention » et 2 par alerte « info »,
  pour les alertes ouvertes vues dans les dernières 24 h.

## Règles et seuils par défaut

Tous les seuils peuvent être modifiés avec `NORIA_ASSISTANT_SEUILS` (JSON, clés entre parenthèses).

| Règle | Ce qui la déclenche | Gravité |
|---|---|---|
| **Force brute par IP** (`force_brute_ip`) | ≥ 10 échecs de connexion ou de code depuis une IP en 15 min (`bruteIpAttention`, `bruteFenetreMin`) | attention ; critique à ≥ 30 (`bruteIpCritique`) |
| **Force brute par compte** (`force_brute_compte`) | ≥ 8 échecs sur un même identifiant en 15 min (`bruteCompteAttention`) | attention ; critique à ≥ 20 (`bruteCompteCritique`) |
| **Pulvérisation** (`pulverisation`) | une IP échoue sur ≥ 5 comptes différents en 15 min (`pulverisationComptes`) | critique |
| **Nouvelle IP ou nouvel appareil** (`nouvel_appareil`) | connexion réussie d'un compte de direction ou du super-admin depuis une IP ou un navigateur jamais vu en 30 jours (`nouvelAppareilJours`), s'il existe un historique | info (direction), attention (super-admin) |
| **Accès entre écoles** (`inter_ecoles`) | ≥ 10 refus 403/404 pour un compte en 15 min (`interEcolesRefus`), ou ≥ 3 fiches d'élèves d'autres écoles (`interEcolesAutres`), ou un refus RLS | attention ; critique si ≥ 3 fiches d'autres écoles ou ≥ 3 refus RLS |
| **Pic de 4xx** (`pic_4xx`) | ≥ 100 réponses 4xx en 10 min (`pic4xx`, `picFenetreMin`) et ≥ 3 fois la moyenne de l'heure précédente (`pic4xxFacteur`) | attention |
| **Pic de 5xx** (`pic_5xx`) | ≥ 5 erreurs serveur en 10 min (`pic5xxAttention`) | attention ; critique à ≥ 20 (`pic5xxCritique`) |
| **Volume anormal** (`volume_anormal`) | par compte et par heure : ≥ 20 exports (`exportsHeure`), ≥ 100 PDF (`pdfHeure`), ≥ 200 fiches consultées (`fichesHeure`) | attention ; critique à 3 fois le seuil |
| **Vérifications d'élèves** (`recherches_eleves`) | par école et par heure (bloc 4, `POST /api/transferts/recherche`) : ≥ 30 vérifications (`recherchesEcoleHeure`) ou ≥ 10 sans résultat (`recherchesEchecsHeure`) | attention ; critique à 3 fois un seuil |
| **Propositions en masse pour le portail** (`propositions_masse`) | par école (bloc 5, `POST /api/portail/propositions`) : ≥ 10 propositions en 1 h (`propositionsHeure`) ou ≥ 30 en 24 h (`propositionsJour`) ; la route est aussi limitée à 30 par heure et par école | attention ; critique à 3 fois un seuil |
| **Consultations du ministère** (`ministere_consultations`) | par compte du ministère (bloc 6, prototype) : ≥ 150 consultations en 1 h (`ministereConsultationsHeure`), ≥ 25 consultations nominatives en 1 h (`ministereNominatifHeure`) ou ≥ 40 écoles différentes ouvertes en 1 h (`ministereEcolesHeure`), ou une heure ≥ 4 fois la moyenne horaire des 7 derniers jours (`ministereFacteur`, au-delà de `ministereMinimum`) | attention ; critique à 3 fois un seuil |
| **Modifications sensibles** (`modifs_sensibles`) | notes rouvertes (`evaluation.rouvrir`), notes corrigées (`grade.correct`), reçus annulés (`payment.cancel`), rôles changés (`user.roles`) sur 24 h par personne : ≥ 10 (`sensiblesJour`), ou hors des heures habituelles 6 h – 20 h, heure d'Haïti (`heureMatin`, `heureSoir`) | info pour 1 ou 2 hors heures ; attention pour ≥ 3 hors heures (`horsHeuresAttention`) ou ≥ 10 ; critique à ≥ 30 |
| **Santé : healthz** (`sante`) | la base ne répond pas à `SELECT 1` | critique |
| **Santé : latence** | latence de la base ou médiane des 500 dernières requêtes ≥ 500 ms (`latenceAttentionMs`) | attention ; critique à ≥ 2000 ms (`latenceCritiqueMs`) |
| **Santé : disque** | espace libre < 15 % (`disqueAttentionPct`), mesuré par `fs.statfs` s'il est disponible | attention ; critique < 5 % (`disqueCritiquePct`) |
| **Santé : mémoire** | mémoire libre du système (`os.freemem`) < 10 % (`memoireAttentionPct`) | attention ; critique < 3 % (`memoireCritiquePct`) |
| **Santé : taille de la base** | > 2048 Mo (`baseMaxMo`) | attention |
| **Santé : sauvegarde** | dernière sauvegarde de `BACKUP_DIR` vieille de plus de 26 h (`sauvegardeMaxHeures`), ou dossier vide | critique ; dossier non configuré en production : attention |
| **Santé : certificat HTTPS** | expiration dans moins de 21 jours (`certAttentionJours`), lue dans `NORIA_TLS_CERT_FILE` ou par une connexion TLS à `NORIA_PUBLIC_URL` | attention ; critique < 7 jours (`certCritiqueJours`) |
| **Configuration** (`configuration`, production seulement) | `NORIA_CLE_MAITRE` ou `NORIA_OTP_SECRET` absente, cookies sans `Secure` | critique |
| | clé de sauvegarde absente (`NORIA_BACKUP_AGE_RECIPIENT`), SMS ou e-mail en mode console | attention |
| | SMS console **accepté** (`NORIA_SMS_CONSOLE_ACCEPTE=1`) | pas d'alerte : le constat n'est pas proposé, donc une alerte déjà traitée ne se rouvre pas |
| **Dépendances** (`dependances`) | rapport `npm audit --json` (`NORIA_AUDIT_RAPPORT`, défaut `server/data/npm-audit.json`) : failles critiques ou élevées | critique (critiques), attention (élevées), info (modérées) ; rapport de plus de 7 jours (`rapportAuditMaxJours`) : info |

Le serveur ne lance jamais `npm`. Le rapport est produit par `npm run audit:rapport` sur un poste ou par cron, ou
récupéré dans l'artefact `npm-audit` de la CI, puis déposé dans `deploy/rapports/npm-audit.json` (monté en lecture
seule dans le conteneur).

## Actions proposées

Toutes les actions se font en deux temps :

1. `POST /api/admin/securite/actions/preparer` : le serveur vérifie la cible et renvoie un résumé. **Rien n'est
   modifié.** Pour une action critique, un code à 6 chiffres part au super-admin (10 min, 5 essais).
2. `POST /api/admin/securite/actions/confirmer` avec `{ token, confirmer: true, code? }` : exécution, puis
   inscription au journal. Le jeton est à usage unique et lié au super-admin qui l'a demandé.

L'interface désigne une action proposée par son rang dans l'alerte : l'IP complète et l'identifiant réel restent
côté serveur.

| Action | Effet | Code exigé | Annulable |
|---|---|---|---|
| Bloquer une IP (`ip.bloquer`) | toutes les routes `/api` répondent 403 à cette adresse, de 5 min à 7 jours (60 min par défaut). Bloquer sa propre adresse est refusé. | non | oui (levée du blocage) |
| Verrouiller un compte (`compte.verrouiller`) | la personne (toutes ses écoles) ne peut plus se connecter ; ses sessions sont fermées | **oui** | oui (déverrouillage) |
| Déverrouiller un compte (`compte.deverrouiller`) | retire le verrou posé par le super-admin | non | oui (nouveau verrou) |
| Déconnecter un compte (`compte.deconnecter`) | ferme toutes les sessions de la personne | non | non (la personne se reconnecte) |
| Déconnecter un compte du ministère (`ministere.deconnecter`) | ferme les sessions du compte du ministère | non | non |
| Désactiver un compte du ministère (`ministere.desactiver`) | le compte ne peut plus demander de code ni se connecter ; sessions fermées | **oui** | oui (réactivation) |
| Déconnecter une école (`ecole.deconnecter`) | ferme toutes les sessions de l'école | **oui** | non |
| Forcer la réinitialisation du mot de passe (`compte.reinitialiser`) | efface le mot de passe et ferme les sessions ; la personne passe par « mot de passe oublié » ou par la connexion par code | **oui** | non |
| Suspendre une école (`ecole.suspendre`) | même effet que la route existante `POST /api/admin/ecoles/:id/suspendre` ; motif obligatoire | **oui** | oui (réactivation) |
| Marquer une alerte comme traitée ou comme faux positif (`alerte.traiter`, `alerte.faux_positif`) | ferme l'alerte | non | oui (réouverture) |
| Annuler une action (`annuler`) | applique l'inverse, enregistré comme une nouvelle ligne du journal qui renvoie à l'action annulée | non | — |

## Questions guidées

Dans le détail d'une alerte : « Pourquoi cette alerte ? », « Que faire ? », « Est-ce grave ? », « Est-ce un faux
positif ? ». Les réponses viennent des règles et du guide intégré (`server/src/securite-guide.js`), en FR et en HT,
sans aucun service externe.

### Adaptateur optionnel `NORIA_ASSISTANT_LLM`

Désactivé par défaut. `NORIA_ASSISTANT_LLM=http` avec `NORIA_ASSISTANT_LLM_URL` (https obligatoire) et
`NORIA_ASSISTANT_LLM_TOKEN` permet de brancher plus tard un modèle externe (`server/src/assistant-llm.js`). Seuls
partent la règle, la gravité, le nombre d'occurrences et le statut. Les preuves, les comptes, les IP, les noms, les
e-mails et les numéros sont retirés, et la question est nettoyée. **Aucune donnée personnelle d'élève n'est envoyée.**

## Notifications

- Une alerte **critique** (nouvelle, ou passée à « critique ») envoie un SMS au super-admin (ou un e-mail s'il n'a
  pas de téléphone), avec les adaptateurs de `server/src/notify.js`.
- **Regroupement** : au plus un message par règle toutes les 30 minutes (`notificationMin`). Les alertes suivantes
  restent visibles dans l'interface, et le message suivant indique combien d'alertes ont été regroupées.
- Le message ne contient aucune donnée personnelle : titre, numéro d'alerte, lien vers l'assistant.
- `NORIA_ASSISTANT_WEBHOOK_URL` (https) : même message en JSON `{ "text": … }`, au format Slack, avec le même
  regroupement.
- `NORIA_ASSISTANT_HEALTHCHECKS_URL` (https) : ping à chaque analyse, `/fail` si une alerte critique est ouverte.

## Accès

Seule une session super-admin (cookie `noria_admin`, mot de passe et code) ouvre les routes
`/api/admin/securite*`. Un compte d'école, même de direction, reçoit 401. Les tables de l'assistant sont refusées
au rôle applicatif PostgreSQL (`REVOKE ALL … FROM noria_app`). `security_action` est en ajout seul (déclencheurs
SQLite et PostgreSQL).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `NORIA_ASSISTANT_INTERVALLE_MIN` | 5 | période de l'analyse automatique ; 0 = manuelle seulement |
| `NORIA_ASSISTANT_SEUILS` | — | JSON de surcharge des seuils (clés du tableau ci-dessus) |
| `NORIA_ASSISTANT_WEBHOOK_URL` | — | webhook Slack ou compatible (alertes critiques) |
| `NORIA_ASSISTANT_HEALTHCHECKS_URL` | — | ping Healthchecks |
| `NORIA_AUDIT_RAPPORT` | `server/data/npm-audit.json` | rapport `npm audit --json` |
| `NORIA_TLS_CERT_FILE` | — | certificat à surveiller (PEM) |
| `NORIA_ASSISTANT_CERT_RESEAU` | activé si `NORIA_PUBLIC_URL` est en https | `0` pour ne pas ouvrir de connexion TLS |
| `NORIA_ASSISTANT_CONFIG_TOUJOURS` | — | `1` : contrôle de configuration même hors production |
| `NORIA_SMS_CONSOLE_ACCEPTE` | — | `1` : l'opérateur accepte les SMS simulés (`NORIA_SMS_PROVIDER=console`, ou absent). L'alerte `configuration:NORIA_SMS_PROVIDER` n'est plus créée ; une alerte déjà marquée traitée ne se rouvre pas. Toute autre valeur (vide, `oui`, `true`) laisse l'alerte active. L'e-mail console n'est pas concerné. |
| `NORIA_ASSISTANT_LLM`, `_URL`, `_TOKEN` | désactivé | adaptateur de modèle externe |
| `BACKUP_DIR` | — | dossier des sauvegardes (monté en lecture seule dans le conteneur) |
| `NORIA_TZ` | `America/Port-au-Prince` | fuseau des heures habituelles |

## Limites connues

- Les adresses IP ne sont fiables que derrière le mandataire de confiance (`NORIA_TRUST_PROXY=1`, Caddy). Une école
  entière derrière une seule IP peut déclencher la règle de force brute (faux positif possible).
- « Nouvel appareil » repose sur l'empreinte du navigateur (User-Agent haché), et non sur un identifiant matériel.
- Le disque mesuré est celui du dossier de la base SQLite, ou du répertoire courant du conteneur. Le disque de
  PostgreSQL se surveille sur l'hôte.
- Le contrôle de la règle « accès entre écoles » sur les fiches d'autres écoles ne porte que sur les chemins
  `/api/students/:id…`.
