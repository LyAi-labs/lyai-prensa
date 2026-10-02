# AGY.md — Antigravity Agent Instructions (lyai-prensa)

**Versión**: 1.0 (2026-09-17)
**Proyecto**: lyai-prensa · `/opt/lyai/app/lyai-prensa`
**Agente**: AGY (Antigravity, Google)
**Jefe de desarrollo / responsable de salud del server**: Claude Code (PM)
**Auditor de seguridad (veto vinculante)**: Aurelius
**CEO / Founder**: Ignacio

> Este fichero es tu TIER 3 (proyecto). Por encima están `/opt/lyai/app/CLAUDE.md`
> (TIER 2, todas las verticales) y `/home/lyai/.claude/CLAUDE.md` (TIER 1, vinculante
> para todo agente en este server). Si algo de aquí contradice esos dos, ganan ellos —
> avisa a Claude Code si detectas la contradicción, no la resuelvas por tu cuenta.

---

## Quién manda y cuándo preguntar

```
Ignacio (CEO)
 └─ Claude Code (PM / jefe de desarrollo, salud del server) ← reporta aquí
     ├─ Aurelius (auditor de seguridad — veto vinculante)
     └─ AGY (tú, lyai-prensa)
```

- Dudas técnicas de tu proyecto → resuélvelas tú, deja rastro (ver "Reportar 'done'" abajo).
- Cambios que tocan routing, BD compartida, costes o algo fuera de `lyai-prensa/` → pregunta a Claude Code antes de actuar.
- Coste ≥ $0.10 (cualquier API de pago) → autorización explícita de Ignacio, pedida vía Claude Code.
- Cualquier cosa con pinta de seguridad (secretos, auth, red) → Aurelius puede vetarlo; el veto es vinculante, no se discute, se cumple.

---

## Prohibiciones críticas (no negociables)

- ❌ Commitear `.env`, credenciales o cualquier secreto
- ❌ `docker compose down -v` — destruye datos de producción sin vuelta atrás
- ❌ Ignorar un veto de seguridad de Aurelius
- ❌ Gastar ≥ $0.10 en APIs sin autorización de Ignacio
- ❌ Editar `/home/lyai/.claude/CLAUDE.md` o `/opt/lyai/app/CLAUDE.md` (TIER 1/2) — eso es competencia de Claude Code
- ❌ Suponer que nginx del host enruta algo — no lo hace, ver abajo

---

## Estructura del server (lo que necesitas saber)

```
/opt/lyai/
├─ app/
│  ├─ CLAUDE.md              # TIER 2, tabla de verticales
│  └─ lyai-prensa/           # TU PROYECTO
│     ├─ AGY.md              # este fichero
│     ├─ docker-compose.yml  # cómo se despliega (ver Traefik abajo)
│     ├─ Dockerfile / Dockerfile.api
│     ├─ api/ · src/ · pipeline/ · database/ · docs/ · ops/ · e2e/
│     └─ .env.example        # plantilla — el .env real NO va en git
├─ wiki/pages/                # base de conocimiento compartida (markdown)
│  ├─ lessons/                # incidentes y soluciones ya vividas
│  └─ decisions/               # decisiones de arquitectura (ADR)
└─ state/                      # secretos/backups (fuera de git)

/home/lyai/.claude/CLAUDE.md   # TIER 1, vinculante para todo agente
/home/lyai/traefik/config/     # config REAL de Traefik (no está en /opt/lyai)
```

⚠️ Nota de proceso: cuando busques algo en la wiki, `grep -rni "<palabra>" /opt/lyai/wiki/pages/`
antes de asumir que un problema es nuevo. Casi seguro alguien ya lo pisó.

---

## Traefik / nginx — cómo enruta este server

**El host nginx no recibe tráfico de producción.** Todo el tráfico externo pasa por Traefik.
Fuente real de la config de Traefik: **`/home/lyai/traefik/config/`** (no `/opt/lyai/...`).
Dentro de esa carpeta, `routes.yml` es un symlink a `dynamic/routes.yml` (file provider,
recarga en caliente — no hace falta reiniciar Traefik al editarlo). Hay ~29 `.bak*` sueltos
en ese directorio de intentos anteriores; no los edites, no son la config viva.

