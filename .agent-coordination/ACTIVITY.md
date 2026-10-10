# Registro de actividad entre agentes — lyai-prensa

Append-only. Una entrada por cambio significativo (no por cada tool call).
Cualquier agente (Claude Code, Antigravity, Codex, Cursor...) lee esto al
empezar y añade una entrada al terminar algo que otro agente necesitaría saber
antes de tocar el mismo área. Formato libre, mínimo: fecha, agente, qué se
hizo, qué queda abierto.

Esto NO sustituye la memoria propia de cada agente ni la wiki — es solo el
"qué está pasando ahora mismo en este repo" compartido entre agentes distintos
que no se ven en tiempo real. Ver
`/opt/lyai/wiki/pages/protocols/proto-agent-coordination.md`.

---

- **2026-10-06** — Antigravity (AGY)
  - **Qué se hizo**: Implementación completa y despliegue de PWA para `lyai-prensa` en `https://prensa.lyai.es`.
    - Generados `manifest.webmanifest` y `manifest.json` con id, scope, shortcuts a Muro 3D y Bento, display standalone y theme black.
    - Generados iconos de alta resolución (192x192, 512x512, maskable 512x512, apple-touch-icon 180x180, favicon SVG y .ico).
    - Creado `public/sw.js` con cacheo de App Shell, estrategia Network-First para `/api/` con fallback offline a cache, y Stale-While-Revalidate para estáticos y fuentes.
    - Actualizado `index.html` con meta tags PWA, `viewport-fit=cover`, `apple-mobile-web-app-*`.
    - Actualizado `Dockerfile` (incorporando `COPY public ./public` antes de build) y `docker/nginx.conf` (con cabeceras `no-cache` y `Service-Worker-Allowed` para `sw.js` y `manifest`).
    - Añadido `src/pwa.ts` y componente interactivo `src/components/pwa/InstallPrompt.tsx` con soporte para instalación directa y guía iOS.
    - Reconstruido y redesplegado contenedor de producción `lyai_prensa`.
  - **Verificado**: `curl -I https://prensa.lyai.es/manifest.webmanifest` (200, `application/manifest+json`), `curl -I https://prensa.lyai.es/sw.js` (200, `Service-Worker-Allowed: /`).
  - **Qué queda abierto**: Si se desea sincronizar estos cambios con la rama `feature/muro-v2-bento` desplegada en `/v2/`.

- **2026-10-06 (update)** — Antigravity (AGY)
  - **Qué se hizo**: Actualizado el flujo de instalación de PWA para que el aviso/modal de instalación se muestre **automáticamente en pantalla** (bottom-sheet en móvil, card modal centrada en desktop) nada más cargar la app, sin requerir que el usuario busque en el menú del navegador.
  - **Detalles**:
    - Dispara automáticamente la invitación con botón directo de instalación "Instalar ahora" (que ejecuta el prompt nativo del navegador con el gesto del clic) o guía interactiva en iOS.
    - Respeta modo `isStandalone()` (oculto si ya está instalada).
    - Reconstruido y desplegado en producción `lyai_prensa`.

- **2026-10-06 (update 2)** — Antigravity (AGY)
  - **Qué se hizo**: Corrección de solapamiento visual entre controles y migración completa a `CalendarLocalized` (21st.dev).
    - **Solapamiento resuelto**: El botón flotante de instalación PWA (`.pwa-install-wrap`) estaba posicionado en `top: 96px; right: 28px`, colisionando con el desplegable del calendario y los botones de cabecera (`↺ HOY`, selector de fecha y `ViewSwitch`). Se ha reubicado como floating action button fijo en la esquina inferior derecha (`bottom: 24px; right: 28px; z-index: 50`, `bottom: 16px; right: 14px` en móvil), dejando la cabecera despejada.
    - **Integración de `CalendarLocalized`**:
      - Sustituido el componente rudimentario `DateCalendar` tanto en `WallGL.tsx` (Muro 3D) como en `DateNav.tsx` (Línea de tiempo) por el nuevo componente 21st.dev `CalendarLocalized` (`src/components/ui/calendar-localized.tsx`).
      - Cuenta con vista bimestral, selector de idioma (Español, English, Català, Galego, Euskara), marcas visuales de contradicciones y backdrop modal centrado con `z-index: 9995` y scroll automático responsivo.
    - **Verificación**: `npm run build` OK (0 errores), contenedor Docker `lyai_prensa` recompilado y reiniciado, `https://prensa.lyai.es` respondiendo HTTP 200.

