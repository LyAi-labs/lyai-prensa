#!/usr/bin/env bash
#
# Backup de lyai_db. Pensado para ejecutarse desde cron.
#
# Modos:
#   ./postgres-backup.sh full          -> pg_dumpall completo (.sql.gz)
#   ./postgres-backup.sh schema NAME   -> pg_dump -Fc del esquema (.dump)
#
# Variables (en /etc/lyai/backup.env, modo 0600 owner root):
#   CONTAINER       (default: lyai_postgres)
#   PG_USER         (default: postgres)
#   PG_DB           (default: lyai_db)
#   BACKUP_DIR      (default: /var/backups/lyai_db)
#   AGE_RECIPIENT   (clave pública age para cifrar off-site; opcional)
#   S3_BUCKET       (bucket S3-compatible, p.ej. s3://lyai-backups; opcional)
#   AWS_*           (credenciales para aws-cli; opcional)
#
# Si AGE_RECIPIENT y S3_BUCKET están definidos, además del dump local
# sube una copia cifrada con age al bucket. Si no, solo dump local.

set -euo pipefail

ENV_FILE="${LYAI_BACKUP_ENV:-/etc/lyai/backup.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

CONTAINER="${CONTAINER:-lyai_postgres}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-lyai_db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lyai_db}"

mkdir -p "$BACKUP_DIR"

mode="${1:-}"
case "$mode" in
  full)
    name="diario-$(date -u +%Y-%m-%d)"
    dest="$BACKUP_DIR/$name.sql.gz"
    docker exec "$CONTAINER" pg_dumpall -U "$PG_USER" \
      | gzip -9 > "$dest"
    ;;
  schema)
    schema="${2:-}"
    if [ -z "$schema" ]; then
      echo "Falta nombre de esquema" >&2
      exit 2
    fi
    name="${schema}-$(date -u +%Y-%m-%dT%H)"
    dest="$BACKUP_DIR/$name.dump"
    docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" \
      --schema="$schema" -Fc > "$dest"
    ;;
  *)
    echo "Uso: $0 {full|schema NAME}" >&2
    exit 2
    ;;
esac

# Off-site cifrado (best-effort: si falla, el dump local sigue intacto).
if [ -n "${AGE_RECIPIENT:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  encrypted="${dest}.age"
  if age -r "$AGE_RECIPIENT" -o "$encrypted" "$dest" \
     && aws s3 cp "$encrypted" "${S3_BUCKET}/$(basename "$encrypted")" >/dev/null; then
    rm -f "$encrypted"
  else
    echo "[WARN] Off-site falló para $dest" >&2
    rm -f "$encrypted"
  fi
fi

# Tamaño legible para el log
size=$(du -h "$dest" | cut -f1)
echo "[OK] $dest ($size)"
