# Facturation des écoles (super-admin) et page « Abonnement »

Outils 100 % libres : PDF généré par `server/src/pdf.js` (aucune dépendance), e-mails via la file `outbox` (Resend si
configuré, sinon simulé), aucune passerelle de paiement payante. **Aucune donnée n'est jamais supprimée.**

## Côté super-admin (onglet « Facturation » de `/admin`)

| Élément | Détail |
|---|---|
| Formules | `par_eleve` (prix × élèves actifs, par an) ou `forfait` (prix fixe par an) ; devise **HTG** ou **USD** ; montants stockés en centimes. Une formule se désactive, elle ne se supprime pas. |
| Abonnement d'une école | formule, **essai gratuit** (N jours à partir d'aujourd'hui ou date de fin), **délai de grâce** (30 j par défaut), mode lecture seule `auto` / `jamais` (dérogation) / `force`, e-mail de facturation. |
| Factures | numéro `NOR-AAAA-0001` attribué dans une transaction ; élèves comptés depuis les inscriptions actives (modifiable) ; échéance à 30 jours par défaut ; **PDF** (`/api/admin/facturation/factures/:id/pdf`). |
| Paiements | manuels : **MonCash, NatCash, virement, espèces** ; référence obligatoire (3–80 car.), unique par mode ; paiement partiel possible ; facture soldée → « payée ». Paiements immuables (ni modification ni suppression). |
| Statuts | `a_payer`, `payee`, `annulee` (motif obligatoire, seulement sans paiement) sont stockés ; **« en retard » est calculé** (à payer et échéance dépassée, heure d'Haïti). |
| Rappels | par facture ou groupés (toutes les factures en retard, au plus un par jour) : e-mail `facturation_rappel` (FR/HT) à l'e-mail de facturation + comptes direction, **notification dans l'application** pour la direction ; chaque envoi est tracé (`billing_reminder`) et journalisé (`platform_audit`). |

## Lecture seule douce

Une école passe en lecture seule (HTTP **423** sur toute écriture) quand :

* une facture à payer dépasse `échéance + délai de grâce`, ou
* l'essai est terminé depuis plus que le délai de grâce **sans aucune facture**, ou
* le super-admin choisit `force`.

`jamais` lève la restriction (dérogation). Un paiement qui solde la facture la lève immédiatement. En lecture seule :
lecture, impressions, PDF et exports restent permis ; déconnexion, notifications, page Abonnement aussi. Une école sans
abonnement configuré n'est jamais restreinte (écoles existantes inchangées).

Protection des données : déclencheurs en base (`028_facturation.*.sql`) qui refusent la suppression des factures, des
abonnements et toute modification/suppression des paiements ; tables réservées à la connexion système (REVOKE pour
`noria_app` et `noria_ministere` en PostgreSQL) ; incluses dans la sauvegarde (`backup.js`).

## Côté école : menu « Administration → Abonnement »

Direction, secrétariat, comptabilité : formule, état (essai, à jour, retard, lecture seule), factures avec PDF, paiements
reçus et consignes de paiement. Un bandeau en haut de l'accueil prévient d'un retard ou de la lecture seule.

## Plus tard : API MonCash (emplacements prévus)

Rien n'est branché. Pour automatiser :

1. Ajouter un adaptateur `moncash` dans `server/src/paiement-adaptateurs.js` (interface `verify({ method, reference, amountCents, currency, schoolId })`), avec `NORIA_MONCASH_CLIENT_ID` / `NORIA_MONCASH_SECRET` en variables d'environnement (jamais en base).
2. Création du paiement : `POST /Api/v1/CreatePayment` (orderId = numéro de facture) → redirection de la direction vers MonCash.
3. Retour/notification : route publique `/api/facturation/moncash/retour` qui appelle `RetrieveTransactionPayment`, puis la même logique que `POST /api/admin/facturation/factures/:id/paiements` (méthode `moncash`, référence = transactionId, `recorded_by` NULL).
4. NatCash : même schéma quand une API marchande sera disponible.

## Questions ouvertes pour Philippe

* ~~Prix~~ — **validé par Philippe le 2026-10-24** (publié sur `/tarifs`) : forfaits annuels plafonnés, pas de prix par élève sur la page publique.
  * Starter — jusqu'à 100 élèves : 25 000 HTG / an ou 200 USD / an
  * Plus — jusqu'à 250 élèves : 55 000 HTG / an ou 420 USD / an
  * Pro — jusqu'à 500 élèves : 95 000 HTG / an ou 720 USD / an
  * Réseau — au-delà de 500 élèves : sur devis
* Facturation **annuelle** (validé) ; trimestrielle / mensuelle : à décider.
* ~~Essai / grâce~~ — **validé** : essai gratuit de **60 jours**, **15 jours** de grâce avant lecture seule (à aligner avec les valeurs par défaut du code, aujourd'hui 30 jours).
* Mentions légales de la facture : raison sociale, NIF, adresse de NORIA, coordonnées bancaires et numéro MonCash marchand.
* ~~Taxes~~ — **validé** : TCA 10 % appliquée sur les factures.
* Taux de change HTG/USD si une école veut payer dans l'autre devise.
