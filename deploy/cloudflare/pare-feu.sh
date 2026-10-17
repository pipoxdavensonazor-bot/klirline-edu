#!/usr/bin/env bash
# Pare-feu du serveur NORIA derrière Cloudflare (ufw) : ports 80 et 443 ouverts aux SEULES plages Cloudflare
# (ips-v4.txt, ips-v6.txt ; maj-plages.sh), SSH à part (limité contre les essais répétés), tout le reste fermé.
#
# Usage (root) : deploy/cloudflare/pare-feu.sh [--ssh-port 22] [--ssh-depuis 203.0.113.7] [--interface eth0] [--essai]
#   --ssh-port    port SSH (défaut 22). Il est autorisé AVANT l'activation : pas de risque de se couper l'accès.
#   --ssh-depuis  n'autoriser SSH que depuis cette adresse ou plage (répétable). Défaut : depuis partout, avec « limit ».
#   --interface   interface publique (défaut : celle de la route par défaut).
#   --essai       affiche ce qui serait fait, ne change rien.
# Relancer après chaque maj-plages.sh. Idempotent : les anciennes règles NORIA sont retirées puis recréées.
#
# Docker publie les ports 80/443 de Caddy en contournant les règles ufw d'entrée (chaîne FORWARD). Le script ajoute donc
# aussi un bloc géré dans /etc/ufw/after.rules et after6.rules (chaîne DOCKER-USER, appliquée au démarrage par ufw) :
# sur l'interface publique, les connexions vers les ports publiés 80/443 qui ne viennent pas de Cloudflare sont rejetées.
# Les connexions sortantes des conteneurs (SMS, e-mail, sauvegardes S3) ne sont pas concernées.
set -euo pipefail
cd "$(dirname "$0")"

ssh_port=22; ssh_from=(); iface=""; essai=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ssh-port) ssh_port="${2:?}"; shift 2 ;;
    --ssh-depuis) ssh_from+=("${2:?}"); shift 2 ;;
    --interface) iface="${2:?}"; shift 2 ;;
    --essai) essai=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "pare-feu : option inconnue : $1" >&2; exit 2 ;;
  esac
done
[[ "$ssh_port" =~ ^[0-9]+$ ]] || { echo "pare-feu : --ssh-port invalide" >&2; exit 2; }

mapfile -t V4 < <(grep -Ev '^[[:space:]]*(#|$)' ips-v4.txt)
mapfile -t V6 < <(grep -Ev '^[[:space:]]*(#|$)' ips-v6.txt)
if [ "${#V4[@]}" -lt 5 ] || [ "${#V6[@]}" -lt 3 ]; then echo "pare-feu : listes de plages Cloudflare vides ou incomplètes" >&2; exit 2; fi

if [ -z "$iface" ]; then iface="$(ip -o route show default 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="dev"){print $(i+1); exit}}')"; fi
[[ "$iface" =~ ^[A-Za-z0-9_.:-]+$ ]] || { echo "pare-feu : interface publique introuvable (utiliser --interface)" >&2; exit 2; }

run() { if [ "$essai" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi; }
if [ "$essai" = 0 ]; then
  [ "$(id -u)" = 0 ] || { echo "pare-feu : à lancer en root (sudo)" >&2; exit 2; }
  command -v ufw >/dev/null || { echo "pare-feu : ufw absent (apt install ufw)" >&2; exit 2; }
fi

COMMENT="noria-cloudflare"
# 1. SSH d'abord (jamais de coupure d'accès).
if [ "${#ssh_from[@]}" -eq 0 ]; then
  run ufw limit "$ssh_port/tcp" comment "noria-ssh"
else
  for src in "${ssh_from[@]}"; do run ufw allow proto tcp from "$src" to any port "$ssh_port" comment "noria-ssh"; done
fi

# 2. Anciennes règles : ouverture générale de 80/443 (guide d'installation) et règles NORIA précédentes.
for r in 80/tcp 443/tcp 443/udp 'Nginx Full' 'WWW Full'; do
  if [ "$essai" = 1 ]; then printf '+ ufw delete allow %s  (si présente)\n' "$r"; else ufw delete allow "$r" >/dev/null 2>&1 || true; fi
done
if [ "$essai" = 0 ]; then
  while n="$(ufw status numbered | grep -F "# $COMMENT" | head -1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')" && [ -n "$n" ]; do
    ufw --force delete "$n" >/dev/null
  done
else
  echo "+ (suppression des règles ufw commentées « $COMMENT »)"
fi

# 3. 80/443 (TCP) depuis les plages Cloudflare seulement. Cloudflare joint l'origine en TCP : pas d'UDP 443 (HTTP/3).
for p in "${V4[@]}" "${V6[@]}"; do
  run ufw allow proto tcp from "$p" to any port 80,443 comment "$COMMENT"
done

# 4. Ports publiés par Docker : bloc géré dans after.rules / after6.rules (chaîne DOCKER-USER).
bloc() { # $1 = liste de plages
  echo "# BEGIN NORIA-CLOUDFLARE (géré par deploy/cloudflare/pare-feu.sh — ne pas modifier à la main)"
  echo "*filter"
  echo ":DOCKER-USER - [0:0]"
  echo "-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN"
  local p
  for p in "$@"; do
    echo "-A DOCKER-USER -i $iface -s $p -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -j RETURN"
    echo "-A DOCKER-USER -i $iface -s $p -p tcp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL -j RETURN"
  done
  echo "-A DOCKER-USER -i $iface -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -j DROP"
  echo "-A DOCKER-USER -i $iface -p tcp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL -j DROP"
  echo "-A DOCKER-USER -i $iface -p udp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL -j DROP"
  echo "-A DOCKER-USER -j RETURN"
  echo "COMMIT"
  echo "# END NORIA-CLOUDFLARE"
}
ecrire_bloc() { # $1 = fichier, puis plages
  local f="$1"; shift
  local tmp; tmp="$(mktemp)"
  if [ -f "$f" ]; then sed '/^# BEGIN NORIA-CLOUDFLARE/,/^# END NORIA-CLOUDFLARE/d' "$f" > "$tmp"; fi
  bloc "$@" >> "$tmp"
  if [ "$essai" = 1 ]; then echo "+ bloc ajouté à $f :"; bloc "$@" | sed 's/^/    /' | head -8; echo "    … ($(bloc "$@" | wc -l) lignes)"; rm -f "$tmp"
  else cat "$tmp" > "$f"; rm -f "$tmp"; fi
}
ecrire_bloc /etc/ufw/after.rules "${V4[@]}"
ecrire_bloc /etc/ufw/after6.rules "${V6[@]}"

# 5. Politique par défaut et activation.
run ufw default deny incoming
run ufw default allow outgoing
run ufw --force enable
run ufw reload
if [ "$essai" = 0 ]; then
  ufw status verbose | head -20
  echo "pare-feu : 80/443 ouverts aux ${#V4[@]} plages IPv4 et ${#V6[@]} plages IPv6 de Cloudflare ; SSH sur le port $ssh_port ; interface $iface."
  echo "Contrôle depuis une machine extérieure : curl -m 5 -kI https://IP_DU_SERVEUR/ doit échouer (délai dépassé)."
fi
