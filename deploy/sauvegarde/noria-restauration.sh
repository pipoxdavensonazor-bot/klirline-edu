#!/usr/bin/env bash
# Restauration NORIA dans une base VIDE (refus sinon).
#   noria-restauration.sh <fichier local | s3:clé>          ex. s3:noria/quotidien/noria-2026-10-16T030000Z.dump.age
#   noria-restauration.sh dernier                          la plus récente sauvegarde quotidienne (S3, sinon locale)
# Base cible : DATABASE_URL (binaires locaux) ou, par défaut, la base POSTGRES_DB du conteneur « db ».
# Déchiffrement : .age → NORIA_BACKUP_AGE_IDENTITY (fichier de clé privée age, gardé HORS du serveur en temps normal) ;
#                 .enc → NORIA_BACKUP_KEY.
set -Eeuo pipefail
umask 077
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config

src="${1:?Usage : $0 <fichier | s3:clé | dernier>}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

if [ "$src" = dernier ]; then
  if s3_actif; then s3_verifier; src="s3:$(s3_lister "$S3_PREFIX/quotidien/" | grep -v sha256 | tail -n 1)"
  else src="$(find "$BACKUP_DIR/quotidien" -maxdepth 1 -name 'noria-*' ! -name '*.sha256' | sort | tail -n 1)"; fi
  [ "$src" = "s3:" ] || [ -z "$src" ] && die "aucune sauvegarde trouvée"
fi
if [[ "$src" == s3:* ]]; then
  s3_verifier; key="${src#s3:}"; file="$work/$(basename "$key")"
  log "téléchargement $key"; s3_telecharger "$key" "$file"
  if s3_telecharger "$key.sha256" "$file.sha256" 2>/dev/null; then (cd "$work" && sha256sum -c --quiet "$(basename "$file").sha256") || die "empreinte SHA-256 incorrecte"; fi
else
  file="$src"; [ -r "$file" ] || die "fichier illisible : $file"
  if [ -r "$file.sha256" ]; then (cd "$(dirname "$file")" && sha256sum -c --quiet "$(basename "$file").sha256") || die "empreinte SHA-256 incorrecte"; fi
fi

plain="$work/noria.dump"
case "$file" in
  *.age) : "${NORIA_BACKUP_AGE_IDENTITY:?NORIA_BACKUP_AGE_IDENTITY manquant (fichier de clé privée age)}"
         age -d -i "$NORIA_BACKUP_AGE_IDENTITY" -o "$plain" "$file" ;;
  *.enc) $NODE_CMD "$NORIA_REPO_DIR/server/scripts/chiffrer.js" dechiffrer < "$file" > "$plain" ;;
  *) die "extension inconnue (attendu .age ou .enc)" ;;
esac
# Le déchiffrement a réussi (étiquette GCM ou MAC age vérifiés) : le contenu est authentique.
pg_restore --list "$plain" >/dev/null 2>&1 || [ -z "${DATABASE_URL:-}" ] || die "archive pg_dump invalide"

# shellcheck disable=SC2046
n="$(pg_cmd psql -X -q -t -A --no-password $(pg_db_args) -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
[ "$n" = "0" ] || die "base cible non vide ($n tables) : restauration refusée. Créer une base neuve (createdb) puis réessayer."
# Le rôle noria_app (RLS) est un objet global, absent de pg_dump : on le recrée avant les GRANT de l'archive.
# shellcheck disable=SC2046
pg_cmd psql -X -q --no-password -v ON_ERROR_STOP=1 $(pg_db_args) -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'noria_app') THEN CREATE ROLE noria_app NOLOGIN; END IF;
  EXECUTE format('GRANT noria_app TO %I', current_user); END \$\$;" >/dev/null
log "pg_restore (transaction unique)"
# shellcheck disable=SC2046
pg_cmd pg_restore --no-owner --exit-on-error --single-transaction --no-password $(pg_db_args) < "$plain"
log "restauration terminée depuis $(basename "$file")"
