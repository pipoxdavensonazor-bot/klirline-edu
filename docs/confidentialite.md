# Politique de confidentialité publique

> **Version publiable : 4 novembre 2026, Version 2.0.** Philippe a dit « Publier ». La page française suit le texte
> nettoyé pour publication ; la page kreyòl reprend les mêmes sections et le même sens. Aucun bandeau « projet non
> publié » et aucun crochet `[à confirmer]` / `[à compléter]` ne figurent sur la page.
>
> **À faire relire par un juriste** avant de s'en prévaloir (droit haïtien, droit canadien pour Klirline Inc., et
> pays des familles le cas échéant). Le texte ne revendique aucune certification. Cette mention reste dans la
> documentation, pas sur la page.
>
> Points encore ouverts, écrits en phrases sur la page (pas en crochets) : règles haïtiennes sur la minorité et
> l'autorité parentale, statut fiscal de la TCA et mentions de facture, régions exactes selon les contrats fournisseurs,
> durée fiscale précise, autorité haïtienne compétente. Le kreyòl suit le français ; une relecture par un locuteur natif
> reste utile. La fusion dans la branche de production et le `git pull` sur le serveur restent au coordinateur.

## Adresses

- Français : `https://noriaedu.com/confidentialite`
- Kreyòl : `https://noriaedu.com/ht/confidentialite`
- Liens : pied de page de toutes les pages du portail, écran de connexion de l'application (`/app`), plan du site.
- Adresse à donner à Meta (application WhatsApp, champ « Privacy Policy URL ») : `https://noriaedu.com/confidentialite`.
  Telegram (BotFather) n'en exige pas, mais la même adresse peut être indiquée dans la description du bot.
- Contact publié : `contact@klirline.ca` (Philippe Davenson Azor, président). Ne pas annoncer `privacy@noriaedu.com` :
  cette adresse n'est pas en service.

## Où est le texte

`server/src/confidentialite.js` (objet `C.fr` / `C.ht`, mêmes sections dans le même ordre ; une ligne qui commence par
`• ` devient une puce). La page est rendue par `server/src/portail-pages.js` dans la mise en page du portail : HTML
statique, aucune ressource externe, CSP du portail (`default-src 'none' ; script-src 'self'`), aucun cookie posé par
la page elle-même. Test : `server/test/confidentialite.test.js`.

Le texte public est celui du 4 novembre 2026 (Version 2.0). Les faits ci-dessous décrivent le produit ; quand la page
est plus prudente ou plus générale que le code, c'est le texte validé pour publication qui est affiché.

## Faits sur lesquels le texte s'appuie (à revoir si l'un change)

