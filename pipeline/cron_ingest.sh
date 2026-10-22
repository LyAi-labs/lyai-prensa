#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# .env trae la DATABASE_URL del HOST (rol `prensa`, 127.0.0.1:5436 -> contenedor
# lyai_prensa_postgres): se usa tal cual, sin reescribir el hostname.
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') INICIO PIPELINE PRENSA ===" >> /var/log/lyai/prensa-ingest.log

# 1. Ingesta de fuentes RSS (con extracción automática de og:image si el RSS viene sin foto)
python3 -m pipeline.ingest >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 1.1 Enriquecimiento retroactivo de imágenes pendientes
python3 -m pipeline.enrich_images --limit 100 --workers 6 >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 2. Extracción de claims para noticias recientes (lote controlado para respetar el free tier)
python3 -m pipeline.extract_claims --limit 25 >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 3. Generación de embeddings con Ollama local (bge-m3)
python3 -m pipeline.embed_claims >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 4. Juicio y detección de contradicciones
python3 -m pipeline.judge_contradictions --limit 35 >> /var/log/lyai/prensa-ingest.log 2>&1 || true

# 5. QA Wall Inspector: auditoría de cards, purga y verificación visual en navegador antes de publicar
python3 -m pipeline.qa_wall_inspector --auto-fix >> /var/log/lyai/prensa-ingest.log 2>&1 || true

echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') FIN PIPELINE PRENSA ===" >> /var/log/lyai/prensa-ingest.log

