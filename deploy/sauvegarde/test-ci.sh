#!/usr/bin/env bash
# Test de bout en bout des sauvegardes (CI) : sauvegarde → restauration dans une base vide → comparaison.
# Prérequis : NORIA_TEST_PG=postgres://… (compte autorisé à créer des bases), pg_dump/pg_restore/psql 16, node.
# Facultatif : age (chiffrement age testé en plus d'AES-256-GCM) ; S3_ENDPOINT/S3_BUCKET/… (serveur moto) pour l'envoi
# hors site et la rotation distante.
set -Eeuo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
: "${NORIA_TEST_PG:?NORIA_TEST_PG manquant}"
base_url() { local u="$NORIA_TEST_PG"; printf '%s/%s' "${u%/*}" "$1"; }
SRC="$(base_url noria_sauv_src)"; DST="$(base_url noria_sauv_dst)"; DST2="$(base_url noria_sauv_dst2)"
work="$(mktemp -d)"
cleanup() { rm -rf "$work"; for d in noria_sauv_src noria_sauv_dst noria_sauv_dst2; do psql -X -q "$NORIA_TEST_PG" -c "DROP DATABASE IF EXISTS $d WITH (FORCE)" || true; done; }
trap cleanup EXIT
ok() { printf '  ✔ %s\n' "$*"; }

for d in noria_sauv_src noria_sauv_dst noria_sauv_dst2; do
  psql -X -q "$NORIA_TEST_PG" -c "DROP DATABASE IF EXISTS $d WITH (FORCE)" -c "CREATE DATABASE $d"
done

