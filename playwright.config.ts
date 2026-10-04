import { defineConfig, devices } from '@playwright/test'

// Entorno remoto: Chromium ya viene preinstalado, Playwright no debe
// intentar descargarlo (ver PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD en el env).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        },
      },
    },
  ],
})
