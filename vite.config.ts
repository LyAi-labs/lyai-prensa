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
  },
}))
