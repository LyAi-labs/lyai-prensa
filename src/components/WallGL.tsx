import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { generateSampleNews, type NewsItem } from '../data/sampleNews'
import './Wall.css'

const ROWS = 3
const COLS = 36
const TILE_W = 260
const TILE_H = 170
const GAP_X = 22
const GAP_Y = 22
const POP_OUT_Z = 60

const STEP_X = TILE_W + GAP_X
const STEP_Y = TILE_H + GAP_Y
const WALL_W = COLS * STEP_X - GAP_X

const CAM_Z = 1500
const FOV = 40

// Zoom con la rueda: dolly de la cámara en Z, suavizado, con límites para no
// atravesar las tarjetas ni alejarse tanto que se pierda el efecto 3D.
const ZOOM_MIN = -950 // cámara más cerca (CAM_Z + esto)
const ZOOM_MAX = 1300 // cámara más lejos
const ZOOM_SPEED = 0.6 // world units por unidad de deltaY
const ZOOM_EASING = 10

// Inercia Newton: sin muelle, sin rebote. Un flick decae hasta parar.
const FRICTION = 2.6
const YAW_MAX = 0.3 // rad ≈ 17°, la cámara gira hacia la dirección de marcha
const YAW_VELOCITY_SATURATION = 1800
const YAW_EASING = 14
const PULLBACK_Z = 140 // la cámara retrocede al girar → barrido Cooliris

// Resolución de la textura de cada tarjeta (device-pixel-ish para que el
// texto no se vea borroso cuando la tile queda cerca de la cámara).
const TEX_SCALE = 2

function drawCard(item: NewsItem): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE_W * TEX_SCALE
  c.height = TILE_H * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const isContra = !!item.contradiction

  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  // Banda de color de la fuente arriba.
  ctx.fillStyle = item.sourceColor
  ctx.fillRect(0, 0, TILE_W, 5)

  // Nombre de la fuente + hora.
  ctx.font = '600 12px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = item.sourceColor
  ctx.fillText(item.source.toUpperCase(), 14, 26)
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  const t = item.publishedAt
  ctx.fillText(t, TILE_W - 14 - ctx.measureText(t).width, 26)

  // Titular, con wrap a 3 líneas.
  ctx.font = '600 15px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#f2f4f8'
  wrapText(ctx, item.headline, 14, 52, TILE_W - 28, 19, 3)

  // Resumen, 2 líneas.
  ctx.font = '12px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  wrapText(ctx, item.summary, 14, 118, TILE_W - 28, 15, 2)

  if (isContra) {
    ctx.strokeStyle = '#ffb020'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, TILE_W - 2, TILE_H - 2)
    ctx.fillStyle = '#ffb020'
    ctx.beginPath()
    ctx.arc(TILE_W - 18, TILE_H - 18, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  return c
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
) {
  const words = text.split(' ')
  let line = ''
  let lines = 0
  for (let i = 0; i < words.length && lines < maxLines; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxW && line) {
      const isLast = lines === maxLines - 1
      ctx.fillText(isLast ? `${line}…` : line, x, y + lines * lineH)
      lines++
      line = words[i]
    } else {
      line = test
    }
  }
  if (lines < maxLines && line) ctx.fillText(line, x, y + lines * lineH)
}

