# NORIA — socle, rôles, données et pilote

Ce document fixe l'architecture visée et les règles de données **avant** d'ajouter d'autres modules à la maquette. Il ne décrit pas un serveur déjà construit. La maquette actuelle (`index.html` et `src/`) reste une démonstration : données fictives dans le navigateur, sélecteur de profil sans valeur de sécurité, aucune synchronisation avec une école.

Nom du produit : **NORIA**. Organisation : **Klirline Inc.** Le dépôt et les clés locales gardent encore le préfixe `klirline_` jusqu'au passage au système serveur, décrit plus bas.

Cette note est une exigence de conception. Elle n'affirme pas une conformité juridique.

## 1. Ce que la maquette ne doit pas laisser croire

- Les données fictives ne sont ni synchronisées ni hébergées.
- Le menu de profil ne protège aucun dossier. Les règles de visibilité du navigateur servent à parcourir les écrans.
- Une fiche de ressource naît avec le statut **À vérifier**. La date « fiche créée le » n'est pas une date de contrôle éditorial. « Licence confirmée (démo) » est une marque locale, pas une relecture par un éducateur.
- La salle Jitsi sur `meet.systemli.org` est une démonstration. Elle ne reçoit pas de vrais élèves.
- Les écrans de finances, de messages, de comptes et de rapports aident à recueillir les besoins. Ils ne sont pas des transactions, des envois ni des contrôles réels.

Phrase affichée dans l'interface :

> Démonstration : données fictives enregistrées sur cet appareil. Aucune synchronisation avec une école.

## 2. Socle serveur visé

NORIA doit pouvoir héberger plusieurs écoles dans le même service, avec des dossiers séparés. Chaque lecture, modification, export et téléchargement passe par l'API. La base refuse une ligne dont l'école ou la classe n'appartient pas au compte.

À prévoir avant toute donnée réelle :

- école, campus, années, niveaux, classes et matières ;
- comptes individuels, invitation et récupération de compte ;
- rôles et permissions vérifiés par le serveur ;
- séparation par école et par classe ;
- journal des actions sensibles : auteur, date, dossier, action, motif ;
- sauvegardes, restauration essayée, et une procédure d'incident écrite.

Le changement de rôle dans la maquette n'est ni une connexion ni un contrôle d'accès.

### Principes

- Un compte = une personne. Pas de compte partagé.
- `schoolId` est obligatoire sur chaque enregistrement métier. Les requêtes le filtrent côté serveur, pas seulement dans l'écran.
- Le parent n'atteint un enfant que par un lien explicite.
- L'enseignant n'atteint que les classes qui lui sont affectées, et seulement les champs utiles à son travail.
- Les exports reprennent les mêmes filtres que l'écran. Un export plus large est une action journalisée, réservée à la direction.
- Aucun secret, jeton ou dossier d'élève dans le JavaScript livré au navigateur.
- Les paiements, s'ils existent un jour, ne font pas transiter de numéro de carte par NORIA.

## 3. Matrice des rôles

Légende : **L** lire, **C** créer, **M** modifier, **P** publier, **—** aucun accès. « Périmètre » est imposé par le serveur.

| Action | Direction | Secrétariat | Enseignant | Comptabilité | Bibliothèque | Parent | Élève |
|---|---|---|---|---|---|---|---|
| École, année, droits | C M | L | — | — | — | — | — |
| Inscription élève et lien parent | C M | C M | — | — | — | — | — |
| Dossier élève complet | L M | L M | L de ses classes, champs utiles | — | — | — | L de soi |
| Identité minimale de prêt (nom, code, classe) | L | L | L de ses classes | — | L | — | L de soi |
| Présence : faire l'appel | L M | L | L M de ses classes | — | — | L de ses enfants | L de soi |
| Corriger une présence (avec motif) | M | — | M de ses classes, journalisé | — | — | — | — |
| Évaluation et notes en brouillon | L | — | C M de ses classes | — | — | — | — |
| Soumettre une évaluation | L | — | P de ses classes | — | — | — | — |
| Publier notes et bulletins | P | — | — | — | — | L de ses enfants | L de soi |
| Annonces et calendrier | C M P | C (brouillon) | C (proposition) | — | — | L de l'audience | L de l'audience |
| Finances, reçus | L | — | — | L M du périmètre financier | — | L de ses enfants | — |
| Catalogue et prêts | L | L | L | — | L M | L | L de ses prêts |
| Export d'un périmètre | P journalisé | P du périmètre dossiers | P de ses classes | P financier | P des prêts | — | — |
| Journal d'audit | L | — | — | — | — | — | — |

La matrice de la page Paramètres de la maquette est un rappel de cette cible. Elle ne l'applique pas.

## 4. Parcours du noyau scolaire

Ces parcours sont le critère du futur pilote. Ils se spécifient et se testent d'abord avec des **données fictives**. Aucun dossier réel n'entre dans la maquette ni dans un environnement non contrôlé.

