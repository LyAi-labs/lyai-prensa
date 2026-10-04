# lyai-prensa — CLAUDE.md (TIER 2)

**Hereda de**: `/home/lyai/.claude/CLAUDE.md` (TIER 1 — costes, security, governance)
<!-- verify: test -f /home/lyai/.claude/CLAUDE.md -->
**Working dir** (server): `/opt/lyai/app/lyai-prensa/`
<!-- verify: test -d /opt/lyai/app/lyai-prensa -->
**Qué es**: observatorio de prensa española — muro 3D (Three.js) con ~80 fuentes (nacional,
regional por CCAA, TV, radio) y un pipeline que detecta contradicciones entre medios sobre el
mismo hecho. En producción en **prensa.lyai.es**.

⚠️ **Origen mixto, no lo olvides**: el proyecto empezó en Claude Code *web* y se trasplantó al
server; después una sesión de **Antigravity (agente Gemini de Google)** avanzó la Fase B del
pipeline usando sus propias instrucciones en **[AGY.md](./AGY.md)**. AGY.md sigue vigente para
quien trabaje desde Antigravity — este CLAUDE.md es el equivalente para Claude Code. **Si tocas
algo que también documenta AGY.md (estado del pipeline, restricciones de modelo, Fase B),
actualiza los dos a la vez** — no hay sincronización automática entre ellos y ya hay precedente
en esta organización de dos ficheros de reglas divergiendo sin que nadie se diera cuenta (ver
TIER 1, historia de `/home/lyai/projects/CLAUDE.md` vs el vigente).

---

## 🚫 Prohibiciones activas de este proyecto

- ❌ **Ninguna API de pago** hasta que la app genere ingresos (decisión de Ignacio,
  2026-09-29) — esto es más estricto que el umbral general de TIER 1 (≥$0.10 requiere
  autorización): aquí es **$0 sin excepción** salvo que Ignacio lo autorice explícitamente.
  Ver "Pipeline de contradicciones" abajo — todo el stack LLM se reescribió el 2026-09-29
  para cumplir esto.
- ❌ **NO** re-tunees la física del muro 3D (`src/components/WallGL.tsx`) sin que se pida
  explícitamente — costó varias iteraciones llegar a que se sintiera bien. Detalle completo
  en AGY.md § "El muro 3D".
- ❌ **NO** subas `JUEZ_MODEL`/`EXTRACTOR_MODEL` (`pipeline/gemini.py`) a un modelo *Pro* o de
  pago sin autorización de coste de Ignacio.

---

## 🐳 Despliegue — Traefik por `routes.yml` (provider de FICHERO)

⚠️ **Corregido 2026-10-02:** esta sección decía «por labels de Docker (no file provider)». Es falso:
`/home/lyai/traefik/config/traefik.yml` solo declara el provider de fichero, así que **las labels de
`docker-compose.yml` no hacen nada**. El routing de prensa está en `dynamic/routes.yml`
(`prensa-https` p.50, `prensa-api-https` p.200, `prensa-v2-https` p.100). Detalle y procedimiento en
AGY.md § «Traefik / nginx». Se descubrió al desplegar `/v2` con labels: Traefik las ignoró.

**Versión experimental en paralelo (2026-10-02):** `docker-compose.parallax.yml` levanta
`lyai_prensa_parallax` (rama `feature/muro-v2-bento` hoy; el fichero sigue citando
`feature/muro-parallax-unfurling` porque no se ha tocado desde que esa rama fue sustituida — ver
«Vistas y ramas» más abajo) servido en **https://prensa.lyai.es/v2/** sin tocar `prensa` ni `api`.
Producción conserva su imagen, además etiquetada como `lyai-prensa:pre-parallax-2026-10-02`. Retirar:
`docker-compose -p lyai-prensa-parallax -f docker-compose.parallax.yml down` (sin `-v`) + quitar
`prensa-v2-*` de `routes.yml` (copia previa: `routes.yml.bak-pre-prensa-v2-20261002-1837`).

**Segunda versión experimental en paralelo (2026-10-02 noche):** `docker-compose.parallax3.yml` levanta
`lyai_prensa_parallax3` (rama `feature/muro-v3-parallax-original`, `VITE_BASE=/v3/`) en
**https://prensa.lyai.es/v3/**, mismo patrón que `/v2`, sin tocar `prensa`/`api`/`prensa_parallax`.
Retirar: `docker-compose -p lyai-prensa-parallax3 -f docker-compose.parallax3.yml down` (sin `-v`) +
quitar `prensa-v3-*` de `routes.yml` (copia previa: `routes.yml.bak-pre-prensa-v3-20261002-2327`).
Detalle de la vista → «Vistas y ramas» más abajo.

