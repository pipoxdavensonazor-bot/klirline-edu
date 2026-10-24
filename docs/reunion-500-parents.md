# Réunions de parents à 500 participants et plus

## Principe
- **Jitsi reste réservé aux intervenants** (direction, secrétariat, enseignants qui parlent : 2 à 6 personnes). Au-delà du seuil
  (`seuil_jitsi`, 40 par défaut), NORIA ne remet jamais le lien Jitsi aux parents.
- **Les parents reçoivent un flux à sens unique** : audio Opus/AAC 32–64 kbit/s (ou vidéo 240p ≈ 200–300 kbit/s) en HLS ou Icecast,
  lu par la balise `<audio>` du navigateur. Fonctionne en 2G/3G, sans compte Jitsi, sans WebRTC.
- **Questions, main levée et présence passent par NORIA** (HTTP simple) : sondage toutes les 10 s en direct, 60 s avant le début,
  arrêt à la fin, pause quand l'onglet est caché, recul ×2 en cas d'erreur (max 5 min). La présence est écrite une fois par minute
  et par parent au plus : 500 parents ≈ 50 requêtes/s légères, sans corps volumineux.
- Un intervenant (ou un PC dans la salle Jitsi) pousse le son vers le serveur de diffusion (RTMP/SRT/WHIP), et l'URL publique du flux
  est saisie dans la réunion NORIA.

## Options comparées
| Option | Rôle | Avantages | Limites |
|---|---|---|---|
| **Jitsi Meet** (meet.jit.si ou auto-hébergé) | salle des intervenants | gratuit, déjà intégré | WebRTC maillé via JVB : pas fait pour 500 écouteurs ; meet.jit.si limite et peut exiger une connexion |
| **Jitsi + Jibri → RTMP** | pont salle → flux | officiel | Jibri lourd (Chrome + ffmpeg, ~4 vCPU / 8 Go par session) |
| **Galène** | visioconférence légère | un seul binaire Go, faible RAM | reste du WebRTC SFU : 500 flux sortants ≈ autant de bande passante que HLS mais avec plus de CPU |
| **LiveKit** | SFU moderne, egress HLS | évolutif, egress RTMP/HLS intégré | plus complexe ; LiveKit Cloud payant au-delà du palier gratuit |
| **Owncast** | diffusion + chat | tout-en-un, RTMP en entrée, HLS en sortie | une seule chaîne par instance |
| **MediaMTX** | serveur média | un binaire, RTMP/SRT/WHIP en entrée, HLS/WebRTC en sortie, très peu de CPU | pas d'interface |
| **Icecast** | radio audio | ultra léger, idéal audio seul | audio seulement |

**Recommandation** : Jitsi (intervenants) → OBS ou ffmpeg sur le PC de la salle → **MediaMTX** (ou Icecast pour l'audio seul) sur un petit VPS → lien HLS saisi dans NORIA.

## Coût serveur estimé (à valider par Philippe — rien n'a été acheté)
- Débit : 500 × 48 kbit/s ≈ 24 Mbit/s ; 1 h ≈ 11 Go sortants. En vidéo 240p : 500 × 250 kbit/s ≈ 125 Mbit/s, ≈ 56 Go/h.
- VPS 1–2 vCPU, 2 Go (Hetzner CX22, OVH VPS, DigitalOcean 6 $) : **≈ 5–12 $/mois**, trafic inclus 1–20 To : largement suffisant en audio.
- Option zéro serveur : placer le HLS derrière Cloudflare (cache) ou diffuser en direct YouTube non répertorié et coller le lien.
- 1 000+ parents en vidéo : prévoir un CDN ou un second nœud (≈ 20 $/mois).

# Adresses e-mail des élèves : adresse ≠ boîte aux lettres
- **Adresse** : un identifiant `prenom.nom@ecole.noriaedu.com`. NORIA la crée automatiquement à l'inscription (format configurable :
  code élève, prenom.nom, p.nom, prenom.nom.annee). Créer une adresse ne coûte rien.
- **Boîte aux lettres** : un espace de stockage avec IMAP/webmail (Google Workspace, Microsoft 365, Zoho…). Généralement payant
  par utilisateur, sauf offres éducation (Google Workspace for Education Fundamentals, Microsoft 365 A1 : gratuits mais soumis à vérification).
- **Option gratuite proposée** : Cloudflare Email Routing (gratuit, transfert vers l'adresse d'un parent ou personnelle,
  200 règles par domaine ; au-delà, un Worker « catch-all » lit la table NORIA). Pour les élèves sans adresse personnelle :
  boîte interne NORIA (la messagerie école du lot 3) — aucun coût, aucune donnée chez un tiers. Rien n'a été acheté.
