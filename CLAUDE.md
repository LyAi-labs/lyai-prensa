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

## 🐳 Despliegue — Traefik por labels de Docker (no file provider)

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
<!-- verify: git -C /opt/lyai/app/lyai-prensa rev-parse --verify claude/resume-session-xLdtE -->

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