- **2026-10-07** — Antigravity (AGY)
  - **Qué se hizo**: Creación e integración del Agente & Proceso de Inspección Visual Pre-Publicación (`pipeline/qa_wall_inspector.py` y `pipeline/qa_images.py`).
    - **Diagnóstico y purga de imágenes**: Se detectó que medios regionales (ej. Grupo Joly) inyectaban banners y logotipos corporativos por defecto en `og:image` de columnas de opinión y breves. Se creó un detector y purgado automático que limpia a `NULL` dichas URLs (934 noticias saneadas), permitiendo que el Muro 3D las renderice en su auténtico modo portada de periódico con masthead vectorial y tipografía serif.
    - **Protección en ingesta**: Actualizados `pipeline/ingest.py` y `pipeline/enrich_images.py` para rechazar placeholders y evitar que vuelvan a entrar a la base de datos.
    - **Agente QA Inspector (`pipeline/qa_wall_inspector.py`)**:
      - Audita las cards recientes en base de datos (saneando entidades HTML mal codificadas, tags rotos, imágenes placeholder y consistencia de claims/contradicciones).
      - Inspección E2E en navegador real (Headless Google Chrome vía Playwright): detecta pantallas en blanco ("pantalla en blanco"), valida carga y dimensiones de Canvas WebGL, escucha errores de consola JavaScript, prueba navegación y cambios de vista, y guarda capturas de pantalla de evidencia en `qa_reports/`.
      - Incorporado en `pipeline/cron_ingest.sh` con flag `--auto-fix`.
    - **Infraestructura Nginx**: Añadido proxy pass para `/api/` en `docker/nginx.conf` de `lyai_prensa` para asegurar enrutamiento interno homogéneo tanto en Traefik como en peticiones directas.
  - **Verificado**: Test de navegador real superado (100% libre de errores fatales JS), 0 incidencias críticas, build de producción desplegado y verificado en `https://prensa.lyai.es`.

- **2026-10-07 (update 2)** — Antigravity (AGY)
  - **Qué se hizo**: Integración de componente `comparison-03` (21st.dev / Hirael) y nivelación de altura en cards de contradicción.
    - **En `lyai-shared`**: Añadido `/opt/lyai/app/lyai-shared/components/comparison-03/` con `comparison-03.tsx`, `index.ts`, `demo.tsx`, `README.md`, y registrado en `registry.json` con tags y metadata. Commits `43e471a`, `f919eb9`.
    - **En `lyai-prensa`**:
      - Copiado `comparison-03.tsx` a `src/components/ui/` y reexportado en `src/components/ui/index.ts`.
      - Extendido con `ExpandableItem` y soporte para toggle `...más` / `...menos` en elementos extensos.
      - En `ContradictionComparison.tsx`: implementado sistema de texto truncado/expandible (`TruncatedText` a 2 líneas de titular y 3 de sumario, y `TruncatedClaimObject` para afirmaciones largas) con botón interactivo `...más`/`...menos`. Ambas tarjetas permanecen alineadas a la misma altura sin saltos visuales ni romper el grid.
      - Añadido selector de vista en popout modal (`⚖️ Comparativa 03` vs `📰 Tarjetas 3D`).
  - **Verificado**: Build de producción `npm run build` en 5.09s (0 errores TS/Vite). Commit `ed0e4dd`.


- **2026-10-10** — Claude Code
  - **Qué se hizo** (sesión con Ignacio, varios temas):
    1. Fix táctil Android: `moveDist < 6` (umbral tap-vs-drag) era igual para ratón y dedo en `WallGL.tsx` `onUp` — el jitter normal de un toque lo superaba y todo tap se clasificaba como arrastre (solo funcionaba deslizar). Ahora `tapSlop = pointerType==='touch' ? 14 : 6`.
    2. Añadido `RotateHint.tsx`: banner "gira el móvil" en `pointer: coarse` + `orientation: portrait`, montado en `App.tsx`.
    3. PWA Android: confirmado que contradicciones entre noticias del MISMO medio son intencionadas (`docs/contradiccion-criterios.md` caso límite "mismo medio, distinto día"). El problema real era que la guía de fallback (`InstallPrompt.tsx`, cuando `beforeinstallprompt` aún no disparó) mostraba instrucciones de Chrome ESCRITORIO ("icono en la barra de direcciones") en Android — añadida rama `isAndroid` con pasos reales (⋮ → Instalar aplicación). Además, quitado `e.preventDefault()` en `pwa.ts` sobre `beforeinstallprompt` para que Chrome muestre su propio diálogo nativo automáticamente (antes solo salía al pulsar nuestro botón propio).
    4. Contradicciones N-way (3+ noticias/medios implicados en el mismo dato): confirmado que el modelo de datos ya soporta `item.contradicciones` con varias entradas, pero TODO el frontend cogía siempre `contradicciones[0]` (sin orden garantizado en SQL). En `ContradictionComparison.tsx`, modo "Tarjetas 3D": cuando `item.contradicciones.length > 1`, nuevo layout con `DragBento`/`BentoTile` (sincronizado de `lyai-shared` a `src/shared/components/drag-bento/`) mostrando TODAS las tarjetas implicadas en una fila arrastrable, cada una con su claim resaltado + badge de intensidad individual. El modo "Comparativa 03" sigue siendo pairwise (usa el primer par).
  - **Pendiente de verificar**: nada probado en dispositivo Android real ni en producción — cambios solo compilados (`tsc --noEmit` limpio). Sin commit todavía.

