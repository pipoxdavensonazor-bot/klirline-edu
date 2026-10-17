# Déployer NORIA en HTTPS

Ce guide met NORIA en ligne sur un **petit VPS Ubuntu (10 à 12 $/mois avec sauvegardes)** avec Docker : l'application, PostgreSQL 16 et Caddy (certificat HTTPS automatique) tournent sur la même machine. Aucun hébergeur n'est imposé : tout fournisseur qui loue un VPS Ubuntu 24.04 convient (Vultr, DigitalOcean, Linode/Akamai, AWS Lightsail, OVH…). **Configuration retenue pour le lancement : `noriaedu.com` + Vultr Miami 2 Go + Cloudflare Free, pas à pas en [section 9](#9-mise-en-ligne--noriaeducom--vultr-miami--cloudflare-free).**

> Données réelles d'élèves = données personnelles de mineurs. Avant d'y mettre une vraie école : sauvegardes testées (section 6), accès SSH par clé seulement, et accord écrit de l'école sur l'hébergement.

## 1. Ce qu'il faut avant de commencer

| Élément | Exemple | Coût indicatif |
|---|---|---|
| Un nom de domaine | `noriaedu.com` (Cloudflare Registrar, prix coûtant) ; sous-domaine d'un domaine existant : gratuit | 10,46 $/an pour un `.com` ; `.ht` ≈ 85–95 $/an (hors Cloudflare) |
| Un VPS Ubuntu 24.04, 1 vCPU, 2 Go de RAM, 20 Go+ de disque | Vultr Miami 2 Go (10 $ + 2 $ de sauvegardes), DigitalOcean New York 2 Go (12 $), Linode Miami 2 Go (12 $), Lightsail 2 Go (12 $) | 10–14,50 $/mois |
| Un bucket compatible S3 pour les sauvegardes hors site | Cloudflare R2 (10 Go gratuits), Backblaze B2 (≈ 6 $/To/mois) | 0–1 $/mois au début |
| Un fournisseur SMS et/ou e-mail | Twilio, Resend, SMTP de l'école | à l'usage |

1 Go de RAM suffit pour une ou quelques écoles (l'application est limitée à 384 Mo) ; 2 Go laissent de la marge à PostgreSQL. Pour ~20 écoles : 2 vCPU / 4 Go (Vultr 20 $ + 4 $ de sauvegardes). Choisir de préférence une région proche d'Haïti (Miami, puis Atlanta, New York) pour la latence.

> Prix relevés le 17 octobre 2026 sur les pages officielles (USD, hors taxes). Hetzner n'est plus conseillé aux États-Unis : depuis la hausse du 15 juin 2026, son plus petit serveur à Ashburn (CPX11, 2 vCPU / 2 Go) coûte 20,49 $ + 0,60 $ d'IPv4 par mois ; les offres CX bon marché sont réservées à l'Europe (trop loin d'Haïti).

## 2. Préparer le serveur (une fois)

```bash
ssh root@IP_DU_SERVEUR
apt update && apt upgrade -y
adduser noria && usermod -aG sudo noria          # compte d'administration
# Copier votre clé SSH publique dans /home/noria/.ssh/authorized_keys, puis dans /etc/ssh/sshd_config :
#   PasswordAuthentication no   et   PermitRootLogin no      →  systemctl restart ssh
apt install -y unattended-upgrades ufw age curl git
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
# Derrière Cloudflare : remplacer l'ouverture générale de 80/443 par deploy/cloudflare/pare-feu.sh (section 9.6).
# Docker (dépôt officiel) :
curl -fsSL https://get.docker.com | sh
usermod -aG docker noria
```

Une petite mémoire d'échange évite qu'un pic de mémoire n'arrête PostgreSQL sur un VPS de 1 Go :

```bash
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Domaine

Chez le gestionnaire DNS, créer un enregistrement **A** `noria.exemple.ht → IP_DU_SERVEUR` (et **AAAA** si le VPS a une IPv6). Avec Cloudflare : section 9 (enregistrements proxifiés, certificat d'origine). Attendre qu'il réponde : `dig +short noria.exemple.ht`. Caddy ne peut obtenir le certificat qu'une fois le DNS en place et les ports 80/443 ouverts.

## 4. Installer NORIA

```bash
sudo mkdir -p /opt/noria && sudo chown noria: /opt/noria
git clone https://github.com/pipoxdavensonazor-bot/klirline-edu.git /opt/noria   # dépôt privé : jeton ou clé de déploiement
cd /opt/noria
cp .env.example .env && chmod 600 .env
nano .env        # NORIA_DOMAIN, POSTGRES_PASSWORD (openssl rand -hex 32), fournisseurs SMS / e-mail
docker compose up -d --build
docker compose ps            # app « healthy », caddy « running »
docker compose logs -f caddy # « certificate obtained successfully »
```

Ouvrir `https://noria.exemple.ht`. La base est vide : créer la première école et le compte de direction (voir `server/README.md`). `NORIA_DEMO=1` est refusé en production.

### Ce que fait la pile

- **Caddy** : certificat Let's Encrypt obtenu et renouvelé seul, redirection HTTP → HTTPS, HTTP/2 et HTTP/3, **HSTS** (1 an), compression zstd/gzip. Les pages HTML appellent les fichiers de l'interface avec `?v=<empreinte du contenu de src/>` : avec la version courante, ces fichiers sont « immutable » (1 an) ; sans `?v=`, cache d'un jour (revalidé par ETag). `index.html` et `sw.js` ne sont jamais mis en cache : après un déploiement, la nouvelle page appelle de nouvelles URL, donc aucun cache (navigateur, Cloudflare) ne sert d'ancienne version. Le portail public est servi sur `/` (pages en cache public 60 s), l'application des écoles sur `/app` (voir `docs/portail-public.md`) ; définir `NORIA_PUBLIC_URL` pour des adresses absolues correctes (Open Graph, plan du site). `/healthz` n'est pas exposé publiquement.
- **Application** : image multi-étape, utilisateur `node` (non root), système de fichiers en lecture seule, aucune capacité Linux, `NODE_ENV=production` donc **cookies `Secure`**, adresse du client lue dans `X-Forwarded-For` posé par Caddy (`NORIA_TRUST_PROXY=1`) pour le limiteur de connexions, **arrêt propre** sur `SIGTERM` (les requêtes en cours se terminent, la base est fermée, 10 s au plus).
- **PostgreSQL 16** : jamais exposé sur Internet, données dans le volume `pgdata`, sommes de contrôle activées. L'application passe par le rôle `noria_app` soumis aux politiques RLS (créé par les migrations).

## 5. Mettre à jour

```bash
cd /opt/noria && git pull && docker compose up -d --build
```

Les migrations s'appliquent au démarrage. Faire une sauvegarde juste avant (`sudo deploy/sauvegarde/noria-sauvegarde.sh`). L'application est indisponible quelques secondes pendant le redémarrage.

## 6. Sauvegardes (obligatoire avant des données réelles)

`deploy/sauvegarde/noria-sauvegarde.sh` :

1. `pg_dump --format=custom` dans le conteneur `db` (même version que le serveur, rien à installer sur l'hôte) ;
2. chiffrement **age** (recommandé : seule la clé publique est sur le serveur ; un pirate du serveur ne peut pas lire les anciennes sauvegardes) ou **AES-256-GCM** avec une clé tirée de l'environnement (`NORIA_BACKUP_KEY`, `server/scripts/chiffrer.js` ; `openssl enc` ne gère pas GCM) ;
3. copie locale dans `/var/backups/noria/{quotidien,hebdomadaire,mensuel}` avec empreinte SHA-256 ;
4. envoi hors site vers R2, B2 ou S3 avec `curl --aws-sigv4` seul (pas de SDK ; identifiants passés à curl par l'entrée standard) ;
5. rotation, en local et dans le bucket : **7 quotidiennes, 4 hebdomadaires (dimanche), 12 mensuelles (le 1er)**.

### Installation

```bash
# Clé age : à créer SUR VOTRE ORDINATEUR, pas sur le serveur
age-keygen -o noria-sauvegarde.key       # affiche « public key: age1… » ; ranger ce fichier dans 2 endroits sûrs hors ligne
# Sur le serveur :
sudo mkdir -p /etc/noria && sudo cp deploy/sauvegarde/sauvegarde.env.example /etc/noria/sauvegarde.env
sudo chmod 600 /etc/noria/sauvegarde.env && sudo nano /etc/noria/sauvegarde.env   # clé publique age, bucket, clés S3
sudo deploy/sauvegarde/noria-sauvegarde.sh          # premier essai
sudo deploy/sauvegarde/noria-sauvegarde.sh lister
```

Bucket : le créer **privé**, avec une clé d'accès limitée à ce seul bucket (R2 : « API token » Object Read & Write sur le bucket ; B2 : « application key » restreinte au bucket). Facultatif mais conseillé : activer le verrouillage d'objets ou le versionnage pour qu'une clé volée ne puisse pas tout effacer.

### Planification — minuteur systemd (recommandé)

```bash
sudo cp deploy/systemd/noria-sauvegarde.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now noria-sauvegarde.timer
systemctl list-timers noria-sauvegarde.timer        # prochaine exécution (03:15 chaque nuit)
journalctl -u noria-sauvegarde.service -n 50         # journal de la dernière sauvegarde
```

`Persistent=true` rattrape une sauvegarde manquée si le serveur était éteint à 03:15.

### Ou cron

```cron
# /etc/cron.d/noria-sauvegarde
15 3 * * * root NORIA_BACKUP_ENV=/etc/noria/sauvegarde.env /opt/noria/deploy/sauvegarde/noria-sauvegarde.sh >> /var/log/noria-sauvegarde.log 2>&1
```

Pour être prévenu d'un échec, renseigner `NORIA_BACKUP_PING_URL` (Healthchecks.io gratuit : alerte par e-mail si le signal n'arrive pas).

### Restaurer

La restauration se fait **toujours dans une base vide** (le script refuse sinon) :

```bash
cd /opt/noria
docker compose exec db createdb -U noria noria_restau
scp noria-sauvegarde.key noria@serveur:/tmp/          # clé privée, le temps de la restauration
sudo NORIA_BACKUP_AGE_IDENTITY=/tmp/noria-sauvegarde.key POSTGRES_DB=noria_restau \
  deploy/sauvegarde/noria-restauration.sh dernier     # ou s3:noria/mensuel/noria-2026-10-01T031500Z.dump.age
shred -u /tmp/noria-sauvegarde.key
```

Pour basculer : `docker compose stop app`, renommer les bases (`ALTER DATABASE noria RENAME TO noria_ancienne; ALTER DATABASE noria_restau RENAME TO noria;`), `docker compose start app`. Les sessions sont conservées dans la sauvegarde pg_dump ; forcer une reconnexion avec `DELETE FROM session;` si la restauration fait suite à un incident de sécurité.

**Tester une restauration une fois par trimestre** : une sauvegarde jamais restaurée n'est pas une sauvegarde. La CI le fait à chaque commit (`deploy/sauvegarde/test-ci.sh` : sauvegarde, restauration dans une base vide, comparaison des données, séquences, politiques RLS et schéma ; fichier altéré refusé ; rotation ; envoi et restauration depuis un S3 de test (moto)).

## 7. Surveillance minimale

- Disponibilité : un moniteur externe gratuit (UptimeRobot, Healthchecks) sur `https://noria.exemple.ht/`.
- Disque : `df -h` ; les journaux Docker sont à limiter (`/etc/docker/daemon.json` : `{"log-driver":"local"}` puis `systemctl restart docker`).
- Mises à jour de sécurité : `unattended-upgrades` (installé plus haut) ; images : `docker compose pull && docker compose up -d --build` chaque mois.

## 8. Variante sans serveur à gérer : Railway ou Render

Le `Dockerfile` fonctionne tel quel sur une plateforme qui construit une image et fournit l'HTTPS :

- **Render** : « New Web Service » depuis le dépôt (Docker), plus « PostgreSQL » géré. Variables : `DATABASE_URL` (URL interne fournie), `NORIA_PUBLIC_URL=https://…`, `NORIA_TRUST_PROXY=1`, fournisseurs SMS/e-mail. Health check path : `/healthz`. Compter ≈ 7 $ (service) + ≈ 7 $ (base) par mois ; les offres gratuites s'endorment et la base gratuite expire : pas pour des données réelles.
- **Railway** : projet depuis le dépôt + extension PostgreSQL ; mêmes variables (`DATABASE_URL=${{Postgres.DATABASE_URL}}`), healthcheck `/healthz`. Facturation à l'usage, ≈ 5–10 $/mois pour une petite école.

Points d'attention : Caddy n'est pas utilisé (la plateforme fait l'HTTPS ; vérifier que HSTS est bien envoyé — l'application l'envoie déjà), et la base gérée doit accepter `CREATE ROLE noria_app` et `SET ROLE` (rôle propriétaire de la base). Les sauvegardes de la plateforme ne remplacent pas une copie hors site chiffrée : lancer `noria-sauvegarde.sh` avec `DATABASE_URL` depuis une autre machine (ou une tâche planifiée de la plateforme) et un client `pg_dump` 16.

## 9. Mise en ligne : noriaedu.com + Vultr Miami + Cloudflare Free

Configuration retenue : domaine **`noriaedu.com`** (Cloudflare Registrar), VPS **Vultr Miami 1 vCPU / 2 Go** avec sauvegardes automatiques, **Cloudflare Free** devant (DNS, proxy, HTTPS, cache, pare-feu applicatif). Coût : **12 $/mois + 10,46 $/an ≈ 154,46 $/an**.

Le portail public est servi sur `/` et l'application des écoles sur `/app` du **même nom** : un seul nom d'hôte (`noriaedu.com`), pas de sous-domaine `app`.

Les étapes marquées **(Philippe)** se font dans les comptes à son nom (paiement, identité) ; les autres sur le serveur.

### 9.1 Domaine — Cloudflare Registrar (Philippe)

1. <https://dash.cloudflare.com> → **Domain Registration → Register Domains** → `noriaedu.com` → payer (10,46 $/an, renouvellement au même prix).
2. Vérifier : **renouvellement automatique** activé, **verrou de transfert** activé, coordonnées du titulaire exactes (l'ICANN envoie un e-mail de vérification à valider sous 15 jours).
3. La zone est créée automatiquement sur Cloudflare (serveurs de noms Cloudflare imposés par le Registrar). **DNS → Settings → DNSSEC : activer.**

### 9.2 VPS — Vultr Miami (Philippe)

1. <https://www.vultr.com> : créer le compte, ajouter une carte, activer l'**authentification à deux facteurs** (Vultr peut demander une vérification d'identité).
2. **Deploy → Cloud Compute – Shared CPU → Regular Performance**, région **Miami**, image **Ubuntu 24.04 LTS x64**, offre **1 vCPU / 2 Go / 55 Go (10 $/mois)**, **Automatic Backups** activé (+ 2 $/mois), **IPv6** activé, **clé SSH** ajoutée (pas de mot de passe), nom `noria-mia-1`.
3. Noter l'IPv4 et l'IPv6 du serveur.

Puis, sur le serveur : sections **2** (préparation, mémoire d'échange) et **4** (installation, sans lancer `docker compose up` avant l'étape 9.5).

### 9.3 DNS — enregistrements proxifiés (Philippe)

Cloudflare → `noriaedu.com` → **DNS → Records** :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `@` (noriaedu.com) | IPv4 du VPS | **Proxifié** (nuage orange) |
| AAAA | `@` | IPv6 du VPS | **Proxifié** |
| CNAME | `www` | `noriaedu.com` | **Proxifié** |

Puis **Rules → Redirect Rules → modèle « Redirect from WWW to root »** (301 vers `https://noriaedu.com`). Ne pas proxifier d'éventuels enregistrements de messagerie (MX, `mail`).

### 9.4 HTTPS — Full (strict) et certificat d'origine (Philippe)

1. **SSL/TLS → Overview : Full (strict).** Jamais « Flexible » (le trafic Cloudflare → serveur serait en clair).
2. **SSL/TLS → Edge Certificates** : *Always Use HTTPS* activé, *Minimum TLS Version* 1.2, *TLS 1.3* activé. HSTS est déjà envoyé par Caddy et l'application (1 an) : inutile de l'activer aussi chez Cloudflare.
3. **SSL/TLS → Origin Server → Create Certificate** : clé générée par Cloudflare (RSA 2048 ou ECC), noms `noriaedu.com` et `*.noriaedu.com`, validité 15 ans, format PEM. La **clé privée n'est affichée qu'une fois** : la copier directement sur le serveur.

Sur le serveur :

```bash
cd /opt/noria
sudo nano deploy/certs/origine.pem     # coller « Origin Certificate »
sudo nano deploy/certs/origine.key     # coller « Private Key »
sudo chown root:root deploy/certs/origine.* && sudo chmod 600 deploy/certs/origine.key && sudo chmod 644 deploy/certs/origine.pem
```

`deploy/certs/` est exclu de Git (`.gitignore`) et de l'image Docker. Autre emplacement possible : `NORIA_CF_CERTS_HOTE=/etc/noria/certs` dans `.env`. Ce certificat n'est reconnu que par Cloudflare : le proxy (nuage orange) doit rester actif (pour revenir à Let's Encrypt, voir 9.11).

### 9.5 Variables de production et démarrage

`/opt/noria/.env` (`chmod 600`, jamais versionné) — générer chaque secret avec `openssl rand -hex 32` :

```bash
NORIA_DOMAIN=noriaedu.com
NORIA_DERRIERE_CLOUDFLARE=1        # Caddy derrière Cloudflare : CF-Connecting-IP + certificat d'origine
POSTGRES_PASSWORD=…                # openssl rand -hex 32
NORIA_CLE_MAITRE=…                 # openssl rand -hex 32 — à garder AUSSI hors du serveur (coffre)
NORIA_OTP_SECRET=…                 # openssl rand -hex 32
NORIA_SMS_PROVIDER=…               # twilio | http (sinon simulé)
NORIA_EMAIL_PROVIDER=…             # resend | smtp (sinon simulé)
```

Fixés par `docker-compose.yml`, à ne pas mettre dans `.env` : `NODE_ENV=production`, `NORIA_TRUST_PROXY=1` (l'application lit l'adresse du client dans `X-Forwarded-For`, que Caddy réécrit toujours avec l'adresse réelle), `NORIA_PUBLIC_URL=https://noriaedu.com`, `DATABASE_URL`. La clé des sauvegardes (`NORIA_BACKUP_AGE_RECIPIENT`, ou `NORIA_BACKUP_KEY`) va dans `/etc/noria/sauvegarde.env` (section 6 et 9.8).

```bash
docker compose up -d --build
docker compose ps                         # app « healthy », caddy « running »
docker compose logs caddy | tail          # aucune tentative Let's Encrypt en mode 1
curl -sI https://noriaedu.com/ | grep -iE '^(HTTP|server|cf-ray)'   # HTTP/2 200, server: cloudflare
```

**Ce que change le mode `NORIA_DERRIERE_CLOUDFLARE=1`** (`deploy/Caddyfile`, `deploy/cloudflare/`) :

- Caddy ne croit l'en-tête `CF-Connecting-IP` que pour les connexions venant des **plages IP Cloudflare** (`deploy/cloudflare/plages.caddy`) ; une requête directe sur l'IP du serveur qui le falsifie est traitée avec sa vraie adresse. Caddy remplace ensuite `X-Forwarded-For` par cette adresse réelle : le limiteur de connexions et le blocage d'IP de l'assistant sécurité visent bien le visiteur, et pas Cloudflare (sans ce mode, tous les visiteurs partageraient quelques adresses Cloudflare et se bloqueraient entre eux). Test : `server/test/cloudflare.test.js`.
- Le certificat d'origine remplace Let's Encrypt (mode SSL Full (strict)).
- Le mode 0 (défaut) reste celui d'un serveur sans Cloudflare : Let's Encrypt, aucun en-tête d'adresse entrant n'est cru.

### 9.6 Pare-feu : 80/443 pour Cloudflare seulement

```bash
sudo deploy/cloudflare/pare-feu.sh --essai                 # affiche ce qui sera fait
sudo deploy/cloudflare/pare-feu.sh                         # SSH (port 22, « limit ») + 80/443 depuis Cloudflare
sudo deploy/cloudflare/pare-feu.sh --ssh-depuis 203.0.113.7   # variante : SSH depuis une seule adresse fixe
```

- SSH est autorisé **avant** l'activation (pas de coupure d'accès) ; tout le reste est fermé en entrée.
- Docker publie les ports de Caddy en contournant les règles ufw d'entrée : le script ajoute donc aussi un bloc géré dans `/etc/ufw/after.rules` et `after6.rules` (chaîne `DOCKER-USER`, rechargée au démarrage) qui rejette, sur l'interface publique, les connexions vers 80/443 hors plages Cloudflare. Les connexions sortantes des conteneurs (SMS, e-mail, sauvegardes) ne sont pas concernées.
- Contrôle depuis une autre machine : `curl -m 5 -kI https://IP_DU_SERVEUR/` doit échouer (délai dépassé) alors que `https://noriaedu.com` répond.

**Plages Cloudflare à jour** (elles changent rarement) — une fois par mois, ou si l'assistant ou un journal le signale :

```bash
deploy/cloudflare/maj-plages.sh --verifier || { deploy/cloudflare/maj-plages.sh && docker compose restart caddy && sudo deploy/cloudflare/pare-feu.sh; }
```

### 9.7 Réglages Cloudflare (Philippe)

**À désactiver** — ils injectent des scripts ou réécrivent les pages, ce que la CSP stricte de NORIA (`script-src 'self'`, aucun script en ligne) refuse, ou ils bloquent les appels de l'application :

| Réglage | Où (tableau de bord Cloudflare) |
|---|---|
| **Rocket Loader** | Speed → Optimization → Content Optimization |
| **Email Address Obfuscation** | Security → Settings (anciennement Scrape Shield) |
| **Web Analytics automatique** (RUM) | Analytics & Logs → Web Analytics → `noriaedu.com` : désactiver l'installation automatique |
| **Zaraz** | Zaraz : ne pas activer (ou désactiver) |
| **Bot Fight Mode** | Security → Bots : désactivé (ses défis JavaScript cassent les appels `/api` et l'application hors ligne) |
| « I'm Under Attack » | Security → Settings : seulement en cas d'attaque, et brièvement (même raison) |

**Cache** : laisser *Caching Level* sur *Standard* et *Browser Cache TTL* sur *Respect Existing Headers*. Ne **jamais** créer de règle « Cache Everything » : `/app`, `/api` et les pages connectées contiennent des données personnelles (l'application envoie `no-store` / `no-cache`, que Cloudflare respecte).

**Pare-feu applicatif (WAF)** :

- Le jeu de règles gérées gratuit (*Free Managed Ruleset*) est actif par défaut : le laisser.
- **Security → Security rules → Rate limiting rules** (plan Free : 1 règle, champ *Path*, comptage par IP, période et blocage de 10 s) :
  - nom « Connexions », expression `(http.request.uri.path contains "/login")` ;
  - **20 requêtes / 10 s**, action *Block*, 10 s.
  - Seuil volontairement large : une école entière sort souvent par une seule adresse IP (NAT). Le limiteur de NORIA (par compte et par IP) fait le contrôle fin.

### 9.8 Sauvegardes hors site — Cloudflare R2 (Philippe, puis serveur)

1. **R2 → Get started** (demande un moyen de paiement même pour l'offre gratuite : 10 Go/mois inclus, puis ≈ 0,015 $/Go/mois).
2. **Create bucket** `noria-sauvegardes`, emplacement *Eastern North America (ENAM)*, accès public **désactivé**.
3. **Manage API tokens → Create API token** : permission *Object Read & Write*, limitée au bucket `noria-sauvegardes`. Noter l'*Access Key ID*, le *Secret Access Key* et l'ID du compte.
4. Sur le serveur, `/etc/noria/sauvegarde.env` (section 6) : `S3_ENDPOINT=https://<ID_COMPTE>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET=noria-sauvegardes`, `S3_ACCESS_KEY_ID=…`, `S3_SECRET_ACCESS_KEY=…`, plus la clé publique age (`NORIA_BACKUP_AGE_RECIPIENT`) ou `NORIA_BACKUP_KEY`. Puis premier essai et minuteur systemd (section 6).

Les sauvegardes automatiques de Vultr (image complète du disque) s'ajoutent à celles-ci, sans les remplacer : elles restent chez le même fournisseur et ne sont pas chiffrées par NORIA.

### 9.9 Mises à jour et cache

```bash
cd /opt/noria && sudo deploy/sauvegarde/noria-sauvegarde.sh && git pull && docker compose up -d --build
```

Aucune purge du cache n'est nécessaire : `index.html` et `sw.js` ne sont jamais mis en cache, et les pages appellent les fichiers avec `?v=<empreinte>` qui change à chaque modification. Pour les rares URL non versionnées (manifeste, images du portail), purge facultative :

```bash
# /etc/noria/cloudflare.env (chmod 600) : CF_API_TOKEN=… (jeton « Zone → Cache Purge » limité à noriaedu.com)  CF_ZONE_ID=…
sudo deploy/cloudflare/purge-cache.sh                                           # tout
sudo deploy/cloudflare/purge-cache.sh https://noriaedu.com/manifest.webmanifest # ou des URL précises
```

### 9.10 Adresses e-mail des élèves (bloc 7, plus tard)

Le domaine étant sur Cloudflare, **Email Routing** est disponible gratuitement (200 règles par domaine, 200 destinations vérifiées par compte) :

- adresses sur un sous-domaine, par exemple `NORIA_EMAIL_DOMAINE=eleve.noriaedu.com` ;
- **Email → Email Routing → Settings** : ajouter le sous-domaine ;
- détails dans [docs/emails-eleves.md](docs/emails-eleves.md).

### 9.11 Revenir au mode direct (sans proxy Cloudflare)

1. DNS : nuage **gris** sur `@` et `www`.
2. `.env` : `NORIA_DERRIERE_CLOUDFLARE=0`.
3. Pare-feu :
   - `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp` ;
   - retirer le bloc `NORIA-CLOUDFLARE` de `/etc/ufw/after.rules` et `after6.rules` ;
   - `sudo ufw reload`.
4. `docker compose up -d caddy` : Caddy obtient alors un certificat Let's Encrypt.

## Assistant sécurité (super-admin)

L'onglet « Assistant sécurité » de `/#admin` surveille les connexions, les intrusions, la santé du serveur, la
configuration et les dépendances. Il ne fait jamais rien seul : chaque action demande une confirmation, et un code
pour les actions critiques. Réglages : `.env.example`, section « Assistant sécurité ». Détail des règles et des
actions : [docs/securite-assistant.md](docs/securite-assistant.md).
- Les sauvegardes de l'hôte (`/var/backups/noria`, ou `NORIA_BACKUP_DIR_HOTE`) sont montées en lecture seule dans
  `/sauvegardes`. Au-delà de 26 h sans nouvelle sauvegarde, l'assistant lève une alerte critique.
- Rapport de dépendances : `cd server && npm run audit:rapport -- ../deploy/rapports/npm-audit.json`, ou bien
  l'artefact `npm-audit` de la CI, déposé dans `deploy/rapports/`.
