# Déployer NORIA en HTTPS

Ce guide met NORIA en ligne sur un **petit VPS Ubuntu (≈ 5 $/mois)** avec Docker : l'application, PostgreSQL 16 et Caddy (certificat HTTPS automatique) tournent sur la même machine. Aucun hébergeur n'est imposé : tout fournisseur qui loue un VPS Ubuntu 24.04 convient (Hetzner, DigitalOcean, Vultr, Linode/Akamai, OVH, Scaleway…).

> Données réelles d'élèves = données personnelles de mineurs. Avant d'y mettre une vraie école : sauvegardes testées (section 6), accès SSH par clé seulement, et accord écrit de l'école sur l'hébergement.

## 1. Ce qu'il faut avant de commencer

| Élément | Exemple | Coût indicatif |
|---|---|---|
| Un nom de domaine | `noria.exemple.ht` (sous-domaine d'un domaine existant : gratuit) | 10–15 $/an pour un `.com` ; `.ht` variable |
| Un VPS Ubuntu 24.04, 1 vCPU, 1–2 Go de RAM, 20 Go+ de disque | Hetzner CX22, DigitalOcean Basic 1 Go, Vultr 1 Go | 4–6 $/mois |
| Un bucket compatible S3 pour les sauvegardes hors site | Cloudflare R2 (10 Go gratuits), Backblaze B2 (≈ 6 $/To/mois) | 0–1 $/mois au début |
| Un fournisseur SMS et/ou e-mail | Twilio, Resend, SMTP de l'école | à l'usage |

1 Go de RAM suffit pour une ou quelques écoles (l'application est limitée à 384 Mo). Choisir de préférence une région proche d'Haïti (Miami, New York, Atlanta) pour la latence.

## 2. Préparer le serveur (une fois)

```bash
ssh root@IP_DU_SERVEUR
apt update && apt upgrade -y
adduser noria && usermod -aG sudo noria          # compte d'administration
# Copier votre clé SSH publique dans /home/noria/.ssh/authorized_keys, puis dans /etc/ssh/sshd_config :
#   PasswordAuthentication no   et   PermitRootLogin no      →  systemctl restart ssh
apt install -y unattended-upgrades ufw age curl git
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
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

Chez le gestionnaire DNS, créer un enregistrement **A** `noria.exemple.ht → IP_DU_SERVEUR` (et **AAAA** si le VPS a une IPv6). Attendre qu'il réponde : `dig +short noria.exemple.ht`. Caddy ne peut obtenir le certificat qu'une fois le DNS en place et les ports 80/443 ouverts.

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

- **Caddy** : certificat Let's Encrypt obtenu et renouvelé seul, redirection HTTP → HTTPS, HTTP/2 et HTTP/3, **HSTS** (1 an), compression zstd/gzip, cache d'un jour pour `/src/*` (revalidé par ETag), `index.html` et `sw.js` jamais mis en cache (mises à jour immédiates). `/healthz` n'est pas exposé publiquement.
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

**Tester une restauration une fois par trimestre** : une sauvegarde jamais restaurée n'est pas une sauvegarde. La CI le fait à chaque commit (`deploy/sauvegarde/test-ci.sh` : sauvegarde, restauration dans une base vide, comparaison des données, séquences, politiques RLS et schéma ; fichier altéré refusé ; rotation ; envoi et restauration depuis un S3 MinIO).

## 7. Surveillance minimale

- Disponibilité : un moniteur externe gratuit (UptimeRobot, Healthchecks) sur `https://noria.exemple.ht/`.
- Disque : `df -h` ; les journaux Docker sont à limiter (`/etc/docker/daemon.json` : `{"log-driver":"local"}` puis `systemctl restart docker`).
- Mises à jour de sécurité : `unattended-upgrades` (installé plus haut) ; images : `docker compose pull && docker compose up -d --build` chaque mois.

## 8. Variante sans serveur à gérer : Railway ou Render

Le `Dockerfile` fonctionne tel quel sur une plateforme qui construit une image et fournit l'HTTPS :

- **Render** : « New Web Service » depuis le dépôt (Docker), plus « PostgreSQL » géré. Variables : `DATABASE_URL` (URL interne fournie), `NORIA_PUBLIC_URL=https://…`, `NORIA_TRUST_PROXY=1`, fournisseurs SMS/e-mail. Health check path : `/healthz`. Compter ≈ 7 $ (service) + ≈ 7 $ (base) par mois ; les offres gratuites s'endorment et la base gratuite expire : pas pour des données réelles.
- **Railway** : projet depuis le dépôt + extension PostgreSQL ; mêmes variables (`DATABASE_URL=${{Postgres.DATABASE_URL}}`), healthcheck `/healthz`. Facturation à l'usage, ≈ 5–10 $/mois pour une petite école.

Points d'attention : Caddy n'est pas utilisé (la plateforme fait l'HTTPS ; vérifier que HSTS est bien envoyé — l'application l'envoie déjà), et la base gérée doit accepter `CREATE ROLE noria_app` et `SET ROLE` (rôle propriétaire de la base). Les sauvegardes de la plateforme ne remplacent pas une copie hors site chiffrée : lancer `noria-sauvegarde.sh` avec `DATABASE_URL` depuis une autre machine (ou une tâche planifiée de la plateforme) et un client `pg_dump` 16.
