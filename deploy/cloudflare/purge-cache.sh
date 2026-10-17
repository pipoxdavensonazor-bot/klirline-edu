#!/usr/bin/env bash
# Purge du cache Cloudflare après un déploiement — FACULTATIF.
# Les pages HTML appellent les fichiers de l'interface avec ?v=<empreinte> (server/src/static.js) : une nouvelle version
# change déjà l'URL, aucune purge n'est nécessaire pour /app. Ce script sert pour les rares URL non versionnées
# (/manifest.webmanifest, /src/... appelés sans ?v=, images du portail) ou en cas de doute.
#
# Usage : CF_API_TOKEN=… CF_ZONE_ID=… deploy/cloudflare/purge-cache.sh            (tout le cache de la zone)
#         CF_API_TOKEN=… CF_ZONE_ID=… deploy/cloudflare/purge-cache.sh https://noriaedu.com/manifest.webmanifest …
# Variables lues aussi dans /etc/noria/cloudflare.env (chmod 600) s'il existe, ou NORIA_CF_ENV=/chemin.
# Jeton : Cloudflare → Mon profil → Jetons d'API → Créer → modèle personnalisé, permission « Zone → Cache Purge → Purge »,
# ressource limitée à la zone noriaedu.com. Rien d'autre (pas d'accès DNS ni SSL). Le jeton n'est jamais affiché.
set -euo pipefail

f="${NORIA_CF_ENV:-/etc/noria/cloudflare.env}"
if [ -f "$f" ]; then
  # shellcheck disable=SC1090
  . "$f"
fi
: "${CF_API_TOKEN:?définir CF_API_TOKEN (permission Cache Purge seulement)}"
: "${CF_ZONE_ID:?définir CF_ZONE_ID (Cloudflare → noriaedu.com → Vue d’ensemble → ID de zone)}"
[[ "$CF_ZONE_ID" =~ ^[0-9a-f]{32}$ ]] || { echo "purge-cache : CF_ZONE_ID invalide (32 caractères hexadécimaux)" >&2; exit 2; }

if [ $# -eq 0 ]; then
  corps='{"purge_everything":true}'
else
  [ $# -le 30 ] || { echo "purge-cache : 30 URL au plus par appel" >&2; exit 2; }
  corps="$(printf '%s\n' "$@" | python3 -c 'import json,sys; u=[l.strip() for l in sys.stdin if l.strip()]; assert all(x.startswith("https://") for x in u), "URL https:// attendues"; print(json.dumps({"files":u}))')"
fi

# Jeton passé à curl par l'entrée standard (fichier de configuration) : absent de la ligne de commande (ps) et des journaux.
rep="$(printf 'header = "Authorization: Bearer %s"\n' "$CF_API_TOKEN" | curl -sS --proto '=https' --max-time 30 -K - \
  -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H 'Content-Type: application/json' --data "$corps")"
if printf '%s' "$rep" | grep -q '"success":[[:space:]]*true'; then
  echo "purge-cache : cache Cloudflare purgé ($([ $# -eq 0 ] && echo 'tout' || echo "$# URL"))."
else
  echo "purge-cache : échec — $(printf '%s' "$rep" | python3 -c 'import json,sys
try: print("; ".join(e.get("message","?") for e in json.load(sys.stdin).get("errors",[])) or "réponse inattendue")
except Exception: print("réponse illisible")')" >&2
  exit 1
fi
