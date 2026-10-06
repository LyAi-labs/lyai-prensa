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
