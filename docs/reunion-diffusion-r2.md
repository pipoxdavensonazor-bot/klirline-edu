# Diffusion audio des réunions de parents (WHIP → MediaMTX → HLS → R2)

But : 500 parents et plus écoutent la direction pour 0 $, sans que le son passe par le VPS (1 vCPU / 2 Go).

```
Téléphone de la direction ──WHIP (HTTPS, quelques Ko)──► Caddy /direct/whip/* ──► MediaMTX (service « diffusion »)
          └──────────── son WebRTC (UDP/TCP 8189) ───────────────────────────────►  │ ffmpeg : AAC 32 kbit/s mono, segments de 6 s
                                                                                     ▼ (tmpfs partagé /diffusion)
Parents ◄── liste HLS signée (NORIA, /api/direct/<id>/index.m3u8?t=…, no-store) ◄─ application : envoi des segments vers R2
Parents ◄── segments .ts (direct.noriaedu.com = R2 + cache Cloudflare, immutable) ◄─ (PUT, puis DELETE après 60 s)
```

Questions, main levée, présence et modération : module existant des réunions. Jitsi reste la salle des intervenants.

## Ce que Philippe doit faire (une fois, rien n'est fait sans son accord)

1. **Bucket R2** `noria-direct` (Cloudflare → R2 → Create bucket ; emplacement automatique). Ne pas activer l'URL `r2.dev`.
2. **Domaine personnalisé** : bucket → Settings → Custom Domains → `direct.noriaedu.com` (zone noriaedu.com : DNS et
   certificat créés par Cloudflare).
3. **Cache** : Rules → Cache Rules → « Eligible for cache » si `hostname eq direct.noriaedu.com` (les `.ts` ne sont pas
   dans la liste d'extensions mise en cache par défaut). Les segments sont envoyés avec
   `cache-control: public, max-age=86400, immutable` : un segment est lu une fois sur R2 par point de présence.
4. **CORS** du bucket (hls.js lit les segments en `fetch`) :
   ```json
   [{"AllowedOrigins":["https://noriaedu.com","https://www.noriaedu.com"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["range"],"MaxAgeSeconds":86400}]
   ```
5. **Cycle de vie** : bucket → Settings → Object lifecycle rules → préfixe `r/` → supprimer après 1 jour (filet de
   sécurité si l'application redémarre pendant une réunion ; d'ordinaire tout est effacé à l'arrêt).
6. **Jeton API R2** : R2 → Manage API tokens → *Object Read & Write*, **appliqué au seul bucket `noria-direct`**, sans
   expiration ou 1 an. Garder l'Access Key ID et le Secret ; ne jamais les coller dans un chat.
7. **`.env` du VPS** (passer les secrets par l'éditeur ou stdin, jamais en ligne de commande visible) :
   ```
   NORIA_DIRECT_URL=https://direct.noriaedu.com
   NORIA_DIRECT_SECRET=<openssl rand -hex 32>
   NORIA_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   NORIA_R2_BUCKET=noria-direct
   NORIA_R2_ACCESS_KEY_ID=…
   NORIA_R2_SECRET_ACCESS_KEY=…
   NORIA_DIRECT_IP=<IP publique du VPS>
   COMPOSE_PROFILES=diffusion
   ```
8. **Pare-feu** : ouvrir UDP 8189 et TCP 8189 (ufw et, si Docker publie le port, la chaîne DOCKER-USER). Si le site est
   derrière le proxy Cloudflare, ce port est joint directement sur l'IP du VPS (le proxy ne transporte pas WebRTC) :
   l'IP d'origine est alors visible du seul téléphone de la direction.
9. `docker compose up -d` (le profil `diffusion` démarre MediaMTX), puis essai avec deux téléphones.

## Coût : 0 $ (offre gratuite R2, vérifiée sur la base des mesures locales)

| Poste | Gratuit / mois | Une réunion de 2 h, 500 parents |
|---|---|---|
| Stockage | 10 Go-mois | ≈ 0,4 Mo à un instant donné (≈ 16 segments × 25 Ko) |
| Opérations classe A (PUT) | 1 000 000 | ≈ 1 200 (un segment / 6 s) ; DELETE gratuits |
| Opérations classe B (GET sur R2) | 10 000 000 | avec cache : ≈ 1 200 × nb de points de présence (quelques milliers) ; **sans** cache : ≈ 600 000 |
| Sortie (egress) | illimitée, gratuite | ≈ 18 Mo par parent et par heure (mesuré : 40,6 kbit/s) |

Sans règle de cache, 10 M de GET couvrent encore ≈ 16 réunions de 2 h à 500 parents par mois. Contrôle mensuel :
R2 → noria-direct → Metrics (opérations A/B, stockage). Option : alerte de facturation à 1 $.

## Sécurité

- Seuls les parents liés à un élève de l'école (et la direction) reçoivent une liste ; jeton HMAC (3 h, une réunion,
  un utilisateur), vérifié à chaque rafraîchissement ; chemin R2 `r/<réunion>-<clé aléatoire 128 bits>/`, nouvelle clé à
  chaque démarrage. Les segments ne sont pas chiffrés : quelqu'un qui reçoit l'URL d'un segment pendant la réunion peut
  l'écouter (même niveau qu'un appel Jitsi ouvert).
- Publication : jeton de publication (4 h) vérifié par MediaMTX via `/api/interne/diffusion/auth` (réseau Docker ;
  Caddy répond 404 de l'extérieur). Lecture RTSP réservée à 127.0.0.1 (ffmpeg du conteneur).
- CSP : seule l'origine `NORIA_DIRECT_URL` est ajoutée à `connect-src` et `media-src` (plus `blob:` pour hls.js).

## Essai local (sans Docker)

`/workspace/e2e-reunion/run.js` (hors dépôt) : faux R2 (vérifie la signature v4), application, MediaMTX + ffmpeg,
Caddy avec ce Caddyfile, Chrome directeur (micro simulé), 20 auditeurs simulés et un parent Chrome mobile.