1. Inscrire un élève et rattacher ses parents ou tuteurs.
2. Créer l'année, les niveaux, les classes, les matières, et affecter les enseignants.
3. Faire l'appel, puis corriger une présence en conservant l'historique et le motif.
4. Préparer une évaluation, saisir les notes, la soumettre, puis la publier selon les rôles.
5. Donner au parent l'accès aux seuls enfants qui lui sont associés.
6. Publier une annonce et un événement de calendrier pour la bonne audience.
7. Produire un bulletin ou un rapport filtré, imprimable, avec les droits du rôle.

Un parcours est terminé quand une personne du rôle prévu le fait du début à la fin, et quand un test automatique montre qu'un autre rôle ou une autre école reçoit un refus.

## 5. Entités principales

Chaque entité métier porte `id`, `schoolId`, `createdAt`, `updatedAt`. Les actions sensibles ajoutent une ligne de journal, elles n'écrasent pas l'historique.

| Entité | Rôle | Liens |
|---|---|---|
| École | Locataire. Nom, contacts du bureau, langue par défaut. | A plusieurs campus, années, utilisateurs. |
| Campus | Lieu de l'école. | Appartient à une école. |
| Année scolaire | Période officielle, périodes et barème. Une année courante par école. | Appartient à une école. |
| Utilisateur | Compte d'une personne, état invité / actif / désactivé. | Appartient à une école. A un ou plusieurs rôles. |
| Lien parent-enfant | Autorise un parent à voir un élève. | Utilisateur parent, élève, motif, date. |
| Classe | Groupe d'une année, d'un niveau et d'un campus. | Enseignants affectés, élèves inscrits. |
| Matière | Discipline et coefficient dans une année. | Reliée aux évaluations et aux ressources. |
| Inscription | Place d'un élève dans une classe pour une année. | Historique des mouvements (entrée, transfert, retrait) avec motif. |
| Présence | Appel d'une classe à une date, plus corrections. | Valeur, auteur, date, motif. L'ancienne valeur reste lisible. |
| Évaluation | Devoir noté : brouillon, soumis, publié. | Classe, matière, barème, auteur. |
| Note | Résultat d'un élève à une évaluation. | Bornée au barème. Visible selon l'état de l'évaluation. |
| Devoir | Consigne de travail, distincte de la note. | Classe, échéance, remises versionnées. |
| Ressource | Fiche de bibliothèque. Voir la section 6. | Source externe ou fichier dont les droits sont connus. |
| Événement | Entrée de calendrier avec audience. | École, campus ou classe. Brouillon puis publié. |

Le journal n'est pas une entité métier éditable. Il enregistre auteur, date, école, dossier, action et motif.

## 6. Bibliothèque : statuts et droits

Le catalogue de la maquette est une **collecte candidate**. Les fiches ont le statut `toCheck`. Il faut les traiter comme une première liste, pas comme une bibliothèque validée.

Statuts visés, dans l'ordre :

| Statut | Sens | Visible comme |
|---|---|---|
| `aVerifier` | Fiche créée, droits ou lien non établis. | À vérifier |
| `lienControle` | Le lien a été ouvert à une date notée. | Lien contrôlé le … |
| `licenceConfirmee` | La licence et le droit de lier, télécharger, adapter ou redistribuer sont notés. | Licence confirmée |
| `relu` | Un éducateur a confirmé niveau, langue et adéquation. Nom et date obligatoires. | Contenu relu par … |
| `retire` | Plus proposé. Le lien d'archive reste dans le journal. | Retiré |

Champs à confirmer avant qu'une fiche passe `relu` :

- niveau et classe ;
- matière et compétence visée ;
- langue réellement disponible ;
- format, taille, durée, besoin de connexion ;
- source, auteur, date de vérification, date de prochaine revue ;
- licence exacte et ce qu'elle autorise ;
- version du programme de référence.

Si les droits ne sont pas établis, NORIA donne le lien vers la source et n'héberge pas le fichier. Un accès gratuit à la consultation n'autorise pas la copie, la traduction, l'hébergement ni la redistribution.

Parcours à constituer, après contrôle : lecture en kreyòl et en français, mathématiques, sciences, histoire et géographie d'Haïti, langues, arts, informatique, orientation. Des sources à étudier, sans les republier : [MIT-Ayiti](https://mit-ayiti.net/) et la [banque de ressources de Lakou Kajou](https://lakoukajou.ht/en/educators/educational-resource-bank/). Le curriculum haïtien évolue : chaque fiche indique la version de programme utilisée. Repères publics : [UNESCO-IBE, réforme du curriculum en Haïti](https://www.ibe.unesco.org/en/capacity-development/haiti), [calendrier scolaire MENFP](https://menfp.gouv.ht/assets/CALENDRIER_SCOLAIRE_2025_2026.pdf), [définition UNESCO des ressources éducatives libres](https://www.unesco.org/en/open-educational-resources/mandate).

Dans la maquette, `toCheck` s'affiche « À vérifier » et `verified` s'affiche « Licence confirmée (démo) ». Le bouton qui pose cette marque le dit. Il ne crée pas le statut `relu`.

## 7. Faible débit

À traiter après le noyau, pas comme un module de plus dans la maquette :