`docker-compose.yml` define dos servicios, ambos en la red externa `traefik_traefik` más
`lyai_postgres_net` (alias de `lyai-ski_ski_internal`, compartida con la BD de lyai-ski):

| Servicio | Contenedor | Dominio |
|---|---|---|
| `prensa` (frontend, nginx) | `lyai_prensa` | `Host(\`prensa.lyai.es\`)` |
| `api` (FastAPI) | `lyai_prensa_api` | `Host(\`prensa.lyai.es\`) && PathPrefix(\`/api\`)`, priority=10 |

<!-- verify: docker inspect lyai_prensa --format '{{.Name}}' | grep -q lyai_prensa -->
<!-- verify: docker inspect lyai_postgres --format '{{.Name}}' | grep -q lyai_postgres -->

⚠️ **En este server el binario es `docker-compose` (v5.1.3), NO el plugin `docker compose`**
(probado 2026-09-29: `docker compose up` falla con "unknown command"). Usa siempre el guion.
<!-- verify: command -v docker-compose -->

⚠️ **El build del frontend puede quedarse en caché y NO recoger cambios de `src/`**, aunque
`docker-compose up -d --build` reporte la imagen como "Built". Comprueba que
`docker inspect lyai_prensa --format '{{.Created}}'` cambió tras el build; si no, fuerza:
```bash
docker-compose build --no-cache prensa && docker-compose up -d --force-recreate prensa
```

⚠️ **La rama que está en producción es `claude/resume-session-xLdtE`, NO `main`** — `main`
es un "first commit" casi vacío, sin relación con lo desplegado. Antes de asumir que "main" es
la rama de referencia, comprueba `git -C /opt/lyai/app/lyai-prensa log --oneline -1
claude/resume-session-xLdtE` contra lo que corren los contenedores.

✅ **Actualizado 2026-10-02:** producción (`lyai_prensa`, imagen `lyai-prensa:latest`, build 19:27 UTC) se
construyó desde **`feature/muro-mejoras-normal`** (cards rediseñadas, peek/giro/misma historia, splash;
muro WebGL intacto), con «EJECUTA» de Ignacio — la rama `claude/resume-session-xLdtE` ya NO es lo
desplegado. **Volver atrás** (imagen anterior conservada):
`docker tag lyai-prensa:pre-parallax-2026-10-02 lyai-prensa:latest && docker-compose up -d --force-recreate --no-deps prensa`
(sin `--build`; no toca `api`). `/v2/` (rama `feature/muro-parallax-unfurling`) sigue en paralelo.
<!-- verify: git -C /opt/lyai/app/lyai-prensa rev-parse --verify claude/resume-session-xLdtE -->

---


## 🧪 Rama `feature/muro-parallax-unfurling` (2026-10-02) — ⚠️ SUSTITUIDA por `feature/muro-v2-bento` (ver «Vistas y ramas»)

En esa rama `App.tsx` monta `src/components/parallax/` (galería DOM inclinada en 3D con parallax
por columnas, inspirada en «3d-parallax-unfurling-gallery» de 21st.dev) + `Splash.tsx` en vez de
`WallGL.tsx`. `WallGL.tsx` y su física **siguen intactos en el repo** como vuelta atrás; en `main`/la
rama de producción nada cambia. Cards con spotlight al hover y giro (flip) al click; contradicciones
con borde/glow rojo. Lección: el `transform-origin` del plano 3D debe anclarse al viewport (el plano
mide decenas de miles de px con la carga infinita) o cualquier giro mínimo deforma la rejilla.

## ✨ Mejoras de cards en la versión normal (rama `feature/muro-mejoras-normal`, 2026-10-02)

El muro sigue siendo WebGL (`WallGL.tsx`, física intacta). Las cards del canvas **no admiten efectos de
DOM**, así que peek, giro y spotlight «salen» a **UNA card DOM** (`card/CardOverlay.tsx` + `card/NewsCard.tsx`)
colocada sobre la card del canvas bajo el cursor/dedo. En escena (Three.js): contradicciones a mayor Z según
intensidad + halo que late; «misma historia» atenúa el resto (`material.color`) e ilumina las gemelas.
Gestos: ratón quieto 450 ms o dedo mantenido 350 ms (<10 px) → peek (sticky con el dedo, se cierra tocando fuera);
click/toque → card girada. `drawCard` rediseñada (opción A «editorial»). Titulares con entidades HTML se decodifican
en `newsApi.ts`. Quitados: paneles `ContradiccionPanel`/`NoticiaPanel` y el HUD de depuración.
La galería parallax (`feature/muro-parallax-unfurling`, /v2) solo se diferencia en el muro; comparte `card/`.

