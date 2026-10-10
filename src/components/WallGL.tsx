import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { generateSampleNews, type NewsItem as MockNewsItem } from '../data/sampleNews'
import { fetchNoticias, fetchNoticiasCount, type Contradiccion, type NewsFilters, type NewsItem } from '../data/newsApi'
import CardOverlay, { type OverlayState } from './card/CardOverlay'
import ContradictionComparison from './card/ContradictionComparison'
import { contraColor, detectSeccion, fechaCorta, iniciales, parseMasthead, storyKey } from './card/cardUtils'
import HeaderDock from './toolbar/HeaderDock'
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

// Textura 4x para nitidez Retina y zoom sin pixelado
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

// Trunca con "…" si no cabe en maxWidth
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

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const SERIF_FONT = "'Playfair Display', Georgia, Cambria, 'Times New Roman', serif"
const BODONI_FONT = "'Bodoni Moda', 'Playfair Display', Georgia, serif"

// Caché en memoria para evitar peticiones repetidas al proxy de imágenes
const imageCache = new Map<string, HTMLImageElement | null>()
const pendingImageCbs = new Map<string, Array<(img: HTMLImageElement) => void>>()

function loadCardImage(url: string, onLoaded: (img: HTMLImageElement) => void) {
  if (!url) return
  if (imageCache.has(url)) {
    const cached = imageCache.get(url)
    if (cached) onLoaded(cached)
    return
  }
  const pending = pendingImageCbs.get(url)
  if (pending) {
    pending.push(onLoaded)
    return
  }
  pendingImageCbs.set(url, [onLoaded])
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imageCache.set(url, img)
    const cbs = pendingImageCbs.get(url) || []
    pendingImageCbs.delete(url)
    cbs.forEach((cb) => cb(img))
  }
  img.onerror = () => {
    imageCache.set(url, null)
    pendingImageCbs.delete(url)
  }
  img.src = `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight
  const targetRatio = w / h
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
  if (imgRatio > targetRatio) {
    sw = img.naturalHeight * targetRatio
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = img.naturalWidth / targetRatio
    sy = (img.naturalHeight - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function drawCanvasMasthead(ctx: CanvasRenderingContext2D, source: string, cx: number, topY: number, maxW: number) {
  const s = source.toLowerCase()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // 1. La Verdad de Murcia
  if (s.includes('verdad') && s.includes('murcia')) {
    ctx.font = `800 13px ${SERIF_FONT}`
    ctx.fillStyle = '#0f172a'
    ctx.fillText('LA VERDAD', cx, topY + 11)
    ctx.font = `700 6px ${FONT}`
    ctx.fillStyle = '#64748b'
    ctx.fillText('DE MURCIA', cx, topY + 18)
    return
  }

  // 2. El Comercio (Asturias)
  if (s.includes('comercio')) {
    ctx.font = `800 13px ${SERIF_FONT}`
    ctx.fillStyle = '#002f6c'
    ctx.fillText('EL COMERCIO', cx, topY + 11)
    const barW = 32
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(cx - barW / 2, topY + 14, barW / 2, 1.5)
    ctx.fillStyle = '#002f6c'
    ctx.fillRect(cx, topY + 14, barW / 2, 1.5)
    return
  }

  // 3. El Norte de Castilla
  if (s.includes('norte') && s.includes('castilla')) {
    ctx.font = `italic 700 13px ${SERIF_FONT}`
    ctx.fillStyle = '#6d1d24'
    ctx.fillText('El Norte', cx, topY + 10)
    ctx.font = `700 6px ${FONT}`
    ctx.fillStyle = '#0f172a'
    ctx.fillText('DE CASTILLA', cx, topY + 17)
    return
  }

  // 4. ABC
  if (s === 'abc' || s.startsWith('abc')) {
    ctx.font = `900 22px ${BODONI_FONT}`
    ctx.fillStyle = '#111827'
    ctx.fillText('AB', cx - 7, topY + 17)
    ctx.fillStyle = '#dc2626'
    ctx.fillText('C', cx + 11, topY + 17)
    return
  }

  // 5. El País
  if (s.includes('país') || s.includes('pais')) {
    ctx.font = `800 13.5px ${SERIF_FONT}`
    ctx.fillStyle = '#111827'
    ctx.fillText('EL PAÍS', cx, topY + 14)
    return
  }

  // 6. El Mundo
  if (s.includes('mundo') && !s.includes('deportivo')) {
    ctx.font = `800 13px ${SERIF_FONT}`
    ctx.fillStyle = '#005999'
    ctx.fillText('EL', cx - 28, topY + 14)
    ctx.beginPath()
    ctx.arc(cx - 15, topY + 10, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#10b981'
    ctx.fill()
    ctx.fillStyle = '#005999'
    ctx.fillText('MUNDO', cx + 12, topY + 14)
    return
  }

  // 7. La Vanguardia
  if (s.includes('vanguardia')) {
    ctx.font = `800 12.5px ${SERIF_FONT}`
    ctx.fillStyle = '#1a1a24'
    ctx.fillText('LA VANGUARDIA', cx, topY + 14)
    return
  }

  // 8. elDiario.es
  if (s.includes('eldiario')) {
    ctx.font = `700 12px ${FONT}`
    ctx.fillStyle = '#1e293b'
    ctx.fillText('elDiario', cx - 8, topY + 14)
    ctx.fillStyle = '#0284c7'
    ctx.fillText('.es', cx + 22, topY + 14)
    return
  }

  // 9. 20 Minutos
  if (s.includes('20 minutos') || s.includes('20minutos')) {
    ctx.font = `900 13px ${FONT}`
    ctx.fillStyle = '#005ca9'
    ctx.fillText('20', cx - 22, topY + 14)
    ctx.font = `700 12px ${FONT}`
    ctx.fillText('minutos', cx + 10, topY + 14)
    return
  }

  // 10. El Confidencial
  if (s.includes('confidencial')) {
    ctx.font = `800 12px ${SERIF_FONT}`
    ctx.fillStyle = '#1e293b'
    ctx.fillText('El Confidencial', cx, topY + 14)
    return
  }

  // 11. Negocios TV
  if (s.includes('negocios')) {
    ctx.font = `900 11px ${FONT}`
    const textW = ctx.measureText('NEGOCIOS').width
    const badgeW = 18
    const gap = 5
    const totalW = textW + gap + badgeW
    const startX = cx - totalW / 2

    ctx.textAlign = 'left'
    ctx.fillStyle = '#0f172a'
    ctx.fillText('NEGOCIOS', startX, topY + 14)

    // Red badge for TV
    ctx.fillStyle = '#dc2626'
    roundRectPath(ctx, startX + textW + gap, topY + 4, badgeW, 11.5, 2.5)
    ctx.fill()

    ctx.font = `900 7.5px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('TV', startX + textW + gap + badgeW / 2, topY + 12.5)
    return
  }

  // Fallback
  const { main, sub } = parseMasthead(source)
  ctx.font = `800 12.5px ${SERIF_FONT}`
  ctx.fillStyle = '#0f172a'
  ctx.fillText(fitText(ctx, main, maxW - 20), cx, sub ? topY + 10 : topY + 14)
  if (sub) {
    ctx.font = `600 6px ${FONT}`
    ctx.fillStyle = '#64748b'
    ctx.fillText(fitText(ctx, sub, maxW - 20), cx, topY + 17)
  }
}

