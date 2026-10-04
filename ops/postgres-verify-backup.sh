#!/usr/bin/env bash
#
# Restore-test semanal: levanta una DB efímera, restaura el último
# dump completo y comprueba que los esquemas existen. Si falla,
# sale con código != 0 y cron lo reportará.
#
# Variables (en /etc/lyai/backup.env):
#   BACKUP_DIR  (default: /var/backups/lyai_db)
#   TEST_PORT   (default: 55432)
#   PGVECTOR_IMAGE (default: pgvector/pgvector:pg15)

set -euo pipefail

ENV_FILE="${LYAI_BACKUP_ENV:-/etc/lyai/backup.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/lyai_db}"
TEST_CONTAINER="lyai_postgres_verify"
TEST_PORT="${TEST_PORT:-55432}"
PGVECTOR_IMAGE="${PGVECTOR_IMAGE:-pgvector/pgvector:pg15}"
EXPECTED_SCHEMAS=("lyai" "puertas" "autonoma" "prensa")

dump=$(ls -t "$BACKUP_DIR"/diario-*.sql.gz 2>/dev/null | head -n1 || true)
if [ -z "$dump" ]; then
  echo "[FAIL] No hay backup diario en $BACKUP_DIR" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[*] Levantando contenedor de verificación..."
docker run -d --name "$TEST_CONTAINER" \
  -e POSTGRES_PASSWORD=verify \
  -p "$TEST_PORT:5432" \
  "$PGVECTOR_IMAGE" >/dev/null

# Esperar Postgres
for _ in $(seq 1 30); do
  if docker exec "$TEST_CONTAINER" pg_isready -U postgres -q; then
    break
  fi
  sleep 1
done

echo "[*] Restaurando $dump..."
gunzip -c "$dump" | docker exec -i "$TEST_CONTAINER" psql -U postgres -q >/dev/null

echo "[*] Comprobando esquemas..."
for schema in "${EXPECTED_SCHEMAS[@]}"; do
  count=$(docker exec "$TEST_CONTAINER" psql -U postgres -d lyai_db -At \
    -c "SELECT count(*) FROM information_schema.schemata WHERE schema_name='$schema';")
  if [ "$count" != "1" ]; then
    echo "[FAIL] Esquema '$schema' ausente en el dump $(basename "$dump")" >&2
    exit 1
  fi
done

# Sanity check: contar tablas por esquema (al menos una en cada uno)
for schema in "${EXPECTED_SCHEMAS[@]}"; do
  tcount=$(docker exec "$TEST_CONTAINER" psql -U postgres -d lyai_db -At \
    -c "SELECT count(*) FROM information_schema.tables
        WHERE table_schema='$schema';")
  if [ "$tcount" -lt 1 ]; then
    echo "[FAIL] Esquema '$schema' restaurado pero sin tablas" >&2
    exit 1
  fi
  echo "  $schema: $tcount tablas"
done

echo "[OK] Backup $(basename "$dump") restaura limpio con los 4 esquemas."
