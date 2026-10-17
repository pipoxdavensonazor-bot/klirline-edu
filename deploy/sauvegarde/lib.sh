# shellcheck shell=bash
# Fonctions communes aux scripts de sauvegarde NORIA (sourcé, pas exécuté).
# Stockage hors site compatible S3 (Cloudflare R2, Backblaze B2, AWS S3, MinIO) avec curl --aws-sigv4 seul :
# pas de SDK. Les identifiants passent par l'entrée standard de curl (-K -), jamais en argument visible dans « ps ».

NORIA_SAUV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NORIA_REPO_DIR="$(cd "$NORIA_SAUV_DIR/../.." && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ÉCHEC : $*"; exit 1; }

# Fichier de configuration facultatif (droits 600 conseillés) : variables ci-dessous.
charger_config() {
  local f="${NORIA_BACKUP_ENV:-/etc/noria/sauvegarde.env}"
  if [ -r "$f" ]; then set -a; # shellcheck disable=SC1090
    . "$f"; set +a; fi
  BACKUP_DIR="${BACKUP_DIR:-/var/backups/noria}"
  KEEP_DAILY="${KEEP_DAILY:-7}"; KEEP_WEEKLY="${KEEP_WEEKLY:-4}"; KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
  WEEKLY_DAY="${WEEKLY_DAY:-7}"         # 1 = lundi … 7 = dimanche
  S3_PREFIX="${S3_PREFIX:-noria}"
  S3_REGION="${S3_REGION:-auto}"        # R2 : auto ; B2 : us-west-004 (par exemple) ; S3 : eu-west-3…
  COMPOSE="${COMPOSE:-docker compose --project-directory $NORIA_REPO_DIR}"
  NODE_CMD="${NODE_CMD:-node}"
}

# Commandes PostgreSQL : binaires locaux si DATABASE_URL est défini (CI, hôte avec client 16),
# sinon dans le conteneur « db » de docker compose (même version que le serveur, rien à installer sur l'hôte).
pg_cmd() { # pg_cmd <outil> [args…]
  local tool="$1"; shift
  if [ -n "${DATABASE_URL:-}" ]; then "$tool" "$@"
  else $COMPOSE exec -T db "$tool" -U "${POSTGRES_USER:-noria}" "$@"; fi
}
pg_db_args() { # désignation de la base cible
  if [ -n "${DATABASE_URL:-}" ]; then printf '%s\n' "--dbname=$DATABASE_URL"; else printf '%s\n' "--dbname=${POSTGRES_DB:-noria}"; fi
}

s3_actif() { [ -n "${S3_BUCKET:-}" ]; }
s3_verifier() {
  : "${S3_ENDPOINT:?S3_ENDPOINT manquant (ex. https://<compte>.r2.cloudflarestorage.com)}"
  : "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID manquant}"; : "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY manquant}"
}
# s3_curl <méthode> <chemin après le bucket> [options curl…] — adressage par chemin : $S3_ENDPOINT/$S3_BUCKET/…
s3_curl() {
  local method="$1" path="$2"; shift 2
  printf 'user = "%s:%s"\n' "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" |
    curl -sS --fail-with-body --retry 3 --retry-delay 5 -K - --aws-sigv4 "aws:amz:${S3_REGION}:s3" \
      -X "$method" "$@" "${S3_ENDPOINT%/}/${S3_BUCKET}/${path}"
}
s3_envoyer() { s3_curl PUT "$2" -H 'content-type: application/octet-stream' -T "$1" -o /dev/null; }
s3_telecharger() { s3_curl GET "$1" -o "$2"; }
s3_supprimer() { s3_curl DELETE "$1" -o /dev/null; }
# Liste des clés sous un préfixe (une par ligne, ordre lexical = chronologique). ListObjectsV2, 1000 clés au plus :
# largement assez puisque la rotation en garde au plus 12 par dossier.
s3_lister() {
  local prefix; prefix="$(printf '%s' "$1" | sed 's#/#%2F#g')"
  s3_curl GET "?list-type=2&prefix=${prefix}" | tr '<' '\n' | sed -n 's#^Key>##p' | sort
}

# Élague une liste triée (entrée standard) : affiche les éléments à supprimer, en gardant les $1 derniers.
a_supprimer() { local keep="$1"; local all; all="$(cat)"; [ -z "$all" ] && return 0
  local n; n="$(printf '%s\n' "$all" | wc -l)"; [ "$n" -le "$keep" ] && return 0
  printf '%s\n' "$all" | head -n "$((n - keep))"; }

elaguer_local() {
  local d
  for d in quotidien:"$KEEP_DAILY" hebdomadaire:"$KEEP_WEEKLY" mensuel:"$KEEP_MONTHLY"; do
    local dir="$BACKUP_DIR/${d%%:*}" keep="${d##*:}"
    [ -d "$dir" ] || continue
    find "$dir" -maxdepth 1 -type f -name 'noria-*' ! -name '*.sha256' -printf '%f\n' | sort | a_supprimer "$keep" |
      while read -r f; do rm -f -- "$dir/$f" "$dir/$f.sha256"; log "local : supprimé ${d%%:*}/$f"; done
  done
}
elaguer_s3() {
  local d
  for d in quotidien:"$KEEP_DAILY" hebdomadaire:"$KEEP_WEEKLY" mensuel:"$KEEP_MONTHLY"; do
    local p="$S3_PREFIX/${d%%:*}/" keep="${d##*:}"
    s3_lister "$p" | { grep -v '\.sha256$' || true; } | a_supprimer "$keep" |
      while read -r k; do s3_supprimer "$k"; s3_supprimer "$k.sha256" || true; log "S3 : supprimé $k"; done
  done
}