- **2026-10-10 (cierre de sesión)** — Claude Code
  - **Desplegado y verificado** (Playwright, no a ciegas): fix tap Android, banner girar móvil, PWA
    prompt nativo + guía Android correcta, rejilla WebGL dispersa centrada, buscador ignora fecha
    con texto, panel N-way de contradicciones con `DragBento`/`BentoTile` (sincronizado de
    lyai-shared) mostrando TODAS las noticias implicadas en vez de solo la primera.
  - **Seguridad**: primer uso real de `/security-audit` a medida (protocolo `audit_tool_request`).
    Hallazgo Alto confirmado: SSRF en `/api/image-proxy` (`api/main.py:295`, sin allowlist, red
    Docker compartida con Postgres de lyai-ski) — propuesto al canal
    (`SEC-PROPOSED-lyai-prensa-image-proxy-ssrf`), **sin arreglar todavía**. Comando guardado en
    `.claude/commands/security-audit.md`.
  - **Pendiente, sin ejecutar**: migración del esquema `prensa` a un Postgres dedicado propio
    (`lyai_prensa_postgres`, imagen con pgvector) — aprobada por Ignacio, prompt de traspaso
    preparado para sesión nueva. 4 iniciativas grandes en curso (archivo/búsqueda pública,
    de-branding/anonimato, SEO, seguridad) — ver memoria del proyecto
    `project_pendientes_cierre_2026-10-10.md` para el detalle completo antes de tocar nada de esto.