export default function WallGL() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x080a0f, 1800, 4200)

    const camera = new THREE.PerspectiveCamera(
      FOV,
      host.clientWidth / host.clientHeight,
      1,
      10000,
    )
    camera.position.set(0, 0, CAM_Z)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)

    const items = generateSampleNews(ROWS * COLS)
    const wall = new THREE.Group()
    scene.add(wall)

    const geo = new THREE.PlaneGeometry(TILE_W, TILE_H)
    const disposables: Array<{ dispose: () => void }> = [geo]

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const item = items[row * COLS + col]
        const tex = new THREE.CanvasTexture(drawCard(item))
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
        disposables.push(tex, mat)

        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(
          col * STEP_X - WALL_W / 2,
          (ROWS / 2 - row - 0.5) * STEP_Y,
          item.contradiction ? POP_OUT_Z : 0,
        )
        wall.add(mesh)

        // Reflejo espejado bajo la fila inferior.
        if (row === ROWS - 1) {
          const rmat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
          })
          disposables.push(rmat)
          const refl = new THREE.Mesh(geo, rmat)
          refl.position.set(
            mesh.position.x,
            mesh.position.y - TILE_H - 8,
            mesh.position.z,
          )
          refl.scale.y = -1
          wall.add(refl)
        }
      }
    }

    // ---- Física: posición + velocidad, fricción exponencial. Sin muelle.
    let posX = 0
    let velX = 0
    let yaw = 0
    let zoomTarget = 0
    let zoomCurrent = 0
    const maxX = WALL_W / 2 - 200
    const minX = -maxX
    const clamp = (v: number) => Math.max(minX, Math.min(maxX, v))

    let dragging = false
    let lastX = 0
    const samples: Array<{ t: number; x: number }> = []
    const pushSample = (t: number, x: number) => {
      samples.push({ t, x })
      while (samples.length && samples[0].t < t - 80) samples.shift()
    }

    // Escala mundo↔pantalla: cuánto se mueve el mundo por píxel de arrastre,
    // para que el muro siga al cursor 1:1 en el plano z=0.
    const worldPerPixel = () => {
      // Usa la distancia de cámara EFECTIVA (con zoom aplicado) para que el
      // arrastre siga siendo 1:1 con el cursor a cualquier nivel de zoom.
      const vh = 2 * Math.tan((FOV * Math.PI) / 180 / 2) * (CAM_Z + zoomCurrent)
      return vh / host.clientHeight
    }

    const el = renderer.domElement
    el.style.touchAction = 'none'

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      samples.length = 0
      pushSample(performance.now(), e.clientX)
      velX = 0
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = (e.clientX - lastX) * worldPerPixel()
      lastX = e.clientX
      pushSample(performance.now(), e.clientX)
      posX = clamp(posX - dx)
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      if (samples.length >= 2) {
        const a = samples[0]
        const b = samples[samples.length - 1]
        const dt = (b.t - a.t) / 1000
        if (dt > 0) velX = (-(b.x - a.x) / dt) * worldPerPixel()
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Swipe horizontal de trackpad, o Shift+rueda (convención estándar
      // para paneo en ratones sin rueda horizontal) → paneo lateral.
      const isPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey
      if (isPan) {
        const d = e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY) ? e.deltaY : e.deltaX
        velX += d * 12
      } else {
        // Rueda vertical normal → zoom (dolly de cámara en Z).
        zoomTarget = Math.max(
          ZOOM_MIN,
          Math.min(ZOOM_MAX, zoomTarget + e.deltaY * ZOOM_SPEED),
        )
      }
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth, host.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    let prev = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now

      if (!dragging) {
        posX += velX * dt
        velX *= Math.exp(-FRICTION * dt)
        if (Math.abs(velX) < 0.5) velX = 0
        if (posX <= minX || posX >= maxX) {
          posX = clamp(posX)
          velX = 0
        }
      }

      // Yaw: la cámara gira hacia donde se mueve, como Cooliris. Durante el
      // drag se deriva de las muestras del puntero; tras soltar, de velX.
      const effVel =
        dragging && samples.length >= 2
          ? (-(samples[samples.length - 1].x - samples[0].x) / 0.08) * worldPerPixel()
          : velX
      const yawT = Math.max(-1, Math.min(1, effVel / YAW_VELOCITY_SATURATION))
      yaw += (-yawT * YAW_MAX - yaw) * (1 - Math.exp(-YAW_EASING * dt))

      zoomCurrent += (zoomTarget - zoomCurrent) * (1 - Math.exp(-ZOOM_EASING * dt))

      camera.position.x = posX
      camera.position.z = CAM_Z + zoomCurrent + Math.abs(yaw / YAW_MAX) * PULLBACK_Z
      camera.rotation.y = yaw

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      if (el.parentElement === host) host.removeChild(el)
    }
  }, [])

  return (
    <div className="wall-root">
      <div ref={containerRef} className="wall-stage" />
      <div className="wall-overlay">
        <h1>LyAi · Prensa</h1>
        <p>WebGL · perspectiva real · inercia Newton</p>
      </div>
    </div>
  )
}
