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

## Prise de parole des parents (audio seul, micro ouvert par la direction)

Réseaux faibles en Haïti : aucune vidéo, et **seule la direction (modératrice) ouvre le micro d'un parent**.

1. Le parent clique « Lever la main » → sa carte affiche « ✋ Main levée — en attente ».
2. La direction voit la main dans « Prise de parole » et clique « Donner la parole ». NORIA crée une autorisation
   (`parent_meeting_speaker`, état `accordee`) valable **60 s, à usage unique, liée à ce parent et à cette réunion**.
3. La page du parent (sondage 3 s) demande le micro et publie en WHIP sur `parole-<réunion>-<autorisation>` :
   Opus mono **≈ 24 kbit/s** (`maxBitrate` + `maxaveragebitrate=24000;stereo=0;useinbandfec=1;usedtx=1`). Le son HLS
   est mis en pause chez lui pendant qu'il parle (sinon il s'entend avec 10 s de retard) → « 🎙 Vous avez la parole ».
4. MediaMTX demande l'accord à NORIA : jeton signé `v.<réunion>.<parent>.<autorisation>.<exp>` + passage atomique
   `accordee → publie` (une seconde publication avec le même jeton est refusée). Sans jeton valable : 401.
5. Le téléphone de la direction lit cette voix en WHEP (jeton de lecture « l », direction seulement) et la mélange à son
   micro avec Web Audio : la voix part dans le même flux WHIP → HLS → R2. **Les autres parents restent sur HLS** ;
   seul l'orateur (et la direction) utilise WebRTC.
6. « Couper le micro » (direction) : l'autorisation est terminée, NORIA expulse la session par l'API MediaMTX
   (`/v3/webrtcsessions/kick`, port 9997 du réseau Docker, jamais publié, utilisateur `noria` + mot de passe dérivé de
   `NORIA_DIRECT_SECRET`), la direction cesse de mélanger, le parent voit « 🔇 Micro coupé ». Le parent peut aussi
   « Arrêter de parler » ou baisser la main, mais **ne peut jamais se redonner la parole**. Fin de diffusion = toutes
   les paroles terminées.

Un orateur à la fois par défaut ; `NORIA_PAROLE_MAX=2` en autorise deux. Chaque don/coupure est journalisé (audit).

Essai local (`/workspace/e2e-reunion/parole.js`, Chrome directeur + Chrome parent avec un ton de 1 kHz comme micro) :
publication sans jeton → 401 ; parole donnée → parent « parle » en ≈ 1 s ; ton 1 kHz dans les segments HLS envoyés à
R2 : −72 dB avant, −49 à −54 dB pendant, −72 dB après la coupure ; chemin MediaMTX supprimé après « Couper le micro »
(parent informé en ≈ 2 s) ; écoute HLS du parent en pause pendant sa parole puis reprise.

Limites : la coupure par l'API est « au mieux » (si MediaMTX ne répond pas, la direction cesse quand même de mélanger
au sondage suivant, ≤ 3 s, et le jeton ne peut pas resservir) ; écho possible si le parent écoute sur haut-parleur un
autre appareil ; la direction reçoit en plus ≈ 24 kbit/s par orateur ; retard de 10–20 s entre une question et la
réponse entendue (HLS).

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
- Prise de parole : jeton à usage unique de 60 s (voir ci-dessus) ; lecture WHEP des chemins `parole-*` réservée à la
  direction ; API MediaMTX sur le réseau Docker interne seulement, authentifiée par NORIA.
- CSP : seule l'origine `NORIA_DIRECT_URL` est ajoutée à `connect-src` et `media-src` (plus `blob:` pour hls.js).

## Essai local (sans Docker)

`/workspace/e2e-reunion/run.js` (hors dépôt) : faux R2 (vérifie la signature v4), application, MediaMTX + ffmpeg,
Caddy avec ce Caddyfile, Chrome directeur (micro simulé), 20 auditeurs simulés et un parent Chrome mobile.
