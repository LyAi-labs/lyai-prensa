import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { generateSampleNews, type NewsItem as MockNewsItem } from '../data/sampleNews'
import { fetchDiasContradiccion, fetchNoticias, type Contradiccion, type NewsItem } from '../data/newsApi'
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

// 2 se quedaba corto al hacer zoom (Ctrl+rueda acerca la cámara hasta
// CAM_Z+ZOOM_MIN = 550, ~2.7x más cerca que la distancia por defecto) — la
// textura de 520x340px se magnificaba y se veía borrosa. 4 da margen de sobra.
const TEX_SCALE = 4

// Rojo >0.7 (contradicción fuerte), ámbar 0.4-0.7, amarillo <0.4 — puntos de
// partida sin validar contra volumen real (hoy solo hay 1 contradicción en
// producción), ver dev-xplain 2026-09-29-2206-prensa-card-header-medio-seccion.
function contraColor(intensidad: number): string {
  if (intensidad > 0.7) return '#ef4444'
  if (intensidad > 0.4) return '#f59e0b'
  return '#eab308'
}

const CONTRA_STRIP_H = 24
const HEADER_H = 26

// Trunca con "…" si no cabe en maxWidth, en vez de dejar que se solape con
// lo que venga al lado — antes "EL DIARIO MONTAÑÉS (CANTABRIA)" se comía la
// hora porque el nombre no tenía límite de ancho.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + '…'
}

function drawCard(item: NewsItem): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE_W * TEX_SCALE
  c.height = TILE_H * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const contra = item.contradicciones[0]
  const isContra = !!contra
  const contentH = isContra ? TILE_H - CONTRA_STRIP_H : TILE_H

  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  // Borde fino del color del medio en vez de bloque sólido de fondo — el
  // color sigue identificando al medio de un vistazo, pero enmarcando en
  // vez de rellenar (feedback: "el color solido es demasiado pobre").
  ctx.strokeStyle = item.sourceColor
  ctx.lineWidth = 1.5
  ctx.strokeRect(0.75, 0.75, TILE_W - 1.5, TILE_H - 1.5)

  ctx.font = '800 13px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = item.sourceColor
  ctx.fillText(fitText(ctx, item.source.toUpperCase(), TILE_W - 44), 12, HEADER_H / 2 + 8)

  if (item.imagenUrl) {
    ctx.font = '11px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('🖼', TILE_W - 26, HEADER_H / 2 + 8)
  }

  ctx.font = '10px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(item.publishedAt, 12, HEADER_H + 15)

  ctx.font = '600 15px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#f2f4f8'
  wrapText(ctx, item.headline, 12, HEADER_H + 38, TILE_W - 24, 19, 3)

  ctx.font = '12px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  wrapText(ctx, item.summary, 12, HEADER_H + 104, TILE_W - 24, 15, Math.max(1, Math.floor((contentH - HEADER_H - 104) / 15)))

  if (isContra) {
    const color = contraColor(contra.intensidad)

    ctx.fillStyle = color
    ctx.globalAlpha = 0.14
    ctx.fillRect(0, TILE_H - CONTRA_STRIP_H, TILE_W, CONTRA_STRIP_H)
    ctx.globalAlpha = 1

    ctx.font = '700 11px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = color
    const label = `CONTRADICE A ${contra.fuenteContraria.toUpperCase()}`
    ctx.fillText(label, 12, TILE_H - CONTRA_STRIP_H / 2 + 4, TILE_W - 60)

    const score = contra.intensidad.toFixed(1)
    ctx.font = '700 11px system-ui, -apple-system, sans-serif'
    ctx.fillText(score, TILE_W - 14 - ctx.measureText(score).width, TILE_H - CONTRA_STRIP_H / 2 + 4)
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
    enlace: '',
    imagenUrl: null,
    contradicciones: m.contradiction
      ? [
          {
            id: `mock-${m.id}`,
            noticiaContrariaId: '',
            fuenteContraria: m.contradiction.counterSource,
            tema: 'general',
            intensidad: 0.7,
            razonamiento: m.contradiction.note,
            claimPropio: { sujeto: m.source, predicado: 'afirma', objeto: m.headline },
            claimContrario: { sujeto: m.contradiction.counterSource, predicado: 'afirma lo contrario', objeto: '' },
          },
        ]
      : [],
  }
}

