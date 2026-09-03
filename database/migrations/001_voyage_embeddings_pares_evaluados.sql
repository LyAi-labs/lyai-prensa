-- ============================================================
-- Migración 001 — lyai_db, schema prensa
--
-- Contexto: schema.sql definía `embeddings.embedding vector(768)` con
-- default `modelo='text-embedding-004'` (Google), pero el resto del
-- pipeline es 100% Anthropic. Pasamos a Voyage AI (voyage-4, 1024 dim),
-- su partner de embeddings recomendado, para no meter un tercer
-- proveedor. Se añade además `pares_evaluados`, la memoria del juez
-- automático de contradicciones (todo veredicto, no solo los positivos),
-- para no re-gastar en LLM sobre pares ya evaluados en corridas previas.
--
-- Diseñada para aplicarse UNA VEZ contra lyai_db real. Ejecutar
-- ops/postgres-backup.sh schema prensa antes, por si acaso.
--
-- Uso:
--   psql "$DATABASE_URL" -f database/migrations/001_voyage_embeddings_pares_evaluados.sql
-- ============================================================

SET search_path TO prensa, public;

-- Guard: si ya hay embeddings con la dimensión vieja, cambiar el tipo de
-- columna los truncaría/rompería en silencio. Abortamos ruidosamente en
-- vez de arriesgar corromper datos — si esto salta, hay que revisar a
-- mano (lo esperable es que la tabla esté vacía: nunca se ha corrido
-- ningún script que la pueble).
DO $$
DECLARE
    n_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO n_rows FROM prensa.embeddings;
    IF n_rows > 0 THEN
        RAISE EXCEPTION
            'prensa.embeddings tiene % fila(s) — revisar a mano antes de cambiar la dimensión del vector (esta migración asume la tabla vacía).',
            n_rows;
    END IF;
END $$;

DROP INDEX IF EXISTS prensa.idx_embeddings_vector;

ALTER TABLE prensa.embeddings
    ALTER COLUMN embedding TYPE vector(1024) USING embedding::vector(1024);

ALTER TABLE prensa.embeddings
    ALTER COLUMN modelo SET DEFAULT 'voyage-4';

CREATE INDEX idx_embeddings_vector ON prensa.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- pares_evaluados — nueva tabla, aditiva
-- ============================================================
CREATE TABLE IF NOT EXISTS prensa.pares_evaluados (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_a_id          UUID NOT NULL REFERENCES prensa.claims(id) ON DELETE CASCADE,
    claim_b_id          UUID NOT NULL REFERENCES prensa.claims(id) ON DELETE CASCADE,
    label               TEXT NOT NULL CHECK (label IN ('contradiccion','coincidencia','no_relacionado','ambiguo')),
    intensidad          REAL DEFAULT 0 CHECK (intensidad BETWEEN 0 AND 1),
    similitud_coseno    REAL,
    juez                TEXT NOT NULL,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (claim_a_id, claim_b_id),
    CHECK (claim_a_id < claim_b_id)
);

CREATE INDEX IF NOT EXISTS idx_pares_evaluados_label ON prensa.pares_evaluados(label);
