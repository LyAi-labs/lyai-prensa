import { test, expect } from '@playwright/test'

// Verificación primaria por CONTRATO DE RED, no por píxeles: Playwright no
// puede inspeccionar de forma fiable el contenido de un <canvas> WebGL, así
// que la prueba que de verdad importa es esta — que /api/noticias devuelve
// contradicciones cuyo noticia_contraria_id apunta a un id real presente en
// la misma respuesta. Es justo lo que sampleNews.ts nunca garantizó.
test('el muro carga noticias reales con contradicciones vinculadas a un id real', async ({ page }) => {
  const consoleMessages: string[] = []
  page.on('console', (msg) => consoleMessages.push(msg.text()))

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/noticias') && res.status() === 200,
  )
  await page.goto('/')
  const response = await responsePromise
  const noticias = await response.json()

  expect(Array.isArray(noticias)).toBe(true)
  expect(noticias.length).toBeGreaterThan(0)

  const ids = new Set(noticias.map((n: { id: string }) => n.id))
  const conContradiccion = noticias.filter(
    (n: { contradicciones: unknown[] }) => n.contradicciones.length > 0,
  )
  expect(conContradiccion.length).toBeGreaterThan(0)

  for (const n of conContradiccion) {
    for (const c of n.contradicciones) {
      expect(ids.has(c.noticia_contraria_id)).toBe(true)
      expect(c.noticia_contraria_id).not.toBe(n.id)
    }
  }

  // Confirma que el frontend realmente montó la escena con estos datos (no
  // cayó al mock de sampleNews.ts por algún fallo silencioso).
  await expect
    .poll(() => consoleMessages.some((m) => m.includes('noticias cargadas:')), { timeout: 5000 })
    .toBe(true)
  const mensajeCarga = consoleMessages.find((m) => m.includes('noticias cargadas:'))
  expect(mensajeCarga).not.toContain('No se pudo cargar')

  await page.waitForTimeout(300) // deja un frame de render tras montar
  await page.screenshot({ path: 'e2e/screenshots/wall-with-real-data.png' })
})
