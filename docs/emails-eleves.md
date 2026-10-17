# Adresses e-mail professionnelles des élèves (bloc 7)

**Construites mais désactivées par défaut.** Tant que `NORIA_EMAIL_ELEVES` n'est pas à `1`, les routes
`/api/emails…`, la page `/email/verifier` et les scripts `src/emails-eleves.js`, `src/mon-email.js`,
`src/emails-eleves.css`, `src/email-verif.css` répondent 404, comme le portail du ministère. Rien n'apparaît dans le
menu et `/api/config` ne mentionne pas la fonction.

## Principe

- **Une adresse par élève**, tirée de son code élève : minuscules, sans accents, tout autre caractère remplacé par
  un tiret (`JPD140101-CSL` → `jpd140101-csl@eleve.noria.ht`). Unique dans **toute** la plateforme ; en cas de
  collision, suffixe `-2`, `-3`… ; noms réservés (`postmaster`, `abuse`, `admin`, `noreply`…) évités. Une adresse n'est
  **jamais réattribuée**, même désactivée.
- **Par école, facultatif** : sous-domaine (`csl.eleve.noria.ht`) et/ou préfixe (`csl.jpd140101-csl@…`). Changer ces
  réglages ne modifie jamais les adresses déjà créées.
- **Pas de boîte aux lettres** : NORIA ne stocke aucun message. L'adresse est un **transfert** (« synchronisation »)
  vers une adresse personnelle **vérifiée** de l'élève, ou d'un parent lié pour un mineur sans adresse. Le contenu
  passe directement du fournisseur à la destination.
- **Création en masse** par la direction (classe ou école entière) : aperçu d'abord (adresses proposées, mineurs,
  collisions), puis validation. La validation porte l'« empreinte » de l'aperçu : si quelque chose a changé entre-temps
  (nouvel élève, adresse prise), elle est refusée (409) et l'aperçu doit être relancé.
- Le secrétariat voit tout en lecture seule. Direction et secrétariat ne voient la destination que **masquée**
  (`a***o@gmail.com`).

## Mineurs

- Rien n'est transféré pour un élève mineur (ou de date de naissance inconnue) sans **accord parental** : soit le
  parent lié le donne dans son espace (et peut le retirer), soit la direction enregistre un **accord écrit** avec le
  nom du parent signataire. L'élève ne peut pas consentir seul.
