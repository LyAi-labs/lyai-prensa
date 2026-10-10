#!/usr/bin/env bash
#
# Restore-test del backup de prensa: un backup no existe hasta que restaura.
#
# Levanta un Postgres efímero con la MISMA imagen que producción (sin red, sin
# puertos), restaura el dump más reciente y comprueba: SHA-256, extensión
# pgvector, tablas clave con filas y recuento coherente con la base viva.
# Sale != 0 y avisa por Telegram si algo falla. No toca la base de producción
# (solo le lee un recuento).
#
#   ops/postgres-verify-backup.sh [fichero.dump]    # por defecto, el más reciente
#
# Variables (opcionales): PRENSA_PG_CONTAINER, PRENSA_PG_DB, PRENSA_BACKUP_DIR,
# LYAI_NOTIFY — las mismas que ops/postgres-backup.sh.

set -euo pipefail

CONTAINER="${PRENSA_PG_CONTAINER:-lyai_prensa_postgres}"
PG_DB="${PRENSA_PG_DB:-prensa}"
BACKUP_DIR="${PRENSA_BACKUP_DIR:-/opt/lyai/backups/prensa}"
NOTIFY="${LYAI_NOTIFY-/opt/lyai/bin/lyai-notify.sh}"
TABLAS_CLAVE=(noticias fuentes claims)
VERIFY="lyai_prensa_pg_verify_$$"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

fail() {
  log "FAIL: $*" >&2
  if [ -n "$NOTIFY" ] && [ -x "$NOTIFY" ]; then
    "$NOTIFY" "🔴 Restore-test del backup de prensa FALLÓ: $*" --tag PRENSA-BACKUP-VERIFY >/dev/null 2>&1 || log "aviso por Telegram NO entregado" >&2
  fi
  exit 1
}

cleanup() { docker rm -f -v "$VERIFY" >/dev/null 2>&1 || true; }
trap cleanup EXIT

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/prensa_db_*.dump 2>/dev/null | head -n 1 || true)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || fail "no hay ningún dump en $BACKUP_DIR"

# 0. El fichero es el que se guardó
SUMS="$(dirname "$DUMP")/SHA256SUMS"
if [ -f "$SUMS" ] && grep -q " $(basename "$DUMP")\$" "$SUMS"; then
  ( cd "$(dirname "$DUMP")" && grep " $(basename "$DUMP")\$" SHA256SUMS | tail -n 1 | sha256sum -c --status ) \
    || fail "SHA-256 de $(basename "$DUMP") no coincide con SHA256SUMS"
else
  log "aviso: $(basename "$DUMP") no figura en SHA256SUMS; sigo sin esa comprobación"
fi

# 1. Postgres efímero, misma imagen que el de producción
IMAGE="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null)" || fail "no puedo leer la imagen de $CONTAINER"
docker run -d --name "$VERIFY" --network none -e POSTGRES_PASSWORD="verify-$$-$RANDOM" "$IMAGE" >/dev/null \
  || fail "no arranca el contenedor de verificación"
# Por TCP a propósito: durante el initdb el servidor temporal solo escucha en el socket.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$VERIFY" pg_isready -h 127.0.0.1 -U postgres -q 2>/dev/null; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || fail "el Postgres de verificación no llegó a estar listo"

# 2. Restaurar
docker cp -q "$DUMP" "$VERIFY:/tmp/verify.dump"
docker exec "$VERIFY" createdb -U postgres verify
docker exec "$VERIFY" pg_restore -U postgres -d verify --no-owner --no-privileges --single-transaction --exit-on-error /tmp/verify.dump \
  2>/tmp/prensa-verify-err.$$ || fail "pg_restore: $(head -n 3 /tmp/prensa-verify-err.$$ | tr '\n' ' ')"
rm -f /tmp/prensa-verify-err.$$

q() { docker exec "$VERIFY" psql -U postgres -d verify -X -At -c "$1"; }

# 3. Comprobar
[ "$(q "select count(*) from pg_extension where extname = 'vector'")" = 1 ] || fail "el dump restaurado no trae la extensión vector"
resumen=""
for t in "${TABLAS_CLAVE[@]}"; do
  n="$(q "select count(*) from prensa.$t")" || fail "prensa.$t no existe en el dump restaurado"
  [ "$n" -gt 0 ] || fail "prensa.$t se restauró vacía"
  resumen+="$t=$n "
done
tablas="$(q "select count(*) from pg_tables where schemaname = 'prensa'")"

# El backup no puede tener más noticias que la base viva, ni quedarse muy por detrás.
restauradas="$(q "select count(*) from prensa.noticias")"
vivas="$(docker exec "$CONTAINER" psql -U postgres -d "$PG_DB" -X -At -c "select count(*) from prensa.noticias")" || fail "no puedo contar en $CONTAINER/$PG_DB"
[ "$restauradas" -le "$vivas" ] || fail "el backup trae más noticias ($restauradas) que la base viva ($vivas)"
[ $(( restauradas * 100 )) -ge $(( vivas * 80 )) ] || fail "el backup trae $restauradas noticias y la base viva $vivas: demasiado viejo o truncado"

log "OK: $(basename "$DUMP") restaura limpio · $tablas tablas · ${resumen}· base viva: noticias=$vivas"