// Renderizado de la card sobre el canvas de la tesela WebGL.
// Si tiene foto y ha cargado, renderiza tarjeta con foto hero.
// Si NO tiene foto, renderiza la portada de periódico fiel a cardsprensa reales.jpg.
function drawCard(
  item: NewsItem,
  img?: HTMLImageElement,
  existingCanvas?: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = existingCanvas || document.createElement('canvas')
  if (!existingCanvas) {
    c.width = TILE_W * TEX_SCALE
    c.height = TILE_H * TEX_SCALE
  }
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const contra = item.contradicciones[0]
  const accent = contra ? contraColor(contra.intensidad) : item.sourceColor
  const R = 12
  const { dia, hora } = fechaCorta(item.publishedAt)
  const dateStr = hora ? `${dia} · ${hora}` : dia
  const ini = iniciales(item.source)
  const hasPhoto = !!(img && img.naturalWidth > 0)

  if (hasPhoto) {
    // ── MODO CON FOTO HERO ────────────────────────────────────────────────
    roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
    ctx.fillStyle = '#12151c'
    ctx.fill()
    ctx.save()
    roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
    ctx.clip()

    // Foto superior
    const bannerH = 96
    drawImageCover(ctx, img, 0, 0, TILE_W, bannerH)

    // Gradiente sobre la foto para transición suave
    const grad = ctx.createLinearGradient(0, bannerH - 35, 0, bannerH)
    grad.addColorStop(0, 'rgba(18, 21, 28, 0)')
    grad.addColorStop(1, '#12151c')
    ctx.fillStyle = grad
    ctx.fillRect(0, bannerH - 35, TILE_W, 35)

    // Floating chip con medio
    const chipText = item.source.toUpperCase()
    ctx.font = `700 8.5px ${FONT}`
    const textW = ctx.measureText(chipText).width
    const chipW = textW + 22
    const chipX = 10
    const chipY = 8
    roundRectPath(ctx, chipX, chipY, chipW, 16, 8)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    // Dot
    ctx.beginPath()
    ctx.arc(chipX + 7.5, chipY + 8, 2.8, 0, Math.PI * 2)
    ctx.fillStyle = item.sourceColor || '#38bdf8'
    ctx.fill()
    // Text
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(chipText, chipX + 14, chipY + 8.5)
    ctx.textBaseline = 'alphabetic'

    // Titular
    ctx.font = `600 12px ${FONT}`
    ctx.fillStyle = '#f6f7fa'
    wrapText(ctx, item.headline, 12, bannerH + 16, TILE_W - 24, 15, 2)

    // Footer
    const footY = TILE_H - 14
    // Avatar
    ctx.beginPath()
    ctx.arc(18, footY, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = item.sourceColor || '#0284c7'
    ctx.fill()
    ctx.font = `800 6px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ini, 18, footY + 0.5)

    // Source y fecha
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 8.5px ${FONT}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillText(item.source, 29, footY + 3)
    const sW = ctx.measureText(item.source).width
    ctx.font = `500 8px ${FONT}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.fillText(`· ${dateStr}`, 29 + sW + 4, footY + 3)

    ctx.restore()
  } else {
    // ── MODO PORTADA DE PERIÓDICO REAL (cardsprensa reales.jpg) ────────────
    // 1. Contenedor exterior pizarra oscuro
    roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
    ctx.fillStyle = '#22252c'
    ctx.fill()
    ctx.save()
    roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
    ctx.clip()

    // 2. Cápsula superior (pill)
    const pillText = item.source.toUpperCase()
    ctx.font = `800 7.5px ${FONT}`
    const pTextW = ctx.measureText(pillText).width
    const pillW = Math.min(TILE_W - 30, pTextW + 22)
    const pillX = (TILE_W - pillW) / 2
    roundRectPath(ctx, pillX, 4.5, pillW, 14.5, 7.25)
    ctx.fillStyle = '#eaedf1'
    ctx.fill()
    // Dot
    ctx.beginPath()
    ctx.arc(pillX + 7, 11.75, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = item.sourceColor || '#22c55e'
    ctx.fill()
    // Text
    ctx.fillStyle = '#1e293b'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(fitText(ctx, pillText, pillW - 16), pillX + 13, 12.25)
    ctx.textBaseline = 'alphabetic'

    // 3. Hoja de periódico blanca
    const sheetX = 6
    const sheetY = 22.5
    const sheetW = TILE_W - 12
    const sheetH = TILE_H - 28.5
    roundRectPath(ctx, sheetX, sheetY, sheetW, sheetH, 7)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.save()
    roundRectPath(ctx, sheetX, sheetY, sheetW, sheetH, 7)
    ctx.clip()

    // 4. Cabecera / Masthead Logo
    drawCanvasMasthead(ctx, item.source, TILE_W / 2, sheetY + 3, sheetW)

    // 5. Línea divisoria horizontal
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sheetX + 7, sheetY + 23)
    ctx.lineTo(sheetX + sheetW - 7, sheetY + 23)
    ctx.stroke()

    // 6. Sección / Categoría
    const seccion = detectSeccion(item.enlace, item.source, item.headline)
    const secY = sheetY + 33.5
    if (seccion.isRed) {
      ctx.font = `800 7px ${FONT}`
      const badgeW = ctx.measureText(seccion.text).width + 8
      roundRectPath(ctx, sheetX + 8, secY - 8, badgeW, 10.5, 2)
      ctx.fillStyle = '#dc2626'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(seccion.text, sheetX + 12, secY - 0.5)
    } else {
      ctx.font = `800 7px ${FONT}`
      ctx.fillStyle = '#64748b'
      ctx.textAlign = 'left'
      ctx.fillText(seccion.text, sheetX + 8, secY - 0.5)
    }

    // 7. Titular editorial en Serif
    ctx.font = `700 11px ${SERIF_FONT}`
    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'left'
    wrapText(ctx, item.headline, sheetX + 8, sheetY + 45, sheetW - 16, 13.5, 3)

    // 8. Resumen opcional corto si hay espacio y no hay contradicción
    if (item.summary && !contra) {
      ctx.font = `400 8px ${FONT}`
      ctx.fillStyle = '#64748b'
      wrapText(ctx, item.summary, sheetX + 8, sheetY + 90, sheetW - 16, 10.5, 1)
    }

    // 9. Footer dentro de la hoja blanca
    const paperFootY = sheetY + sheetH - 10
    // Mini avatar
    ctx.beginPath()
    ctx.arc(sheetX + 14, paperFootY, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = item.sourceColor || '#0284c7'
    ctx.fill()
    ctx.font = `800 5px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ini, sheetX + 14, paperFootY + 0.5)

    // Source y fecha
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 8px ${FONT}`
    ctx.fillStyle = '#1e293b'
    ctx.fillText(item.source, sheetX + 23, paperFootY + 2.5)
    const psW = ctx.measureText(item.source).width
    ctx.font = `500 7.5px ${FONT}`
    ctx.fillStyle = '#94a3b8'
    ctx.fillText(`· ${dateStr}`, sheetX + 23 + psW + 3, paperFootY + 2.5)

    // Flecha circular a la derecha
    const arrX = sheetX + sheetW - 12
    ctx.beginPath()
    ctx.arc(arrX, paperFootY, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = '#f1f5f9'
    ctx.fill()
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.font = `700 7px ${FONT}`
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('→', arrX, paperFootY + 0.5)
    ctx.textBaseline = 'alphabetic'

    ctx.restore()
    ctx.restore()
  }

  // ── Contradicción si existe ─────────────────────────────────────────────
  if (contra) {
    const barH = CONTRA_STRIP_H
    ctx.save()
    roundRectPath(ctx, 0, 0, TILE_W, TILE_H, R)
    ctx.clip()
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.9
    ctx.fillRect(0, TILE_H - barH, TILE_W, barH)
    ctx.globalAlpha = 1

    const score = contra.intensidad.toFixed(1)
    ctx.font = `800 9px ${FONT}`
    const chipW = ctx.measureText(score).width + 12
    roundRectPath(ctx, TILE_W - 10 - chipW, TILE_H - barH + 4.5, chipW, 15, 7.5)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'center'
    ctx.fillText(score, TILE_W - 10 - chipW / 2, TILE_H - barH + 15)

    ctx.font = `800 8.5px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(
      fitText(ctx, `VS ${contra.fuenteContraria.toUpperCase()}`, TILE_W - 20 - chipW - 8),
      10,
      TILE_H - barH + 15.5,
    )
    ctx.restore()
  }

  // Borde fino exterior
  roundRectPath(ctx, 0.5, 0.5, TILE_W - 1, TILE_H - 1, R - 0.5)
  ctx.strokeStyle = contra ? accent : 'rgba(255,255,255,0.08)'
  ctx.lineWidth = contra ? 1.8 : 1
  ctx.stroke()

  ctx.restore()
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

function drawFloorArrow(isRight: boolean, targetPage: number): HTMLCanvasElement {
  const W = 340
  const H = 160
  const c = document.createElement('canvas')
  c.width = W * TEX_SCALE
  c.height = H * TEX_SCALE
  const ctx = c.getContext('2d')!
  ctx.scale(TEX_SCALE, TEX_SCALE)

  const isLight = document.documentElement.classList.contains('light')
  const mainColor = isRight ? '#00e5ff' : '#a855f7'
  const glowColor = isRight ? 'rgba(0, 229, 255, 0.12)' : 'rgba(168, 85, 247, 0.12)'

  // Fondo glassmorphic con esquinas suaves
  roundRectPath(ctx, 4, 4, W - 8, H - 8, 18)
  const bgGrad = ctx.createLinearGradient(0, 0, W, H)
  if (isLight) {
    bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    bgGrad.addColorStop(1, 'rgba(241, 245, 249, 0.92)')
  } else {
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.92)')
    bgGrad.addColorStop(1, 'rgba(10, 15, 28, 0.95)')
  }
  ctx.fillStyle = bgGrad
  ctx.fill()

  // Sutil resplandor interior
  ctx.fillStyle = glowColor
  ctx.fill()

  // Borde fino elegante
  ctx.strokeStyle = mainColor
  ctx.lineWidth = 1.8
  ctx.stroke()

  // Pill badge en la parte superior
  const badgeText = isRight ? 'HISTÓRICO ANTERIOR' : 'NOTICIAS RECIENTES'
  ctx.font = `700 11px ${FONT}`
  const badgeW = ctx.measureText(badgeText).width + 24
  const badgeX = (W - badgeW) / 2
  const badgeY = 18
  roundRectPath(ctx, badgeX, badgeY, badgeW, 22, 11)
  ctx.fillStyle = isRight ? 'rgba(0, 229, 255, 0.12)' : 'rgba(168, 85, 247, 0.12)'
  ctx.fill()
  ctx.strokeStyle = mainColor
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = mainColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(badgeText, W / 2, badgeY + 11)

  // Círculo del icono central con flecha
  const circleX = W / 2
  const circleY = 72
  const circleR = 20
  ctx.beginPath()
  ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2)
  ctx.fillStyle = isRight ? 'rgba(0, 229, 255, 0.18)' : 'rgba(168, 85, 247, 0.18)'
  ctx.fill()
  ctx.strokeStyle = mainColor
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Dibujar vector de la flecha / chevron
  ctx.beginPath()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (isRight) {
    ctx.moveTo(circleX - 4, circleY - 7)
    ctx.lineTo(circleX + 4, circleY)
    ctx.lineTo(circleX - 4, circleY + 7)
  } else {
    ctx.moveTo(circleX + 4, circleY - 7)
    ctx.lineTo(circleX - 4, circleY)
    ctx.lineTo(circleX + 4, circleY + 7)
  }
  ctx.stroke()

  // Título principal
  ctx.font = `700 16px ${FONT}`
  ctx.fillStyle = isLight ? '#0f172a' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const actionText = isRight ? `Avanzar a Página ${targetPage + 1}` : `Volver a Página ${targetPage + 1}`
  ctx.fillText(actionText, W / 2, 112)

  // Subtítulo
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = isLight ? '#64748b' : 'rgba(255, 255, 255, 0.55)'
  const hintText = 'Haz clic para navegar'
  ctx.fillText(hintText, W / 2, 134)

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

export default function WallGL({
  onReady,
  view = 'muro',
  onViewChange,
}: {
  onReady?: () => void
  view?: 'muro' | 'tiempo'
  onViewChange?: (v: 'muro' | 'tiempo') => void
}) {
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
  const [totalCount, setTotalCount] = useState(3330)
  // Toolbar: búsqueda + fuente + sección + contradicciones. Cambiar un
  // filtro vuelve a la página 0, igual que Hoy/calendario.
  const [filters, setFilters] = useState<NewsFilters>({})
  const handleFiltersChange = useCallback((next: NewsFilters) => {
    setFilters(next)
    setPage(0)
  }, [])
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

  // ── Pop-out 3D de Contradicciones Cara a Cara ──────────────────────────
  const [comparison, setComparison] = useState<{
    item: NewsItem
    contra: Contradiccion
    contrarioItem?: NewsItem
    contrarioEnlace?: string
  } | null>(null)

  const openComparisonRef = useRef<(item: NewsItem, contra?: Contradiccion) => void>(() => {})

  const openComparison = useCallback((item: NewsItem, contra?: Contradiccion) => {
    const c = contra || (item.contradicciones && item.contradicciones[0])
    if (!c) return
    const contrarioItem = itemsRef.current.find((i) => i.id === c.noticiaContrariaId)
    setComparison({
      item,
      contra: c,
      contrarioItem,
      contrarioEnlace: contrarioItem?.enlace,
    })
    setOverlay(null)
  }, [setOverlay])

  openComparisonRef.current = openComparison

  const toggleOverlayFlip = useCallback(() => {
    const cur = overlayRef.current
    if (!cur) return
    // 2º Click: si ya está girada mostrando el reverso y tiene contradicciones,
    // sale del muro hacia el usuario en vista comparativa cara a cara.
    if (cur.flipped && cur.item.contradicciones && cur.item.contradicciones.length > 0) {
      const contra = cur.item.contradicciones[0]
      openComparison(cur.item, contra)
      return
    }
    setOverlay({ ...cur, flipped: !cur.flipped })
  }, [openComparison, setOverlay])
  // Ancla de fecha del botón Hoy/calendario — YYYY-MM-DD, o null = "lo más
  // reciente" (comportamiento de siempre, sin filtro de fecha).
  const [dateAnchor, setDateAnchor] = useState<string | null>(null)

  // Salto de fecha (Hoy o un día del calendario): dolly-out + blur de la
  // escena viva, flash de marca tapando el remount real de Three.js, y la
  // escena nueva monta ya en modo "recién llegado" para hacer dolly-in
  // (ver useEffect). No toca la física del muro (pan/zoom con inercia) —
  // ver dev-xplain 2026-09-30-0159-prensa-hoy-transicion-gsap.
  const jumpTo = (apply: () => void) => {
    const commit = () => {
      justJumpedRef.current = true
      if (flashRef.current) {
        gsap.killTweensOf(flashRef.current)
        gsap.timeline()
          .to(flashRef.current, { opacity: 0.7, duration: 0.15, ease: 'power2.in' })
          .to(flashRef.current, { opacity: 0, duration: 0.35, ease: 'power2.out', delay: 0.05 })
      }
      apply()
    }
    if (sceneApiRef.current) {
      sceneApiRef.current.animateExit(commit)
    } else {
      commit()
    }
  }

  const goToday = () => {
    if (dateAnchor === null && page === 0) return
    jumpTo(() => { setDateAnchor(null); setPage(0) })
  }

  const goToDate = (isoDate: string) => {
    if (dateAnchor === isoDate && page === 0) return
    jumpTo(() => { setDateAnchor(isoDate); setPage(0) })
  }

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      let items: NewsItem[]
      try {
        // Con texto de búsqueda, el usuario espera un buscador global: el
        // ancla de fecha (Hoy/calendario) deja de restringir el resultado.
        const antes = dateAnchor && !filters.q ? `${dateAnchor}T23:59:59.999` : undefined
        items = await fetchNoticias(PAGE_SIZE, page * PAGE_SIZE, antes, filters)
        if (items.length === 0) {
          if (page > 0) {
            if (flashRef.current) gsap.set(flashRef.current, { opacity: 0 })
            setPage(0)
            return
          }
          // Si no hay noticias para esa fecha/filtro en página 0, cargar muestra segura para que Three.js no rompa
          items = generateSampleNews(PAGE_SIZE).map(mockToNewsItem)
        }
      } catch (err) {
        console.warn('No se pudo cargar /api/noticias, usando datos de ejemplo:', err)
        items = generateSampleNews(PAGE_SIZE).map(mockToNewsItem)
      }
      if (disposed) {
        if (flashRef.current) gsap.set(flashRef.current, { opacity: 0 })
        return
      }
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
        renderer.domElement.style.opacity = '0.2'
        renderer.domElement.style.filter = 'blur(8px)'
        gsap.to(renderer.domElement, {
          opacity: 1,
          filter: 'blur(0px)',
          duration: JUMP_ENTER_DURATION,
          ease: 'power2.out',
        })
        gsap.to(jumpDolly, { z: 0, duration: JUMP_ENTER_DURATION, ease: 'power3.out' })
        if (flashRef.current) {
          gsap.to(flashRef.current, { opacity: 0, duration: 0.35, ease: 'power2.out' })
        }
      } else {
        renderer.domElement.style.opacity = '1'
        renderer.domElement.style.filter = 'none'
        if (flashRef.current) {
          gsap.set(flashRef.current, { opacity: 0 })
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

      // Render de tarjetas de la página actual. El `% items.length` rellena
      // la rejilla cuando faltan pocas (última página del feed); pero con
      // resultados muy escasos (p. ej. 1 noticia de una búsqueda) repetiría
      // la MISMA tarjeta en las 108 celdas — si no hay ni una fila completa,
      // se centran en una sola fila en vez de rellenar: la cámara arranca
      // mirando al centro de WALL_W (ancho fijo de 36 columnas), así que con
      // pocos items hay que colocarlos ahí o quedan fuera de vista.
      const sparse = items.length < COLS
      const sparseStartCol = sparse ? Math.max(0, Math.floor((COLS - items.length) / 2)) : 0
      const sparseRow = Math.floor(ROWS / 2)
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (sparse) {
            if (row !== sparseRow) continue
            const i = col - sparseStartCol
            if (i < 0 || i >= items.length) continue
          }
          const idx = row * COLS + col
          const item = sparse ? items[col - sparseStartCol] : items[idx % items.length]
          const canvas = drawCard(item)
          const tex = new THREE.CanvasTexture(canvas)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
          disposables.push(tex, mat)

          if (item.imagenUrl) {
            loadCardImage(item.imagenUrl, (img) => {
              if (disposed) return
              drawCard(item, img, canvas)
              tex.needsUpdate = true
            })
          }

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

      // ── Tarjetas 3D Laterales a la altura de la vista (Navegación entre Páginas) ──
      const navCardGeo = new THREE.PlaneGeometry(340, 160)
      disposables.push(navCardGeo)
      const navMeshes: THREE.Mesh[] = []

      // Tarjeta Derecha (Avanzar / Noticias Anteriores en el tiempo)
      if ((page + 1) * PAGE_SIZE < totalCount) {
        const rightNavTex = new THREE.CanvasTexture(drawFloorArrow(true, page + 1))
        rightNavTex.colorSpace = THREE.SRGBColorSpace
        const rightNavMat = new THREE.MeshBasicMaterial({ map: rightNavTex, transparent: true })
        disposables.push(rightNavTex, rightNavMat)

        const rightNavMesh = new THREE.Mesh(navCardGeo, rightNavMat)
        rightNavMesh.position.set(WALL_W / 2 + 200, 0, 30)
        rightNavMesh.userData = { isButton: true, action: 'next' }
        wall.add(rightNavMesh)
        navMeshes.push(rightNavMesh)
      }

      // Tarjeta Izquierda (Volver / Noticias Recientes)
      if (page > 0) {
        const leftNavTex = new THREE.CanvasTexture(drawFloorArrow(false, Math.max(0, page - 1)))
        leftNavTex.colorSpace = THREE.SRGBColorSpace
        const leftNavMat = new THREE.MeshBasicMaterial({ map: leftNavTex, transparent: true })
        disposables.push(leftNavTex, leftNavMat)

        const leftNavMesh = new THREE.Mesh(navCardGeo, leftNavMat)
        leftNavMesh.position.set(-WALL_W / 2 - 200, 0, 30)
        leftNavMesh.userData = { isButton: true, action: 'prev' }
        wall.add(leftNavMesh)
        navMeshes.push(leftNavMesh)
      }

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

      const checkNavClick = (clientX: number, clientY: number) => {
        if (!navMeshes.length) return false
        const rect = el.getBoundingClientRect()
        mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
        mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouseVec, camera)
        const intersects = raycaster.intersectObjects(navMeshes)
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

      const pickNavAt = (clientX: number, clientY: number): THREE.Mesh | null => {
        if (!navMeshes.length) return null
        const rect = el.getBoundingClientRect()
        mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
        mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouseVec, camera)
        const hits = raycaster.intersectObjects(navMeshes)
        return hits.length ? (hits[0].object as THREE.Mesh) : null
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
        const navHit = pickNavAt(e.clientX, e.clientY)
        el.style.cursor = (m || navHit) ? 'pointer' : 'grab'
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
        const tapSlop = e.pointerType === 'touch' ? 14 : 6
        if (moveDist < tapSlop) {
          // Click limpio sin arrastre → tarjeta de navegación 3D, o card girada.
          if (checkNavClick(e.clientX, e.clientY)) return
          const m = pickAt(e.clientX, e.clientY)
          if (m) {
            const hitItem = m.userData.item as NewsItem
            const curOverlay = overlayRef.current
            if (
              curOverlay?.flipped &&
              curOverlay.item.contradicciones &&
              curOverlay.item.contradicciones.length > 0
            ) {
              const contra = curOverlay.item.contradicciones[0]
              if (hitItem.id === curOverlay.item.id || hitItem.id === contra.noticiaContrariaId) {
                openComparisonRef.current(curOverlay.item, contra)
                return
              }
            }
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
        if (flashRef.current) {
          gsap.killTweensOf(flashRef.current)
          gsap.set(flashRef.current, { opacity: 0 })
        }
        sceneApiRef.current = null
        disposables.forEach((d) => d.dispose())
        renderer.dispose()
        if (el.parentElement === host) host.removeChild(el)
      }
    })()

    return () => {
      disposed = true
      if (flashRef.current) {
        gsap.killTweensOf(flashRef.current)
        gsap.set(flashRef.current, { opacity: 0 })
      }
      cleanup?.()
    }
  }, [page, dateAnchor, filters])

  // Total real para el contador ("Mostrando X-Y de TOTAL") — antes iba
  // hardcodeado a 3330; con filtros activos esa cifra ya no significa nada.
  useEffect(() => {
    let cancelled = false
    const antes = dateAnchor && !filters.q ? `${dateAnchor}T23:59:59.999` : undefined
    fetchNoticiasCount(antes, filters)
      .then((total) => { if (!cancelled) setTotalCount(total) })
      .catch(() => { /* se queda con el último total válido */ })
    return () => { cancelled = true }
  }, [dateAnchor, filters])

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
      
      {/* Dock Superior Unificado de 4-5 botones */}
      <HeaderDock
        view={view}
        onViewChange={onViewChange}
        dateAnchor={dateAnchor}
        onToday={goToday}
        onSelectDate={goToDate}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={totalCount}
      />

      {/* Botones Flotantes Laterales en Pantalla */}
      {page > 0 && (
        <button
          className="wall-arrow wall-arrow-left"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          title="Página Anterior / Noticias Recientes"
          aria-label="Página anterior"
        >
          <ChevronLeft size={28} strokeWidth={2.4} />
        </button>
      )}
      {(page + 1) * PAGE_SIZE < totalCount && (
        <button
          className="wall-arrow wall-arrow-right"
          onClick={() => setPage((p) => p + 1)}
          title="Página Siguiente / Noticias Anteriores"
          aria-label="Página siguiente"
        >
          <ChevronRight size={28} strokeWidth={2.4} />
        </button>
      )}

      {/* Overlay Superior e Inferior */}
      <div className="wall-overlay">
        <div className="wall-legend">
          <span className="legend-dot legend-dot-comet" />
          <span>
            {dateAnchor && !filters.q ? `Noticias hasta el ${dateAnchor} · ` : ''}
            {dateAnchor && filters.q ? 'Buscando en todo el histórico (fecha ignorada) · ' : ''}
            Mostrando {startNewsIdx} - {endNewsIdx} de {totalCount} noticias (Página {page + 1})
          </span>
        </div>
      </div>

      {/* Flash de marca que tapa el corte real del remount de Three.js al
          saltar por Hoy/calendario — GSAP lo anima vía flashRef, sin
          re-render de React. */}
      <div ref={flashRef} className="wall-jump-flash" />

      {overlay && (
        <CardOverlay
          state={overlay}
          onToggle={toggleOverlayFlip}
          onClose={closeOverlay}
          onOpenComparison={() => {
            if (overlay.item.contradicciones && overlay.item.contradicciones.length > 0) {
              openComparison(overlay.item, overlay.item.contradicciones[0])
            }
          }}
        />
      )}

      {comparison && (
        <ContradictionComparison
          item={comparison.item}
          contra={comparison.contra}
          contrarioItem={comparison.contrarioItem}
          contrarioEnlace={comparison.contrarioEnlace}
          onClose={() => setComparison(null)}
        />
      )}
    </div>
  )
}


