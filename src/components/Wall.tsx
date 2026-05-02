import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  CSS3DObject,
  CSS3DRenderer,
} from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { generateSampleNews, type NewsItem } from '../data/sampleNews'
import './Wall.css'

const ROWS = 3
const COLS = 36
const TILE_W = 260
const TILE_H = 170
const GAP_X = 22
const GAP_Y = 22
const POP_OUT_Z = 70

export default function Wall() {
  const containerRef = useRef<HTMLDivElement>(null)
  const panLeftRef = useRef<() => void>(() => {})
  const panRightRef = useRef<() => void>(() => {})
  const panStopRef = useRef<() => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const news = generateSampleNews(ROWS * COLS)

    let width = container.clientWidth
    let height = container.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 10000)
    camera.position.set(0, 0, 1500)

    const renderer = new CSS3DRenderer()
    renderer.setSize(width, height)
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    container.appendChild(renderer.domElement)

    // Distribute news cards in a grid. X axis is chronological: oldest left,
    // newest right (the data is generated newest-first, so we reverse for X).
    const totalWidth = COLS * (TILE_W + GAP_X) - GAP_X
    const totalHeight = ROWS * (TILE_H + GAP_Y) - GAP_Y

    const tileObjects: { obj: CSS3DObject; baseZ: number }[] = []

    for (let i = 0; i < news.length; i++) {
      const item = news[i]
      const col = Math.floor(i / ROWS)
      const row = i % ROWS
      const xColIndex = COLS - 1 - col // newest on the right

      const el = createTileElement(item)
      const obj = new CSS3DObject(el)
      obj.position.x =
        -totalWidth / 2 + xColIndex * (TILE_W + GAP_X) + TILE_W / 2
      obj.position.y =
        totalHeight / 2 - row * (TILE_H + GAP_Y) - TILE_H / 2
      const baseZ = item.contradiction ? POP_OUT_Z : 0
      obj.position.z = baseZ
      scene.add(obj)
      tileObjects.push({ obj, baseZ })
    }

    // Floor reflection: clones of the bottom row, mirrored, masked.
    for (let col = 0; col < COLS; col++) {
      const xColIndex = COLS - 1 - col
      const idx = col * ROWS + (ROWS - 1)
      const item = news[idx]
      if (!item) continue
      const refEl = createReflectionElement(item)
      const refObj = new CSS3DObject(refEl)
      refObj.position.x =
        -totalWidth / 2 + xColIndex * (TILE_W + GAP_X) + TILE_W / 2
      refObj.position.y =
        totalHeight / 2 - (ROWS - 1) * (TILE_H + GAP_Y) - TILE_H / 2 - TILE_H
      refObj.position.z = 0
      scene.add(refObj)
    }

    // ── Camera control ────────────────────────────────────────────────
    const minX = -totalWidth / 2 + width / 2 - TILE_W
    const maxX = totalWidth / 2 - width / 2 + TILE_W
    const clampX = (v: number) => Math.max(minX, Math.min(maxX, v))

    const cam = {
      targetX: 0,
      velocityX: 0,
    }

    // Cooliris-style camera yaw: camera rotates around its own vertical
    // axis toward the direction of motion. Driven by the per-frame
    // velocity of camera.position.x, so it covers drag, wheel, momentum
    // and the (held) arrow buttons. Returns to 0 when motion stops.
    const BASE_Z = 1500
    const MIN_Z = 600
    const MAX_Z = 3000
    const MAX_YAW = THREE.MathUtils.degToRad(45)
    const YAW_DX_SATURATION = 80 // scene units per 60fps frame
    const PAN_SPEED = 14 // scene units per 60fps frame while a side-arrow is held
    let cameraYaw = 0
    let prevCamX = 0
    let targetZ = BASE_Z
    let panDir = 0 // -1 left, 0 idle, +1 right (driven by side-arrow buttons)

    let dragging = false
    let dragPointerId: number | null = null
    let dragStartClientX = 0
    let dragStartTargetX = 0
    let lastMoveX = 0
    let lastMoveT = 0

    const DRAG_FACTOR = 3.0 // scene units per pixel of mouse drag

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Cancel any leftover continuous pan from a side-arrow button whose
      // pointerup may not have fired (e.g. tab focus changed mid-press).
      panDir = 0
      dragging = true
      dragPointerId = e.pointerId
      dragStartClientX = e.clientX
      dragStartTargetX = cam.targetX
      lastMoveX = e.clientX
      lastMoveT = performance.now()
      cam.velocityX = 0
      container.setPointerCapture(e.pointerId)
      container.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragPointerId) return
      const dx = e.clientX - dragStartClientX
      // Drag-the-camera: mouse right → camera right (matches yaw direction).
      cam.targetX = clampX(dragStartTargetX + dx * DRAG_FACTOR)

      const now = performance.now()
      const dt = now - lastMoveT
      if (dt > 0) {
        // velocity in scene-units per ms
        cam.velocityX = ((e.clientX - lastMoveX) * DRAG_FACTOR) / dt
      }
      lastMoveX = e.clientX
      lastMoveT = now
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragPointerId) return
      dragging = false
      dragPointerId = null
      container.releasePointerCapture(e.pointerId)
      container.style.cursor = 'grab'
      // Convert flick into target offset (momentum throw)
      const flick = cam.velocityX * 220
      if (Math.abs(flick) > 6) {
        cam.targetX = clampX(cam.targetX + flick)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + wheel → dolly zoom along Z (also catches trackpad pinch).
        targetZ = Math.max(MIN_Z, Math.min(MAX_Z, targetZ + e.deltaY * 1.5))
      } else {
        const delta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        cam.targetX = clampX(cam.targetX + delta * 1.4)
      }
    }

    panLeftRef.current = () => {
      panDir = -1
    }
    panRightRef.current = () => {
      panDir = 1
    }
    panStopRef.current = () => {
      panDir = 0
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerUp)
    container.addEventListener('wheel', onWheel, { passive: false })

    const onResize = () => {
      width = container.clientWidth
      height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize)

    // ── Animation loop ────────────────────────────────────────────────
    let raf = 0
    let lastTime = performance.now()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      // Frame-rate independent factor: how many "60fps frames" elapsed
      const dt = Math.min((now - lastTime) / 16.6667, 4)
      lastTime = now

      // Continuous pan while a side-arrow button is held.
      if (panDir !== 0) {
        cam.targetX = clampX(cam.targetX + panDir * PAN_SPEED * dt)
      }

      // Frame-independent exponential smoothing toward targetX/targetZ.
      const easing = 1 - Math.pow(1 - 0.18, dt)
      const cur = camera.position.x
      const next = cur + (cam.targetX - cur) * easing
      camera.position.x =
        Math.abs(cam.targetX - next) < 0.05 ? cam.targetX : next

      const zCur = camera.position.z
      const zNext = zCur + (targetZ - zCur) * easing
      camera.position.z =
        Math.abs(targetZ - zNext) < 0.05 ? targetZ : zNext

      // Decay residual velocity when not dragging.
      if (!dragging) {
        cam.velocityX *= Math.pow(0.9, dt)
      }

      // Pure yaw on the camera's vertical axis, driven by visible
      // horizontal velocity. Camera does not translate sideways or in Z.
      const dxPerFrame =
        dt > 0.001 ? (camera.position.x - prevCamX) / dt : 0
      prevCamX = camera.position.x

      // While a side-arrow is held, force yaw to its extreme so the
      // sweep reaches the end of the wall. Otherwise derive yaw from
      // visible horizontal velocity (drag, wheel, flick momentum).
      const yawT =
        panDir !== 0
          ? panDir
          : Math.max(-1, Math.min(1, dxPerFrame / YAW_DX_SATURATION))
      // Moving right (dx > 0) → camera looks right (rotation.y < 0 in three.js)
      const targetYaw = -yawT * MAX_YAW
      const yawEasing = 1 - Math.pow(1 - 0.12, dt)
      cameraYaw += (targetYaw - cameraYaw) * yawEasing
      if (
        Math.abs(cameraYaw) < 0.0005 &&
        Math.abs(targetYaw) < 0.0005
      ) {
        cameraYaw = 0
      }
      camera.rotation.y = cameraYaw

      renderer.render(scene, camera)
    }
    tick()

    container.style.cursor = 'grab'

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('wheel', onWheel)
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="wall-root">
      <div ref={containerRef} className="wall-stage" />

      <div className="wall-overlay">
        <div className="wall-header">
          <h1 className="wall-title">LyAi · Prensa española</h1>
          <p className="wall-subtitle">
            Observador de medios — muro cronológico
          </p>
        </div>
        <div className="wall-legend">
          <span className="legend-dot legend-dot-comet" />
          <span>Tarjetas con contradicción detectada</span>
        </div>
      </div>

      <button
        className="wall-arrow wall-arrow-left"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          panLeftRef.current()
        }}
        onPointerUp={() => panStopRef.current()}
        onPointerCancel={() => panStopRef.current()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Ir atrás en el tiempo"
      >
        ‹
      </button>
      <button
        className="wall-arrow wall-arrow-right"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          panRightRef.current()
        }}
        onPointerUp={() => panStopRef.current()}
        onPointerCancel={() => panStopRef.current()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Avanzar en el tiempo"
      >
        ›
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Tile DOM construction
// ─────────────────────────────────────────────────────────────────────

function createTileElement(item: NewsItem): HTMLElement {
  const root = document.createElement('div')
  root.className = 'tile' + (item.contradiction ? ' tile-contradiction' : '')

  const card = document.createElement('div')
  card.className = 'tile-card'
  card.style.setProperty('--source-color', item.sourceColor)

  card.innerHTML = `
    <div class="tile-source-bar"></div>
    <div class="tile-body">
      <div class="tile-meta">
        <span class="tile-source">${escapeHtml(item.source)}</span>
        <span class="tile-date">${escapeHtml(item.publishedAt)}</span>
      </div>
      <div class="tile-headline">${escapeHtml(item.headline)}</div>
      <div class="tile-summary">${escapeHtml(item.summary)}</div>
      ${
        item.contradiction
          ? `<div class="tile-contradiction-note">⚡ ${escapeHtml(
              item.contradiction.note,
            )}</div>`
          : ''
      }
    </div>
  `

  root.appendChild(card)

  if (item.contradiction) {
    const halo = document.createElement('div')
    halo.className = 'tile-comet'
    root.appendChild(halo)
  }

  return root
}

function createReflectionElement(item: NewsItem): HTMLElement {
  const root = document.createElement('div')
  root.className = 'tile tile-reflection-wrap'

  const inner = document.createElement('div')
  inner.className = 'tile-reflection-inner'

  const card = document.createElement('div')
  card.className = 'tile-card'
  card.style.setProperty('--source-color', item.sourceColor)
  card.innerHTML = `
    <div class="tile-source-bar"></div>
    <div class="tile-body">
      <div class="tile-meta">
        <span class="tile-source">${escapeHtml(item.source)}</span>
        <span class="tile-date">${escapeHtml(item.publishedAt)}</span>
      </div>
      <div class="tile-headline">${escapeHtml(item.headline)}</div>
      <div class="tile-summary">${escapeHtml(item.summary)}</div>
    </div>
  `

  inner.appendChild(card)
  root.appendChild(inner)
  return root
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
