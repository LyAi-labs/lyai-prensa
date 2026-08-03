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

// Spring físico crítico-amortiguado suave — reemplaza el `1 - Math.pow(1 - factor, dt)`
// exponencial por un muelle real con inercia. Ajustar con feel:
const SPRING_STIFFNESS = 90 // más = tira más fuerte al target
const SPRING_DAMPING = 14 // más = menos oscilación
const YAW_MAX = 0.28 // rad, ≈16°
const YAW_VELOCITY_SATURATION = 1400 // px/s a los que el yaw satura

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

      // Estado del scroll y del muelle.
      let targetX = 0 // objetivo en coords "cámara"
      let posX = 0 // posición actual (muelle)
      let velX = 0 // velocidad (px/s)
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

      const onPointerDown = (e: PointerEvent) => {
        dragging = true
        lastPointerX = e.clientX
        lastPointerT = performance.now()
        velX = 0
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
      }
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastPointerX
        lastPointerX = e.clientX
        const now = performance.now()
        const dt = Math.max(1, now - lastPointerT) / 1000
        lastPointerT = now
        // Drag mueve la cámara en dirección contraria al puntero (agarras el muro).
        targetX = clamp(targetX - dx)
        // Actualiza inmediatamente la velocidad para que el yaw responda.
        velX = -dx / dt
      }
      const onPointerUp = () => {
        if (!dragging) return
        dragging = false
        // Momentum: proyecta la velocidad actual sobre el target.
        targetX = clamp(targetX + velX * 0.25)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        targetX = clamp(targetX + delta)
      }

      app.canvas.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('wheel', onWheel, { passive: false })

      // Loop: integra el muelle y aplica yaw.
      app.ticker.add((t) => {
        const dt = Math.min(0.05, t.deltaMS / 1000)

        // Muelle explícito: fuerza hacia target, amortiguación por velocidad.
        const force = (targetX - posX) * SPRING_STIFFNESS
        velX += force * dt
        // amortiguación exponencial (equivalente a f = -damping*v integrado):
        velX *= Math.exp(-SPRING_DAMPING * dt)
        posX += velX * dt

        // Yaw derivado de la velocidad visible (sensación Cooliris).
        const yawT = Math.max(-1, Math.min(1, velX / YAW_VELOCITY_SATURATION))
        const targetYaw = -yawT * YAW_MAX
        // suavizado exponencial del yaw para que no salte.
        yaw += (targetYaw - yaw) * (1 - Math.exp(-12 * dt))

        wall.position.x = -posX
        scene.rotation = yaw
        // pequeño pull-back con yaw (efecto barrido).
        scene.scale.set(1 - Math.abs(yaw) * 0.06)
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