**lyai-prensa NO usa el file provider.** Se enruta por **labels de Docker** directamente en
`docker-compose.yml` (provider Docker de Traefik, no el de fichero). Esto es correcto y
deliberado — es el mismo patrón que usan `dnb-api` y `agents-hub`. Configuración actual:

| Servicio | Dominio/regla | Red | Puerto interno |
|---|---|---|---|
| `prensa` (frontend) | `Host(\`prensa.lyai.es\`)` | `traefik_traefik` | 80 |
| `api` (backend) | `Host(\`prensa.lyai.es\`) && PathPrefix(\`/api\`)`, priority=10 | `traefik_traefik` + `lyai_postgres_net` | 8000 |

- `lyai_postgres_net` es un alias externo de la red real `lyai-ski_ski_internal` — la BD de
  prensa comparte red con Postgres de lyai-ski (confirmado con `docker inspect lyai_postgres`
  el 2026-09-04, commiteado el 2026-09-17 en `9c17be8`; decisión de fondo en la wiki,
  `decisions/decision-2026-09-04-separar-lyai-postgres-de-otros-proyectos.md`). Ya NO es un
  placeholder — no lo vuelvas a "confirmar", ya está en `docker-compose.yml`.
- `certresolver: letsencrypt`, entrypoint `websecure`; el challenge ACME lo atiende Traefik
  solo en el entrypoint `web`, no hace falta router HTTP propio.
- **Si cambias las labels**: `docker compose up -d --build` para que Traefik las relea —
  esto sí requiere recrear el contenedor, a diferencia del file provider.
- **Si necesitas tocar el file provider** (`/home/lyai/traefik/config/dynamic/routes.yml`)
  para algo de prensa (ej. un alias, un middleware compartido), avisa a Claude Code primero
  — ese fichero es la única fuente de verdad para TODO el routing basado en fichero del
  server, y un error ahí afecta a otras verticales.

Verificación tras cualquier cambio de routing:
```bash
curl -I -H "Host: prensa.lyai.es" http://localhost/
docker inspect lyai_prensa --format '{{json .NetworkSettings.Networks}}'
```

---

## Estado actual del proyecto (léelo antes de tocar nada)

Rama de trabajo: `claude/resume-session-xLdtE` (origin la tiene al día; en el server,
`git fetch origin && git checkout claude/resume-session-xLdtE && git pull` si no está ya).
**Antes de cualquier `checkout`/`pull`/`reset`: `git status` primero** — este repo ha tenido
cambios locales sin commitear que no estaban en el resumen de la sesión anterior (ver lección
en `/opt/lyai/wiki/pages/lessons/` una vez Claude Code la escriba, o pregunta si no aparece).


### ✨ Mejoras de cards en la versión normal (rama `feature/muro-mejoras-normal`, 2026-10-02)

El muro sigue siendo WebGL (`WallGL.tsx`, física intacta). Las cards del canvas **no admiten efectos de
DOM**, así que peek, giro y spotlight «salen» a **UNA card DOM** (`card/CardOverlay.tsx` + `card/NewsCard.tsx`)
colocada sobre la card del canvas bajo el cursor/dedo. En escena (Three.js): contradicciones a mayor Z según
intensidad + halo que late; «misma historia» atenúa el resto (`material.color`) e ilumina las gemelas.
Gestos: ratón quieto 450 ms o dedo mantenido 350 ms (<10 px) → peek (sticky con el dedo, se cierra tocando fuera);
click/toque → card girada. `drawCard` rediseñada (opción A «editorial»). Titulares con entidades HTML se decodifican
en `newsApi.ts`. Quitados: paneles `ContradiccionPanel`/`NoticiaPanel` y el HUD de depuración.
La galería parallax (`feature/muro-parallax-unfurling`, /v2) solo se diferencia en el muro; comparte `card/`.

### El muro 3D — NO toques la física del scroll sin que se pida explícitamente

`src/components/WallGL.tsx` (Three.js WebGL puro) es la implementación válida — `App.tsx`
solo monta este componente. `Wall.tsx` (CSS3DRenderer) y `WallPixi.tsx` (PixiJS) son
iteraciones descartadas, siguen en el repo pero no se usan; no las "recuperes" ni las borres
sin preguntar.

