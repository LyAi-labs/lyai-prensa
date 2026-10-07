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