- L'adresse devient **active** quand : (majeur ou accord parental) **et** destination vérifiée.
- Les adresses ne sont jamais publiées : ni portail public, ni annuaire, ni portail du ministère (le rôle PostgreSQL
  `noria_ministere` n'a aucun droit sur ces tables).

## Vérification de la destination

1. L'élève (ou un parent lié) saisit une adresse personnelle dans « Adresse e-mail NORIA ».
2. NORIA envoie, en français et en kreyòl, un **code à 6 chiffres** et un **lien** (valables 24 h).
3. Le code se saisit dans NORIA (5 essais au plus) ; le lien ouvre une page sans script qui demande un clic sur
   « Confirmer » (formulaire POST : les robots de messagerie qui ouvrent les liens ne valident rien).
4. L'ancienne destination reçoit un avis de changement. Au plus 5 demandes par heure et par élève.

## Cycle de vie

| Statut | Signification |
|---|---|
| `en_attente` | créée ; il manque l'accord parental et/ou une destination vérifiée |
| `active` | transfert en service |
| `suspendue` | suspendue par la direction (motif obligatoire) ; plus aucun transfert ; reprise possible |
| `redirigee` | élève transféré vers une école qui ne garde pas l'adresse : transfert maintenu un temps limité |
| `desactivee` | définitif ; l'adresse ne sera jamais réattribuée |

- **Fin de scolarité** : la direction programme la désactivation avec un délai (par défaut
  `NORIA_EMAIL_DELAI_JOURS=90`, de 0 à 365 jours), annulable. Un élève **retiré** (plus aucune inscription active)
  reçoit automatiquement une fin programmée. Le balayage a lieu à chaque consultation (pas de tâche planifiée).
- **Transfert entre écoles — règle proposée** : l'adresse **suit l'élève** (comme son code élève, global) quand ni
  l'adresse ni l'école d'accueil n'utilisent de sous-domaine ou de préfixe : destination vérifiée et accord parental
  partent avec elle. Sinon l'ancienne adresse passe `redirigee` pendant `NORIA_EMAIL_REDIRECTION_JOURS` (90 par défaut)
  puis est désactivée ; l'école d'accueil crée la nouvelle adresse et le lien est gardé (`replaced_by`).
- **Journal** : chaque adresse a son journal en ajout seul (`student_email_event` : création, demandes et vérifications
  de destination, accord, activation, suspension, reprise, fin, transfert, erreurs du fournisseur) ; les actions de la
  direction vont aussi dans `audit_log`.

## Documents officiels

Badge (PDF), relevé de notes et invitation d'un compte élève mentionnent l'adresse NORIA **seulement si elle est
active** (et si la fonction est activée).

## Assistant sécurité

Règle `emails_eleves` (fiche FR/HT dans le guide) : rafale de changements de destination dans une école (10/h),
changements répétés pour une même adresse (3 en 24 h), créations en masse (300/h), codes faux (15/h). Seuils
réglables par `NORIA_ASSISTANT_SEUILS` (`emailsDestinationsHeure`, `emailsDestinationAdresseJour`,
`emailsCreationsHeure`, `emailsEchecsHeure`). Action proposée : déconnecter/verrouiller le compte en cause.

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `NORIA_EMAIL_ELEVES` | `0` | `1` active la fonction (sinon tout répond 404) |
| `NORIA_EMAIL_DOMAINE` | — | domaine des adresses, par ex. `eleve.noria.ht` ; sans lui, aucune création (409) |
| `NORIA_EMAIL_FOURNISSEUR` | `simule` | routage entrant : `simule`, `cloudflare`, `forwardemail` |
| `NORIA_EMAIL_ENVOI` | `simule` | envoi des codes et avis : `simule`, `mailgun`, `noria` (réutilise `NORIA_EMAIL_PROVIDER`) |
| `NORIA_EMAIL_EXPEDITEUR` | `NORIA <no-reply@domaine>` | expéditeur des codes |
| `NORIA_EMAIL_DELAI_JOURS` | `90` | délai avant désactivation après la fin de scolarité |
| `NORIA_EMAIL_REDIRECTION_JOURS` | `90` | durée de la redirection après un transfert |
| `NORIA_EMAIL_WEBHOOK_SECRET` | — | secret HMAC (24 caractères au moins) du webhook entrant `/api/emails/entrant` |
| `NORIA_CF_API_TOKEN`, `NORIA_CF_ZONE_ID`, `NORIA_CF_ACCOUNT_ID` | — | Cloudflare Email Routing |
| `NORIA_FE_API_TOKEN` | — | Forward Email |
| `NORIA_MAILGUN_API_KEY`, `NORIA_MAILGUN_DOMAIN`, `NORIA_MAILGUN_REGION` (`us`/`eu`) | — | Mailgun (envoi) |

Aucune clé n'est écrite dans le code. En production, le serveur avertit au démarrage si la fonction est activée sans
domaine ou avec un fournisseur simulé. Les tests n'appellent jamais le réseau (faux `fetch` injecté).

## Coûts estimés (relevés le 17 octobre 2026, en dollars US, à revérifier au moment d'acheter)

| Poste | Option | Coût | Source |
|---|---|---|---|
| Domaine | **sous-domaine d'un domaine déjà possédé** (`eleve.noria.ht` si `noria.ht` existe) | **0 $** | — |
| Domaine | nouveau `.ht` | ~84 à 228 $/an selon le registraire (médiane ~126 $) ; NIC Haïti ne publie pas de prix public | [tld-list.com/tld/ht](https://tld-list.com/tld/ht), [nic.ht](https://nic.ht/en) |
| Routage entrant | **Cloudflare Email Routing** | **gratuit**, illimité en volume ; **200 règles par domaine et 200 adresses de destination vérifiées par compte** (augmentation sur demande) | [limites](https://developers.cloudflare.com/email-routing/limits/), [adresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/) |
| Routage entrant | **Forward Email** | gratuit (transfert par enregistrements DNS, sans API) ; **Enhanced 3 $/mois** (API, alias illimités) ; Team 9 $/mois | [forwardemail.net](https://forwardemail.net/en) |
| Routage entrant | Mailgun Routes | Free : 1 route ; Basic 15 $/mois : 5 routes ; routage complet dès Foundation 35 $/mois | [tarifs](https://www.mailgun.com/pricing/), [aide](https://help.mailgun.com/hc/en-us/articles/203068914), [Routes](https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/routes) |
| Routage entrant | Amazon SES (réception + fonction de transfert à écrire) | 0,10 $/1 000 messages reçus + 0,09 $ par tranche de 1 000 × 256 Ko ; non branché | [SES](https://aws.amazon.com/ses/pricing/) |
| Envoi des codes | **Mailgun Free** | **0 $** jusqu'à 100 e-mails/jour | [tarifs](https://www.mailgun.com/pricing/) |
| Envoi des codes | Cloudflare Email Sending | Workers Paid 5 $/mois minimum, 3 000 e-mails inclus puis 0,35 $/1 000 | [tarifs](https://developers.cloudflare.com/email-service/platform/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/) |
| Envoi des codes | Amazon SES | 0,10 $/1 000 (à la carte) | [SES](https://aws.amazon.com/ses/pricing/) |

### Les moins chères, selon la taille

1. **Pilote (jusqu'à ~200 élèves avec une destination) : 0 $/mois.** Sous-domaine d'un domaine existant +
   Cloudflare Email Routing (`NORIA_EMAIL_FOURNISSEUR=cloudflare`) + Mailgun Free pour les codes
   (`NORIA_EMAIL_ENVOI=mailgun`), ou l'envoi déjà configuré de NORIA (`NORIA_EMAIL_ENVOI=noria`).
2. **Au-delà de 200 destinations : ~3 $/mois.** Forward Email Enhanced (`NORIA_EMAIL_FOURNISSEUR=forwardemail`,
   alias illimités par API) + Mailgun Free (100 codes/jour suffisent largement : un code par changement de destination).
   Alternative : demander à Cloudflare une hausse de la limite de 200 (gratuit, sans garantie).
3. Volumes importants (dizaines de milliers d'élèves) : Amazon SES (quelques dollars par mois), mais il faut écrire et
   exploiter la fonction de transfert (non fournie).

## Branchement pas à pas

### Cloudflare Email Routing (gratuit)

1. Mettre le domaine (ou le domaine parent du sous-domaine) sur Cloudflare et activer **Email Routing** : Cloudflare
   ajoute lui-même les enregistrements MX et SPF. Pour un sous-domaine, l'ajouter dans Email Routing (30 domaines par
   zone au plus).
2. Créer un **jeton d'API** limité : *Zone → Email Routing Rules → Edit* (sur cette zone) et *Account → Email Routing
   Addresses → Edit*. Relever l'identifiant de zone et l'identifiant de compte.
3. Variables : `NORIA_EMAIL_ELEVES=1`, `NORIA_EMAIL_DOMAINE=eleve.noria.ht`, `NORIA_EMAIL_FOURNISSEUR=cloudflare`,
   `NORIA_CF_API_TOKEN`, `NORIA_CF_ZONE_ID`, `NORIA_CF_ACCOUNT_ID`.
4. À l'activation d'une adresse, NORIA déclare la destination auprès de Cloudflare puis crée une règle
   « to = adresse → forward ». **Cloudflare envoie aussi son propre lien de vérification** au propriétaire de la
   destination, une seule fois par destination : le transfert réel ne commence qu'après ce clic (à expliquer aux
   familles).
5. Option « catch-all » (évite la limite de 200 règles, pas celle des 200 destinations) : règle catch-all vers un
   Email Worker qui interroge NORIA :

```js
// Email Worker Cloudflare (variables NORIA_URL et NORIA_SECRET = NORIA_EMAIL_WEBHOOK_SECRET)
export default {
  async email(message, env) {
    const body = JSON.stringify({ to: message.to });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.NORIA_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
    const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const r = await fetch(`${env.NORIA_URL}/api/emails/entrant`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-noria-timestamp': ts, 'x-noria-signature': sig }, body });
    const d = r.ok ? await r.json() : null;
    if (d && d.action === 'forward') await message.forward(d.to);
    else message.setReject('Adresse inconnue');
  },
};
```

### Forward Email (≈ 3 $/mois) — à valider au branchement

1. Ajouter le domaine chez Forward Email et poser les enregistrements MX/TXT indiqués ; souscrire l'offre Enhanced.
2. Générer un jeton d'API ; variables `NORIA_EMAIL_FOURNISSEUR=forwardemail`, `NORIA_FE_API_TOKEN`.
3. NORIA crée un alias par adresse (`POST /v1/domains/:domaine/aliases`, destinataire = destination vérifiée), le met
   à jour au changement de destination et le supprime à la suspension ou à la désactivation. Le format exact des
   réponses de l'API est à vérifier lors du premier branchement réel (adaptateur testé seulement avec un faux fetch).

### Mailgun (envoi des codes, gratuit jusqu'à 100/jour)

1. Ajouter un domaine d'envoi (par ex. `mg.noria.ht`) et poser SPF, DKIM et MX indiqués par Mailgun.
2. Variables : `NORIA_EMAIL_ENVOI=mailgun`, `NORIA_MAILGUN_API_KEY`, `NORIA_MAILGUN_DOMAIN`, `NORIA_MAILGUN_REGION=us`
   ou `eu`, et `NORIA_EMAIL_EXPEDITEUR="NORIA <no-reply@mg.noria.ht>"`.

## Tables (migration 015) et sauvegardes

`school_email_settings`, `student_email_dest`, `student_email`, `student_email_event` : cloisonnées par école (RLS
PostgreSQL), aucune suppression (déclencheurs et droits), adresse figée, désactivation définitive, journal en ajout
seul. Toutes les quatre sont dans la sauvegarde chiffrée (`backup.js`, test de couverture). Les codes et jetons de
vérification ne sont conservés que sous forme d'empreinte.

## Risques et décisions pour Philippe

- **Choix du domaine** : sous-domaine d'un domaine NORIA existant (0 $) ou domaine dédié `.ht` (~84–228 $/an).
- **Fournisseur** : Cloudflare gratuit pour un pilote ≤ 200 élèves, Forward Email (~3 $/mois) au-delà.
- **Double vérification Cloudflare** (lien Cloudflare en plus du code NORIA) : acceptable pour un pilote, à expliquer.
- **Délivrabilité** : un transfert peut casser SPF/DMARC de certains expéditeurs (messages en indésirables). Les
  fournisseurs réécrivent l'expéditeur (SRS), sans garantie totale.
- **Règle de transfert** proposée ci-dessus (l'adresse suit l'élève sans préfixe) : à valider.
- **Délais** de 90 jours (fin de scolarité, redirection) : à valider.
- **Âge inconnu traité comme mineur** : prudent mais impose l'accord parental.
- **Pas d'envoi depuis l'adresse** : les élèves reçoivent, ils ne peuvent pas écrire « depuis » l'adresse NORIA
  (nécessiterait de vraies boîtes, donc un budget par élève).
