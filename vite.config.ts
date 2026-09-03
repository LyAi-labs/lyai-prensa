import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` es env-driven en build: `VITE_BASE=/` para servir en la raíz
// (docker/nginx sirviendo prensa.lyai.es), o `/lyai-prensa/` para GH Pages.
// Default sigue siendo `/lyai-prensa/` para no romper el workflow existente.
// En `npm run dev` es siempre `/`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/lyai-prensa/') : '/',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Dev: /api/* va a uvicorn local (mismo patrón que en producción, donde
    // Traefik enruta /api/* al contenedor `api` bajo el mismo origen — así
    // no hace falta CORS ni un VITE_API_BASE distinto entre dev y prod).
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
