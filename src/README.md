# Klirline Édu — prototype de gestion scolaire

Version de démonstration destinée à illustrer des parcours scolaires et recueillir les commentaires d'écoles pilotes. Les données fournies sont fictives. Le nom et la disponibilité de la marque ne sont pas vérifiés.

## Ouvrir la démonstration

Ouvrir `index.html` dans un navigateur récent. Les modifications sont conservées dans le stockage local de ce navigateur. Le bouton de réinitialisation restaure les données de démonstration.

## Fonctions visibles

- Profils de démonstration : direction, secrétariat, enseignant, comptabilité, bibliothèque, parent et élève.
- Registres de démonstration pour les élèves, classes, présences, notes, communications, paiements, livres et calendrier.
- Extensions pour les devoirs, les ressources pédagogiques, les rapports, les prêts, l'installation de l'école et la continuité scolaire.
- Espace « Classe virtuelle » pour planifier un cours, puis l'ouvrir dans la salle : cours en direct, tableau, présence, discussion et devoirs.
- Interface en français et en créole haïtien, affichage adaptatif, impressions et exports CSV selon les modules.

## Ce que la salle de classe fait réellement

L'enseignant planifie un cours (classe, matière, titre, date, consignes, ressource HTTPS optionnelle). « Entrer dans la salle » ouvre la classe visuelle dans NORIA : le tableau du jour, la présence par prénom, la discussion de la classe et les devoirs de cette classe.

