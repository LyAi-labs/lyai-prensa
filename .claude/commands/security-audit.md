---
description: Auditoría de seguridad a medida para lyai-prensa (FastAPI + Postgres/pgvector + React/Vite/Three.js tras nginx+Traefik), con foco en SSRF del image-proxy, fuga de IP de visitantes/operador y endpoints públicos de api/.
---

# /security-audit — lyai-prensa

Generado por Aurelio (canal `audit_tool_request`, flag `AUDIT-TOOL-lyai-prensa-20261010`) el 2026-10-10, calibrado contra el código real del proyecto en esa fecha — no es una plantilla genérica. Si al ejecutar este comando algo de lo citado ya no coincide (fichero movido, línea distinta), es la realidad actual la que manda: verifícalo de nuevo con `Read`/`Grep`, no asumas que esta chuleta sigue vigente.

**Stack real confirmado** (no asumir nada fuera de esto sin comprobarlo tú):
- Frontend: React 18 + Vite 5 + TypeScript, Three.js/pixi.js/gsap/framer-motion, Radix UI, Tailwind. Build Docker multi-stage (`Dockerfile`: `node:20-alpine` → `nginx:alpine`) + despliegue paralelo a GitHub Pages (`.github/workflows/deploy-pages.yml`).
- Backend: FastAPI (`api/main.py`) sobre `psycopg2` con SQL parametrizado a mano (sin ORM), esquema `prensa` en un Postgres DEDICADO desde el 2026-10-10 (contenedor `lyai_prensa_postgres`, base `prensa`; `api` conecta con el rol de solo lectura `prensa_api`; pgvector para embeddings vía `pipeline/embed_claims.py`).
- Pipeline: Python puro — `pipeline/ingest.py` (RSS no confiable vía `feedparser`), `pipeline/gemini.py` (REST a Gemini con `?key=` en la URL), `pipeline/embed_claims.py` (Ollama local, modelo `bge-m3`), `pipeline/judge_contradictions.py`, `pipeline/qa_images.py`, `pipeline/seed_fuentes.py`.
- Deploy: `docker-compose.yml` — dos contenedores (`lyai_prensa` nginx, `lyai_prensa_api` FastAPI/uvicorn) detrás de Traefik, en redes `traefik_traefik` (externa) y `lyai_prensa_db_net` (propia: solo `api` y su Postgres). Hasta el 2026-10-10 `api` colgaba de `lyai-ski_ski_internal`, compartida con el Postgres de `lyai-ski`; re-verifica que no ha vuelto.
- Sin autenticación en ningún endpoint de `api/` — API pública de solo lectura (parece intencional: muro de noticias público). No lo trates como bug por sí solo, pero sí exige que **todo** lo que cuelgue bajo `/api/` siga siendo estrictamente de solo lectura (ningún `INSERT`/`UPDATE`/`DELETE` alcanzable desde ahí).
- `.env` correctamente en `.gitignore`, no trackeado (`git ls-files | grep env` → solo `.env.example`). Variables: `DATABASE_URL`, `GOOGLE_GENERATIVE_KEY` (key compartida con `lyai-ski/backend`, mismo nombre de variable — "single rotation surface"), `OLLAMA_BASE_URL`, `API_CORS_ORIGINS`.
- **No hay flags SEC-XXX/OPS-XXX previas para `lyai-prensa`** en `refs/FLAGS.md` ni `/opt/lyai/audits/INDEX.md` (grep vacío en ambos, 2026-10-10). Si para cuando ejecutes esto ya existe alguna, tu primer paso es leerla y re-verificarla explícitamente contra el código actual antes de seguir — no la ignores ni la repitas sin comprobar si ya se arregló.

---

## 0. Regla de oro (AUR-010, vinculante)

**Ningún hallazgo sin cita verificable.** Por cada afirmación de este informe debes incluir el comando exacto que la prueba — `grep -n`, `cat file:L-L`, `docker inspect --format`, `git log -p` — y, si es posible, su output real (recortado a lo relevante). "Parece inseguro" no es un hallazgo; "`api/main.py:295` solo comprueba el prefijo `http(s)://`, cero más — `grep -n 'startswith' api/main.py`" sí lo es. Si no puedes verificarlo en esta pasada, dilo explícitamente como "pendiente de verificar", nunca lo redondees a certeza.

---

## 1. SSRF / proxy abierto en `/api/image-proxy` (prioridad 1 — es el hallazgo central de este audit)

