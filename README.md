# LyAi Prensa

Observatorio de prensa española: un muro 3D con las últimas noticias de ~80 medios
(nacionales, regionales por comunidad autónoma, TV y radio) y un pipeline que detecta
**contradicciones entre medios sobre un mismo hecho** — cifras oficiales distintas,
declaraciones que se contradicen, versiones incompatibles del mismo evento.

En producción: **https://prensa.lyai.es**

## Qué hace

1. **Ingesta** (`pipeline/fuentes.py` + `pipeline/ingest.py`) — RSS de cada fuente hacia
   `prensa.noticias`.
2. **Extracción de claims** (`pipeline/extract_claims.py`) — un LLM lee cada noticia y
   extrae afirmaciones atómicas y verificables (quién dijo/hizo/decidió qué).
3. **Embeddings** (`pipeline/embed_claims.py`) — vectoriza cada claim para poder buscar
   candidatos semánticamente parecidos entre medios distintos.
4. **Juez de contradicciones** (`pipeline/judge_contradictions.py`) — compara pares de
   claims candidatos y decide si son una contradicción, una coincidencia, o no están
   relacionados. Solo evalúa cada par una vez (memoria en `prensa.pares_evaluados`).
5. **Muro 3D** (`src/components/WallGL.tsx`, Three.js) — pinta las noticias reales vía
   `GET /api/noticias` y resalta las que tienen contradicción activa.

Todo el paso 2-4 corre sobre un stack **sin coste**: extracción y juicio vía Gemini
(tier gratuito de Google AI Studio), embeddings vía `bge-m3` en Ollama **local**, en el
mismo servidor — no hay ninguna API de pago en producción.

## Estructura

```
src/           frontend (React + Vite + Three.js) — el muro 3D
api/           FastAPI de solo lectura (/api/noticias, /api/fuentes, /api/health)
pipeline/      ingesta RSS + extracción de claims + embeddings + juez (Python)
database/      schema.sql + migraciones (Postgres + pgvector)
docs/          criterios de qué cuenta como "contradicción" (usado literalmente
               como parte del prompt del juez, no lo dupliques a mano)
e2e/           tests end-to-end (Playwright)
ops/           scripts de operación (backup de Postgres)
```

## Desarrollo local

**Frontend** (solo el muro, con datos de ejemplo si no hay API corriendo):
```bash
npm install
npm run dev          # http://localhost:3000, con proxy a la API
```

**Backend + pipeline** (Python 3.10+):
```bash
pip install -r requirements.txt
cp .env.example .env  # y rellena DATABASE_URL / GOOGLE_GENERATIVE_KEY
uvicorn api.main:app --reload --port 8000
```

El pipeline (`python -m pipeline.ingest`, `pipeline.extract_claims`, etc.) necesita
además Ollama corriendo localmente con el modelo `bge-m3` descargado
(`ollama pull bge-m3`) para los embeddings.

## Producción

Desplegado con `docker-compose` (no el plugin `docker compose`) detrás de Traefik. Dos
servicios: `prensa` (frontend, nginx) y `api` (FastAPI), ambos en `prensa.lyai.es`. La base
de datos es un Postgres propio con pgvector (`docker-compose.db.yml`, contenedor
`lyai_prensa_postgres`, base `prensa`).

Detalles operativos (redes, gotchas de despliegue, estado del pipeline, restricciones de
coste) → [`CLAUDE.md`](./CLAUDE.md).

## Descripción portable (para pegar en otras IAs/herramientas)

Bloque autocontenido para dar contexto a un modelo o agente que no tiene acceso a este
repo — por ejemplo, para pedir un favicon, un logo o cualquier pieza visual en ChatGPT u
otra herramienta de diseño. Cópialo tal cual:

> **LyAi Prensa** (`prensa.lyai.es`) es un observatorio de prensa española: un muro de
> noticias en 3D que agrega ~80 medios (nacionales, regionales, TV, radio) y detecta
> automáticamente contradicciones entre ellos sobre un mismo hecho (cifras oficiales
> distintas, declaraciones incompatibles). La estética es de "sala de control de datos":
> fondo casi negro con degradado radial muy oscuro (`#0a0b0d` → `#000000`, con un
> `#1a1d22` sutil en el centro), tarjetas de noticia individuales con una franja de color
> arriba (el color de cada medio), tipografía de palo seco (system-ui), y dos acentos neón
> usados con moderación: **cian `#00e5ff`** y **violeta `#a855f7`** (se usan para los
> controles de navegación, no para el fondo). Nada de colores pastel ni ilustración
> orgánica — es minimalista, tecnológico, tipo terminal de datos o Cooliris.
>
> Para un favicon: necesito algo simple y reconocible a 16×16/32×32 sobre fondo oscuro,
> coherente con esa paleta (negro + cian/violeta neón). Ideas: una rejilla abstracta de
> 3×3 tarjetas (referenciando el muro), una "P" geométrica con un acento neón, o un icono
> de contradicción/comparación (dos formas que casi se solapan) en cian y violeta.

## Recursos de marca

- **Nombre**: LyAi Prensa
- **URL producción**: https://prensa.lyai.es
- **Paleta**: fondo `#0a0b0d`/`#000000` (con `#1a1d22` de realce central) · acentos
  `#00e5ff` (cian) y `#a855f7` (violeta) · texto principal `rgba(255,255,255,0.92)`
- **Tipografía**: `system-ui, -apple-system, sans-serif`
- Ver `src/components/Wall.css` para el sistema visual completo del muro.
