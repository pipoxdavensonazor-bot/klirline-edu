# Codes de connexion gratuits (bloc 9)

NORIA envoie ses codes de connexion **sans SMS payant**. Il y a cinq façons de se connecter, toutes gratuites pour l'école et pour les familles :

| Canal | Ce que fait la personne | Coût | Activation |
|---|---|---|---|
| **WhatsApp « inversé »** | NORIA affiche un code ; elle l'**envoie** depuis son WhatsApp au numéro NORIA (bouton qui ouvre WhatsApp avec le message `NORIA 123456` déjà écrit). La page se connecte toute seule. | 0 : Meta ne facture pas les messages reçus. La réaction ✅ envoyée en retour est gratuite. | variables `NORIA_WHATSAPP_*` |
| **Bot Telegram** | Elle relie son compte une seule fois, puis reçoit ses codes à 6 chiffres dans Telegram. | 0 : l'API Bot de Telegram est gratuite. | variables `NORIA_TELEGRAM_*` |
| **E-mail** | Elle reçoit le code par e-mail (Resend, déjà en place). | offre Resend | `NORIA_EMAIL_PROVIDER=resend` (inchangé) |
| **Appareil de confiance** | Elle coche « Faire confiance à cet appareil » : NORIA se rouvre sans code pendant 30 jours. | 0 | toujours actif |
| **Code de l'école** | La direction ou le secrétariat imprime un code à usage unique pour un élève ou un parent sans e-mail ni messagerie. | 0 (une feuille) | toujours actif |

**Aucun SMS payant n'est ajouté ni activé.** Le code SMS existant (`server/src/notify.js`) n'est pas modifié ; `NORIA_SMS_PROVIDER` reste `console` (simulé) par défaut. Le choix « SMS » n'apparaît à l'écran de connexion que si un fournisseur SMS réel est réglé (ou sur le serveur de démonstration). L'assistant sécurité continue de signaler que les SMS sont simulés : c'est normal et voulu.

WhatsApp et Telegram sont **désactivés par défaut** : tant que leurs variables ne sont pas réglées, leurs routes répondent 404 et l'écran de connexion ne les propose pas.

---

## 1. Ce que voit la personne (écran de connexion)

- **Se connecter avec un code (WhatsApp, Telegram, e-mail)** : choix du canal (en français ou en kreyòl), puis :
  - *WhatsApp* : grand code `NORIA 123456`, bouton **Ouvrir WhatsApp**, trois étapes simples. La page interroge le serveur toutes les 3 s (pause quand l'onglet est caché, reprise au retour) pendant 10 minutes, puis propose un nouveau code.
  - *Telegram* ou *E-mail* : saisie du code à 6 chiffres comme avant (10 min, usage unique, 5 essais).
- **J'ai un code de mon école** : école + code imprimé (10 caractères, par ex. `K7QM-2XP-9TR`).
- Case **Faire confiance à cet appareil pendant 30 jours** (décochée par défaut ; à ne pas cocher sur un ordinateur partagé).

Menu **Administration** :

- **Connexion et appareils** (tous les comptes) : appareils de confiance (retirer un appareil ou tous), liaison Telegram (relier, retirer), rappel du mode WhatsApp.
- **Codes d'activation** (direction, secrétariat) : générer un lot (élèves ou parents, une classe ou toutes, 1 à 90 jours), **imprimer la liste** (une carte par code, avec le mode d'emploi), suivre et annuler les codes émis.

Tout respecte la CSP stricte (aucun script ni style en ligne) ; le module `src/connexion.js` est chargé à la demande.

## 2. Fonctionnement et sécurité

### WhatsApp inversé (`server/src/whatsapp.js`)

