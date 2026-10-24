# Notes sur les extensions

Ce fichier conserve le contexte d'architecture de la maquette. Les descriptions ci-dessous désignent des parcours de démonstration dans le navigateur; elles ne prouvent ni l'existence d'un service distant ni la sécurité de données réelles.

## Modules ajoutés à la maquette

| Module | Parcours représenté | Limite à retenir |
| --- | --- | --- |
| Devoirs & leçons | Consignes et remises textuelles | Pas de dépôt de fichiers sécurisé ni de messagerie de classe |
| Structure établissement | Campus, matières, périodes et barèmes | Paramètres conservés localement |
| Suivi des inscriptions | Mouvements et informations d'urgence de démonstration | Pas de dossier officiel ni de synchronisation serveur |
| Présences + | Corrections, préférences et journal local | Aucun avis n'est envoyé |
| Communications + | Annonces et réunions de démonstration | Pas d'envoi réel par courriel, SMS ou messagerie |
| Finances + | Échéanciers, bourses et remboursements de démonstration | Aucun paiement réel |
| Bibliothèque ouverte | Liens de ressources et listes de lecture | Disponibilité, licence et coûts à revalider auprès des éditeurs |
| Rapports + | Filtres et exports de démonstration | Les formats ministériels ne sont pas certifiés |
| Classe virtuelle | Salle dans NORIA : Jitsi public, tableau, présence, discussion, devoirs | Serveur meet.systemli.org, sans compte ; démonstration seulement, pas de dossiers d'enfants |
| Calendrier + | Partage et publication simulés | Les règles du navigateur ne protègent pas les données |
| Continuité scolaire | Événements et plans de reprise | Pas de suivi des personnes ni d'évaluation de sécurité |

## Stockage et limites d'accès

Les extensions utilisent la clé locale `klirline_ext_v1` et lisent le registre de démonstration `klirline_school_v1`. L'action « Appliquer au registre » modifie explicitement le registre local de démonstration. Ces noms de clés et contrôles ne fournissent aucune isolation réelle entre écoles ou utilisateurs.

Les filtres et sélecteurs de rôle sont utiles pour parcourir les écrans, mais toute permission de production doit être imposée et vérifiée par un serveur authentifié. N'utilisez pas cette maquette avec des dossiers scolaires réels.

## Retour et salles de cours (lot école)

- **Barre « Retour »** : `XGO` ajoute une barre commune en tête de chaque page de l'espace Extensions
  (page parente, puis accueil des extensions ; depuis l'accueil, retour au tableau de bord).
- **Salles de cours** (`ext-salles`, mode serveur seulement) : module `src/salles-cours.js` (`NORIA_SAL`), API `/api/salles`
  (`server/src/salles.js`). Infos du cours (classe, matière, enseignant, horaire, ordre du jour), ressources (lien, texte,
  formule KaTeX, PDF ≤ 700 Ko lu avec PDF.js), tableau blanc (canvas, local), minuteur, main levée, sondages,
  mode faible connexion (Jitsi audio seul, actualisation 45 s, PDF chargé seulement au clic).
- **Bibliothèques libres hébergées** dans `src/vendor/` : KaTeX 0.19.1 (MIT) rendu par `katex.render` (DOM, compatible CSP),
  PDF.js / pdfjs-dist 6.4.299 (Apache 2.0, `isEvalSupported:false`). Chargées à la demande, jamais au premier affichage.
- **Vidéo** : Jitsi public `meet.systemli.org` (iframe) ; la `permissions-policy` autorise caméra, micro et partage d'écran
  pour cette seule origine.
