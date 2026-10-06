#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/lyai_postgres/localhost/')"

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') INICIO PIPELINE PRENSA ===" >> /var/log/lyai/prensa-ingest.log

# 1. Ingesta de fuentes RSS
python3 -m pipeline.ingest >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 2. Extracción de claims para noticias recientes (lote controlado para respetar el free tier)
python3 -m pipeline.extract_claims --limit 25 >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 3. Generación de embeddings con Ollama local (bge-m3)
python3 -m pipeline.embed_claims >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 4. Juicio y detección de contradicciones
python3 -m pipeline.judge_contradictions --limit 35 >> /var/log/lyai/prensa-ingest.log 2>&1 || true

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') FIN PIPELINE PRENSA ===" >> /var/log/lyai/prensa-ingest.log

