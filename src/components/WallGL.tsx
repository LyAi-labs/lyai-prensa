import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { generateSampleNews, type NewsItem as MockNewsItem } from '../data/sampleNews'
import { fetchNoticias, type NewsItem } from '../data/newsApi'
import './Wall.css'

const ROWS = 3
const COLS = 36
const PAGE_SIZE = ROWS * COLS // 108 celdas por página
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

const ZOOM_MIN = -950
const ZOOM_MAX = 1300
const ZOOM_SPEED = 0.6
const ZOOM_EASING = 10

const FRICTION = 2.6
const RENDER_SMOOTH = 55
const YAW_MAX = 0.3
const YAW_VELOCITY_SATURATION = 1800
const YAW_EASING = 14
const PULLBACK_Z = 140

const TEX_SCALE = 2

function drawCard(item: NewsItem): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE_W * TEX_SCALE
  c.height = TILE_H * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const isContra = item.contradicciones.length > 0

  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  ctx.fillStyle = item.sourceColor
  ctx.fillRect(0, 0, TILE_W, 5)

  ctx.font = '600 12px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = item.sourceColor
  ctx.fillText(item.source.toUpperCase(), 14, 26)
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  const t = item.publishedAt
  ctx.fillText(t, TILE_W - 14 - ctx.measureText(t).width, 26)

  ctx.font = '600 15px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#f2f4f8'
  wrapText(ctx, item.headline, 14, 52, TILE_W - 28, 19, 3)

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

function drawFloorArrow(label: string, isRight: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 420 * TEX_SCALE
  c.height = 110 * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const mainColor = isRight ? '#00e5ff' : '#a855f7'

  // Fondo glassmorphism
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fillRect(0, 0, 420, 110)

  // Borde neón
  ctx.strokeStyle = mainColor
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, 416, 106)

  // Glow decorativo
  ctx.fillStyle = mainColor
  ctx.globalAlpha = 0.15
  ctx.fillRect(4, 4, 412, 102)
  ctx.globalAlpha = 1.0

  // Texto
  ctx.font = '700 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 210, 42)

  ctx.font = '600 13px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = mainColor
  ctx.fillText(isRight ? 'PULSA PARA AVANZAR EN EL TIEMPO' : 'PULSA PARA VER NOTICIAS RECIENTES', 210, 78)

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

function mockToNewsItem(m: MockNewsItem): NewsItem {
  return {
    id: m.id,
    source: m.source,
    sourceColor: m.sourceColor,
    headline: m.headline,
    summary: m.summary,
    publishedAt: m.publishedAt,
    contradicciones: m.contradiction
      ? [
          {
            id: `mock-${m.id}`,
            noticiaContrariaId: '',
            fuenteContraria: m.contradiction.counterSource,
            tema: 'general',
            intensidad: 0.7,
            razonamiento: m.contradiction.note,
          },
        ]
      : [],
  }
}

