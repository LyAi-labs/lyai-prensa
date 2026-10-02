import { useEffect, useRef } from 'react'
import type { NewsItem } from '../../data/newsApi'
import NewsCard from './NewsCard'

// Una única card DOM que se coloca sobre la card del canvas WebGL bajo el
// cursor/dedo. Las cards del muro son texturas de canvas y no admiten efectos
// de DOM (spotlight, giro, hoja de peek): el efecto «sale» a esta card.
export type OverlayState = {
  item: NewsItem
  cx: number // centro de la card del canvas, en px de pantalla
  cy: number
  flipped: boolean
  sticky: boolean // abierta con el dedo: se cierra tocando fuera
  storyCount: number
  contrarioEnlace?: string
}

const CARD_W = 300
const HALF_H = 220 // alto medio estimado, solo para no salirse de pantalla
const MARGIN = 12
const GRACE_MS = 140
const FIRST_GRACE_MS = 800
// El click/toque que abre la card (o el que Android lanza al soltar el dedo
// mantenido) no debe girarla al instante.
const CLICK_GUARD_MS = 450

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export default function CardOverlay({
  state,
  onToggle,
  onClose,
}: {
  state: OverlayState
  onToggle: () => void
  onClose: () => void
}) {
  const closeTimer = useRef(0)
  const openedAt = useRef(0)
  const { item, flipped, sticky } = state

  // Si el cursor no cae dentro de la card (queda clampada), no habría
  // pointerleave: un cierre de gracia que cancela pointerenter lo cubre.
  useEffect(() => {
    openedAt.current = performance.now()
    if (!sticky) return
    // Abierta con el dedo aún apoyado: el click que Android lanza al levantarlo
    // puede llegar mucho después de abrirse, así que la guarda cuenta desde que
    // se levanta, no desde que se abre.
    const onUp = () => {
      openedAt.current = performance.now()
      window.removeEventListener('pointerup', onUp, true)
    }
    window.addEventListener('pointerup', onUp, true)
    return () => window.removeEventListener('pointerup', onUp, true)
  }, [item.id, sticky])

  useEffect(() => {
    if (flipped || sticky) return
    closeTimer.current = window.setTimeout(onClose, FIRST_GRACE_MS)
    return () => window.clearTimeout(closeTimer.current)
  }, [item.id, flipped, sticky, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(CARD_W, vw - 2 * MARGIN)
  const left = flipped ? vw / 2 : clamp(state.cx, w / 2 + MARGIN, vw - w / 2 - MARGIN)
  const top = flipped ? vh / 2 : clamp(state.cy, HALF_H + MARGIN, vh - HALF_H - MARGIN)

  return (
    <div className="cardov">
      {(flipped || sticky) && <div className={`cardov-catch${flipped ? ' is-dim' : ''}`} onPointerDown={onClose} />}
      <div
        key={item.id}
        className="cardov-card"
        style={{ left, top, ['--ov-w' as string]: `${w}px` }}
        onPointerEnter={() => window.clearTimeout(closeTimer.current)}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch' || flipped || sticky) return
          closeTimer.current = window.setTimeout(onClose, GRACE_MS)
        }}
      >
        <NewsCard
          item={item}
          flipped={flipped}
          onToggle={() => {
            if (performance.now() - openedAt.current < CLICK_GUARD_MS) return
            onToggle()
          }}
          contrarioEnlace={state.contrarioEnlace}
          peek
          storyCount={state.storyCount}
        />
      </div>
    </div>
  )
}
