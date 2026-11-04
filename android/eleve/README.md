# NORIA Élève — coque Android (Google Play)

Coque **Trusted Web Activity** pour l’espace des écoles, pas une deuxième application.
Elle ouvre `https://noriaedu.com/app` (connexion, invitations, parents, élèves, personnel).
Le site public (annonces, événements, « Espaces des écoles ») reste dans le navigateur : cette coque ne revendique pas la racine du site.

Ce dossier prépare un fichier **AAB** à déposer dans la Play Console de Philippe.
Il ne publie rien et n’appelle aucun service payant. Le compte Play Console existe déjà.

## Pourquoi une Trusted Web Activity

L’espace `/app` est déjà une application web installable : manifeste (`manifest.webmanifest`, `start_url` `/app`, affichage `standalone`), service worker (`sw.js`), icônes `src/icon-192.png` et `src/icon-512.png`.

Une TWA est une fenêtre Chrome sans barre d’adresse, pointée sur cette URL. Le code de NORIA reste le site. Une mise à jour du site est visible sans nouvelle version Play, tant que l’adresse ne change pas.

Capacitor embarquerait un second projet natif et une WebView à maintenir, pour le même résultat. La bibliothèque utilisée ici est [android-browser-helper](https://github.com/GoogleChrome/android-browser-helper) 2.7.4 (Apache 2.0), la même que l’outil Bubblewrap. Bubblewrap n’est pas requis : le projet Gradle de ce dossier est la source à compiler.

`twa-manifest.json` décrit les mêmes choix (identifiant, URL, couleurs) pour qui voudrait régénérer une coque plus tard. Ne pas le donner à Play Console : Play reçoit l’AAB.

## Identité (à ne plus changer après le premier envoi)

| Champ | Valeur |
|---|---|
| Nom affiché | NORIA Élève |
| Identifiant de paquet | `ca.klirline.noria.eleve` |
| Version | `1.0.1` (versionCode `2`) |
| Adresse ouverte | `https://noriaedu.com/app` |
| SDK minimal | Android 7 (API 24) |
| SDK cible | Android 16 (API 36), exigé par Play pour une nouvelle appli |
| Icône | `src/icon-512.png` (N blanc, fond `#123048`) |
| Barre d’état | `#0E1218`, comme `theme_color` du manifeste web |

L’identifiant `ca.klirline` suit le domaine de Klirline Inc. (`contact@klirline.ca`). Une fois la fiche créée dans Play Console, ce paquet ne se renomme pas.

Le manifeste web dit encore « NORIA » : c’est le nom de l’installation depuis le navigateur, pour tous les rôles. Seule la fiche Play et le lanceur Android portent « NORIA Élève ».

## Ce que voit la personne

Même écran que `https://noriaedu.com/app` :

- mot de passe, ou code à 6 chiffres (e-mail, Telegram, SMS, WhatsApp selon ce que l’école a activé) ;
- « J’ai un code de mon école » ;
- lien d’invitation `https://noriaedu.com/app#invitation=…` et lien de réunion `https://noriaedu.com/app#reunion=…`.

Le fragment (`#invitation=`) n’est pas envoyé au serveur : c’est voulu. Après installation, ouvrir un vrai lien d’invitation depuis le téléphone et vérifier que l’écran « Activer votre compte » s’affiche. S’il retombe sur la connexion vide, le fragment a été perdu en route : la personne ouvre alors le lien dans Chrome.

La première ouverture exige le réseau. Ensuite, le service worker déjà en place peut réafficher la dernière session hors ligne, comme dans le navigateur. La session de l’appli n’est pas celle d’un onglet Chrome ouvert à côté.

Sans le fichier Digital Asset Links (plus bas), Chrome garde une barre d’adresse. L’espace fonctionne quand même. Avec le fichier en place et la vérification réussie, la barre disparaît.

Si Chrome est absent ou trop ancien, la coque retombe sur la WebView du téléphone, à la même adresse. Cette activité (`WebViewFallbackActivity`) et `ManageDataLauncherActivity` sont déclarées dans le manifeste : la bibliothèque 2.7.4 les active au démarrage. Les retirer referme l’appli tout de suite, avec le dialogue système « elle comporte un bug ».

## Prérequis (gratuits)

- JDK 17 ou 21 (`java -version`).
- Android SDK en ligne de commande, sans Android Studio : [outils de ligne de commande](https://developer.android.com/studio#command-line-tools-only). Installer au minimum `platforms;android-36` et `build-tools;35.0.0`.
- Rien à payer pour compiler. Le compte développeur Play est déjà ouvert.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"   # le dossier qui contient platforms/
cd android/eleve
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
```

`local.properties` reste sur la machine (voir `.gitignore`).

## Icônes

Déjà générées depuis `src/icon-512.png` et `src/noria-logo.png`. Pour les refaire (Python 3, Pillow) :

```bash
python3 android/eleve/scripts/generer-icones.py
```

- Lanceur : `app/src/main/res/mipmap-*/ic_launcher.png` et l’icône adaptative.
- Fiche Play, 512×512 : `play/icone-512.png`.
- Bannière de fiche, 1024×500 : `play/banniere-1024x500.png` (le mot-symbole sur le fond `#f3f2ef`). On peut la remplacer par une autre image aux mêmes dimensions.

## Produire l’AAB

La clé d’importation ne va pas dans Git. La créer une fois et la garder (coffre, pas le dépôt) : Play s’en sert pour reconnaître les mises à jour.

```bash
cd android/eleve
keytool -genkeypair -v \
  -keystore upload.jks -alias noria-eleve \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 'CHOISIR-UN-MOT-DE-PASSE' -keypass 'CHOISIR-UN-MOT-DE-PASSE' \
  -dname 'CN=NORIA Eleve, O=Klirline Inc., C=CA'
```

Copier `keystore.properties.example` vers `keystore.properties` et y mettre le mot de passe et `storeFile=upload.jks`.

```bash
chmod +x ./gradlew
./gradlew :app:bundleRelease
```

Fichier à envoyer : `app/build/outputs/bundle/release/app-release.aab`.

APK de dépannage, installable à la main, non destiné à Play :

```bash
./gradlew :app:assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

Avant chaque nouvel envoi, augmenter `versionCode` (entier) et `versionName` dans `app/build.gradle`.

## Digital Asset Links (barre d’adresse)

Play **resigne** l’appli. L’empreinte à publier est celle du **certificat de signature d’application** (Play Console → Intégrité de l’application → Signature d’applications), pas seulement celle de `upload.jks`. Les deux peuvent différer. Tant que l’appli n’a pas été envoyée une première fois en test interne, cette empreinte Play n’existe pas : faire l’envoi, copier le SHA-256, puis publier le JSON.

Modèle : `assetlinks.json.example`. Le déposer, sous le nom exact `assetlinks.json`, à :

`https://noriaedu.com/.well-known/assetlinks.json`

`Content-Type: application/json`, sans redirection. Vérification :

```bash
keytool -list -v -keystore upload.jks -alias noria-eleve
# SHA256: AA:BB:...  → coller cette forme (deux-points, majuscules) si Play utilise la même clé
curl -sI https://noriaedu.com/.well-known/assetlinks.json
```

Le serveur NORIA ne sert pas ce chemin aujourd’hui (`server/src/static.js` n’autorise que l’application, `/src/` et quelques fichiers racine). Ce dépôt ne change pas le serveur. En attendant, Caddy peut répondre tout seul, devant le reverse proxy, avec un fichier déposé sur la machine :

```
handle /.well-known/assetlinks.json {
	header Content-Type application/json
	header Cache-Control "public, max-age=3600"
	root * /etc/noria
	file_server
}
```

Le fichier sur la machine est alors `/etc/noria/.well-known/assetlinks.json`. Ce bloc n’est pas ajouté au `Caddyfile` du dépôt : c’est un réglage de la machine, au moment voulu.

Sans cette URL, la coque reste une fenêtre Chrome avec la barre d’adresse. Ce n’est pas un échec de compilation.

## Play Console — quoi remplir

Créer l’application au nom **NORIA Élève**, langue par défaut français, application (pas un jeu), gratuite. Commencer par la piste **test interne**. Ne passer en production que lorsque le lien d’invitation a été essayé sur un téléphone.

| Écran | Valeur |
|---|---|
| Nom de l’application | NORIA Élève |
| Description courte (80 caractères) | Espace de l'école pour les élèves et les familles, sur invitation. |
| Description complète | Voir le texte plus bas. |
| Icône | `play/icone-512.png` |
| Image de présentation | `play/banniere-1024x500.png` |
| Captures d’écran | Au moins deux, prises sur un téléphone : connexion `/app` et un écran élève ou parent. Pas le portail public. |
| Catégorie | Éducation |
| Coordonnées | `contact@klirline.ca` |
| Politique de confidentialité | `https://noriaedu.com/confidentialite` |
| Site (facultatif) | `https://noriaedu.com/app` |
| Publicité | Non |
| Achats intégrés | Non. Cette coque n’ajoute pas la facturation Play. Les frais de scolarité restent ceux du site. |
| Pays | Haïti, puis les autres au choix |
| Signature | Laisser Play gérer la clé de signature d’application. Garder `upload.jks` pour les prochains AAB. |

Description complète, à coller :

```
NORIA Élève ouvre l’espace de votre école : https://noriaedu.com/app

Les familles et les élèves s’y connectent avec le lien d’invitation reçu de l’école, le code remis par l’école, ou leurs identifiants. Le personnel de l’école utilise la même adresse.

Le site public (annonces, événements) n’est pas cette application : il reste dans le navigateur, sur noriaedu.com.

NORIA est un produit de Klirline Inc.
Politique de confidentialité : https://noriaedu.com/confidentialite
Contact : contact@klirline.ca
```

La description courte fait 66 caractères, sous la limite de 80.

### Public et mineurs

Des élèves mineurs entrent seulement avec un compte créé par l’école (voir la politique de confidentialité). Dans « Public cible et contenu », déclarer les âges réellement concernés, y compris les enfants si des élèves de moins de 13 ans ont un compte. Ne pas inscrire l’appli au programme « Conçue pour les familles » sans une décision explicite : ce programme ajoute des règles propres. Ceci n’est pas un avis juridique.

### Sécurité des données

La coque n’embarque ni analyse d’audience, ni publicité, ni autre SDK que la bibliothèque TWA. Elle ne collecte rien par elle-même. Dès que la personne est connectée, les données sont celles du site, décrites sur `https://noriaedu.com/confidentialite` : compte (nom, rôle, école, e-mail ou téléphone), dossier saisi par l’école, codes de connexion, appareil de confiance si la case est cochée, journaux techniques. Elles transitent en HTTPS. Elles ne sont pas vendues. Demande d’accès ou de suppression : `contact@klirline.ca`.

Le questionnaire Play doit reprendre cette politique, pas inventer une collecte propre à Android.

### Classification du contenu

Remplir le questionnaire IARC depuis la console (éducation, pas de violence, pas de chat ouvert au public). Le résultat affiché vient de Google, pas de ce dépôt.

## Hors de ce dossier

- Pas de publication, pas de piste production, pas de capture du compte Play.
- Pas de projet iOS.
- Pas de changement de l’application web, du manifeste public, ni du serveur.
