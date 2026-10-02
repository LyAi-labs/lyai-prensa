import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { generateSampleNews, type NewsItem as MockNewsItem } from '../data/sampleNews'
import { fetchDiasContradiccion, fetchNoticias, type NewsItem } from '../data/newsApi'
import CardOverlay, { type OverlayState } from './card/CardOverlay'
import { contraColor, fechaCorta, iniciales, legible, storyKey } from './card/cardUtils'
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

// Transición Hoy/calendario (GSAP) — dolly-out/in aditivo sobre la física
// normal, no la sustituye. Ver dev-xplain 2026-09-30-0159-prensa-hoy-transicion-gsap.
const JUMP_DOLLY_Z = 900
const JUMP_EXIT_DURATION = 0.28
const JUMP_ENTER_DURATION = 0.55

// 2 se quedaba corto al hacer zoom (Ctrl+rueda acerca la cámara hasta
// CAM_Z+ZOOM_MIN = 550, ~2.7x más cerca que la distancia por defecto) — la
// textura de 520x340px se magnificaba y se veía borrosa. 4 da margen de sobra.
const TEX_SCALE = 4

// Contradicciones: salen del plano (eje Z) tanto más cuanto más intensas, con
// un halo que late. POP_OUT_Z se conserva como suelo de profundidad.
const CONTRA_Z_BASE = 70
const CONTRA_Z_RANGE = 80
const CONTRA_SCALE = 1.03
const HALO_W = TILE_W * 1.55
const HALO_H = TILE_H * 1.75

// «Parar» (peek): ratón quieto 450 ms o dedo mantenido 350 ms sin moverse.
const DWELL_MOUSE_MS = 450
const DWELL_TOUCH_MS = 350
const DWELL_MOUSE_JITTER = 3
const DWELL_TOUCH_SLOP = 10
const DWELL_MAX_VEL = 30

// Misma historia en otros medios: las demás cards se atenúan.
const STORY_DIM = 0.32

const CONTRA_STRIP_H = 24

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

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const FONT = 'system-ui, -apple-system, sans-serif'