Le cours en direct utilise [Jitsi Meet](https://jitsi.org/jitsi-meet/) sur le serveur public gratuit [meet.systemli.org](https://meet.systemli.org/). Le serveur officiel `meet.jit.si` demande un compte pour ouvrir une salle, et cette connexion ne fonctionne pas dans une page intégrée. systemli laisse démarrer la salle sans compte. Aucune clé n'est demandée. La salle charge la vidéo seulement après un clic, micro et caméra coupés au départ, avec l'écran d'accueil Jitsi. Le nom affiché est le rôle (enseignant, élève), jamais le nom d'un élève. Le nom de la salle vient de l'identifiant du cours. Jitsi apporte la caméra, le micro, le partage d'écran et son tableau. La discussion scolaire et les devoirs restent dans le stockage local de NORIA ; le chat Jitsi n'y est pas copié.

Ce serveur public convient à une démonstration. Il ne convient pas à de vrais dossiers d'enfants : les flux passent par un service tiers, et les données de la maquette restent dans le navigateur. Aucun secret n'est placé dans le JavaScript.

La présence se marque à la main. Il n'y a pas d'enregistrement du cours, de salles de sous-groupes, de dépôt de fichier sécurisé ni de paiement.

## Limites importantes

- Il n'y a pas de serveur, de base de données distante, de connexion réelle, d'envoi de courriel/SMS ni de synchronisation multiappareil.
- Le sélecteur de rôle sert uniquement à explorer la maquette. Les contrôles de rôle du navigateur ne sont pas des autorisations de sécurité.
- Les données restent dans `localStorage`, qui n'est pas adapté au stockage réel de dossiers scolaires ou de renseignements d'enfants.
- Les parcours de paiement, de messagerie, de synchronisation hors ligne, d'activation de comptes et d'audit sont des simulations.
- Les liens des ressources sont des liens externes candidats. Leur disponibilité, leur licence, leur coût et leur adéquation au programme doivent être revérifiés avant leur diffusion.
- Les états « vérifié » affichés dans la maquette ne remplacent pas une vérification opérationnelle récente.

## Architecture

- `index.html` : structure de page et chargement des modules.
- `src/styles.css`, `src/addons.css` : styles adaptatifs et styles des extensions.
- `src/i18n.js`, `src/addons-i18n.js` : libellés français et créoles.
- `src/seed.js`, `src/addons-data.js` : données fictives et stockage local.
- `src/app.js`, `src/addons.js`, `src/tours.js` : interfaces, interactions et parcours de démonstration.
- `src/README-EXTENSIONS.md` : notes historiques sur les extensions.
- `src/flyer.html` : dépliant de présentation à compléter avant diffusion.

## Vérifications effectuées pour cette version

Les résultats et limites des vérifications réalisées sont consignés dans `src/AUDIT-2026-10-14.md`. Elles ne constituent pas une validation de mise en production.

## Historique des portées appliquées et vérifiées (maquette)

- **Accueils « Aujourd'hui » par rôle** : ce qui se passe, ce qui demande attention, la prochaine action, l'état de synchro et l'âge des données locales. Parent : pastilles par enfant (un dossier à la fois).
- **Données minimales par rôle** : bibliothèque = code/nom/classe ; comptable = + solde ; fiche/relevé/reçu refusés hors périmètre (enseignant = classes assignées, bibliothécaire = jamais, comptable = reçus seuls). Finances et exports CSV/MENFP réservés.
- **Notes** : brouillon → soumis → publié ; professeur prépare/soumet, direction publie/corrige avec motif et historique ; saisie bornée au barème de chaque évaluation.
- **Devoirs (§15 P0)** : éditeur texte simple (titre, gras/italique/listes/liens, aperçu, export .txt, impression) avec brouillon autosauvegardé et reprise ; remises versionnées (remis/en retard/retourné/noté), corbeille de correction avec retour commenté et note, modération par masquage ; nouvelles versions après correction sans écraser les précédentes.
- **Calendrier** : publication direction seule, audience réellement filtrée (école/campus/classe) ; enseignants proposent (la direction crée en brouillon) ; export CSV + ICS limité aux événements visibles ; aucun abonnement externe actif dans la démo.
- **Impressions** : périmètre de l'enseignant appliqué à l'aperçu comme au CSV ; chaque document porte école, année, module, classe, date, auteur et mention « sans valeur officielle » ; exports CSV verrouillés par rôle et journalisés.
- **Prêts** : échéance = sortie + durée configurable (14 j par défaut), prolongation +7 j, déclaration de perte (sans retour au stock), rappels avec canal consenti et statut préparé/remis/échec ; carte à référence opaque unique sans faux QR (identifiant de prêt uniquement, jamais d'accès portail).
- **Comptes** : codes uniques, parcours créer → remettre → activer, chaque étape journalisée ; désactivation/réactivation, nouveau code d'assistance (l'ancien n'est jamais réutilisé), suppression confirmée ; un compte = une personne, comptes partagés interdits.
- **Classe virtuelle** : cours planifié sans compte externe, salle NORIA (Jitsi public en démonstration, tableau, présence, discussion, devoirs), ressource HTTPS optionnelle, périmètre par classe ; création et suppression réservées à la direction et à l'enseignant.
- **Continuité scolaire (§16 P1)** : événement brouillon → publié → terminé/annulé (direction seule), copie calendrier, annonce liée, plans de reprise par classe avec agrégats sans noms d'élèves.
- **Validation pilote** : checklist mesurable + protocole de test terrain ; seuils web.dev affichés comme cibles, pas comme résultats.

## Suivi de la version du 14 octobre 2026

Une revue du ZIP de suivi a renforcé les vérifications de consentement des rappels, le filtrage des exports de calendrier, l'échappement du texte ICS et les gardes des actions de comptes et de prêts. Voir la section « Revue de suivi » dans `src/AUDIT-2026-10-14.md`. Les rappels restent des simulations locales et ne transmettent aucun message.

## Direction visuelle — interface v1

La feuille `src/design-refresh.css` modernise l'enveloppe visuelle sans modifier les parcours métier : navigation latérale sur grand écran, barre de navigation horizontale sur téléphone, contrastes renforcés, composants plus lisibles et palette inspirée des couleurs haïtiennes (bleu profond, rouge, or et turquoise). Les références culturelles restent subtiles afin de garder une interface scolaire sobre et accueillante.