Costó varias iteraciones llegar a que se sintiera bien — no re-tunees por iniciativa propia:
- **Rueda (vertical/horizontal)** → paneo lateral, motor de física continuo (velocidad +
  fricción exponencial, `FRICTION = 2.6`, sin muelle ni rebote), integrado cada frame. Este es
  el método principal y el que mejor se siente — preservarlo.
- **Ctrl + rueda** → zoom (`ZOOM_MIN = -950`, `ZOOM_MAX = 1300`, `ZOOM_SPEED = 0.6`,
  `ZOOM_EASING = 10`); da pinch-to-zoom gratis porque el navegador reporta el pellizco como
  wheel+ctrlKey.
- **Arrastre con botón izquierdo** → paneo alternativo 1:1 (cursor `grab`→`grabbing`). El
  botón derecho NO arrastra — deja el menú contextual libre.
- Yaw (`YAW_MAX = 0.3` rad, `YAW_VELOCITY_SATURATION = 1800`, `YAW_EASING = 14`) + pullback en
  Z (`PULLBACK_Z = 140`) dan el barrido tipo Cooliris.
- Durante el drag, el yaw usa el tiempo real entre muestras, no una constante (era un bug ya
  corregido). `renderX`/`RENDER_SMOOTH = 55` filtra jitter de hardware sin lag perceptible.

**Principio de fondo**: paneo por rueda (física simulada) > arrastre (1:1 directo, sensible a
jitter). Cualquier cambio futuro de interacción debe preservar esa jerarquía.

### Pipeline de contradicciones — Fase A completa y verificada

Antes el muro pintaba `sampleNews.ts` (mock) con contradicciones sin pareja real. Ya resuelto:

- `pipeline/embed_claims.py` — embeddings de claims vía **Ollama local** (`bge-m3`, 1024 dim,
  sin coste). Antes era Voyage AI (de pago) — cambiado 2026-09-29: el proyecto no puede
  gastar en APIs hasta que genere ingresos (ver `RULES-COSTS.md`). `bge-m3` da 1024 dim por
  suerte, así que la migración/el esquema no cambiaron de forma.
- `pipeline/judge_contradictions.py` — candidatos por similitud coseno (sobremuestreo HNSW
  top-50, filtrado en Python, tope 8) + una llamada a **Gemini 2.5-flash** (gratis según
  `RULES-COSTS.md`, ver `pipeline/gemini.py`) por par claim-fuente contra el criterio de
  `docs/contradiccion-criterios.md` (se carga literalmente en runtime, no lo dupliques en el
  prompt a mano). Escribe en `pares_evaluados` (memoria de todo veredicto) y
  `contradicciones`, recalcula `noticias.intensidad_contradiccion`/`eje_z`.
- `api/` — FastAPI de solo lectura (`/api/noticias`, `/api/fuentes`, `/api/health`). Cada
  contradicción resuelve al ID real de la otra noticia.
- `src/data/newsApi.ts` + `WallGL.tsx` — fetch real con fallback a `sampleNews.ts` si falla.
- `database/migrations/001_voyage_embeddings_pares_evaluados.sql` — migración con guard que
  aborta si `embeddings` ya tiene filas (el nombre del fichero es histórico — el default de
  `modelo` ya apunta a `bge-m3`, no a Voyage; ver comentario dentro del propio SQL).
- Verificado end-to-end en sandbox aislado (Postgres 16 + pgvector, fixture en
  `database/seed_test_data.sql`) **sin gastar en llamadas reales**. Test E2E en
  `e2e/wall.spec.ts`.

### Fase B — esto es lo que toca ahora en el servidor real

1. `git status` primero, siempre, antes de tocar la rama.
2. `git fetch origin && git checkout claude/resume-session-xLdtE && git pull` si hace falta.
3. Backup antes de tocar la BD: `./ops/postgres-backup.sh schema prensa` — **roto ahora
   mismo**: `mkdir /var/backups/lyai_db` da Permission denied (el directorio es root:root
   755). O se arregla el permiso/BACKUP_DIR, o se pide a Ignacio, antes de fiarse de este
   paso.
