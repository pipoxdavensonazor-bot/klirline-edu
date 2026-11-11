# Facturation des écoles (super-admin) et page « Abonnement »

Outils 100 % libres : PDF généré par `server/src/pdf.js` (aucune dépendance), e-mails via la file `outbox` (Resend si
configuré, sinon simulé), aucune passerelle de paiement payante. **Aucune donnée n'est jamais supprimée.**

## Côté super-admin (onglet « Facturation » de `/admin`)

| Élément | Détail |
|---|---|
| Formules | `par_eleve` (prix × élèves actifs, par an) ou `forfait` (prix fixe par an) ; devise **HTG** ou **USD** ; montants stockés en centimes. Une formule se désactive, elle ne se supprime pas. |
| Abonnement d'une école | formule, **essai gratuit** (N jours à partir d'aujourd'hui ou date de fin), **délai de grâce** (15 j par défaut, valeur validée), mode lecture seule `auto` / `jamais` (dérogation) / `force`, e-mail de facturation. |
| Factures | numéro `NOR-AAAA-0001` attribué dans une transaction ; élèves comptés depuis les inscriptions actives (modifiable) ; échéance à 30 jours par défaut ; **PDF** (`/api/admin/facturation/factures/:id/pdf`). |
| Paiements | manuels : **MonCash, NatCash, virement, espèces** ; référence obligatoire (3–80 car.), unique par mode ; paiement partiel possible ; facture soldée → « payée ». Paiements immuables (ni modification ni suppression). |
| Statuts | `a_payer`, `payee`, `annulee` (motif obligatoire, seulement sans paiement) sont stockés ; **« en retard » est calculé** (à payer et échéance dépassée, heure d'Haïti). |
| Rappels | par facture ou groupés (toutes les factures en retard, au plus un par jour) : e-mail `facturation_rappel` (FR/HT) à l'e-mail de facturation + comptes direction, **notification dans l'application** pour la direction ; chaque envoi est tracé (`billing_reminder`) et journalisé (`platform_audit`). |

## TCA 10 %

Décision : les prix des formules (ceux publiés sur `/tarifs`, ex. Starter 25 000 HTG / an) sont **HT** ; la facture
ajoute la **TCA 10 %** : `TCA = arrondi(HT × 10 %)` (au centime), `TTC = HT + TCA`. Exemple Starter : 25 000 HT +
2 500 TCA = **27 500 HTG TTC**. Par élève : HT = élèves × prix unitaire, puis TCA sur ce total.

* `billing_invoice.amount_cents` = **montant dû TTC** (paiements, reste dû et statut « payée » s'appuient dessus) ;
  détail stocké dans `tax_rate_bp` (1000 = 10 %) et `tax_cents` (migration `029_facturation_tca.sql`). HT = amount − tax.
* PDF : ligne en HT, puis **Total HT / TCA 10 % / Total TTC**, déjà payé, reste dû.
* Factures émises avant la migration : `tax_cents = 0`, montant inchangé, PDF avec un simple « Total ».
* Mentions légales en pied de PDF depuis `NORIA_RAISON_SOCIALE`, `NORIA_NIF`, `NORIA_ADRESSE` ; sinon
  « Mentions légales : à compléter » (rien n'est inventé). Contact de facturation : `facturation@noriaedu.com`.

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

* ~~Prix~~ — **validé par Philippe le 2026-10-24** (publié sur `/tarifs`) : deux modèles publiés.
  * **Forfaits** annuels plafonnés (formule `forfait`) :
  * Starter — jusqu'à 100 élèves : 25 000 HTG / an ou 200 USD / an
  * Plus — jusqu'à 250 élèves : 55 000 HTG / an ou 420 USD / an
  * Pro — jusqu'à 500 élèves : 95 000 HTG / an ou 720 USD / an
  * Réseau — au-delà de 500 élèves : sur devis
  * **Par élève** (formule `par_eleve`) : **250 HTG / élève / an** ou **2,50 USD / élève / an** ; montant de la facture = élèves actifs × prix unitaire, calculé à l'émission. À effectif plein, le forfait est égal (Starter = 100 × 250) ou moins cher.
* Facturation **annuelle** (validé) ; trimestrielle / mensuelle : à décider.
* ~~Essai / grâce~~ — **validé** : essai gratuit de **60 jours**, **15 jours** de grâce avant lecture seule — désormais la valeur par défaut du code (abonnement créé sans délai précisé : 15 j). La colonne SQL grace_days garde DEFAULT 30 (migration 028 déjà appliquée), mais l'API fournit toujours la valeur explicitement..
* Mentions légales de la facture : raison sociale, NIF, adresse de NORIA, coordonnées bancaires et numéro MonCash marchand.
* ~~Taxes~~ — **validé** : TCA 10 % appliquée sur les factures (voir « TCA 10 % » ci-dessous).
* Taux de change HTG/USD si une école veut payer dans l'autre devise.
