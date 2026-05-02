-- ============================================================
-- LyAi Prensa — Schema v1
-- Muro de prensa 3D / hemeroteca con detector de contradicciones
-- ============================================================

DROP SCHEMA IF EXISTS prensa CASCADE;
CREATE SCHEMA prensa;
SET search_path TO prensa, public;

-- Extensiones (idempotentes a nivel de DB)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. FUENTES — medios de prensa normalizados
-- ============================================================
CREATE TABLE fuentes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug        TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    pais        TEXT NOT NULL DEFAULT 'ES',
    idioma      TEXT NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','ca','eu','gl','en','fr','de','it','pt')),
    rss_url     TEXT,
    web_url     TEXT,
    color       TEXT NOT NULL DEFAULT '#4466aa',
    sesgo       TEXT CHECK (sesgo IN ('izquierda','centro_izq','centro','centro_der','derecha','desconocido')),
    activo      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. IMÁGENES — cache local con dedup por sha1
-- ============================================================
CREATE TABLE imagenes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sha1        TEXT NOT NULL UNIQUE,
    url_origen  TEXT NOT NULL,
    path_local  TEXT NOT NULL,
    mime        TEXT NOT NULL,
    bytes       INTEGER NOT NULL,
    width       INTEGER,
    height      INTEGER,
    cacheada_en TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. NOTICIAS — artículos publicados
-- ============================================================
CREATE TABLE noticias (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fuente_id       UUID NOT NULL REFERENCES fuentes(id) ON DELETE CASCADE,
    id_externo      TEXT NOT NULL,                          -- GUID o link del RSS para dedup
    titular         TEXT NOT NULL,
    descripcion     TEXT DEFAULT '',
    cuerpo          TEXT,                                    -- texto completo si lo tenemos
    enlace          TEXT NOT NULL,
    publicada_en    TIMESTAMPTZ NOT NULL,
    sentimiento     REAL CHECK (sentimiento BETWEEN -1 AND 1),
    intensidad_contradiccion  REAL DEFAULT 0 CHECK (intensidad_contradiccion BETWEEN 0 AND 1),
    eje_z           REAL DEFAULT 0,                          -- visual: intensidad * 3
    temas           JSONB DEFAULT '[]'::jsonb,               -- [{tema, score}]
    imagen_id       UUID REFERENCES imagenes(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (fuente_id, id_externo)
);

-- ============================================================
-- 4. CLAIMS — afirmaciones atómicas extraídas de cada noticia
-- ============================================================
CREATE TABLE claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    noticia_id      UUID NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
    sujeto          TEXT NOT NULL,
    predicado       TEXT NOT NULL,
    objeto          TEXT NOT NULL,
    cita            TEXT,                                    -- texto literal opcional del cuerpo
    tema            TEXT,                                    -- tag temático normalizado
    factual         BOOLEAN DEFAULT true,                    -- factual vs opinión
    confianza_extr  REAL CHECK (confianza_extr BETWEEN 0 AND 1),
    extractor       TEXT,                                    -- modelo/version que extrajo
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. EMBEDDINGS — vectores de noticia o claim
-- ============================================================
CREATE TABLE embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    noticia_id      UUID REFERENCES noticias(id) ON DELETE CASCADE,
    claim_id        UUID REFERENCES claims(id) ON DELETE CASCADE,
    idioma          TEXT NOT NULL DEFAULT 'es',
    texto_origen    TEXT NOT NULL,
    embedding       vector(768),
    modelo          TEXT NOT NULL DEFAULT 'text-embedding-004',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (noticia_id IS NOT NULL OR claim_id IS NOT NULL)
);

-- ============================================================
-- 6. CONTRADICCIONES — pares de claims juzgados como opuestos
-- ============================================================
CREATE TABLE contradicciones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_a_id          UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    claim_b_id          UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    tema                TEXT NOT NULL,
    intensidad          REAL DEFAULT 0 CHECK (intensidad BETWEEN 0 AND 1),
    razonamiento        TEXT,                                -- explicación del LLM-juez
    juez                TEXT NOT NULL,                       -- e.g. 'claude-opus-4-7'
    revisado            BOOLEAN DEFAULT false,
    revisado_correcto   BOOLEAN,                             -- TP=true, FP=false, NULL=sin revisar
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (claim_a_id, claim_b_id),
    CHECK (claim_a_id < claim_b_id)                          -- canonicaliza el par para evitar (a,b)/(b,a)
);

-- ============================================================
-- 7. EVAL_PARES — set etiquetado a mano para medir el detector
-- ============================================================
CREATE TABLE eval_pares (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_a_id      UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    claim_b_id      UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    label           TEXT NOT NULL CHECK (label IN ('contradiccion','coincidencia','no_relacionado','ambiguo')),
    notas           TEXT,
    etiquetado_por  TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (claim_a_id, claim_b_id),
    CHECK (claim_a_id < claim_b_id)
);

-- ============================================================
-- 8. ESTADÍSTICAS DE RECOLECCIÓN
-- ============================================================
CREATE TABLE estadisticas_recoleccion (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha                   TIMESTAMPTZ DEFAULT NOW(),
    total_noticias          INTEGER DEFAULT 0,
    total_contradicciones   INTEGER DEFAULT 0,
    fuentes_exitosas        INTEGER DEFAULT 0,
    fuentes_fallidas        INTEGER DEFAULT 0,
    metadata                JSONB DEFAULT '{}'::jsonb
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_fuentes_slug ON fuentes(slug);
CREATE INDEX idx_fuentes_activo ON fuentes(activo);

CREATE INDEX idx_imagenes_sha1 ON imagenes(sha1);

CREATE INDEX idx_noticias_fuente ON noticias(fuente_id);
CREATE INDEX idx_noticias_publicada ON noticias(publicada_en DESC);
CREATE INDEX idx_noticias_intensidad ON noticias(intensidad_contradiccion DESC);
CREATE INDEX idx_noticias_temas_gin ON noticias USING gin (temas jsonb_path_ops);

CREATE INDEX idx_claims_noticia ON claims(noticia_id);
CREATE INDEX idx_claims_tema ON claims(tema);
CREATE INDEX idx_claims_factual ON claims(factual);

-- HNSW vector index para búsqueda semántica
CREATE INDEX idx_embeddings_vector ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_embeddings_noticia ON embeddings(noticia_id);
CREATE INDEX idx_embeddings_claim ON embeddings(claim_id);
CREATE INDEX idx_embeddings_idioma ON embeddings(idioma);

CREATE INDEX idx_contradicciones_claim_a ON contradicciones(claim_a_id);
CREATE INDEX idx_contradicciones_claim_b ON contradicciones(claim_b_id);
CREATE INDEX idx_contradicciones_tema ON contradicciones(tema);
CREATE INDEX idx_contradicciones_intensidad ON contradicciones(intensidad DESC);
CREATE INDEX idx_contradicciones_pendientes ON contradicciones(revisado) WHERE revisado = false;

CREATE INDEX idx_eval_pares_label ON eval_pares(label);

-- ============================================================
-- TRIGGER updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION prensa.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fuentes_updated_at
    BEFORE UPDATE ON fuentes
    FOR EACH ROW EXECUTE FUNCTION prensa.update_updated_at();

CREATE TRIGGER trg_noticias_updated_at
    BEFORE UPDATE ON noticias
    FOR EACH ROW EXECUTE FUNCTION prensa.update_updated_at();