`api/main.py:288-296`:
```python
async def image_proxy(url: str = Query(...)):
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return Response(status_code=400, content="URL inválida")
```
Esa es la **única** validación. No hay allowlist de dominios, no hay bloqueo de rangos privados/loopback/metadata (`127.0.0.1`, `169.254.169.254`, `10.*`, `172.16-31.*`, `192.168.*`, ni de hostnames internos de Docker como `lyai_postgres`, `ollama`, `lyai_prensa_api` mismo). El contenedor `lyai_prensa_api` descarga la URL con un cliente `httpx` persistente (`get_httpx_client()`, línea 270) que sigue redirecciones (`follow_redirects=True`) y devuelve el contenido al que pidió — es decir, es un proxy abierto hacia dentro de la red Docker del servidor, no solo hacia internet.

Verifica tú mismo, en este orden:
1. `grep -n "startswith\|follow_redirects\|def image_proxy" api/main.py` — confirma que sigue sin allowlist/blocklist.
2. `docker inspect lyai_prensa_api --format '{{json .NetworkSettings.Networks}}'` — qué redes tiene hoy el contenedor (a fecha de este audit: `traefik_traefik` + `lyai-ski_ski_internal`).
3. `docker network inspect lyai-ski_ski_internal --format '{{range .Containers}}{{.Name}} {{end}}'` — qué más vive en esa red (a fecha de este audit incluye el Postgres compartido de `lyai-ski`). Si consigues reproducir en sandbox `curl 'http://localhost:8000/api/image-proxy?url=http://lyai_postgres:5432/'` o apuntar a un puerto interno conocido (p. ej. Ollama `11434`) y obtener una respuesta distinta de timeout, es prueba directa de SSRF explotable, no solo teórica.
4. Si hay despliegue en cloud (Hetzner no expone metadata service tipo AWS 169.254.169.254, pero verifícalo: `curl -s -m 2 http://169.254.169.254/ -o /dev/null -w '%{http_code}\n'` desde el host, no desde fuera) — descarta o confirma ese vector específico explícitamente, no lo asumas por el nombre genérico "SSRF".

Severidad si se confirma el punto 3: **Alta** (pivot lateral hacia servicios internos/compartidos con otro proyecto, no solo "server hace de proxy anónimo hacia internet").

## 2. `PIL.Image.open()` sobre bytes descargados vía el SSRF anterior (`api/main.py:333-343`)

El proxy decodifica con Pillow cualquier byte que la URL atacante-controlada haya devuelto, sin `Image.MAX_IMAGE_PIXELS` explícito ni límite de tamaño antes de decodificar (el `thumbnail()` redimensiona *después* de decodificar la imagen completa). Combinado con §1, esto es "URL arbitraria → Pillow decodifica bytes arbitrarios" — superficie clásica de decompression-bomb y de CVEs de parsing de imagen.
- `grep -n "Image.open\|MAX_IMAGE_PIXELS\|thumbnail" api/main.py`
- `pip show pillow 2>/dev/null | grep Version` dentro del contenedor (`docker exec lyai_prensa_api pip show pillow`) — compara contra CVEs conocidas de esa versión exacta, no de "Pillow" en general.
- `cat requirements.txt` — confirma que sigue sin pines de versión (`Pillow>=10.0`, no `==`). Sin lockfile de Python no hay reproducibilidad ni forma de saber qué versión corre realmente sin `pip show` en vivo.

Severidad: Media por sí sola, sube a Alta si se confirma §1 como explotable (la cadena completa es "fetch arbitrario" + "parseo sin límites").

## 3. Fuga de identidad del visitante a terceros (preocupación explícita de Ignacio)