4. ~~Confirmar red Docker de `lyai_postgres`~~ — **ya hecho y commiteado** (`9c17be8`,
   2026-09-17): es `lyai-ski_ski_internal`. No lo repitas.
5. ~~Añadir `VOYAGE_API_KEY`~~ — **ya no aplica** (2026-09-29): embeddings son locales
   (Ollama/bge-m3, sin key) y el juez/extractor usan `GOOGLE_GENERATIVE_KEY` (Gemini,
   gratis, reutilizada de `lyai-ski/backend/.env` — ya está en `.env` de este proyecto).
6. Aplicar migración: `psql "$DATABASE_URL" -f database/migrations/001_voyage_embeddings_pares_evaluados.sql`.
7. `docker-compose up -d --build` (en este server el binario es `docker-compose`, no el
   plugin `docker compose` — probado 2026-09-29); verificar `docker-compose ps`,
   `docker logs lyai_prensa_api --tail 50`, `curl -sk https://prensa.lyai.es/api/health`.
   ⚠️ El build del frontend puede quedarse en caché de Docker y no recoger cambios de
   `src/` aunque la imagen se reporte "Built" — si el `Created` del contenedor no cambia
   tras el build, forzar `docker-compose build --no-cache prensa && docker-compose up -d
   --force-recreate prensa`.
8. Primera corrida pequeña — **ya no requiere autorización de coste** (todo gratis desde el
   2026-09-29): `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed
   's/lyai_postgres/localhost/') python3 -m pipeline.ingest && ... extract_claims --limit 20
   && ... embed_claims --limit 20 && ... judge_contradictions --limit 20`. Nota el prefijo
   `DATABASE_URL=...localhost...`: el `.env` trae el hostname Docker (`lyai_postgres`), que
   solo resuelve dentro de la red del contenedor — para correr el pipeline en el host hay que
   sustituirlo por `localhost` (Postgres publica `127.0.0.1:5432`), sin tocar el `.env` (el
   contenedor `api` sí necesita el hostname tal cual).
9. No hay cron todavía para el pipeline — pendiente de cerrar una vez validado lo anterior.

### Restricciones activas

- **No usar modelos superiores a `gemini-2.5-flash`** en `extract_claims.py` /
  `judge_contradictions.py`, ni en código ni en subagentes — subir a `gemini-2.5-pro` (o
  volver a un proveedor de pago) requiere autorización explícita de Ignacio, no es gratis.
- Ser eficiente con el consumo de tokens/llamadas — no re-litigar decisiones ya tomadas y
  documentadas en el código o en `docs/`.

---

## dev-xplain (búsqueda de código)

Cuando necesites localizar algo en el repo sin leer todo el árbol, usa `dev-xplain` (o el
equivalente que tengas disponible en Antigravity) en modo búsqueda dirigida:
- Sirve para: "dónde está X", "qué archivo define Y", "quién referencia Z"
- No sirve para: revisión de código, análisis abierto, auditoría de consistencia — para eso
  lee los ficheros completos con tu herramienta de lectura normal.
- Regla de oro: si la pregunta tiene una respuesta de una línea (un path, una función), usa
  dev-xplain; si necesitas juicio o contexto de varias piezas, lee tú mismo.

---

## Wiki compartida

`/opt/lyai/wiki/pages/` es la memoria institucional del server, en markdown, versionada en
git y compartida entre todos los agentes (Claude Code, Aurelius, tú).

- **Antes de depurar algo**: `grep -rni "<keyword>" /opt/lyai/wiki/pages/`
- **`lessons/`**: incidentes ya vividos y su causa raíz — si tu bug huele a algo que ya pasó
  en otra vertical (Traefik, Postgres, secretos), probablemente está aquí.
- **`decisions/`**: por qué se decidió algo, no solo qué se decidió.
- **Si resuelves algo nuevo y no trivial**: escribe una lección en `lessons/` con fecha en
  el nombre del fichero (`lesson-2026-09-17-...md`) y coméntalo a Claude Code — la wiki la
  commitea Claude Code en el cierre, pero el contenido lo aportas tú.

---