export default function WallGL() {
  const containerRef = useRef<HTMLDivElement>(null)
  const debugRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<NewsItem[]>([])
  const [page, setPage] = useState(0)
  const [totalCount] = useState(3330)
  const [activeContra, setActiveContra] = useState<{ item: NewsItem; contradiccion: Contradiccion } | null>(null)
  const [activeNoticia, setActiveNoticia] = useState<NewsItem | null>(null)
  // Ancla de fecha del botón Hoy/calendario — YYYY-MM-DD, o null = "lo más
  // reciente" (comportamiento de siempre, sin filtro de fecha).
  const [dateAnchor, setDateAnchor] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)

  const goToday = () => {
    setDateAnchor(null)
    setPage(0)
    setShowCalendar(false)
  }

  const goToDate = (isoDate: string) => {
    setDateAnchor(isoDate)
    setPage(0)
    setShowCalendar(false)
  }

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      let items: NewsItem[]
      try {
        const antes = dateAnchor ? `${dateAnchor}T23:59:59.999` : undefined
        items = await fetchNoticias(PAGE_SIZE, page * PAGE_SIZE, antes)
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
      itemsRef.current = items

      const scene = new THREE.Scene()
      // near=1800 quedaba a solo 300 unidades de CAM_Z (1500) — con
      // ZOOM_MAX=1300 (cámara hasta 2800), cualquier zoom-out moderado ya
      // entraba en niebla y apagaba el contraste del texto (se percibía como
      // "desenfoque", confirmado con el HUD de depuración: z=2160 ya
      // fogueado). La niebla ahora solo entra cerca del límite de zoom-out.
      const FOG_NEAR = CAM_Z + ZOOM_MAX - 100 // 2700
      const FOG_FAR = CAM_Z + ZOOM_MAX + 700 // 3500
      scene.fog = new THREE.Fog(0x080a0f, FOG_NEAR, FOG_FAR)

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
      const cardMeshes: THREE.Mesh[] = []

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
          mesh.userData = { item }
          wall.add(mesh)
          cardMeshes.push(mesh)

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

      // Solo abre un panel si la card tiene contradicción o foto — el resto
      // del muro sigue siendo "solo panear", sin sorpresas al hacer click.
      // La contradicción tiene prioridad (es la info más urgente).
      const checkCardClick = (clientX: number, clientY: number) => {
        const rect = el.getBoundingClientRect()
        mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
        mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouseVec, camera)
        const intersects = raycaster.intersectObjects(cardMeshes)
        if (intersects.length > 0) {
          const item = intersects[0].object.userData.item as NewsItem
          if (item?.contradicciones.length > 0) {
            setActiveContra({ item, contradiccion: item.contradicciones[0] })
            return true
          }
          if (item?.imagenUrl) {
            setActiveNoticia(item)
            return true
          }
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
          // Fue un click limpio sin arrastre → comprobar flecha de suelo, luego card
          if (checkFloorClick(e.clientX, e.clientY)) return
          if (checkCardClick(e.clientX, e.clientY)) return
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

        // HUD de depuración — escribe directo al DOM (sin setState) para no
        // añadir un re-render de React a 60fps.
        if (debugRef.current) {
          debugRef.current.textContent =
            `z: ${camera.position.z.toFixed(0)} (CAM_Z ${CAM_Z} + zoom ${zoomCurrent.toFixed(0)})  ·  ` +
            `x: ${renderX.toFixed(0)}  ·  ` +
            `zoomTarget: ${zoomTarget.toFixed(0)}  ·  ` +
            `px/world: ${worldPerPixel().toFixed(3)}`
        }
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
  }, [page, dateAnchor])

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

      {/* Navegación por fecha: volver a lo más reciente, o saltar a un día */}
      <div className="wall-date-nav">
        <button className="wall-date-btn wall-date-btn-today" onClick={goToday} title="Volver a lo más reciente">
          ↺ HOY
        </button>
        <button
          className="wall-date-btn wall-date-btn-cal"
          onClick={() => setShowCalendar((v) => !v)}
          title="Saltar a una fecha"
          aria-label="Abrir calendario"
        >
          📅
        </button>
        {showCalendar && (
          <DateCalendar
            selected={dateAnchor}
            onSelect={goToDate}
            onClose={() => setShowCalendar(false)}
          />
        )}
      </div>

      {/* Overlay Superior e Inferior */}
      <div className="wall-overlay">
        <div className="wall-header">
          <h1 className="wall-title">LyAi · Prensa</h1>
          <p className="wall-subtitle">Muro 3D · Perspectiva real · Inercia Newton</p>
        </div>

        <div className="wall-legend">
          <span className="legend-dot legend-dot-comet" />
          <span>
            {dateAnchor ? `Noticias hasta el ${dateAnchor} · ` : ''}
            Mostrando {startNewsIdx} - {endNewsIdx} de {totalCount} noticias (Página {page + 1})
          </span>
        </div>
      </div>

      {/* HUD de depuración — cámara Z (zoom) y X (paneo horizontal), para
          diagnosticar el desenfoque de las tarjetas a distintas distancias. */}
      <div
        ref={debugRef}
        style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          background: 'rgba(0,0,0,0.35)',
          padding: '3px 8px',
          borderRadius: 4,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      {activeContra && (
        <ContradiccionPanel
          data={activeContra}
          contrarioEnlace={
            itemsRef.current.find((i) => i.id === activeContra.contradiccion.noticiaContrariaId)?.enlace
          }
          onClose={() => setActiveContra(null)}
        />
      )}

      {activeNoticia && <NoticiaPanel item={activeNoticia} onClose={() => setActiveNoticia(null)} />}
    </div>
  )
}