1. `POST /api/login/whatsapp { school, identifier, trust }` → `{ ticket, code, number, link, minutes: 10, pollSeconds: 3 }`. Réponse **identique** que le compte existe ou non (pour un compte inconnu ou sans téléphone, rien n'est enregistré). Limiteur IP + compte.
2. La personne envoie `NORIA <code>` depuis WhatsApp. Meta appelle `POST /api/whatsapp/webhook`, signé par `X-Hub-Signature-256` = HMAC-SHA256 du **corps brut** avec le secret de l'application (comparaison à temps constant ; corps lu en octets).
3. Le serveur cherche une demande ouverte **pour le numéro expéditeur** (le téléphone du compte) et compare le code (haché, HMAC salé). WhatsApp garantit que l'expéditeur possède ce numéro : la preuve vaut un code SMS. Messages de plus de 10 min ignorés ; autre numéro, mauvais code : rien ne se passe.
4. `POST /api/login/whatsapp/statut { ticket }` → `en_attente`, puis `ok` + session (une seule fois). Le ticket (256 bits) ne quitte jamais le navigateur ; seule son empreinte est en base.
5. Réponse gratuite dans la fenêtre de service : réaction ✅ (défaut), ou court texte (`NORIA_WHATSAPP_REPLY=texte`), ou rien (`NORIA_WHATSAPP_REPLY=0`). Elle n'est envoyée que si `NORIA_WHATSAPP_TOKEN` et `NORIA_WHATSAPP_PHONE_ID` sont réglés, et seulement après une connexion réussie.
6. `GET /api/whatsapp/webhook` : poignée de main de Meta (`hub.mode=subscribe`, `hub.verify_token`, réponse `hub.challenge` en texte).

Risque à connaître : quelqu'un qui connaît le numéro d'une personne peut lancer une demande et **lui demander** de lui envoyer « NORIA 123456 » (hameçonnage, comme pour un code SMS). L'écran rappelle : « Personne de l'école ne vous demandera ce code : ne l'envoyez qu'au numéro NORIA. » Le numéro WhatsApp de la personne doit être celui de son compte NORIA.

### Telegram (`server/src/telegram.js`)

- Liaison : `POST /api/me/telegram/lien` (connecté) → `https://t.me/<bot>?start=<jeton>` (15 min, usage unique, 10 liens par heure). La personne appuie sur **Démarrer** : Telegram envoie `/start <jeton>` au webhook, NORIA enregistre la conversation **privée** (groupes et canaux ignorés) et confirme dans Telegram.
- Code : `POST /api/login/code { …, channel: 'telegram' }` envoie le code à la conversation reliée (n'importe quelle école de la personne). Sans liaison : rien n'est envoyé, réponse identique.
- Webhook `POST /api/telegram/webhook` authentifié par l'en-tête `X-Telegram-Bot-Api-Secret-Token` (temps constant). `/stop` dans Telegram, ou **Retirer la liaison** dans NORIA, arrête l'envoi.

### E-mail

Inchangé (Resend ou SMTP via `notify.js`). Nouveau : `channel: 'email'` envoie le code à l'adresse e-mail du compte même si la personne a tapé son téléphone (les adresses techniques `@telephone.invalid` sont exclues).

### Appareil de confiance (`server/src/appareils.js`)

- Cookie `noria_appareil` : `HttpOnly`, `SameSite=Strict`, `Path=/api/`, `Secure` en production, 30 jours. Seule l'empreinte SHA-256 du jeton est en base (`trusted_device`).
- `POST /api/login/appareil` (en-tête `x-noria: 1` obligatoire) rouvre une session et **renouvelle le jeton** (l'ancien ne marche plus). `/api/config` indique `appareil: true` quand le cookie est valable : l'interface se reconnecte seule.
- Révocation : **Connexion et appareils** (un appareil ou tous), **Se déconnecter** (cet appareil), et automatiquement à toute révocation des sessions du compte (récupération du mot de passe, désactivation, actions de l'assistant sécurité). 10 appareils au plus par compte.

### Codes d'activation (`server/src/activation.js`)

- `POST /api/codes-activation { role: 'eleve'|'parent', class_id?, student_ids?, days? }` (direction, secrétariat) : un code par compte actif (élève relié à sa fiche, ou parent relié à l'élève). Les codes ne sont rendus **qu'une fois** (liste à imprimer) ; seule une empreinte HMAC liée à l'école est conservée ; un nouveau code annule le précédent du même compte. 400 codes au plus par lot.
- `GET /api/codes-activation` (suivi, sans les codes), `POST /api/codes-activation/:id/annuler`.
- `POST /api/login/activation { school, code, trust }` : usage unique ; réponse identique pour un code inconnu, expiré, annulé ou déjà utilisé ; limiteur par IP (5 échecs / 15 min) et par école (50 / 15 min).
- Alphabet sans caractères ambigus (pas de 0/O ni 1/I/L), 10 caractères (≈ 8·10¹⁴ combinaisons).

### Base de données (migration `017_codes_gratuits`)

| Table | Contenu | RLS (PostgreSQL) | Sauvegarde |
|---|---|---|---|
| `login_challenge` | demandes WhatsApp (empreintes du ticket et du code, 10 min) | politique `ecole` ; **aucun droit** pour `noria_app` (connexion système seulement) | exclue |
| `telegram_link` | liaison compte ↔ conversation Telegram | politique `ecole`, pas de suppression | sauvegardée |
| `trusted_device` | appareils de confiance (empreintes) | politique `ecole`, pas de suppression | exclue |
| `activation_code` | codes imprimés (empreintes) | politique `ecole`, pas de suppression | exclue |

Le rôle du ministère (`noria_ministere`) n'a aucun droit sur ces tables. Tests : `server/test/codes-gratuits.test.js` (SQLite et PostgreSQL 16), `menu.test.js`, `kreyol.test.js`.

## 3. Variables d'environnement

À mettre dans `/opt/noria/.env` (jamais versionné), puis redémarrer (`docker compose up -d`).

| Variable | Rôle |
|---|---|
| `NORIA_WHATSAPP_NUMBER` | numéro WhatsApp de NORIA, format international (`+509…`) — affiché aux familles |
| `NORIA_WHATSAPP_VERIFY_TOKEN` | jeton choisi par vous (16 caractères au moins, `openssl rand -hex 24`) et recopié chez Meta |
| `NORIA_WHATSAPP_APP_SECRET` | « Clé secrète » de l'application Meta (vérifie la signature des messages reçus) |
| `NORIA_WHATSAPP_TOKEN` | facultatif : jeton permanent d'utilisateur système (pour la réaction ✅) |
| `NORIA_WHATSAPP_PHONE_ID` | facultatif : « Identifiant du numéro de téléphone » (réaction ✅, et filtre des messages reçus) |
| `NORIA_WHATSAPP_REPLY` | facultatif : `reaction` (défaut), `texte` ou `0` |
| `NORIA_WHATSAPP_GRAPH_VERSION` | facultatif : version de l'API Graph (défaut `v21.0`) |
| `NORIA_TELEGRAM_BOT_TOKEN` | jeton donné par @BotFather |
| `NORIA_TELEGRAM_BOT_USERNAME` | nom du bot, sans `@` (par ex. `NoriaEduBot`) |
| `NORIA_TELEGRAM_WEBHOOK_SECRET` | secret choisi par vous (`openssl rand -hex 32`), recopié dans `setWebhook` |

Les trois premières activent WhatsApp ; les trois variables Telegram activent Telegram. `NORIA_OTP_SECRET` (déjà en place) sert aussi de poivre pour les codes WhatsApp et d'activation.

---

## 4. Ce que Philippe doit faire lui-même

Aucune de ces étapes ne coûte d'argent. Ne jamais envoyer de « modèles » (templates) WhatsApp : ce sont eux qui sont payants, et NORIA n'en utilise pas.

### 4.1 WhatsApp (compte Meta Business et numéro)

1. **Un numéro de téléphone dédié à NORIA** (puce Digicel ou Natcom, par exemple), qui reçoit les SMS ou appels pour la vérification. Il ne doit **pas** être déjà utilisé dans l'application WhatsApp ou WhatsApp Business (sinon, supprimer d'abord ce compte WhatsApp du téléphone).
2. **Portefeuille Meta Business** : sur <https://business.facebook.com>, se connecter avec un compte Facebook personnel, créer le portefeuille « Klirline Inc. » (nom légal, adresse, site `https://noriaedu.com`, e-mail professionnel). Meta peut demander plus tard une **vérification de l'entreprise** (documents officiels) : la faire si elle est proposée, elle augmente les limites.
3. **Application développeur** : sur <https://developers.facebook.com/apps>, **Créer une app** → cas d'usage « Entreprise / Business » → la rattacher au portefeuille Klirline. Dans l'app, ajouter le produit **WhatsApp** (« Configurer »).
4. **Ajouter le numéro** : WhatsApp → *Configuration de l'API* (API Setup) → **Ajouter un numéro de téléphone** : nom d'affichage « NORIA » (soumis à validation de Meta), catégorie Éducation, puis code reçu par SMS ou appel. Meta peut demander d'enregistrer un moyen de paiement sur le compte WhatsApp : rien n'est prélevé tant qu'aucun modèle payant n'est envoyé.
5. **Relever trois valeurs** :
   - le **numéro** au format `+509…` → `NORIA_WHATSAPP_NUMBER` ;
   - l'**Identifiant du numéro de téléphone** (Phone number ID, page API Setup) → `NORIA_WHATSAPP_PHONE_ID` ;
   - la **Clé secrète de l'app** (Paramètres de l'app → Général → *Clé secrète*, bouton Afficher) → `NORIA_WHATSAPP_APP_SECRET`.
6. **Jeton permanent** (pour la réaction ✅, facultatif) : business.facebook.com → Paramètres → **Utilisateurs système** → Ajouter (rôle Administrateur) → *Attribuer des éléments* : l'app et le compte WhatsApp (contrôle total) → **Générer un jeton**, sans expiration, avec les permissions `whatsapp_business_messaging` et `whatsapp_business_management` → `NORIA_WHATSAPP_TOKEN`. Le garder comme un mot de passe.
7. **Choisir le jeton de vérification** : `openssl rand -hex 24` → `NORIA_WHATSAPP_VERIFY_TOKEN`.
8. **Mettre ces variables sur le serveur et redémarrer NORIA** (déploiement de la branche — étape faite avec l'équipe, pas automatiquement).
9. **Brancher le webhook** : dans l'app Meta → WhatsApp → *Configuration* → Webhook → **Modifier** : URL de rappel `https://noriaedu.com/api/whatsapp/webhook`, jeton de vérification = la valeur de l'étape 7 → **Vérifier et enregistrer** (NORIA doit déjà tourner avec les variables). Puis, dans *Champs du webhook*, **s'abonner à `messages`**.
10. **Passer l'app en mode « Live »** (en haut de la page de l'app) : Meta demande l'adresse d'une **politique de confidentialité** publique : indiquer `https://noriaedu.com/confidentialite` (version kreyòl : `https://noriaedu.com/ht/confidentialite`, voir `docs/confidentialite.md`).
11. **Essai** : sur un téléphone dont le numéro WhatsApp est celui d'un compte NORIA, choisir « WhatsApp » à la connexion, appuyer sur **Ouvrir WhatsApp**, envoyer le message : la page doit se connecter en quelques secondes et le message recevoir ✅.

### 4.2 Telegram (bot créé avec BotFather)

1. Dans Telegram, ouvrir **@BotFather** (badge bleu officiel) et envoyer `/newbot`.
2. Nom affiché : `NORIA` ; nom d'utilisateur : par ex. `NoriaEduBot` (doit finir par `bot`). BotFather donne un **jeton** du type `123456789:AA…` → `NORIA_TELEGRAM_BOT_TOKEN` ; le nom d'utilisateur (sans `@`) → `NORIA_TELEGRAM_BOT_USERNAME`. Garder le jeton secret (en cas de fuite : `/revoke` dans BotFather).
3. Facultatif mais conseillé : `/setdescription` (« Codes de connexion NORIA — gratuits »), `/setuserpic` (logo NORIA), `/setcommands` :
   ```
   start - Relier mon compte NORIA
   stop - Ne plus recevoir de codes
   ```
4. Choisir le secret du webhook : `openssl rand -hex 32` → `NORIA_TELEGRAM_WEBHOOK_SECRET`.
5. Mettre les trois variables sur le serveur et redémarrer NORIA.
6. **Enregistrer le webhook** (une fois, depuis n'importe quel ordinateur ; remplacer `<JETON>` et `<SECRET>`) :
   ```bash
   curl -s "https://api.telegram.org/bot<JETON>/setWebhook" \
     -d url=https://noriaedu.com/api/telegram/webhook \
     -d secret_token=<SECRET> \
     -d 'allowed_updates=["message"]' -d drop_pending_updates=true
   curl -s "https://api.telegram.org/bot<JETON>/getWebhookInfo"   # url correcte, aucune erreur
   ```
7. **Essai** : se connecter à NORIA → *Connexion et appareils* → **Relier Telegram** → **Démarrer** dans Telegram (le bot confirme), puis se déconnecter et choisir « Telegram » à la connexion : le code arrive dans Telegram.

### 4.3 Rien à faire pour

- l'**e-mail** (Resend déjà configuré) ;
- les **appareils de confiance** et les **codes de l'école** (actifs dès la mise en ligne de la branche).

## 5. Limites connues

- WhatsApp : la personne doit avoir des données mobiles ou du Wi-Fi, et son numéro WhatsApp doit être celui de son compte. Meta peut limiter un nouveau numéro au début ; les messages **reçus** ne sont pas plafonnés de la même façon que les envois.
- Telegram : il faut avoir Telegram et relier son compte une fois (depuis une session ouverte, par exemple après un code e-mail ou un code de l'école).
- Codes de l'école : remis en main propre ; un code perdu se remplace en générant un nouveau code pour le même élève (l'ancien est annulé).