- **2026-10-10 07:40 UTC — EN CURSO** — Claude Code (sesión cd8df931, migración Postgres)
  - **Qué estoy haciendo**: sacar el esquema `prensa` de `lyai_postgres` (el Postgres de lyai-ski) a un
    contenedor dedicado `lyai_prensa_postgres`. Ahora mismo **solo preparación**: producción intacta, el
    cron sigue escribiendo en la BD de siempre.
  - **Por favor, hasta que esta entrada diga CERRADO**:
    - NO recrear el contenedor `api` (`docker-compose up -d --build`, `--force-recreate`…). Si necesitas
      redesplegar el frontend usa `docker-compose up -d --no-deps prensa`.
    - NO hacer más `docker cp` al contenedor `api`: está parcheado en caliente (api/*.py + Pillow instalado
      a mano) y la imagen `lyai-prensa-api:latest` NO contiene ese código — cualquier recreate lo revertía.
      Lo dejo resuelto en esta migración (imagen reconstruida desde el árbol).
    - NO editar `.env`, `docker-compose.yml`, `pipeline/db.py` ni `pipeline/cron_ingest.sh` sin mirar aquí.
  - Avisaré en este mismo fichero de la ventana de corte (cron pausado unos minutos) y del cierre.

- **2026-10-10 08:25 UTC — VENTANA DE CORTE ABIERTA** — Claude Code (sesión cd8df931)
  - EJECUTA de Ignacio tras revisión de la sesión INFRA de lyai-ski (aprobado con condiciones). Cron de
    ingesta PAUSADO. **No lanzar pipeline a mano ni recrear `api` hasta la entrada de cierre.**

- **2026-10-10 08:35 UTC — CERRADO** — Claude Code (sesión cd8df931) · migración a Postgres dedicado
  - **Hecho** (corte 08:24 UTC, EJECUTA de Ignacio tras revisión de la sesión INFRA de lyai-ski): la BD de
    prensa es ahora el contenedor `lyai_prensa_postgres` (`docker-compose.db.yml`, base `prensa`,
    `127.0.0.1:5436`). `api` ya no está en `lyai-ski_ski_internal` y conecta con el rol de solo lectura
    `prensa_api`. Cron reactivado y escribiendo en la BD nueva. Detalle: CLAUDE.md § «Base de datos» y
    wiki `decisions/decision-2026-10-10-prensa-postgres-dedicado.md`.
  - **Lo que cambia para ti**:
    - `.env` trae la `DATABASE_URL` del HOST: `python3 -m pipeline.xxx` funciona sin `sed`. `pipeline/db.py`
      rechaza URLs que apunten a `lyai_postgres`/`lyai_db`. Quité de `db.py` el fallback
      `lyai_postgres -> 127.0.0.1` que había sin commitear (ya no hace falta).
    - La imagen de `api` se reconstruyó desde el árbol y ya contiene lo que estaba parcheado con
      `docker cp` (api/*.py, Pillow). **No más `docker cp`**: `docker-compose build api`.
      `constraints-api.txt` fija sus dependencias; `Dockerfile.api` lo usa.
    - Backup propio: `ops/postgres-backup.sh` (cada 6 h) y `ops/postgres-verify-backup.sh` (domingos).
  - **Abierto**: el esquema `prensa` sigue congelado en `lyai_postgres` (su DROP espera a Ignacio; no
    tocar) · rotación del rol `lyai`, a cargo de lyai-ski · `/opt/lyai/backups/prensa/` no sale del servidor.
  - Mi commit incluye también los pasos de `cron_ingest.sh` que estaban sin commitear (enrich_images,
    qa_wall_inspector): ya corrían en producción.

- **2026-10-10 09:02 UTC** — Claude Code (sesión cd8df931) · despliegue de `/archivo`
  - Reconstruyo y recreo `api` y `prensa` (EJECUTA de Ignacio). Añade `api/archivo.py`, `public/archivo/index.html`
    y un `location /archivo` en `docker/nginx.conf`. El muro no cambia.
  - **Desplegado y verificado 09:03 UTC** (Playwright contra producción: búsqueda, fichas, CSV, móvil, muro intacto).
    Detalle en CLAUDE.md § «Archivo para periodistas». Imágenes anteriores: `:pre-archivo-20261010`.
    Mi commit incluye lo que había sin commitear en `api/main.py` y `docker/nginx.conf` (ya estaba en producción).

## 2026-10-10 — Claude Code (sesión principal)
- Pedido: adaptar `lyai-shared/components/command-palette` (⌘K, existente sin usar) al estilo del
  action-searchbar de 21st.dev pegado por Ignacio, para la barra de búsqueda del `Toolbar.tsx`.
- Dev-xplain publicado: https://dev.lyai.pro/dev-xplain/2026-10-10-1530-search-dropdown-live/
  (dropdown inline con resultados reales vía `/api/archivo/noticias?q=`, contradicciones en rojo).
- Pendiente de "aplica" de Ignacio antes de tocar código. Nada editado aún en `src/`.

## 2026-10-10 (cont.) — Claude Code
- Reestructurado `/var/www/dev.lyai.pro/panel/lyai-shared/index.html` (fuera de este repo, pero
  mismo hilo de trabajo): layout tipo 21st.dev — sidebar con categorías reales (derivadas de tags
  del registry) + estado, rails "Estables"/"Últimos en el registro" con thumbnails reales, tabs,
  logo Λ de LyAi. Lógica de búsqueda/modal preservada sin regresión (verificado con Playwright).
  Backup: index.html.bak-20261010-pre-21stdev-layout.

## 2026-10-10 (cont.) — Claude Code
- `works-wheel` identificado en el panel: alta en registry.json/data.json (estaba el código en
  disco sin indexar, commiteado ahora) + thumbnail real recortada de una captura que pasó Ignacio.
- Deep-linking por hash en `dev.lyai.pro/panel/lyai-shared/`: `#<short>` abre el modal de ese
  componente directamente (carga inicial + hashchange), Escape cierra, el hash se limpia al
  cerrar. Así se puede pasar el enlace de una ficha concreta a otro agente.
  Backup: index.html.bak-20261010-pre-deeplink.

## 2026-10-10 (cont. 2) — Claude Code
- Bug reportado por Ignacio: "Catálogo" en la miga de pan del panel lyai-shared parecía clicable
  (estilo 21st.dev) pero era texto plano — no volvía a /panel/. Convertido en enlace real.
  Backup: index.html.bak-20261010-pre-breadcrumb-link.

## 2026-10-10 (cont. 3) — Claude Code
- Card de "lyai-shared" en /panel/ (índice general) sin imagen, a diferencia de las demás —
  añadida miniatura real (captura del panel rediseñado, thumbs/lyai-shared.png) + contador
  actualizado a 49 ÍTEMS. Backup: panel/index.html.bak-20261010-pre-lyai-shared-thumb.

## 2026-10-10 (cont. 4) — Claude Code
- Tarjetas de navegación del muro (`drawFloorArrow`) rediseñadas: fecha protagonista + pill-button
  real (spotlight-card + button.tsx de lyai-shared como referencia). Commit local, sin push
  (veto de Aurelius activo, SEC-021/022, no relacionado — avisar a Ignacio antes de push).