---


## 🗂️ Vistas y ramas (actualizado 2026-10-02 noche)

- **Versión normal** (`feature/muro-mejoras-normal`, la base de producción): muro 3D WebGL como vista
  **predeterminada** + **línea de tiempo como opción** (selector arriba al centro, `components/views/`).
  La opción NO se recuerda entre visitas: siempre se entra por el muro.
- **v2** (`feature/muro-v2-bento`, desplegada en `/v2/`): igual, pero el muro es un **bento horizontal** que se
  arrastra (`components/bento/`, referencia «bento-gallery» de 21st.dev) en vez del WebGL. La galería parallax
  anterior sigue en `feature/muro-parallax-unfurling` (sin uso).
- **v3** (`feature/muro-v3-parallax-original`, desplegada en `/v3/`, 2026-10-02 noche): añade una **tercera**
  pestaña «Parallax» (`components/parallax3/ParallaxGallery.tsx`) junto a Muro y Línea de tiempo — **nunca
  predeterminada**. Adapta el componente *3d-parallax-unfurling-gallery* de 21st.dev tal como se archivó en
  `Componentes/lyai-components/components/marketing/3d-parallax-unfurling-gallery/` (código + prompt original,
  sin usar en producción): mismo mecanismo de scroll con **framer-motion** (`useScroll`/`useTransform`/
  `useSpring`, banner que se expande 0→15% del scroll y rejilla 3D que se endereza + parallax por columna
  15→100%), pero las 4 columnas se rellenan con `useNewsFeed` (noticias reales) en vez de `UNSPLASH_IMAGES`.
  Reutiliza `CardOverlay`/`NewsCard`, `DateNav` y `views/stories.ts` — no toca `WallGL.tsx` ni `BentoWall.tsx`.
  Precedida por dev-xplain verificado (`2026-10-02-2315-muro-v3-parallax-21st-original`), aplicada y
  desplegada con "aplica"/"EJECUTA" explícitos de Ignacio. Infra: `docker-compose.parallax3.yml` (contenedor
  `lyai_prensa_parallax3`) + `routes.yml` (`prensa-v3-https`/`-strip`/`-svc`, calcados de los de `/v2`).
  Retirar: `docker-compose -p lyai-prensa-parallax3 -f docker-compose.parallax3.yml down` (sin `-v`) + quitar
  las 3 entradas `prensa-v3-*` de `routes.yml` (backup previo: `routes.yml.bak-pre-prensa-v3-20261002-2327`).
- Comparten `components/card/` (card DOM, overlay, peek, giro, splash), `components/views/` y `data/useNewsFeed.ts`.
  **Si se toca algo compartido, aplicarlo en las ramas que lo usen** (`git checkout <otra> -- <ruta>`).
- La línea de tiempo, el bento y el parallax agrupan titulares idénticos en una pieza (`views/stories.ts`); el
  detalle muestra «También lo cuentan» con los demás medios.

---

## 🧩 Componentes compartidos (`src/shared/`) y veto — 2026-10-02

- `src/shared/` es **copia sincronizada de `/opt/lyai/app/lyai-shared`** (flip-card, anchored-overlay, view-switch, splash-screen,
  timeline, drag-bento, use-dwell, use-spotlight). **No se edita aquí**: se cambia en `lyai-shared` y
  `/opt/lyai/app/lyai-shared/bin/lyai-shared-sync . --update` (en las DOS ramas: normal y v2). Estado: `lyai-shared-sync . --check`.
- En prensa queda solo el contenido y el dominio: `card/NewsCard` (sobre FlipCard), `card/CardOverlay` (sobre AnchoredOverlay),
  `card/Splash` (sobre SplashScreen), `views/TimelineView` (sobre Timeline), `bento/BentoWall` (v2, sobre DragBento).
- **Antes de `git push`/deploy: `cat /opt/lyai/state/aurelius-veto.json`**; si `"active": true`, avisar a Ignacio (regla transversal).
- Mapa de la empresa: `/opt/lyai/wiki/pages/mapa-empresa-lyai.md`.
  <!-- verify: test -f /opt/lyai/app/lyai-prensa/src/shared/lyai-shared.manifest.json -->

