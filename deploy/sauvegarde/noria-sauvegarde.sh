#!/usr/bin/env bash
# Sauvegarde complète NORIA : pg_dump (format custom) → chiffrement → copie locale → envoi hors site S3 → rotation.
#   noria-sauvegarde.sh            sauvegarde + rotation (usage normal, depuis cron ou le minuteur systemd)
#   noria-sauvegarde.sh elaguer    rotation seule (local et S3)
#   noria-sauvegarde.sh lister     liste locale et distante
# Rotation : 7 quotidiennes, 4 hebdomadaires (dimanche), 12 mensuelles (le 1er) — réglable (KEEP_*).
# Chiffrement (obligatoire) : NORIA_BACKUP_AGE_RECIPIENT (clé publique age, recommandé : le serveur ne peut pas
# déchiffrer) ou NORIA_BACKUP_KEY (AES-256-GCM, 32 octets en hexadécimal, via server/scripts/chiffrer.js).
set -Eeuo pipefail
umask 077
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
TMP_FILE=""
trap 'rm -f "${TMP_FILE:-/nonexistent}"' EXIT

chiffrer() {
  if [ -n "${NORIA_BACKUP_AGE_RECIPIENT:-}" ]; then age -r "$NORIA_BACKUP_AGE_RECIPIENT"
  elif [ -n "${NORIA_BACKUP_KEY:-}" ]; then $NODE_CMD "$NORIA_REPO_DIR/server/scripts/chiffrer.js" chiffrer
  else die "aucune clé de chiffrement (NORIA_BACKUP_AGE_RECIPIENT ou NORIA_BACKUP_KEY)"; fi
}
extension() { if [ -n "${NORIA_BACKUP_AGE_RECIPIENT:-}" ]; then echo age; else echo enc; fi; }

# État lisible par l'application (Santé du serveur) : les sous-dossiers restent en 0700 root ; seul ce petit fichier,
# sans aucun secret (nom, date, taille, empreinte, chiffrement, copie hors site), est en 0644. Écriture atomique.
ecrire_etat() {
  local name="$1" hors_site="$2" f="$BACKUP_DIR/quotidien/$1"
  local taille sha n; taille=$(stat -c %s "$f"); sha=$(cut -d' ' -f1 < "$f.sha256")
  n=$(find "$BACKUP_DIR/quotidien" -maxdepth 1 -type f -name 'noria-*' ! -name '*.sha256' | wc -l)
  printf '{"version":1,"derniere":{"name":"%s","at":"%s","size":%s,"sha256":"%s"},"chiffrement":"%s","hors_site":%s,"quotidiennes":%s}\n' \
    "$name" "$(date -u +%FT%TZ)" "$taille" "$sha" "$(extension)" "$hors_site" "$n" > "$BACKUP_DIR/.etat.json.tmp"
  chmod 0644 "$BACKUP_DIR/.etat.json.tmp"; mv -f "$BACKUP_DIR/.etat.json.tmp" "$BACKUP_DIR/etat.json"
}

sauvegarder() {
  [ -n "${NORIA_BACKUP_AGE_RECIPIENT:-}" ] && ! command -v age >/dev/null && die "age introuvable (sudo apt install age)"
  s3_actif && s3_verifier
  # NORIA_BACKUP_DATE (AAAA-MM-JJ) : uniquement pour les tests de rotation.
  local day="${NORIA_BACKUP_DATE:-$(date -u +%F)}"
  local stamp; stamp="${day}T$(date -u +%H%M%S)Z"
  local name; name="noria-${stamp}.dump.$(extension)"
  mkdir -p "$BACKUP_DIR"/{quotidien,hebdomadaire,mensuel}
  TMP_FILE="$BACKUP_DIR/.en-cours-$name"; local tmp="$TMP_FILE"
  log "pg_dump → $name"
  # shellcheck disable=SC2046
  pg_cmd pg_dump --format=custom --compress=6 --no-password $(pg_db_args) | chiffrer > "$tmp"
  [ -s "$tmp" ] || die "fichier vide"
  mv "$tmp" "$BACKUP_DIR/quotidien/$name"
  (cd "$BACKUP_DIR/quotidien" && sha256sum "$name" > "$name.sha256")
  local copies=(quotidien)
  [ "$(date -u -d "$day" +%u)" = "$WEEKLY_DAY" ] && copies+=(hebdomadaire)
  [ "$(date -u -d "$day" +%d)" = "01" ] && copies+=(mensuel)
  local c
  for c in "${copies[@]:1}"; do
    ln -f "$BACKUP_DIR/quotidien/$name" "$BACKUP_DIR/$c/$name"; ln -f "$BACKUP_DIR/quotidien/$name.sha256" "$BACKUP_DIR/$c/$name.sha256"
  done
  log "local : ${copies[*]} ($(du -h "$BACKUP_DIR/quotidien/$name" | cut -f1))"
  local hors_site=false
  if s3_actif; then
    for c in "${copies[@]}"; do
      s3_envoyer "$BACKUP_DIR/quotidien/$name" "$S3_PREFIX/$c/$name"
      s3_envoyer "$BACKUP_DIR/quotidien/$name.sha256" "$S3_PREFIX/$c/$name.sha256"
      log "S3 : envoyé $S3_PREFIX/$c/$name"
    done
    hors_site=true
  else log "S3_BUCKET non défini : AUCUNE copie hors site (à corriger en production)"; fi
  elaguer_local
  if s3_actif; then elaguer_s3; fi
  ecrire_etat "$name" "$hors_site"
  # Signal de vie facultatif (Healthchecks.io, Uptime Kuma…) : alerte si la sauvegarde ne passe plus.
  if [ -n "${NORIA_BACKUP_PING_URL:-}" ]; then curl -fsS -m 10 --retry 3 "$NORIA_BACKUP_PING_URL" -o /dev/null || true; fi
  log "terminé : $name"
}

case "${1:-sauver}" in
  sauver) sauvegarder ;;
  elaguer) elaguer_local; if s3_actif; then s3_verifier; elaguer_s3; fi ;;
  lister) for c in quotidien hebdomadaire mensuel; do echo "== local $c"; find "$BACKUP_DIR/$c" -maxdepth 1 -type f -name "noria-*" ! -name "*.sha256" -printf "%f\n" 2>/dev/null | sort || true; done
          if s3_actif; then s3_verifier; for c in quotidien hebdomadaire mensuel; do echo "== S3 $c"; s3_lister "$S3_PREFIX/$c/" | grep -v sha256 || true; done; fi ;;
  *) echo "Usage : $0 [sauver|elaguer|lister]" >&2; exit 2 ;;
esac
