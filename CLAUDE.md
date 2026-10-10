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
`lyai_prensa_parallax` (rama `feature/muro-parallax-unfurling`, build con `VITE_BASE=/v2/`) servido en
**https://prensa.lyai.es/v2/** sin tocar `prensa` ni `api`. Producción conserva su imagen, además
etiquetada como `lyai-prensa:pre-parallax-2026-10-02`. Retirar: `docker-compose -p lyai-prensa-parallax
-f docker-compose.parallax.yml down` (sin `-v`) + quitar `prensa-v2-*` de `routes.yml`
(copia previa: `routes.yml.bak-pre-prensa-v2-20261002-1837`).

`docker-compose.yml` define dos servicios en la red externa `traefik_traefik`; `api` cuelga además
de `lyai_prensa_db_net`, la red del Postgres propio (ver «Base de datos» abajo). Desde el 2026-10-10
ningún contenedor de prensa está en `lyai-ski_ski_internal`:

| Servicio | Contenedor | Dominio |
|---|---|---|
| `prensa` (frontend, nginx) | `lyai_prensa` | `Host(\`prensa.lyai.es\`)` |
| `api` (FastAPI) | `lyai_prensa_api` | `Host(\`prensa.lyai.es\`) && PathPrefix(\`/api\`)`, priority=10 |

<!-- verify: docker inspect lyai_prensa --format '{{.Name}}' | grep -q lyai_prensa -->
<!-- verify: docker inspect lyai_prensa_postgres --format '{{.State.Health.Status}}' | grep -q healthy -->
<!-- verify: ! docker inspect lyai_prensa_api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -q ski_internal -->

### 🗄️ Base de datos — Postgres DEDICADO (desde 2026-10-10)

El esquema `prensa` ya **no** vive en `lyai_postgres` (lyai-ski). Decisión y procedimiento:
`/opt/lyai/wiki/pages/decisions/decision-2026-10-10-prensa-postgres-dedicado.md`.

- **Contenedor** `lyai_prensa_postgres` (PostgreSQL 16.13 + pgvector 0.8.2, imagen fijada por digest),
  definido en **`docker-compose.db.yml`** — proyecto compose aparte (`lyai-prensa-db`): un
  `up --build`/`down` de la app no lo toca. Volumen **externo** `lyai_prensa_pgdata` (ni `down -v`
  lo borra), red `lyai_prensa_db_net`, puerto solo en `127.0.0.1:5436`. Base `prensa`.
- **Tres roles** (los crea `ops/prensa-db-bootstrap.sh`, idempotente):
  `postgres` (superusuario, solo por `docker exec`) · `prensa` (dueño del esquema, lectura/escritura:
  el pipeline) · `prensa_api` (**solo lectura**: el contenedor `api`).
- **`.env` trae la `DATABASE_URL` del HOST** (rol `prensa`, `127.0.0.1:5436`): cron y pipeline a mano la
  usan tal cual, sin `sed`. El contenedor `api` recibe otra, que monta `docker-compose.yml` con
  `PRENSA_API_DB_PASSWORD`. El superusuario va en `.env.db`, que `api` no carga.
- `pipeline/db.py` **rechaza** una URL que apunte a `lyai_postgres`/`lyai_db` (evita escribir en el
  esquema viejo por una variable exportada antigua).
- psql a mano: `docker exec -it lyai_prensa_postgres psql -U postgres -d prensa`.
- ⚠️ El esquema `prensa` **sigue existiendo, congelado, en `lyai_postgres`**. Su `DROP` espera días de
  estabilidad y confirmación explícita de Ignacio. No lo borres ni lo uses.
- ⚠️ **La imagen de `api` sale siempre del árbol** (`docker-compose build api`), nunca de `docker cp`:
  el 2026-10-10 producción llevaba 3 días con código y Pillow metidos a mano en el contenedor y una
  imagen `latest` que no los tenía — cualquier recreate lo habría revertido. `constraints-api.txt`
  fija las versiones exactas de sus dependencias.
  <!-- verify: test -f /opt/lyai/app/lyai-prensa/docker-compose.db.yml && test -x /opt/lyai/app/lyai-prensa/ops/prensa-db-bootstrap.sh -->

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
- Comparten `components/card/` (card DOM, overlay, peek, giro, splash), `components/views/` y `data/useNewsFeed.ts`.
  **Si se toca algo compartido, aplicarlo en las dos ramas** (`git checkout <otra> -- <ruta>`).
- La línea de tiempo y el bento agrupan titulares idénticos en una pieza (`views/stories.ts`); el detalle muestra
  «También lo cuentan» con los demás medios.

---

## 🗃️ Archivo para periodistas — `prensa.lyai.es/archivo` (2026-10-10)

Explorador público de solo lectura sobre toda la base: noticias, contradicciones, afirmaciones, medios y
método. **No es parte de la SPA del muro**: es una página estática propia, `public/archivo/index.html`
(JS a pelo, sin dependencias ni peticiones a terceros), que nginx sirve para todo `/archivo*`
(`docker/nginx.conf`). Su API es `api/archivo.py` (`/api/archivo/*`), con límite de 120 peticiones/min por IP.

- Cada ficha tiene URL propia: `/archivo/noticia/<id>` y `/archivo/contradiccion/<idA>_<idB>`.
- Las contradicciones se muestran **agrupadas por pareja de noticias** (en la base son pares de afirmaciones).
- Filtra los datos de prueba (`claims.extractor = 'seed'`) y las noticias con fecha futura; siguen en la base.
- Se renderiza en el navegador: para SEO serio haría falta servir el HTML ya montado desde el servidor.
- Mockup aprobado: https://dev.lyai.pro/dev-xplain/2026-10-10-0850-prensa-explorador-periodistas/
- Volver atrás: `docker tag lyai-prensa:pre-archivo-20261010 lyai-prensa:latest` (ídem `lyai-prensa-api`) y
  `docker-compose up -d --no-deps --no-build api prensa`.
  <!-- verify: test -f /opt/lyai/app/lyai-prensa/public/archivo/index.html && test -f /opt/lyai/app/lyai-prensa/api/archivo.py -->

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
- **Pipeline desde el host**: `python3 -m pipeline.extract_claims --limit 20` sin más — `.env` ya
  trae la URL del host (ver «Base de datos»). El viejo `sed 's/lyai_postgres/localhost/'` sobra.
- **Backup** (arreglado 2026-10-10): `ops/postgres-backup.sh` vuelca la base entera a
  `/opt/lyai/backups/prensa/` (SHA-256, 14 días) y `ops/postgres-verify-backup.sh` la restaura en un
  Postgres efímero para probar que sirve. En el crontab de `lyai`: cada 6 h (a y 20) y domingos 05:20;
  log en `/var/log/lyai/prensa-backup.log`; avisan por Telegram si fallan.
  ⚠️ Esa carpeta **no sale del servidor**: el espejo off-site solo recoge `/opt/lyai/backups/auto`.
- **Cron**: `*/30 * * * * pipeline/cron_ingest.sh` (crontab de `lyai`) — ingesta, imágenes, claims,
  embeddings, juez y QA. Una corrida dura 13-24 min y no lleva lock.

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