`index.html:33-35` — el frontend real (no los componentes sueltos en `Componentes/`, confirma cuál se sirve realmente con `grep -rn "fonts.googleapis" index.html src/`) carga Google Fonts **directamente desde el navegador del visitante**:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet" />
```
Esto es exactamente lo que Ignacio describe como riesgo: cada visita hace que el navegador del visitante hable directo con Google, exponiéndole IP real + User-Agent + Referer — contradice el patrón de privacidad que el propio proyecto ya usa para imágenes (el `/api/image-proxy` existe precisamente para que las imágenes de terceros no las pida el navegador del visitante). Fix candidato: self-host las fuentes (`npm install @fontsource/...` o build-time download) y servirlas desde `/usr/share/nginx/html` igual que el resto de assets con hash de Vite.
- Verifica que no hay más orígenes de terceros cargados directo por el navegador: `grep -rniE "https?://[a-z0-9.-]+\.(com|net|io|dev)" index.html src --include=*.{html,ts,tsx} | grep -v "prensa.lyai.es\|localhost"`.

Severidad: Media (no es una brecha de datos propios, pero es exactamente la preocupación que se pidió auditar y tiene fix concreto y barato).

## 4. Logging de IPs y cabeceras que delatan infraestructura

- `docker/nginx.conf` no tiene `server_tokens off;` → revisa si el `Server:` header que llega al cliente final expone versión de nginx (`curl -sI https://prensa.lyai.es/ | grep -i server`; nota que Traefik puede estar reescribiendo esa cabecera — confírmalo contra `/home/lyai/traefik/config/` antes de culpar a nginx). Tampoco hay `Content-Security-Policy`, `X-Frame-Options` ni `Referrer-Policy` en ninguna respuesta — `grep -n "add_header" docker/nginx.conf`.
- `api/main.py:40-47`: CORS cae a `allow_origins=["*"]` si `API_CORS_ORIGINS` no está puesta. Revisa el valor real en producción (`docker exec lyai_prensa_api printenv API_CORS_ORIGINS` — sin volcar el resto del entorno) para confirmar si en prod se dejó vacío a propósito (el comentario en `.env.example:21-25` dice que "normalmente no hace falta") o es un olvido.
- Logging de IPs de visitantes: nginx (`docker/nginx.conf`, bloque `/api/`) reenvía `X-Real-IP`/`X-Forwarded-For` a FastAPI (línea 26-27) — correcto para que la app sepa quién pide qué, pero verifica dónde aterrizan esos logs y su retención: `docker inspect lyai_prensa --format '{{json .Mounts}}'` y `docker inspect lyai_prensa_api --format '{{json .Mounts}}'` — si no hay volumen montado para logs, son efímeros dentro del contenedor (default nginx: `/var/log/nginx/access.log`); si alguna vez se monta un volumen de logs, confirma que no cae en una ruta servida públicamente.
- Confirma que las llamadas salientes del propio servidor (Gemini, Ollama, proxy de imágenes) no incluyen cabeceras que delaten que esto es LyAi/Aurelio/Claude: `grep -n "User-Agent" api/main.py pipeline/ingest.py` (el `User-Agent` de `get_httpx_client()` en `api/main.py:278-281` ya suplanta un Chrome real — nota esto como mitigación ya existente para el proxy de imágenes, no como hallazgo).

Severidad: Baja/Media según lo que confirmes — son hardening, no explotación directa salvo que el `Server:` header real sí revele versión exacta y haya un CVE conocido para ella.

## 5. Ausencia de rate limiting

Ningún endpoint de `api/main.py` tiene límite de tasa — ni `/api/noticias?q=` (búsqueda `ILIKE`, coste de escaneo si crece la tabla) ni, sobre todo, `/api/image-proxy` (cada petición sin caché hace que **el servidor** descargue hasta 8MB de un host arbitrario — un atacante puede usar esto para hacerte gastar ancho de banda/CPU de forma gratuita, o apuntar a un host lento para agotar el pool de 100 conexiones de `get_httpx_client()`). nginx tiene `proxy_cache` para `/api/image-proxy` (`docker/nginx.conf:1,10-20`) pero el cache-key es `$arg_url` — una URL distinta por petición (trivial para un atacante) sigue llegando a FastAPI sin limitar.
- `grep -rn "limiter\|slowapi\|rate" api/ docker/nginx.conf` — confirma que no hay ninguna capa de rate limiting hoy.
- Revisa si Traefik tiene algún middleware de rate-limit global aplicable (`/home/lyai/traefik/config/`) que mitigue esto a nivel de edge aunque la app no lo tenga.

Severidad: Media, sube si se combina con §1/§2 (el vector de abuso de ancho de banda/CPU es el mismo endpoint que el SSRF).

## 6. Endurecimiento de contenedor

`Dockerfile.api` (`python:3.12-slim`) no declara `USER` → el proceso `uvicorn` corre como root dentro del contenedor. `Dockerfile` (frontend) usa `nginx:alpine` tal cual, que sí baja privilegios por defecto — confírmalo (`docker inspect lyai_prensa_api --format '{{.Config.User}}'` vacío = root; compara con `lyai_prensa`).

Severidad: Baja aislada, pero es defensa en profundidad justo para el contenedor que tiene el SSRF de §1 — si se compromete por una CVE de Pillow (§2), hoy lo hace como root del contenedor.

## 7. Inyección — repaso rápido (parece correcto, pero compruébalo, no lo asumas por este audit)

