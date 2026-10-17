# Certificat d'origine Cloudflare (mode `NORIA_DERRIERE_CLOUDFLARE=1`)

Déposer ici, **sur le serveur seulement** (jamais dans Git) :

- `origine.pem` : le certificat d'origine (Cloudflare → SSL/TLS → Serveur d'origine → Créer un certificat) ;
- `origine.key` : sa clé privée (`chmod 600`, propriétaire root).

Ce dossier est monté en lecture seule dans le conteneur Caddy (`/etc/caddy/certs`). Autre emplacement :
`NORIA_CF_CERTS_HOTE=/etc/noria/certs` dans `.env`. Voir `DEPLOIEMENT.md`, section 9.
