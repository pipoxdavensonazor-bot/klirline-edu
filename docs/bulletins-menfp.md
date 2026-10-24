# Bulletins au format haïtien (MENFP)

Ce module **complète** les relevés existants (`/api/report-cards`, bulletin signé et vérifiable par QR). Il ne les remplace pas. Il ajoute :

- des **règles de bulletin propres à chaque école** (`school.bulletin_rules`), avec des valeurs par défaut de type MENFP ;
- le **tableau de classe** pour une période ou pour l'année. Il affiche la moyenne de chaque matière sur l'échelle de l'école, les points (moyenne × coefficient), le total, la moyenne générale, le rang (ex aequo à la manière des jeux olympiques), la mention et, pour le bilan annuel, la décision ;
- un **PDF imprimable** avec une page par élève : la ligne « République d'Haïti — MENFP », l'en-tête de l'école, le tableau des notes, la moyenne, le rang, la mention, la décision et les cases de signature ;
- les **appréciations du préscolaire**, sans note chiffrée (« Acquis / En voie d'acquisition / Non acquis » par domaine) ;
- dans le bulletin émis (`report_card.snapshot.menfp`), le rang, la mention et la moyenne figés sur l'échelle de l'école ;
- dans l'**assistant de structure**, les coefficients MENFP du 3e cycle fondamental (7e–9e AF), proposés automatiquement à la création des matières, et le mode « appréciations » pour le préscolaire.

## API

| Méthode | Chemin | Rôles |
|---|---|---|
| GET | `/api/bulletins/regles` | direction, secrétariat, enseignant (lecture) |
| PUT | `/api/bulletins/regles` `{rules}` ou `{reset:true}` | direction (journalisé `bulletin.rules`) |
| GET | `/api/bulletins/classes/:id?term_id=<id>\|annuel` | direction, secrétariat, enseignant (limité à ses classes) |
| GET | `/api/bulletins/classes/:id/pdf?term_id=&student_id=` | direction, secrétariat |
| POST | `/api/bulletins/appreciations` `{student_id, term_id, items:[{domain, level, comment}]}` | direction, enseignant ; préscolaire uniquement (sinon 409) |

Dans l'interface : **Structure de l'école → Bulletins** (direction et secrétariat).

## Règles par défaut et degré de certitude

| Règle | Valeur par défaut | Statut |
|---|---|---|
| Coefficients 9e AF (et, par extension, 7e–8e AF) : Mathématiques, Créole, Français, Sciences sociales, Sciences expérimentales ×3 ; Anglais, Espagnol, EEA, EPS, ITAP ×2 | proposés par l'assistant | **Source officielle** pour la 9e AF (décision du 14 juin 2023). L'extension à la 7e et à la 8e AF est **une hypothèse** que chaque école peut modifier (coefficients des matières). |
| Promotion automatique en 1re, 2e et 3e AF (pas de redoublement) | activée | **Annoncée par le MENFP.** La date d'application diffère selon les sources (2025-2026 ou 2026-2027). Le réglage est configurable. |
| Échelle de notation | sur 10 | **À confirmer.** C'est l'usage courant dans les écoles haïtiennes, mais nous n'avons trouvé aucun texte officiel qui l'impose. Elle se règle de 1 à 100. |
| Moyenne de passage | 5 / 10 | **À confirmer** (usage courant, variable selon l'école). |
| « Admis sous condition » | de 4,5 à 5 | **À confirmer.** La règle dépend de l'école. |
| Mentions : Excellent ≥ 9, Très bien ≥ 8, Bien ≥ 7, Assez bien ≥ 6, Passable ≥ 5, Insuffisant | ces seuils | **À confirmer** (usage, aucun barème officiel trouvé). |
| Pondération des périodes dans la moyenne annuelle | égale | **À confirmer.** Certaines écoles donnent plus de poids au dernier trimestre. Le réglage `ponderation_periodes` existe. |
| Rang dans la classe | affiché | Usage courant. Il peut être désactivé. |
| Préscolaire : appréciations par domaine, sans note | 3 niveaux, 6 domaines | **Hypothèse** inspirée du Cadre d'orientation curriculaire. Les libellés sont réglables. |
| Coefficients du nouveau secondaire (NS1–NS4) | non préremplis | Seuls ceux du bac NS4 2025 sont publiés. Ils sont **à saisir par l'école**. |

Les seuils marqués « à confirmer » portent un badge dans l'interface. La direction les règle dans **Bulletins → Règles du bulletin**. Les règles d'une école ne touchent pas les autres.

## Sources publiques consultées

1. Décision ministérielle du 14 juin 2023 portant révision des coefficients aux examens de 9e AF : <https://www.haitilibre.com/article-39777-haiti-flash-revision-des-coefficients-des-matieres-obligatoires-aux-examens-de-9-af-officiel.html>
2. Gouvernement d'Haïti (MENFP), atelier de mise en œuvre des coefficients de 9e AF, 13 juillet 2023 : <https://communication.gouv.ht/in/menfp/finalisation-du-plan-de-mise-en-oeuvre-de-la-revision-des-coefficients-des-matieres-aux-9e-a-f/>
3. HPN, nouvelles mesures pour la rentrée 2023-2024 : <https://www.hpninfo.com/post/ha%C3%AFti-%C3%A9ducation-de-nouvelles-mesures-pour-la-rentr%C3%A9e-scolaire-2023-2024>
4. Le Témoin Haïti et Ted'Actu (même décision, 15 juin 2023) : <https://tedactu.com/2023/06/15/les-eleves-pourront-passer-les-examens-officiels-de-la-9e-af-en-creole-a-partir-de-lannee-prochaine/>
5. Promotion automatique en 1re–3e AF : Le National <https://www.lenational.org/post_article.php?pol=1694>, Haïti24 <https://haiti24.net/haiti-le-menfp-met-fin-au-redoublement-dans-les-trois-premieres-annees-fondamentales/>, Haiti9news (« dès 2026-2027 ») <https://haiti9news.net/premier-cycle-fondamental-passage-automatique-des-2026-2027/>
6. Coefficients du baccalauréat NS4 2025 (HaïtiLibre, news 45329) : <https://www.haitilibre.com/en/news-45329.html>
7. Relevé de notes final en ligne (La Question News, mars 2024) : <https://laquestionnews.com>
8. Cadre d'orientation curriculaire 2021 (MENFP), PDF : <https://mit-ayiti.net>
9. Programme du secondaire 2024 : <https://docs.haitidocs.org>

> Le chiffre « moyenne de passage 5/10 » que l'on trouve souvent en ligne vient en partie de sources ivoiriennes (FratMat). Nous ne l'avons **pas** retenu comme source haïtienne. La valeur reste un défaut à confirmer.

## Questions ouvertes pour l'équipe

- Échelle /10 ou /100 pour vos écoles pilotes ? Quelle moyenne de passage ?
- Faut-il garder « Admis sous condition » ? Avec quelle bande de moyennes ?
- Pour la 7e et la 8e AF, garder les coefficients de la 9e AF ?
- La date d'entrée en vigueur de la promotion automatique est-elle 2025-2026 ou 2026-2027 ?