function ContradiccionPanel({
  data,
  contrarioEnlace,
  onClose,
}: {
  data: { item: NewsItem; contradiccion: Contradiccion }
  contrarioEnlace?: string
  onClose: () => void
}) {
  const { item, contradiccion: c } = data
  const color = contraColor(c.intensidad)
  const nivel = c.intensidad > 0.7 ? 'fuerte' : c.intensidad > 0.4 ? 'moderada' : 'leve'

  return (
    <div className="contra-backdrop" onClick={onClose}>
      <div className="contra-panel" onClick={(e) => e.stopPropagation()}>
        <div className="contra-panel-head">
          <span className="contra-panel-title" style={{ color }}>
            ⚠ Contradicción detectada · {c.tema}
          </span>
          <button className="contra-panel-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="contra-panel-meter">
          <div className="contra-meter-labels">
            <span>Intensidad del desacuerdo</span>
            <span style={{ color }}>
              {c.intensidad.toFixed(1)} · {nivel}
            </span>
          </div>
          <div className="contra-meter-track">
            <div
              className="contra-meter-fill"
              style={{ width: `${c.intensidad * 100}%`, background: color }}
            />
          </div>
        </div>

        <div className="contra-panel-cols">
          <div className="contra-col">
            <div className="contra-col-source" style={{ color: item.sourceColor }}>
              {item.source.toUpperCase()}
            </div>
            <div className="contra-col-claim">
              "{c.claimPropio.sujeto} {c.claimPropio.predicado} {c.claimPropio.objeto}"
            </div>
            {item.enlace && (
              <a className="contra-col-link" href={item.enlace} target="_blank" rel="noreferrer">
                Leer noticia ↗
              </a>
            )}
          </div>
          <div className="contra-col">
            <div className="contra-col-source">{c.fuenteContraria.toUpperCase()}</div>
            <div className="contra-col-claim">
              "{c.claimContrario.sujeto} {c.claimContrario.predicado} {c.claimContrario.objeto}"
            </div>
            {contrarioEnlace && (
              <a className="contra-col-link" href={contrarioEnlace} target="_blank" rel="noreferrer">
                Leer noticia ↗
              </a>
            )}
          </div>
        </div>

        {c.razonamiento && (
          <div className="contra-panel-reasoning">
            <b>Razonamiento del juez:</b> {c.razonamiento}
          </div>
        )}
      </div>
    </div>
  )
}