- `api/queries.py` y `pipeline/ingest.py`: todo el SQL usa `%(name)s`/`%s` parametrizados, incluso el WHERE dinámico de `build_noticias_where()` (`api/queries.py:24-64`) interpola solo *nombres* de parámetros fijos, nunca datos. `seccion_regex`/`todas_las_secciones_regex` (`api/classification.py`) se construyen desde el diccionario estático `SECCIONES`, no desde input de usuario directo — el `seccion` que llega por querystring solo se usa si `seccion in SECCIONES` (`api/main.py:85`). Verifica que sigue así: `grep -n "f\"\|f'" api/queries.py api/classification.py` no debería devolver interpolación de valores de usuario en SQL.
- `pipeline/ingest.py` inserta contenido de RSS **no confiable** (feeds de terceros) en `titular`/`descripcion` vía SQL parametrizado (`INSERT_NOTICIA_SQL`, línea 73-81) — correcto contra SQLi. Para XSS en el frontend: `grep -rn "dangerouslySetInnerHTML" src/` debe seguir vacío (lo está a fecha de este audit); si alguna vez aparece, sería XSS almacenado directo desde feeds RSS externos no confiables — trátalo como Crítico si lo encuentras, porque el payload no lo controla LyAi sino cualquier medio cuyo feed se ingiera.

Severidad: sin hallazgo mientras las dos comprobaciones anteriores sigan devolviendo lo mismo — este punto es para que no se te escape una regresión, no para abrir una flag hoy.

## 8. Dependencias

- Python: `requirements.txt` sin pines (`fastapi>=0.115`, `psycopg2-binary>=2.9`, `httpx>=0.27`, etc.) y sin lockfile — no hay forma de auditar versiones exactas sin mirar el contenedor en vivo. Usa `docker exec lyai_prensa_api pip list` y compara contra avisos de seguridad conocidos de esas versiones puntuales (especialmente Pillow, por §2).
- Node: sí hay `package-lock.json` → `npm audit --omit=dev` (o `npm audit` completo) dentro del repo es reproducible y debe ser el primer comando que corras en esta sección. Reporta solo vulnerabilidades con ruta de explotación real hacia este proyecto (build-time/dev tooling vs. runtime del bundle servido son severidades distintas).

---

## 9. Qué hacer con cada hallazgo Alto/Crítico

Para cada hallazgo de severidad **Alta** o **Crítica** que confirmes con cita verificable (no basta con "parece"):

1. Repórtalo en terminal con: cita exacta (`archivo:línea`), comando que lo reprodujo, severidad, fix propuesto.
2. Además, **apéndalo** como una línea JSON a `/opt/lyai/app/channels/Aurelius.jsonl` — formato calcado del uso real del canal a 2026-10-10 (no de `refs/CONVENTIONS.md`, que está desactualizado), por ejemplo:

```json
{"timestamp": "2026-10-10TXX:XX:XXZ", "from": "security-audit-lyai-prensa", "to": "aurelius", "msg_type": "flag_proposal", "status": "open", "priority": "high", "flag_id": "SEC-PROPOSED-lyai-prensa-image-proxy-ssrf", "context": "(server, /opt/lyai/app/lyai-prensa)", "content": "[AUR-065] Contexto=(server, /opt/lyai/app/lyai-prensa). <hallazgo con cita verificable: archivo:línea, comando, qué prueba>"}
```

Reglas de esa línea:
- `flag_id` **siempre** con prefijo `SEC-PROPOSED-lyai-prensa-<slug-corto-del-hallazgo>` — es una propuesta, no una flag canónica. El ID definitivo `SEC-XXX`/`OPS-XXX` lo asigna Aurelio al reconciliar contra `/opt/lyai/audits/INDEX.md`, nunca tú.
- `priority`: `"high"` para Alta, sube a lo que uses para Crítica si tu severidad es esa (sigue el mismo criterio que `BARRIDO-*`/`flag_proposal` ya en el canal: Alta/Crítica = `"high"`).
- `content` lleva siempre el marcador `[AUR-065] Contexto=(server, /opt/lyai/app/lyai-prensa).` al principio, seguido del hallazgo con su cita — ese marcador es la convención inter-agente vinculante (ver `CLAUDE.md` TIER 1, sección AUR-065): sin los dos marcadores (contexto + verificable) Aurelio no la acepta.
- Nunca escribas valores reales de `GOOGLE_GENERATIVE_KEY`/`DATABASE_URL` en el `content` — solo nombres de variable y rutas.
- Una línea por hallazgo, nunca agrupes varios hallazgos distintos en una sola propuesta.

No hay flags previas de `lyai-prensa` que re-verificar en esta pasada (confirmado vacío en `refs/FLAGS.md` e `INDEX.md` a 2026-10-10) — pero si entre esa fecha y la tuya Aurelio ya reconcilió alguna `SEC-PROPOSED-lyai-prensa-*` en una `SEC-XXX` canónica, tu primer paso es `grep -n "lyai-prensa" /opt/lyai/audits/INDEX.md` y re-verificarla explícitamente antes de proponer nada nuevo sobre el mismo hallazgo.
