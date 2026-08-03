import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { generateSampleNews, type NewsItem } from '../data/sampleNews'
import './Wall.css'

const ROWS = 3
const COLS = 36
const TILE_W = 260
const TILE_H = 170
const GAP_X = 22
const GAP_Y = 22
const RADIUS = 10

const WALL_W = COLS * TILE_W + (COLS - 1) * GAP_X
const WALL_H = ROWS * TILE_H + (ROWS - 1) * GAP_Y

// Inercia Newton pura: la velocidad decae por fricción exponencial hacia 0,
// sin rebote. Es la sensación de Cooliris — un flick sigue moviéndose y se
// para, no oscila. El "target" se elimina del modelo: el drag setea velocidad
// y a partir de ahí es todo integración.
const FRICTION = 2.6 // s⁻¹, coef de fricción exponencial (mayor = para antes)
const YAW_MAX = 0.22 // rad, ≈12.5°
const YAW_VELOCITY_SATURATION = 1600 // px/s a los que el yaw satura

type CardMeta = { g: Graphics; item: NewsItem; row: number; col: number; baseX: number }

export default function WallPixi() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let disposed = false
    let readyApp: Application | null = null
    const teardownFns: Array<() => void> = []

    ;(async () => {
      const app = new Application()
      await app.init({
        resizeTo: host,
        antialias: true,
        backgroundAlpha: 0,
        preference: 'webgpu',
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      if (disposed) {
        app.destroy(true, { children: true })
        return
      }
      readyApp = app
      host.appendChild(app.canvas)

      const items = generateSampleNews(ROWS * COLS)
      const cards: CardMeta[] = []

      // scene: contenedor exterior centra la vista; wall es lo que se mueve.
      const scene = new Container()
      const wall = new Container()
      scene.addChild(wall)
      app.stage.addChild(scene)

      // pintar los cards.
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = row * COLS + col
          const item = items[idx]
          const g = new Graphics()
          const isContradiction = !!item.contradiction

          g.roundRect(0, 0, TILE_W, TILE_H, RADIUS).fill({
            color: item.sourceColor,
            alpha: 0.9,
          })
          // franja lateral para diferenciar contradicciones (iter 1 provisional).
          if (isContradiction) {
            g.roundRect(0, 0, 8, TILE_H, 4).fill({ color: 0xffffff, alpha: 0.9 })
          }

          const baseX = col * (TILE_W + GAP_X)
          const y = row * (TILE_H + GAP_Y)
          g.position.set(baseX, y)
          wall.addChild(g)
          cards.push({ g, item, row, col, baseX })
        }
      }

      // Estado del scroll: solo posición y velocidad (modelo Newton).
      let posX = 0
      let velX = 0
      let yaw = 0

      const layout = () => {
        const w = app.screen.width
        const h = app.screen.height
        // centrar la wall vertical, el scroll horizontal se aplica en el ticker.
        scene.position.set(w / 2, h / 2 - WALL_H / 2)
        wall.pivot.set(0, WALL_H / 2)
      }
      layout()

      const maxScroll = Math.max(0, WALL_W - app.screen.width + 200)
      const clamp = (v: number) => Math.max(-maxScroll * 0.05, Math.min(maxScroll, v))

      // Input: pointer drag.
      let dragging = false
      let lastPointerX = 0
      let lastPointerT = 0
      app.canvas.style.touchAction = 'none'

      // Ventana de muestras para calcular velocidad de release (más estable
      // que usar solo el último delta, que suele ser 0 si el usuario paró).
      const samples: Array<{ t: number; x: number }> = []
      const pushSample = (t: number, x: number) => {
        samples.push({ t, x })
        const cutoff = t - 80 // ms
        while (samples.length && samples[0].t < cutoff) samples.shift()
      }

      const onPointerDown = (e: PointerEvent) => {
        dragging = true
        lastPointerX = e.clientX
        lastPointerT = performance.now()
        samples.length = 0
        pushSample(lastPointerT, e.clientX)
        velX = 0 // el drag inmediatamente mata la inercia previa
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
      }
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastPointerX
        lastPointerX = e.clientX
        const now = performance.now()
        lastPointerT = now
        pushSample(now, e.clientX)
        // Drag mueve directamente la posición 1:1 (agarras el muro).
        posX = clamp(posX - dx)
      }
      const onPointerUp = () => {
        if (!dragging) return
        dragging = false
        // Velocidad de release = pendiente de las últimas ~80 ms de muestras.
        if (samples.length >= 2) {
          const first = samples[0]
          const last = samples[samples.length - 1]
          const dt = (last.t - first.t) / 1000
          if (dt > 0) velX = -(last.x - first.x) / dt
        }
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        // Wheel inyecta velocidad, la fricción se encarga de decaer.
        velX += delta * 15
      }

      app.canvas.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('wheel', onWheel, { passive: false })

      // Loop: integra Newton (posición + velocidad × fricción) sin muelle.
      app.ticker.add((t) => {
        const dt = Math.min(0.05, t.deltaMS / 1000)

        if (!dragging) {
          // Solo cuando NO estamos arrastrando: aplica la inercia.
          posX += velX * dt
          velX *= Math.exp(-FRICTION * dt)
          if (Math.abs(velX) < 0.5) velX = 0
          // Rebote elástico solo si se sale de los límites (no como resorte).
          if (posX < 0) {
            posX = 0
            velX = 0
          } else if (posX > maxScroll) {
            posX = maxScroll
            velX = 0
          }
        }

        // Yaw derivado de la velocidad visible (sensación Cooliris).
        const effVel =
          dragging && samples.length >= 2
            ? -(samples[samples.length - 1].x - samples[0].x) / 0.08
            : velX
        const yawT = Math.max(-1, Math.min(1, effVel / YAW_VELOCITY_SATURATION))
        const targetYaw = -yawT * YAW_MAX
        yaw += (targetYaw - yaw) * (1 - Math.exp(-14 * dt))

        wall.position.x = -posX
        scene.rotation = yaw
        scene.scale.set(1 - Math.abs(yaw) * 0.05)
      })

      const onResize = () => layout()
      window.addEventListener('resize', onResize)

      teardownFns.push(() => {
        app.canvas.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        app.canvas.removeEventListener('wheel', onWheel)
        window.removeEventListener('resize', onResize)
      })
    })()

    return () => {
      disposed = true
      teardownFns.forEach((fn) => fn())
      if (readyApp) {
        if (readyApp.canvas?.parentElement === host) host.removeChild(readyApp.canvas)
        readyApp.destroy(true, { children: true })
      }
    }
  }, [])

  return (
    <div className="wall-root">
      <div ref={containerRef} className="wall-stage" />
      <div className="wall-overlay">
        <h1>LyAi · Prensa (Pixi v8)</h1>
        <p>Iter 1 · WebGPU/WebGL + spring physics</p>
      </div>
    </div>
  )
}