function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Panel de detalle al hacer click en una card con foto (Iteración 4, opción
// A: la card del muro se queda compacta y sin foto — solo se ve aquí). El
// footer de comentarios/compartir/guardar de la plantilla original se
// sustituye por el link real a la noticia (no hay esos datos en la app).
function NoticiaPanel({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  return (
    <div className="contra-backdrop" onClick={onClose}>
      <div className="noticia-panel" style={{ borderColor: item.sourceColor, boxShadow: `0 0 30px -4px ${item.sourceColor}80, 0 30px 60px -20px rgba(0,0,0,.8)` }} onClick={(e) => e.stopPropagation()}>
        <div className="noticia-panel-head">
          <span className="noticia-panel-name" style={{ color: item.sourceColor }}>
            {item.source}
          </span>
          <button className="contra-panel-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {item.imagenUrl && <img className="noticia-panel-img" src={item.imagenUrl} alt="" />}
        <div className="noticia-panel-body">
          <div className="noticia-panel-title">{item.headline}</div>
          <div className="noticia-panel-meta">
            {item.source} · {item.publishedAt}
          </div>
          {item.summary && <div className="noticia-panel-excerpt">{item.summary}</div>}
        </div>
        {item.enlace && (
          <a className="noticia-panel-foot" href={item.enlace} target="_blank" rel="noreferrer">
            ↗ {dominio(item.enlace)} — leer noticia original
          </a>
        )}
      </div>
    </div>
  )
}

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DateCalendar({
  selected,
  onSelect,
  onClose,
}: {
  selected: string | null
  onSelect: (iso: string) => void
  onClose: () => void
}) {
  const today = new Date()
  const initial = selected ? new Date(`${selected}T00:00:00`) : today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth()) // 0-11
  const [contraDays, setContraDays] = useState<Set<string>>(new Set())

  useEffect(() => {
    const desde = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
    const hastaDate = new Date(viewYear, viewMonth + 1, 1)
    const hasta = isoDate(hastaDate)
    let cancelled = false
    fetchDiasContradiccion(desde, hasta)
      .then((days) => {
        if (!cancelled) setContraDays(days)
      })
      .catch((err) => console.warn('No se pudo cargar /api/contradicciones/dias:', err))
    return () => {
      cancelled = true
    }
  }, [viewYear, viewMonth])

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  // getDay(): 0=domingo..6=sábado → lo pasamos a L=0..D=6
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayIso = isoDate(today)

  const changeMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewMonth(m)
    setViewYear(y)
  }

  return (
    <div className="wall-calendar" onClick={(e) => e.stopPropagation()}>
      <div className="wall-calendar-head">
        <button onClick={() => changeMonth(-1)} aria-label="Mes anterior">‹</button>
        <span>{MESES[viewMonth]} {viewYear}</span>
        <button onClick={() => changeMonth(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="wall-calendar-grid wall-calendar-dow">
        {DIAS_SEMANA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="wall-calendar-grid">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayIso
          const isSelected = iso === selected
          const hasContra = contraDays.has(iso)
          const cls = [
            'wall-calendar-day',
            isSelected ? 'is-selected' : '',
            !isSelected && isToday ? 'is-today' : '',
            hasContra ? 'has-contra' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button key={iso} className={cls} onClick={() => onSelect(iso)}>
              {day}
            </button>
          )
        })}
      </div>
      <div className="wall-calendar-foot">
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}