- pages légères, images compressées, pas de vidéo lancée seule ;
- lisible sur un téléphone modeste ;
- fiches téléchargeables pour lecture hors ligne ;
- impression peu gourmande en encre ;
- reprise d'une saisie après coupure ;
- synchronisation différée, avec une règle de conflit explicite ;
- préparation des contenus avant la classe.

Kolibri est une piste pour diffuser des cours hors ligne. Aucune intégration n'est annoncée tant qu'elle n'est pas validée sur le plan technique, pédagogique et opérationnel. [Learning Equality — Kolibri](https://learningequality.org/kolibri/about-kolibri/)

## 8. Classe virtuelle, décision séparée

La maquette peut ouvrir une salle Jitsi publique pour une démonstration. Ce n'est pas une classe de production.

Avant de proposer la visioconférence à une école, écrire :

- quel fournisseur traite l'audio, la vidéo et les identifiants de séance ;
- comment un élève entre ;
- comment l'enseignant contrôle l'entrée, le micro et la discussion ;
- quelles règles protègent les mineurs et modèrent les échanges ;
- quelles données sont gardées, par qui, et combien de temps ;
- ce qui se passe si la connexion est faible, et quelle alternative existe (devoir, fiche, impression).

Recommandation : la vidéo reste un module optionnel. Les liens externes servent à la démonstration. Aucun élève réel n'est envoyé vers un serveur public sans analyse de confidentialité, contrôle d'accès et accord opérationnel.

## 9. Nom NORIA et clés `klirline_*`

Aujourd'hui :

- l'interface et le pied de page disent NORIA, produit de Klirline Inc. ;
- le registre de démonstration est `klirline_school_v1` ;
- les extensions sont `klirline_ext_v1` ;
- une ancienne clé `klirline_v1` est seulement retirée lors d'une réinitialisation.

Ces clés restent en place dans la maquette. Les renommer maintenant effacerait les démonstrations déjà ouvertes dans les navigateurs, sans apporter d'isolation.

Lors du passage au serveur :

1. Le serveur devient la source des dossiers. Le navigateur ne garde qu'un cache.
2. La clé de cache s'appelle `noria_cache_v1`, et elle est limitée à une école et à un utilisateur.
3. `klirline_school_v1` et `klirline_ext_v1` ne sont pas recopiées vers le serveur : ce sont des données fictives.
4. Au premier lancement du nouveau client, ces clés sont laissées intactes, puis proposées à l'effacement local après confirmation. Aucun envoi automatique.
5. Les noms de fichiers du dépôt peuvent rester jusqu'à une décision de renommage séparée. Le nom affiché aux écoles est NORIA.

## 10. Critères du pilote

Le pilote se décide avec des écoles, après les étapes 2 et 3 de la feuille de route. Cette maquette ne déclenche pas une mise en production.

Conditions minimales avant d'y mettre un dossier réel :

- les tests montrent qu'un rôle et une école ne lisent pas le périmètre d'un autre ;
- la sauvegarde a été restaurée au moins une fois ;
- les sept parcours de la section 4 ont été faits avec des données fictives, puis rejoués par des personnes représentatives ;
- chaque ressource publiée a une source, une langue, un niveau, une licence ou un statut, et une date de contrôle ;
- les écrans essentiels restent utilisables sur téléphone après une coupure ;
- les écoles savent qui appeler, et une procédure d'incident existe ;
- la visioconférence, si elle est proposée, a un fournisseur nommé et des règles pour les mineurs.

Tant que ces conditions manquent, NORIA se présente comme une démonstration de parcours, pas comme un SaaS prêt à recevoir des dossiers d'élèves.

## Feuille de route

| Étape | Travail | Critère de sortie |
|---|---|---|
| 1. Cadrer | Nom, rôles, parcours et limites du pilote confirmés avec des écoles. | Parcours approuvés par des utilisateurs représentatifs. |
| 2. Socle serveur | Connexion, plusieurs écoles, autorisations, base, journal, sauvegarde et restauration. | Un rôle ou une école ne peut pas lire un autre périmètre. |
| 3. Noyau scolaire | Inscriptions, classes, présence, notes, annonces, calendrier, vues parent et élève, rapports essentiels. | Un petit groupe d'écoles fait un cycle pilote sans tableur parallèle pour ces parcours. |
| 4. Bibliothèque | Catalogue contrôlé, parcours, licences, ressources locales et contenus ouverts. | Chaque ressource publiée a source, langue, niveau, licence ou statut, et date de contrôle. |
| 5. Faible débit | Téléchargement, hors ligne, impression légère, synchronisation différée. | Les parcours essentiels marchent sur téléphone après une coupure. |
| 6. Échanges de classe | Devoirs, discussion modérée, visioconférence évaluée, notifications consenties. | Accès contrôlé, modération et limites du fournisseur écrites. |
| 7. Exploitation | Formation, support, supervision, incident, guide des écoles. | Les écoles pilotes réussissent les tâches convenues et savent obtenir de l'aide. |

L'ordre de construction suit ce tableau. On ne commence pas l'étape 6 tant que l'étape 2 n'a pas son critère de sortie.
