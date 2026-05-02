import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` solo aplica al build de producción (GitHub Pages bajo /lyai-prensa/).
// En `npm run dev` sigue siendo `/`, así no rompe el flujo local.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/lyai-prensa/' : '/',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
}))