| Point | Source |
|---|---|
| Exploitant Klirline Inc., nº 777880576RC0001 ; adresse publiée : 10948 Avenue de Rome, Montréal-Nord (Québec) H1H 4P4, Canada | fait donné pour la version du 4 novembre 2026 |
| Responsable : Philippe Davenson Azor, contact@klirline.ca | fait donné pour cette version |
| Rôles : l'école décide des finalités scolaires ; Klirline traite sur instruction ; Klirline décide pour la sécurité, les comptes grand public et la facture d'abonnement | `docs/portail-public.md`, `docs/facturation.md`, `server/src/policy.js` |
| Données scolaires (élève, classe, notes, présences, santé/famille pour la direction et le secrétariat seulement, photo, paiements de scolarité émis par l'école, bibliothèque, relevés, transferts, déclarations) | migrations 001–016, `policy.js` (`studentFields`) |
| Photo de badge privée, EXIF retiré, pas de reconnaissance faciale dans le code | `server/src/badges.js` |
| Lauréat mineur : nom complet et photo seulement avec l'accord de l'école et du parent ; sinon initiales, photo non servie | `docs/portail-public.md` |
| Comptes grand public (annonces, événements, actualités, lauréats, département) ; pas de question d'âge ; suppression immédiate sur demande ; pas de purge d'inactivité | `server/src/portail-public.js` |
| Codes : empreinte HMAC, 10 min ; WhatsApp 10 min ; lien Telegram 15 min | `otp.js`, `whatsapp.js`, `telegram.js` |
| SMS non actif (`NORIA_SMS_PROVIDER` simulé / console) | `docs/codes-connexion.md` |
| Invitations de réunion : e-mail ; sinon lien `wa.me` que l'école envoie elle-même (pas d'appel à l'API Meta) | `server/src/reunions-invitations.js` |
| Appareils de confiance : empreinte du jeton, libellé, 30 jours ; retirés à la déconnexion, à la révocation et à la réinitialisation du mot de passe | `appareils.js`, `auth.js` (`destroyUserSessions`) |
| Journaux de sécurité ~35 jours | `securite.js` (`retentionJours: 35`) |
| Audio réunions : segments HLS ~6 s, préfixe R2 `r/`, DELETE ~60 s après sortie de liste ; cache demandé `max-age=86400` ; pas de transcription ni d'enregistrement permanent dans le produit. Cycle de vie 1 jour sur `r/` : filet **prévu** (à activer dans Cloudflare), pas une preuve qu'il est déjà en place. Un lien https de rediffusion saisi par l'école est stocké, pas le fichier | `docs/reunion-diffusion-r2.md`, `server/src/diffusion-relais.js`, `reunions-parents.js` (`replay_url`) |
| Jitsi : salle des intervenants ; lien audio parents seulement sans flux NORIA et si l'assistance prévue ≤ 50 (`NORIA_REUNION_JITSI_MAX`). Démonstration de cours `meet.systemli.org` : pas pour des dossiers réels | `reunions-parents.js`, `src/salles-cours.js`, `docs/noria-socle.md` |
| Sauvegardes chiffrées sur R2 : **30 / 4 / 12** (chiffre de production retenu pour la page). Le script du dépôt reste à **7 / 4 / 12** tant que `KEEP_DAILY` n'est pas à 30 (`deploy/sauvegarde/lib.sh`) | fait de production donné pour cette version ; défaut du dépôt à vérifier sur le serveur avant « publier » |
| Fin de contrat : 60 jours pour l'export, puis suppression des systèmes actifs, sous réserve légale ; le résidu des sauvegardes suit le calendrier (~12 mois). Ce délai n'est pas un traitement automatique dans le code | fait retenu pour la page ; pas de tâche de purge dans le dépôt. Les factures d'abonnement sont protégées contre la suppression (`docs/facturation.md`) |
| Facture d'abonnement : Klirline, HT + TCA 10 % sur les factures nouvelles, TTC ; MonCash, NatCash, virement, espèces. Frais de scolarité : l'école émet, NORIA est l'outil | `server/src/facturation.js`, `docs/facturation.md` |
| Prestataires : Vultr (Miami), Cloudflare, R2, Resend, Meta WhatsApp (option), Telegram (option), Jitsi (option) | `.env` de production, `notify.js`, `whatsapp.js`, `telegram.js`, `reunions-parents.js` |
| Cookies : `noria_session` (8 h), `noria_appareil` (30 j), `noria_public` (30 j), `noria_pub_in` (témoin « 1 », 30 j, pas HttpOnly), `noria_admin` (2 h), `noria_ministere` (4 h) | `app.js`, `appareils.js`, `portail-public.js`, `plateforme.js`, `ministere.js` |
| Pas de témoin Cloudflare Web Analytics ; CSP `script-src 'self'` ; en-tête `nel` / `report-to` (cf-nel) observé sur https://noriaedu.com le 3 novembre 2026, sans `Set-Cookie` sur une consultation ordinaire | `server/src/portail-pages.js`, `server/src/app.js` (`no-transform`), en-têtes en production |
| Stockage local du navigateur : langue, dernier code d'école, file hors ligne | `src/login.js`, `src/offline.js` |

La page Version 2.0 ne nomme pas Jitsi. Le produit peut encore ouvrir une salle (`reunions-parents.js`, démonstration
`meet.systemli.org` dans `src/salles-cours.js`). Cette salle ne doit pas recevoir de dossiers d'élèves. Les invitations
WhatsApp du code préparent un lien `wa.me` que l'école envoie elle-même ; la page, elle, dit que le numéro est communiqué
à Meta lorsque la personne a accepté WhatsApp. Le cookie `noria_pub_in` existe dans le code et n'est pas nommé sur la page.
