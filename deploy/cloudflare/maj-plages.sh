#!/usr/bin/env bash
# Met à jour les plages d'adresses IP de Cloudflare (https://www.cloudflare.com/ips/) utilisées par :
#   - Caddy (plages.caddy : trusted_proxies, mode NORIA_DERRIERE_CLOUDFLARE=1) ;
#   - le pare-feu (pare-feu.sh : ports 80/443 ouverts à ces plages seulement).
# Usage : deploy/cloudflare/maj-plages.sh            (puis : docker compose restart caddy ; sudo deploy/cloudflare/pare-feu.sh)
#         deploy/cloudflare/maj-plages.sh --verifier (code 1 si les fichiers versionnés ne sont plus à jour ; rien n'est écrit)
# Les listes sont refusées si elles sont vides ou contiennent autre chose que des plages CIDR (page d'erreur, proxy…).
set -euo pipefail
cd "$(dirname "$0")"

verifier=0
[ "${1:-}" = "--verifier" ] && verifier=1

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for v in 4 6; do
  curl -fsS --proto '=https' --max-time 30 "https://www.cloudflare.com/ips-v$v" -o "$tmp/v$v.brut"
  # Une plage par ligne, retours chariot et lignes vides retirés, dernière ligne terminée (la source n'en met pas).
  tr -d '\r' < "$tmp/v$v.brut" | awk 'NF { print $1 }' > "$tmp/ips-v$v.txt"
done
if ! grep -Eqx '([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}' "$tmp/ips-v4.txt" \
   || grep -Evqx '([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}' "$tmp/ips-v4.txt"; then
  echo "maj-plages : liste IPv4 invalide, rien n'est modifié" >&2; exit 2
fi
if ! grep -Eqx '[0-9a-f:]+/[0-9]{1,3}' "$tmp/ips-v6.txt" || grep -Evqx '[0-9a-f:]+/[0-9]{1,3}' "$tmp/ips-v6.txt"; then
  echo "maj-plages : liste IPv6 invalide, rien n'est modifié" >&2; exit 2
fi

{
  echo "# Généré par deploy/cloudflare/maj-plages.sh depuis https://www.cloudflare.com/ips/ — ne pas modifier à la main."
  printf 'trusted_proxies static'
  cat "$tmp/ips-v4.txt" "$tmp/ips-v6.txt" | while read -r p; do printf ' %s' "$p"; done
  echo
} > "$tmp/plages.caddy"

change=0
for f in ips-v4.txt ips-v6.txt plages.caddy; do
  if ! cmp -s "$tmp/$f" "$f"; then
    change=1
    diff -u "$f" "$tmp/$f" || true
    [ "$verifier" = 1 ] || cp "$tmp/$f" "$f"
  fi
done

if [ "$change" = 0 ]; then echo "maj-plages : plages Cloudflare déjà à jour."; exit 0; fi
if [ "$verifier" = 1 ]; then echo "maj-plages : plages Cloudflare à mettre à jour (lancer sans --verifier)." >&2; exit 1; fi
echo "maj-plages : plages mises à jour. Appliquer : docker compose restart caddy && sudo deploy/cloudflare/pare-feu.sh"