echo "1. Base source : migrations, données fictives, écritures"
(cd "$repo/server" && DB="$SRC" node -e '
  const { openStore } = require("./src/store"); const { seed } = require("./src/seed");
  (async () => { const db = await openStore(process.env.DB); const ids = await seed(db);
    await db.run("INSERT INTO audit_log (school_id, actor_user_id, action, record_type) VALUES (?,?,?,?)", ids.A.school, ids.A.users.direction, "test-sauvegarde", "x");
    await db.close(); })().catch((e) => { console.error(e); process.exit(1); });')

# Comparaison logique : toutes les tables métier (même empreinte que la sauvegarde JSON), séquences, politiques RLS.
empreinte() { (cd "$repo/server" && DB="$1" node -e '
  const { openStore } = require("./src/store"); const { dump } = require("./src/backup");
  (async () => { const db = await openStore(process.env.DB); const d = await dump(db);
    const pol = await db.all("SELECT tablename, policyname, qual, with_check FROM pg_policies ORDER BY 1, 2");
    const rls = await db.all("SELECT relname FROM pg_class WHERE relrowsecurity ORDER BY 1");
    const seq = await db.all("SELECT sequencename, last_value FROM pg_sequences ORDER BY 1");
    const n = Object.values(d.tables).reduce((a, r) => a + r.length, 0);
    console.log(JSON.stringify({ sha: d.sha256, n, migrations: d.migrations, pol, rls, seq }));
    await db.close(); })().catch((e) => { console.error(e); process.exit(1); });' | sha256sum | cut -c1-16); }
schema() { pg_dump --schema-only --no-owner "$1" | grep -v '^--' | grep -v '^$' | grep -v '\\restrict\|\\unrestrict'; }

run_cycle() { # run_cycle <libellé> <variables d'environnement de chiffrement…>
  local label="$1"; shift
  echo "2. [$label] Sauvegarde"
  rm -rf "$work/b"
  if ! env "$@" DATABASE_URL="$SRC" BACKUP_DIR="$work/b" NORIA_BACKUP_ENV=/dev/null "$here/noria-sauvegarde.sh" 2> "$work/log"; then
    cat "$work/log"; exit 1; fi
  local f; f="$(find "$work/b/quotidien" -name 'noria-*' ! -name '*.sha256')"
  [ -s "$f" ] || { cat "$work/log"; exit 1; }
  if head -c 64 "$f" | grep -qa 'PGDMP'; then echo "fichier non chiffré !"; exit 1; fi
  ok "fichier chiffré écrit : $(basename "$f")"
  echo "3. [$label] Restauration dans une base vide"
  psql -X -q "$NORIA_TEST_PG" -c "DROP DATABASE IF EXISTS noria_sauv_dst WITH (FORCE)" -c "CREATE DATABASE noria_sauv_dst"
  env "$@" DATABASE_URL="$DST" BACKUP_DIR="$work/b" NORIA_BACKUP_ENV=/dev/null "$here/noria-restauration.sh" "$f"
  echo "4. [$label] Comparaison"
  local a b; a="$(empreinte "$SRC")"; b="$(empreinte "$DST")"
  [ "$a" = "$b" ] || { echo "données différentes ($a ≠ $b)"; exit 1; }
  ok "données, séquences et politiques RLS identiques ($a)"
  diff <(schema "$SRC") <(schema "$DST") > "$work/diff" || { cat "$work/diff"; echo "schémas différents"; exit 1; }
  ok "schéma identique"
  if env "$@" DATABASE_URL="$DST" NORIA_BACKUP_ENV=/dev/null "$here/noria-restauration.sh" "$f" 2>/dev/null; then echo "base non vide acceptée !"; exit 1; fi
  ok "restauration refusée sur une base non vide"
  # Altération d'un octet : le déchiffrement authentifié doit échouer.
  cp "$f" "$work/altere"; printf 'X' | dd of="$work/altere" bs=1 seek=200 conv=notrunc status=none
  local alt="$work/altere.${f##*.}"; mv "$work/altere" "$alt"
  if env "$@" DATABASE_URL="$DST2" NORIA_BACKUP_ENV=/dev/null "$here/noria-restauration.sh" "$alt" 2>/dev/null; then echo "fichier altéré accepté !"; exit 1; fi
  [ "$(psql -X -t -A "$DST2" -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")" = 0 ] || { echo "base modifiée par un fichier altéré"; exit 1; }
  ok "fichier altéré refusé, base cible intacte"
}

run_cycle "AES-256-GCM" NORIA_BACKUP_KEY="$(openssl rand -hex 32)"
# Mauvaise clé : refus.
if command -v age >/dev/null; then
  age-keygen -o "$work/age.key" 2>/dev/null
  run_cycle "age" NORIA_BACKUP_AGE_RECIPIENT="$(age-keygen -y "$work/age.key")" NORIA_BACKUP_AGE_IDENTITY="$work/age.key"
else echo "  (age absent : cycle age non testé)"; fi

echo "5. Rotation locale (fichiers fictifs sur 400 jours)"
R="$work/r"; mkdir -p "$R"/{quotidien,hebdomadaire,mensuel}
for i in $(seq 0 399); do
  d="$(date -u -d "2025-01-01 + $i days" +%F)"; n="noria-${d}T030000Z.dump.enc"
  touch "$R/quotidien/$n"
  [ "$(date -u -d "$d" +%u)" = 7 ] && touch "$R/hebdomadaire/$n"
  [ "$(date -u -d "$d" +%d)" = 01 ] && touch "$R/mensuel/$n"
done
BACKUP_DIR="$R" NORIA_BACKUP_ENV=/dev/null S3_BUCKET= "$here/noria-sauvegarde.sh" elaguer 2>/dev/null
c() { find "$R/$1" -type f | wc -l; }
[ "$(c quotidien)" = 7 ] && [ "$(c hebdomadaire)" = 4 ] && [ "$(c mensuel)" = 12 ] || { echo "rotation incorrecte : $(c quotidien)/$(c hebdomadaire)/$(c mensuel)"; exit 1; }
[ -e "$R/quotidien/noria-2026-02-04T030000Z.dump.enc" ] && [ ! -e "$R/quotidien/noria-2026-01-28T030000Z.dump.enc" ] || { echo "mauvais fichiers gardés"; exit 1; }
ok "7 quotidiennes, 4 hebdomadaires, 12 mensuelles (les plus récentes)"

if [ -n "${S3_ENDPOINT:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  echo "6. Hors site S3 ($S3_ENDPOINT) : envoi, rotation distante, restauration depuis S3"
  export S3_PREFIX="ci-$$"
  KEY="$(openssl rand -hex 32)"
  for i in $(seq 1 9); do
    NORIA_BACKUP_DATE="2026-03-0$i" NORIA_BACKUP_KEY="$KEY" DATABASE_URL="$SRC" BACKUP_DIR="$work/s3loc" NORIA_BACKUP_ENV=/dev/null "$here/noria-sauvegarde.sh"
    sleep 1
  done
  . "$here/lib.sh"; charger_config
  nb() { s3_lister "$S3_PREFIX/$1/" | { grep -vc sha256 || true; }; }
  q="$(nb quotidien)"; h="$(nb hebdomadaire)"; m="$(nb mensuel)"
  [ "$q" = 7 ] && [ "$h" = 2 ] && [ "$m" = 1 ] || { echo "rotation S3 incorrecte : $q/$h/$m"; exit 1; }
  ok "S3 : 7 quotidiennes, 2 hebdomadaires (1er et 8 mars), 1 mensuelle"
  psql -X -q "$NORIA_TEST_PG" -c "DROP DATABASE IF EXISTS noria_sauv_dst WITH (FORCE)" -c "CREATE DATABASE noria_sauv_dst"
  NORIA_BACKUP_KEY="$KEY" DATABASE_URL="$DST" NORIA_BACKUP_ENV=/dev/null "$here/noria-restauration.sh" dernier
  [ "$(empreinte "$SRC")" = "$(empreinte "$DST")" ] || { echo "restauration S3 différente"; exit 1; }
  ok "restauration depuis S3 identique"
else echo "6. (S3_ENDPOINT non défini : envoi hors site non testé)"; fi
echo "Sauvegardes : tous les contrôles sont passés."
