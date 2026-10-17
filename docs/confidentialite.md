# Politique de confidentialité publique

> **À faire relire par un juriste** avant de s'en prévaloir (droit haïtien, droit canadien pour Klirline Inc., et
> pays des familles le cas échéant). Le texte décrit ce que NORIA fait réellement au 17 octobre 2026 ; il ne revendique
> aucune certification ni conformité à un règlement. Cette mention reste dans la documentation, pas sur la page.

## Adresses

- Français : `https://noriaedu.com/confidentialite`
- Kreyòl : `https://noriaedu.com/ht/confidentialite`
- Liens : pied de page de toutes les pages du portail, écran de connexion de l'application (`/app`), plan du site.
- Adresse à donner à Meta (application WhatsApp, champ « Privacy Policy URL ») : `https://noriaedu.com/confidentialite`.
  Telegram (BotFather) n'en exige pas, mais la même adresse peut être indiquée dans la description du bot.

## Où est le texte

`server/src/confidentialite.js` (objet `C.fr` / `C.ht`, mêmes sections dans le même ordre ; une ligne qui commence par
`• ` devient une puce). La page est rendue par `server/src/portail-pages.js` dans la mise en page du portail : HTML
statique, aucune ressource externe, CSP du portail (`default-src 'none'`), aucun cookie posé, environ 3 Ko compressée.
Test : `server/test/confidentialite.test.js` (contenu, CSP, absence de cookie, liens, plan du site, versions FR/HT alignées).

## Faits sur lesquels le texte s'appuie (à revoir si l'un change)

| Point | Source dans le code / l'exploitation |
|---|---|
| Exploitant Klirline Inc., contact contact@klirline.ca | pied de page du portail ; contact donné par Philippe |
| Données scolaires (élève, classe, notes, présences, santé/famille facultatives, photo, paiements, bibliothèque, relevés, transferts, déclarations) | migrations 001–016 |
| Comptes grand public, demandes d'inscription | migration 016 |
| Codes : empreinte HMAC, 10 min ; WhatsApp 10 min ; lien Telegram 15 min | `otp.js`, `whatsapp.js`, `telegram.js` |
| Appareils de confiance : empreinte du jeton, libellé, 30 jours, révoqués à la déconnexion et au changement de mot de passe | `appareils.js`, `auth.js` |
| Journaux de sécurité ~35 jours (IP, chemin, statut, empreinte du navigateur) | `securite.js` (`retentionJours: 35`) |
| Sauvegardes chiffrées 30 / 4 / 12 sur Cloudflare R2 | réglage de production indiqué par Philippe (le défaut du script est 7/4/12 ; `/etc/noria` n’est lisible qu’avec sudo, à vérifier) |
| Prestataires : Vultr (Miami), Cloudflare, R2, Resend, Meta WhatsApp, Telegram | `.env` de production, `notify.js`, `whatsapp.js`, `telegram.js` |
| Cookies : `noria_session` (8 h), `noria_appareil` (30 j), `noria_public` (30 j), `noria_admin`, `noria_ministere` ; tous HttpOnly | `app.js`, `appareils.js`, `portail-public.js`, `plateforme.js`, `ministere.js` |
| Stockage local du navigateur : langue, dernier code d'école, file hors ligne | `src/login.js`, `src/offline.js` |

Points que le juriste devrait trancher : durée de conservation après la fin du contrat d'une école, délai de réponse aux
demandes (le texte dit « raisonnable »), engagement d'avertir les écoles en cas d'incident, transferts hors d'Haïti,
âge à partir duquel un élève peut exercer seul ses droits. Si la salle de classe Jitsi (`meet.systemli.org`,
démonstration) sert un jour à de vrais élèves, l'ajouter aux prestataires.