// Cara «editorial» (dev-xplain 2026-10-02-1737, opción A): barra lateral con
// el color del medio, nombre en blanco (los colores de medio tienen contraste
// 1,8–3,9 sobre este fondo), borde neutro — el rojo/ámbar queda reservado a
// las contradicciones — y, si no hay resumen, el titular crece.
function drawCard(item: NewsItem): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE_W * TEX_SCALE
  c.height = TILE_H * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const contra = item.contradicciones[0]
  const accent = contra ? contraColor(contra.intensidad) : item.sourceColor
  const R = 10
  const barH = contra ? CONTRA_STRIP_H : 0
  const hasSummary = !!item.summary
  const { dia, hora } = fechaCorta(item.publishedAt)

  // Fondo y recorte con esquinas redondeadas (la textura es transparente).
  roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
  ctx.fillStyle = '#12151c'
  ctx.fill()
  ctx.save()
  roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
  ctx.clip()

  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 3, TILE_H)

  // Cabecera: avatar con iniciales + nombre + fecha.
  ctx.fillStyle = item.sourceColor
  ctx.beginPath()
  ctx.arc(27, 21, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = `800 8px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(iniciales(item.source), 27, 21.5)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const dateText = hora ? `${dia} · ${hora}` : dia
  ctx.font = `500 10px ${FONT}`
  const dateW = ctx.measureText(dateText).width
  const iconW = item.imagenUrl ? 17 : 0
  ctx.fillStyle = 'rgba(255,255,255,0.58)'
  ctx.fillText(dateText, TILE_W - 12 - dateW, 25)
  if (item.imagenUrl) {
    // Icono de foto vectorial (antes un emoji, que parecía imagen rota).
    const ix = TILE_W - 12 - dateW - 15
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1.2
    roundRectPath(ctx, ix, 17, 11, 8, 1.5)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.arc(ix + 3.5, 20.2, 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.font = `700 10.5px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.93)'
  ctx.fillText(fitText(ctx, item.source.toUpperCase(), TILE_W - 44 - dateW - iconW - 14), 41, 25)

  // Titular (crece si no hay resumen) y resumen.
  const headSize = hasSummary ? 15 : 17
  const headLine = hasSummary ? 19 : 21
  ctx.font = `600 ${headSize}px ${FONT}`
  ctx.fillStyle = '#f6f7fa'
  wrapText(ctx, item.headline, 16, 54, TILE_W - 30, headLine, hasSummary ? 3 : 5)

  if (hasSummary) {
    const top = 114
    const lines = Math.max(1, Math.floor((TILE_H - barH - top - 8) / 14.5))
    ctx.font = `11.5px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    wrapText(ctx, item.summary, 16, top, TILE_W - 30, 14.5, lines)
  }

  if (contra) {
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.18
    ctx.fillRect(0, TILE_H - barH, TILE_W, barH)
    ctx.globalAlpha = 0.45
    ctx.fillRect(0, TILE_H - barH, TILE_W, 1)
    ctx.globalAlpha = 1

    const score = contra.intensidad.toFixed(1)
    ctx.font = `800 10px ${FONT}`
    const chipW = ctx.measureText(score).width + 14
    roundRectPath(ctx, TILE_W - 12 - chipW, TILE_H - barH + 5, chipW, 14, 7)
    ctx.fillStyle = accent
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(score, TILE_W - 12 - chipW + 7, TILE_H - barH + 15.5)

    ctx.font = `700 10px ${FONT}`
    ctx.fillStyle = legible(accent, 0.4)
    ctx.fillText(
      fitText(ctx, `CONTRADICE A ${contra.fuenteContraria.toUpperCase()}`, TILE_W - 24 - chipW - 8),
      16,
      TILE_H - barH + 15.5,
    )
  }
  ctx.restore()

  // Borde fino neutro; con contradicción, del color de la contradicción.
  roundRectPath(ctx, 0.5, 0.5, TILE_W - 1, TILE_H - 1, R - 0.5)
  ctx.strokeStyle = contra ? accent : 'rgba(255,255,255,0.1)'
  ctx.lineWidth = contra ? 1.6 : 1
  ctx.stroke()

  return c
}

// Halo suave (gradiente radial) compartido por todas las contradicciones y
// por las cards de «misma historia»; el color lo pone el material.
function makeHaloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
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

export default function WallGL({ onReady }: { onReady?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const readyFiredRef = useRef(false)
  const flashRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<NewsItem[]>([])
  // Puente hacia la escena Three.js viva, para que goToday()/goToDate()
  // (fuera del useEffect) puedan animar la cámara de salida antes de que
  // React re-monte la escena. null si todavía no ha montado ninguna.
  const sceneApiRef = useRef<{
    animateExit: (onDone: () => void) => void
    focusStory: (id: string | null) => void
  } | null>(null)
  // true si el próximo montaje de la escena viene de un salto Hoy/calendario
  // (con animación de entrada) en vez de paginación normal (sin animación).
  const justJumpedRef = useRef(false)
  const [page, setPage] = useState(0)
  const [totalCount] = useState(3330)
  // Card DOM que se coloca sobre la card del canvas (peek / giro). El ref
  // espeja el estado para que la escena Three.js (cierre fuera de React) sepa
  // si hay overlay abierto sin re-suscribirse.
  const [overlay, setOverlayState] = useState<OverlayState | null>(null)
  const overlayRef = useRef<OverlayState | null>(null)
  const setOverlay = useCallback((next: OverlayState | null | ((cur: OverlayState | null) => OverlayState | null)) => {
    const value = typeof next === 'function' ? next(overlayRef.current) : next
    overlayRef.current = value
    setOverlayState(value)
  }, [])
  const closeOverlay = useCallback(() => setOverlay(null), [setOverlay])
  const toggleOverlayFlip = useCallback(
    () => setOverlay((cur) => (cur ? { ...cur, flipped: !cur.flipped } : cur)),
    [setOverlay],
  )
  // Ancla de fecha del botón Hoy/calendario — YYYY-MM-DD, o null = "lo más
  // reciente" (comportamiento de siempre, sin filtro de fecha).
  const [dateAnchor, setDateAnchor] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)

  // Salto de fecha (Hoy o un día del calendario): dolly-out + blur de la
  // escena viva, flash de marca tapando el remount real de Three.js, y la
  // escena nueva monta ya en modo "recién llegado" para hacer dolly-in
  // (ver useEffect). No toca la física del muro (pan/zoom con inercia) —
  // ver dev-xplain 2026-09-30-0159-prensa-hoy-transicion-gsap.
  const jumpTo = (apply: () => void) => {
    setShowCalendar(false)
    const commit = () => {
      justJumpedRef.current = true
      if (flashRef.current) gsap.to(flashRef.current, { opacity: 1, duration: 0.15, ease: 'power1.in' })
      apply()
    }
    if (sceneApiRef.current) {
      sceneApiRef.current.animateExit(commit)
    } else {
      commit()
    }
  }

  const goToday = () => jumpTo(() => { setDateAnchor(null); setPage(0) })
  const goToDate = (isoDate: string) => jumpTo(() => { setDateAnchor(isoDate); setPage(0) })

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
      if (!readyFiredRef.current) {
        readyFiredRef.current = true
        onReady?.()
      }

      const animateIn = justJumpedRef.current
      justJumpedRef.current = false

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

      // Offset aditivo de la transición Hoy/calendario — GSAP anima este
      // objeto, tick() lo suma a camera.position.z. Así no toca zoomCurrent
      // ni su suavizado (ZOOM_EASING), que siguen siendo solo del usuario.
      const jumpDolly = { z: animateIn ? JUMP_DOLLY_Z : 0 }

      // Entrada de la transición Hoy/calendario: arranca desenfocada/tenue y
      // hace dolly-in (jumpDolly.z) + fade/deblur hasta el estado normal. Si
      // no viene de un salto (paginación normal), no se toca nada de esto.
      if (animateIn) {
        renderer.domElement.style.opacity = '0'
        renderer.domElement.style.filter = 'blur(10px)'
        gsap.to(renderer.domElement, {
          opacity: 1,
          filter: 'blur(0px)',
          duration: JUMP_ENTER_DURATION,
          ease: 'power2.out',
        })
        gsap.to(jumpDolly, { z: 0, duration: JUMP_ENTER_DURATION, ease: 'power3.out' })
        if (flashRef.current) {
          gsap.to(flashRef.current, { opacity: 0, duration: 0.4, ease: 'power2.out', delay: 0.05 })
        }
      }

      // focusStory se asigna cuando existen las mallas (más abajo).
      let focusStoryImpl: (id: string | null) => void = () => {}
      sceneApiRef.current = {
        focusStory: (id) => focusStoryImpl(id),
        animateExit(onDone) {
          gsap.killTweensOf(jumpDolly)
          gsap.killTweensOf(renderer.domElement)
          gsap.to(jumpDolly, { z: JUMP_DOLLY_Z, duration: JUMP_EXIT_DURATION, ease: 'power1.in' })
          gsap.to(renderer.domElement, {
            opacity: 0.3,
            filter: 'blur(6px)',
            duration: JUMP_EXIT_DURATION,
            ease: 'power1.in',
            onComplete: onDone,
          })
        },
      }

      const wall = new THREE.Group()
      scene.add(wall)

      const geo = new THREE.PlaneGeometry(TILE_W, TILE_H)
      const disposables: Array<{ dispose: () => void }> = [geo]
      const cardMeshes: THREE.Mesh[] = []

      const haloGeo = new THREE.PlaneGeometry(HALO_W, HALO_H)
      const haloTex = makeHaloTexture()
      disposables.push(haloGeo, haloTex)
      const contraHalos: Array<{ mat: THREE.MeshBasicMaterial; phase: number; base: number }> = []
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

      // «Misma historia»: titular normalizado → nº de medios en esta página.
      const keyOf = new Map<string, string>()
      const countOf = new Map<string, number>()
      for (const it of items) {
        const k = storyKey(it.headline)
        if (!k) continue
        keyOf.set(it.id, k)
        countOf.set(k, (countOf.get(k) ?? 0) + 1)
      }

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
          const contra = item.contradicciones[0]
          // Las contradicciones salen del plano hacia el espectador: más
          // intensidad, más profundidad (parallax visible al barrer el muro).
          const z = contra ? Math.max(POP_OUT_Z, CONTRA_Z_BASE + contra.intensidad * CONTRA_Z_RANGE) : 0
          mesh.position.set(col * STEP_X - WALL_W / 2, (ROWS / 2 - row - 0.5) * STEP_Y, z)
          if (contra) mesh.scale.setScalar(CONTRA_SCALE)
          mesh.userData = { item }
          wall.add(mesh)
          cardMeshes.push(mesh)

          if (contra) {
            const hmat = new THREE.MeshBasicMaterial({
              map: haloTex,
              color: new THREE.Color(contraColor(contra.intensidad)),
              transparent: true,
              opacity: 0.5,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            })
            disposables.push(hmat)
            const halo = new THREE.Mesh(haloGeo, hmat)
            halo.position.set(mesh.position.x, mesh.position.y, z - 6)
            wall.add(halo)
            contraHalos.push({ mat: hmat, phase: Math.random() * Math.PI * 2, base: 0.42 + contra.intensidad * 0.2 })
          }

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

      const pickAt = (clientX: number, clientY: number): THREE.Mesh | null => {
        const rect = el.getBoundingClientRect()
        mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
        mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouseVec, camera)
        const hits = raycaster.intersectObjects(cardMeshes)
        return hits.length ? (hits[0].object as THREE.Mesh) : null
      }

      const projectToScreen = (m: THREE.Mesh) => {
        const v = new THREE.Vector3()
        m.getWorldPosition(v)
        v.project(camera)
        const r = el.getBoundingClientRect()
        return { cx: r.left + ((v.x + 1) / 2) * r.width, cy: r.top + ((1 - v.y) / 2) * r.height }
      }

      // Las cards del canvas no admiten efectos de DOM: peek, giro y spotlight
      // «salen» a UNA card DOM (CardOverlay) colocada sobre la del canvas.
      const openOverlay = (m: THREE.Mesh, opts: { flipped: boolean; sticky: boolean }) => {
        const item = m.userData.item as NewsItem
        const contra = item.contradicciones[0]
        const k = keyOf.get(item.id)
        setOverlay({
          item,
          ...projectToScreen(m),
          flipped: opts.flipped,
          sticky: opts.sticky,
          storyCount: k ? (countOf.get(k) ?? 1) : 1,
          related: k ? itemsRef.current.filter((i) => keyOf.get(i.id) === k) : undefined,
          contrarioEnlace: contra
            ? itemsRef.current.find((i) => i.id === contra.noticiaContrariaId)?.enlace
            : undefined,
        })
      }

      // ── Misma historia: atenúa el resto y ilumina las gemelas ──────────
      const dim = { v: 1 }
      let dimKey: string | null = null
      const storyHalos = new Map<THREE.Mesh, THREE.Mesh>()
      const itemOf = (m: THREE.Mesh) => m.userData.item as NewsItem
      const applyDim = () => {
        for (const m of cardMeshes) {
          const same = dimKey !== null && keyOf.get(itemOf(m).id) === dimKey
          ;(m.material as THREE.MeshBasicMaterial).color.setScalar(dimKey === null || same ? 1 : dim.v)
        }
      }
      const storyHaloFor = (m: THREE.Mesh): THREE.Mesh => {
        let h = storyHalos.get(m)
        if (!h) {
          const hmat = new THREE.MeshBasicMaterial({
            map: haloTex,
            color: new THREE.Color('#00e5ff'),
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
          disposables.push(hmat)
          h = new THREE.Mesh(haloGeo, hmat)
          h.position.set(m.position.x, m.position.y, m.position.z - 8)
          wall.add(h)
          storyHalos.set(m, h)
        }
        return h
      }
      focusStoryImpl = (id) => {
        const k = id ? keyOf.get(id) : undefined
        const group = k && (countOf.get(k) ?? 0) > 1 ? k : null
        gsap.killTweensOf(dim)
        storyHalos.forEach((h) => (h.visible = false))
        if (group) {
          dimKey = group
          for (const m of cardMeshes) if (keyOf.get(itemOf(m).id) === group) storyHaloFor(m).visible = true
          gsap.to(dim, { v: STORY_DIM, duration: 0.3, ease: 'power2.out', onUpdate: applyDim })
        } else {
          gsap.to(dim, {
            v: 1,
            duration: 0.25,
            ease: 'power2.out',
            onUpdate: applyDim,
            onComplete: () => {
              dimKey = null
              applyDim()
            },
          })
        }
      }

      // ── «Parar»: ratón quieto o dedo mantenido sobre una card ──────────
      let dwellTimer = 0
      let dwellMesh: THREE.Mesh | null = null
      let dwellX = 0
      let dwellY = 0
      let holdOpened = false
      const clearDwell = () => {
        window.clearTimeout(dwellTimer)
        dwellTimer = 0
        dwellMesh = null
      }
      const armDwell = (x: number, y: number, m: THREE.Mesh, touch: boolean) => {
        clearDwell()
        dwellMesh = m
        dwellX = x
        dwellY = y
        dwellTimer = window.setTimeout(() => {
          const hit = pickAt(dwellX, dwellY)
          // Con el muro deslizándose bajo un cursor quieto no se abre nada.
          if (!hit || hit !== dwellMesh || Math.abs(velX) > DWELL_MAX_VEL) return
          if (touch) {
            holdOpened = true
            navigator.vibrate?.(12)
          }
          openOverlay(hit, { flipped: false, sticky: touch })
        }, touch ? DWELL_TOUCH_MS : DWELL_MOUSE_MS)
      }

      const onHover = (e: PointerEvent) => {
        if (e.pointerType === 'touch' || dragging || overlayRef.current) return
        const m = pickAt(e.clientX, e.clientY)
        el.style.cursor = m ? 'pointer' : 'grab'
        if (!m) {
          clearDwell()
          return
        }
        if (m !== dwellMesh || Math.hypot(e.clientX - dwellX, e.clientY - dwellY) > DWELL_MOUSE_JITTER) {
          armDwell(e.clientX, e.clientY, m, false)
        }
      }

      const onCanvasLeave = (e: PointerEvent) => {
        if (e.pointerType !== 'touch') clearDwell()
      }

      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        clearDwell()
        holdOpened = false
        dragging = true
        lastX = e.clientX
        startX = e.clientX
        startY = e.clientY
        samples.length = 0
        pushSample(performance.now(), e.clientX)
        velX = 0
        el.setPointerCapture(e.pointerId)
        el.style.cursor = 'grabbing'
        if (e.pointerType === 'touch') {
          const m = pickAt(e.clientX, e.clientY)
          if (m) armDwell(e.clientX, e.clientY, m, true)
        }
      }

      const onMove = (e: PointerEvent) => {
        // Con el dedo, moverse más de DWELL_TOUCH_SLOP es scroll: no es «parar».
        if (
          e.pointerType === 'touch' &&
          dwellTimer &&
          Math.hypot(e.clientX - dwellX, e.clientY - dwellY) > DWELL_TOUCH_SLOP
        ) {
          clearDwell()
        }
        if (!dragging) return
        const dx = (e.clientX - lastX) * worldPerPixel()
        lastX = e.clientX
        pushSample(performance.now(), e.clientX)
        posX = clamp(posX - dx)
      }

      const onUp = (e: PointerEvent) => {
        clearDwell()
        if (!dragging) return
        dragging = false
        el.style.cursor = 'grab'

        if (holdOpened) {
          // El peek ya se abrió con el dedo mantenido: soltar no es un click.
          holdOpened = false
          return
        }

        const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY)
        if (moveDist < 6) {
          // Click limpio sin arrastre → flecha de suelo, o card girada.
          if (checkFloorClick(e.clientX, e.clientY)) return
          const m = pickAt(e.clientX, e.clientY)
          if (m) {
            openOverlay(m, { flipped: true, sticky: false })
            return
          }
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
        clearDwell()
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
      el.addEventListener('pointermove', onHover)
      el.addEventListener('pointerleave', onCanvasLeave)
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
        camera.position.z = CAM_Z + zoomCurrent + Math.abs(yaw / YAW_MAX) * PULLBACK_Z + jumpDolly.z
        camera.rotation.y = yaw

        renderer.render(scene, camera)

        // Halo de las contradicciones: late despacio (quieto con «reducir movimiento»).
        const tSec = now / 1000
        for (const h of contraHalos) {
          h.mat.opacity = reduceMotion ? h.base : h.base + 0.16 * Math.sin(tSec * 2.2 + h.phase)
        }
      }
      tick()

      cleanup = () => {
        cancelAnimationFrame(raf)
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onHover)
        el.removeEventListener('pointerleave', onCanvasLeave)
        clearDwell()
        gsap.killTweensOf(dim)
        setOverlay(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        el.removeEventListener('wheel', onWheel)
        window.removeEventListener('resize', onResize)
        gsap.killTweensOf(jumpDolly)
        gsap.killTweensOf(renderer.domElement)
        sceneApiRef.current = null
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

  // «Misma historia»: con una card abierta, la escena atenúa el resto y
  // ilumina las gemelas; al cerrarla, vuelve todo.
  const overlayItemId = overlay?.item.id ?? null
  useEffect(() => {
    sceneApiRef.current?.focusStory(overlayItemId)
  }, [overlayItemId])

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
          <p className="wall-subtitle">Lo que cuentan los medios españoles — y cuándo no coinciden</p>
        </div>

        <div className="wall-legend">
          <span className="legend-dot legend-dot-comet" />
          <span>
            {dateAnchor ? `Noticias hasta el ${dateAnchor} · ` : ''}
            Mostrando {startNewsIdx} - {endNewsIdx} de {totalCount} noticias (Página {page + 1})
          </span>
        </div>
      </div>

      {/* Flash de marca que tapa el corte real del remount de Three.js al
          saltar por Hoy/calendario — GSAP lo anima vía flashRef, sin
          re-render de React. */}
      <div ref={flashRef} className="wall-jump-flash" />

      {overlay && <CardOverlay state={overlay} onToggle={toggleOverlayFlip} onClose={closeOverlay} />}
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
