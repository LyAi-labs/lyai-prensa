#!/usr/bin/env bash
#
# Backup del Postgres dedicado de prensa (contenedor `lyai_prensa_postgres`,
# base `prensa`). Pensado para el cron del usuario lyai (ver ops/crontab.example).
# No lleva secretos: entra por el socket local del contenedor (`docker exec`).
#
#   ops/postgres-backup.sh
#
# Pasos — se para en el primero que falle y avisa por Telegram:
#   1. pg_dump -Fc de la base entera a un temporal DENTRO del contenedor (nunca
#      por redirección al host: un pg_dump que muere a medias dejaría un fichero
#      truncado con pinta de bueno)
#   2. tamaño mínimo
#   3. `pg_restore --list`: el fichero se lee y trae las tablas clave
#   4. copia al host + SHA-256 en SHA256SUMS
#   5. rotación (RETENTION_DAYS)
#
# "Tengo un dump" no es "puedo restaurar": eso lo prueba
# ops/postgres-verify-backup.sh, que restaura de verdad.
#
# El dump trae esquema, datos y extensiones, pero NO los roles (son del clúster).
# Restaurar en un contenedor nuevo: docker-compose.db.yml + ops/prensa-db-bootstrap.sh
# y luego `pg_restore -U postgres -d prensa --no-owner --role=prensa <dump>`.
#
# Variables (opcionales, por entorno):
#   PRENSA_PG_CONTAINER  (lyai_prensa_postgres)
#   PRENSA_PG_DB         (prensa)
#   PRENSA_BACKUP_DIR    (/opt/lyai/backups/prensa)
#   RETENTION_DAYS       (14)
#   LYAI_NOTIFY          (/opt/lyai/bin/lyai-notify.sh; vacío = no avisar, para pruebas)

set -euo pipefail

CONTAINER="${PRENSA_PG_CONTAINER:-lyai_prensa_postgres}"
PG_DB="${PRENSA_PG_DB:-prensa}"
BACKUP_DIR="${PRENSA_BACKUP_DIR:-/opt/lyai/backups/prensa}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
NOTIFY="${LYAI_NOTIFY-/opt/lyai/bin/lyai-notify.sh}"
MIN_SIZE_BYTES=1048576
TABLAS_CLAVE=(noticias fuentes claims)

TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="prensa_db_${TS}.dump"
DEST="$BACKUP_DIR/$NAME"
TMP_IN_CONTAINER="/tmp/${NAME}.partial"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

fail() {
  log "FAIL: $*" >&2
  if [ -n "$NOTIFY" ] && [ -x "$NOTIFY" ]; then
    "$NOTIFY" "🔴 Backup de prensa FALLÓ: $*" --tag PRENSA-BACKUP >/dev/null 2>&1 || log "aviso por Telegram NO entregado" >&2
  fi
  exit 1
}

cleanup() { docker exec "$CONTAINER" rm -f "$TMP_IN_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || fail "el contenedor $CONTAINER no está corriendo"
mkdir -p "$BACKUP_DIR" && chmod 750 "$BACKUP_DIR" || fail "no puedo crear $BACKUP_DIR"

# 1. Dump dentro del contenedor
docker exec "$CONTAINER" pg_dump -U postgres -d "$PG_DB" -Fc -f "$TMP_IN_CONTAINER" 2>/tmp/prensa-backup-err.$$ \
  || fail "pg_dump: $(head -n 3 /tmp/prensa-backup-err.$$ 2>/dev/null | tr '\n' ' ')"
rm -f /tmp/prensa-backup-err.$$

# 2. Tamaño
SIZE="$(docker exec "$CONTAINER" stat -c%s "$TMP_IN_CONTAINER")"
[ "$SIZE" -ge "$MIN_SIZE_BYTES" ] || fail "dump demasiado pequeño: ${SIZE} bytes"

# 3. Se lee y trae las tablas clave
LISTA="$(docker exec "$CONTAINER" pg_restore --list "$TMP_IN_CONTAINER" 2>/dev/null)" || fail "pg_restore --list no puede leer el dump"
for t in "${TABLAS_CLAVE[@]}"; do
  grep -q "TABLE DATA prensa $t " <<<"$LISTA" || fail "el dump no trae datos de prensa.$t"
done

# 4. Al host + SHA-256
docker cp -q "$CONTAINER:$TMP_IN_CONTAINER" "$DEST.partial" || fail "docker cp del dump al host"
[ "$(stat -c%s "$DEST.partial")" = "$SIZE" ] || fail "el dump copiado no mide lo mismo que el original"
mv "$DEST.partial" "$DEST"
chmod 640 "$DEST"
( cd "$BACKUP_DIR" && sha256sum "$NAME" >> SHA256SUMS )

# 5. Rotación: fuera los dumps viejos y sus líneas en SHA256SUMS
find "$BACKUP_DIR" -maxdepth 1 -name 'prensa_db_*.dump' -mtime +"$RETENTION_DAYS" -delete
( cd "$BACKUP_DIR" && while read -r sum file; do [ -f "$file" ] && echo "$sum  $file"; done < SHA256SUMS > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS )

log "OK: $DEST ($(numfmt --to=iec "$SIZE"), $(grep -c 'TABLE DATA prensa ' <<<"$LISTA") tablas) · quedan $(find "$BACKUP_DIR" -maxdepth 1 -name 'prensa_db_*.dump' | wc -l) copias"