export default function WallGL() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [totalCount] = useState(3330)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      let items: NewsItem[]
      try {
        items = await fetchNoticias(PAGE_SIZE, page * PAGE_SIZE)
        if (items.length === 0 && page > 0) {
          // Si nos pasamos de página, volvemos a la 0
          setPage(0)
          return
        }
      } catch (err) {
        console.warn('No se pudo cargar /api/noticias, usando datos de ejemplo:', err)
        items = generateSampleNews(PAGE_SIZE).map(mockToNewsItem)
      }
      if (disposed) return

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

      const wall = new THREE.Group()
      scene.add(wall)

      const geo = new THREE.PlaneGeometry(TILE_W, TILE_H)
      const disposables: Array<{ dispose: () => void }> = [geo]

      // Render de tarjetas de la página actual
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const item = items[(row * COLS + col) % items.length]
          const tex = new THREE.CanvasTexture(drawCard(item))
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
          disposables.push(tex, mat)

          const mesh = new THREE.Mesh(geo, mat)
          mesh.position.set(
            col * STEP_X - WALL_W / 2,
            (ROWS / 2 - row - 0.5) * STEP_Y,
            item.contradicciones.length > 0 ? POP_OUT_Z : 0,
          )
          wall.add(mesh)

          // Reflejo espejado
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

      // ── Botones / Flechas 3D en el Suelo (Navegación entre Páginas) ──
      const floorArrowGeo = new THREE.PlaneGeometry(420, 110)
      disposables.push(floorArrowGeo)

      // Flecha Suelo Derecha (Avanzar / Noticias Anteriores)
      const rightFloorTex = new THREE.CanvasTexture(drawFloorArrow('AVANZAR PÁGINA »', true))
      rightFloorTex.colorSpace = THREE.SRGBColorSpace
      const rightFloorMat = new THREE.MeshBasicMaterial({ map: rightFloorTex, transparent: true })
      disposables.push(rightFloorTex, rightFloorMat)

      const rightFloorMesh = new THREE.Mesh(floorArrowGeo, rightFloorMat)
      rightFloorMesh.position.set(
        WALL_W / 2 + 180,
        -(ROWS / 2 + 0.7) * STEP_Y,
        40,
      )
      rightFloorMesh.userData = { isButton: true, action: 'next' }
      wall.add(rightFloorMesh)

      // Flecha Suelo Izquierda (Anterior / Noticias Recientes)
      const leftFloorTex = new THREE.CanvasTexture(drawFloorArrow('« PÁGINA ANTERIOR', false))
      leftFloorTex.colorSpace = THREE.SRGBColorSpace
      const leftFloorMat = new THREE.MeshBasicMaterial({ map: leftFloorTex, transparent: true })
      disposables.push(leftFloorTex, leftFloorMat)

      const leftFloorMesh = new THREE.Mesh(floorArrowGeo, leftFloorMat)
      leftFloorMesh.position.set(
        -WALL_W / 2 - 180,
        -(ROWS / 2 + 0.7) * STEP_Y,
        40,
      )
      leftFloorMesh.userData = { isButton: true, action: 'prev' }
      wall.add(leftFloorMesh)

      // ---- Física
      let posX = 0
      let renderX = 0
      let velX = 0
      let yaw = 0
      let zoomTarget = 0
      let zoomCurrent = 0
      const maxX = WALL_W / 2 - 200
      const minX = -maxX
      const clamp = (v: number) => Math.max(minX, Math.min(maxX, v))

      let dragging = false
      let lastX = 0
      let startX = 0
      let startY = 0

      const raycaster = new THREE.Raycaster()
      const mouseVec = new THREE.Vector2()

      const samples: Array<{ t: number; x: number }> = []
      const pushSample = (t: number, x: number) => {
        samples.push({ t, x })
        while (samples.length && samples[0].t < t - 80) samples.shift()
      }

      const worldPerPixel = () => {
        const vh = 2 * Math.tan((FOV * Math.PI) / 180 / 2) * (CAM_Z + zoomCurrent)
        return vh / host.clientHeight
      }

      const el = renderer.domElement
      el.style.touchAction = 'none'
      el.style.cursor = 'grab'

      const checkFloorClick = (clientX: number, clientY: number) => {
        const rect = el.getBoundingClientRect()
        mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
        mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouseVec, camera)
        const intersects = raycaster.intersectObjects([rightFloorMesh, leftFloorMesh])
        if (intersects.length > 0) {
          const hit = intersects[0].object
          if (hit.userData.action === 'next') {
            setPage((p) => p + 1)
          } else if (hit.userData.action === 'prev') {
            setPage((p) => Math.max(0, p - 1))
          }
          return true
        }
        return false
      }

      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        dragging = true
        lastX = e.clientX
        startX = e.clientX
        startY = e.clientY
        samples.length = 0
        pushSample(performance.now(), e.clientX)
        velX = 0
        el.setPointerCapture(e.pointerId)
        el.style.cursor = 'grabbing'
      }

      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = (e.clientX - lastX) * worldPerPixel()
        lastX = e.clientX
        pushSample(performance.now(), e.clientX)
        posX = clamp(posX - dx)
      }

      const onUp = (e: PointerEvent) => {
        if (!dragging) return
        dragging = false
        el.style.cursor = 'grab'

        const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY)
        if (moveDist < 6) {
          // Fue un click limpio sin arrastre → comprobar si pulsó la flecha del suelo
          if (checkFloorClick(e.clientX, e.clientY)) return
        }

        if (samples.length >= 2) {
          const a = samples[0]
          const b = samples[samples.length - 1]
          const dt = (b.t - a.t) / 1000
          if (dt > 0) velX = (-(b.x - a.x) / dt) * worldPerPixel()
        }
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        if (e.ctrlKey) {
          zoomTarget = Math.max(
            ZOOM_MIN,
            Math.min(ZOOM_MAX, zoomTarget + e.deltaY * ZOOM_SPEED),
          )
          return
        }
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        velX += d * 12
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

        let effVel = velX
        if (dragging && samples.length >= 2) {
          const first = samples[0]
          const last = samples[samples.length - 1]
          const dtSample = (last.t - first.t) / 1000
          if (dtSample > 0.001) {
            effVel = (-(last.x - first.x) / dtSample) * worldPerPixel()
          }
        }
        const yawT = Math.max(-1, Math.min(1, effVel / YAW_VELOCITY_SATURATION))
        yaw += (-yawT * YAW_MAX - yaw) * (1 - Math.exp(-YAW_EASING * dt))

        zoomCurrent += (zoomTarget - zoomCurrent) * (1 - Math.exp(-ZOOM_EASING * dt))
        renderX += (posX - renderX) * (1 - Math.exp(-RENDER_SMOOTH * dt))

        camera.position.x = renderX
        camera.position.z = CAM_Z + zoomCurrent + Math.abs(yaw / YAW_MAX) * PULLBACK_Z
        camera.rotation.y = yaw

        renderer.render(scene, camera)
      }
      tick()

      cleanup = () => {
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
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [page])

  const startNewsIdx = page * PAGE_SIZE + 1
  const endNewsIdx = Math.min((page + 1) * PAGE_SIZE, totalCount)

  return (
    <div className="wall-root">
      <div ref={containerRef} className="wall-stage" />
      
      {/* Botones Flotantes de Avanzar/Retroceder en Pantalla */}
      {page > 0 && (
        <button
          className="wall-arrow wall-arrow-left"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          title="Página Anterior / Noticias Recientes"
        >
          ‹
        </button>
      )}
      <button
        className="wall-arrow wall-arrow-right"
        onClick={() => setPage((p) => p + 1)}
        title="Página Siguiente / Avance en el tiempo"
      >
        ›
      </button>

      {/* Overlay Superior e Inferior */}
      <div className="wall-overlay">
        <div className="wall-header">
          <h1 className="wall-title">LyAi · Prensa</h1>
          <p className="wall-subtitle">Muro 3D · Perspectiva real · Inercia Newton</p>
        </div>

        <div className="wall-legend">
          <span className="legend-dot legend-dot-comet" />
          <span>Mostrando {startNewsIdx} - {endNewsIdx} de {totalCount} noticias (Página {page + 1})</span>
        </div>
      </div>
    </div>
  )
}