## Sistema de memoria (persistente, no la wiki)

Distinto de la wiki: la wiki es historial compartido de incidentes; la memoria es contexto
vivo sobre el proyecto, el usuario y feedback de cómo trabajar. Vive en:
```
~/.claude/projects/-opt-lyai-app/memory/
├─ MEMORY.md          # índice, una línea por entrada, se auto-carga en cada sesión de Claude
├─ feedback_*.md       # correcciones/validaciones de cómo trabajar
├─ project_*.md        # estado de iniciativas en curso
├─ reference_*.md      # punteros a sistemas externos
└─ user_*.md            # perfil/preferencias de Ignacio
```
Esta memoria la gestiona principalmente Claude Code. Si aprendes algo sobre lyai-prensa que
debería sobrevivir a tu sesión (una decisión de Ignacio, un bug recurrente, una preferencia
de trabajo), repórtalo a Claude Code para que lo guarde — no escribas tú directamente en
`MEMORY.md` salvo que Claude Code te lo pida explícitamente.

---

## Reportar "done" (convención AUR-065, vinculante)

Cualquier "hecho" que le pases a Claude Code y que toque filesystem, BD, contenedor o config
necesita DOS marcadores o Claude Code no lo acepta:

1. **Contexto** — dónde ocurrió: `(server)`, `(docker: lyai_prensa)`, etc.
2. **Verificable** — comando que reproduce o refuta la afirmación: `docker inspect --format`,
   `SELECT COUNT(*)`, `grep VAR=`, diff antes/después, código HTTP de una curl.

Ejemplo:
> ✅ Añadido endpoint `/api/articles` (server, contenedor `lyai_prensa_api`)
> Verificación: `curl -s -o /dev/null -w '%{http_code}' https://prensa.lyai.es/api/articles` → `200`

Sin esto, Claude Code te lo va a pedir de vuelta — ahórrate la vuelta.

---

## Costes

- Gratis, sin pedir permiso: Gemini 2.5-flash, Overpass, Wikimedia, Anthropic Claude.
- De pago, requieren autorización de Ignacio antes de gastar ≥$0.10: Imagen 4, Google Places,
  cualquier servicio cloud facturable.
- Si no sabes si algo es de pago, pregunta a Claude Code antes de llamarlo, no después.

---

## Qué puedes hacer sin pedir permiso

✅ Cambios de código dentro de `lyai-prensa/`, commits locales, tests, lectura de wiki/logs,
migraciones de BD con backup previo, `docker compose up -d --build` de tus propios servicios.

⚠️ Con visto bueno de Claude Code ("aplica" = reversible): cambios de labels de Traefik,
variables de entorno no-secretas, dependencias nuevas.

❌ Requiere autorización explícita de Ignacio (palabra literal **EJECUTA** si toca producción/
routing compartido): gasto ≥$0.10, `docker compose down -v`, cambios a `/home/lyai/traefik/`
file provider, tocar la red `lyai_postgres_net` compartida con lyai-ski.

---

## Cierre de sesión

**No existe ya un protocolo manual tipo "PROTOCOLO-CIERRE-AURELIO.md" para ejecutar a mano.**
El cierre canónico en este server es:
```
/save-session
```
Esto consolida tu memoria de proyecto, deja rastro en la wiki si procede, y notifica al canal
de Aurelius con marcador AUR-065. Si terminas una tarea y detectas intención de cierre por
parte de Ignacio o de Claude Code, usa `/save-session` — no reconstruyas el protocolo antiguo
de memoria, quedó retirado.

---

## Checklist antes de empezar

- [ ] Confirmar acceso a `/opt/lyai/app/lyai-prensa/`
- [ ] `grep -rni "prensa" /opt/lyai/wiki/pages/` para ver qué ya se sabe
- [ ] Revisar `docs/backups-y-ha.md` y `docs/contradiccion-criterios.md` (ya existen en el repo)
- [ ] Entender: secretos van en `.env` fuera de git, routing es por labels de Docker, cierre
      es `/save-session`, cualquier duda de alcance → preguntar a Claude Code

---

**Creado**: 2026-09-17 · **Gestiona**: Claude Code (PM, jefe de desarrollo)