---

## 🧠 Pipeline de contradicciones — stack 100% gratuito (reescrito 2026-09-29)

`extract_claims.py` → `embed_claims.py` → `judge_contradictions.py`. Antes usaba Claude
Opus/Sonnet (Anthropic) + Voyage AI, todo de pago. Sustituido porque el proyecto no puede
gastar hasta que genere ingresos:

- **Embeddings** (`pipeline/embed_claims.py`): **Ollama LOCAL** en este mismo servidor,
  modelo `bge-m3` (1024 dim — por suerte igual que Voyage, no hizo falta tocar el esquema).
  Sin key, sin coste, sin límite de cuota. Requiere `systemctl is-active ollama`.
  <!-- verify: systemctl is-active ollama -->
  <!-- verify: ollama list | grep -q bge-m3 -->
- **Extracción + juez** (`pipeline/extract_claims.py`, `pipeline/judge_contradictions.py`,
  vía `pipeline/gemini.py`): **Gemini** (Google AI Studio), REST puro con `httpx`, sin SDK —
  mismo patrón que `lyai-ski/backend/services/llm/providers/google.py`. Usa
  `GOOGLE_GENERATIVE_KEY` en `.env` (variable reutilizable entre proyectos, "single rotation
  surface"). **El modelo concreto vive SOLO en `pipeline/gemini.py` (`GEMINI_MODEL`)** — no
  lo hardcodees en otro sitio, porque Google retira modelos: `gemini-2.5-flash` (el que citaba
  `RULES-COSTS.md`) ya no está disponible para keys nuevas, verificado 2026-09-29 contra un
  404 real; el sucesor gratuito hoy es `gemini-3.8-flash`. Si esto vuelve a fallar con 404, la
  política volvió a quedarse atrás — revalida contra `ai.google.dev/gemini-api/docs/pricing`
  antes de subir de generación, no asumas.
  <!-- verify: grep -q 'GEMINI_MODEL = "gemini-3.8-flash"' /opt/lyai/app/lyai-prensa/pipeline/gemini.py -->
- **Rate limit real del tier gratuito**: ~20 req/min (confirmado por un 429 con
  `generate_content_free_tier_requests, limit: 20`). Los tres scripts pacean con
  `SLEEP_ENTRE_LLAMADAS` (~3.5s) entre llamadas — no lo quites, un lote de más de un puñado
  de noticias falla en cadena sin él.
- **Gotcha de conexión a BD desde el host**: `.env` trae `DATABASE_URL` con el hostname
  Docker `lyai_postgres` (solo resuelve dentro de la red del contenedor). Para correr el
  pipeline directamente en el host (`python -m pipeline.xxx`, como documenta AGY.md), hay que
  sustituir el host por `localhost` (Postgres publica `127.0.0.1:5432`) **sin tocar el
  `.env`** — el contenedor `api` sí necesita el hostname tal cual:
  ```bash
  DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/lyai_postgres/localhost/') \
    python3 -m pipeline.extract_claims --limit 20
  ```
- **Backup roto**: `ops/postgres-backup.sh` falla con `Permission denied` al crear
  `/var/backups/lyai_db` (directorio `root:root 755`, el usuario `lyai` no puede escribir
  ahí). No arreglado todavía — no des por hecho que el backup corrió solo porque el script no
  dio error de sintaxis.
- **Cron**: no hay ninguno todavía para el pipeline (extracción/embeddings/juez corren solo a
  mano). Pendiente de decidir cadencia una vez validada una corrida grande.

---

## 📦 Recursos heredados

- **TIER 1** (`/home/lyai/.claude/CLAUDE.md`): costes, security, governance, prohibiciones.
- **AGY.md**: instrucciones para el agente Antigravity/Gemini — ver aviso de origen mixto
  arriba. Contiene el estado detallado de la Fase B y la física del muro.
- **Memoria persistente**: `~/.claude/projects/-opt-lyai-app-lyai-prensa/memory/`
<!-- verify: test -d /home/lyai/.claude/projects/-opt-lyai-app-lyai-prensa/memory -->

---

**Creado**: 2026-09-29 (no existía TIER 2 para este proyecto hasta hoy — Ignacio lo señaló al
abrir AGY.md en VSCode y no encontrar su equivalente Claude Code).
