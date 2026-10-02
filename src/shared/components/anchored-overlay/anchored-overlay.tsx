import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import './anchored-overlay.css'

/**
 * Una única capa DOM anclada a un punto de pantalla (cx, cy): se coloca sobre un
 * elemento que NO puede tener efectos de DOM (p. ej. una card pintada en una
 * `THREE.CanvasTexture`), o abre un detalle sobre una tesela.
 *
 * - `modal`: se centra en pantalla con fondo atenuado (detalle girado/expandido).
 * - `sticky`: abierta con el dedo; una capa transparente cierra al tocar fuera.
 * - Sin modal ni sticky (ratón): se cierra al salir del contenido (`graceMs`).
 * - Esc cierra. Guarda de click: el click que abre (o el que Android lanza al
 *   levantar el dedo tras un «mantener») no acciona el contenido.
 */
export interface AnchoredOverlayHelpers {
  /** true mientras el click aún es el que abrió el overlay → ignóralo. */
  shouldIgnoreClick: () => boolean
}

export interface AnchoredOverlayProps {
  cx: number
  cy: number
  modal?: boolean
  sticky?: boolean
  onClose: () => void
  children: ReactNode | ((h: AnchoredOverlayHelpers) => ReactNode)
  /** Cambia con cada contenido nuevo: reinicia temporizadores y animación de entrada. */
  contentKey?: string | number
  width?: number
  /** Alto medio estimado, solo para no salirse de pantalla. */
  halfHeight?: number
  margin?: number
  graceMs?: number
  firstGraceMs?: number
  clickGuardMs?: number
  className?: string
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function AnchoredOverlay({
  cx,
  cy,
  modal = false,
  sticky = false,
  onClose,
  children,
  contentKey,
  width = 300,
  halfHeight = 230,
  margin = 12,
  graceMs = 140,
  firstGraceMs = 800,
  clickGuardMs = 450,
  className,
}: AnchoredOverlayProps) {
  const closeTimer = useRef(0)
  const openedAt = useRef(0)

  useEffect(() => {
    openedAt.current = performance.now()
    if (!sticky) return
    // Con el dedo aún apoyado el click llega al levantar, quizá mucho después de
    // abrirse: la guarda cuenta desde que se levanta, no desde que se abre.
    const onUp = () => {
      openedAt.current = performance.now()
      window.removeEventListener('pointerup', onUp, true)
    }
    window.addEventListener('pointerup', onUp, true)
    return () => window.removeEventListener('pointerup', onUp, true)
  }, [contentKey, sticky])

  // Si el cursor no cae dentro del contenido (queda clampado) no habría
  // pointerleave: un cierre de gracia que cancela pointerenter lo cubre.
  useEffect(() => {
    if (modal || sticky) return
    closeTimer.current = window.setTimeout(onClose, firstGraceMs)
    return () => window.clearTimeout(closeTimer.current)
  }, [contentKey, modal, sticky, onClose, firstGraceMs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shouldIgnoreClick = useCallback(
    () => performance.now() - openedAt.current < clickGuardMs,
    [clickGuardMs],
  )

  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(width, vw - 2 * margin)
  const left = modal ? vw / 2 : clamp(cx, w / 2 + margin, vw - w / 2 - margin)
  const top = modal ? vh / 2 : clamp(cy, halfHeight + margin, vh - halfHeight - margin)

  return (
    <div className={`ls-ao${className ? ` ${className}` : ''}`}>
      {(modal || sticky) && <div className={`ls-ao-catch${modal ? ' is-dim' : ''}`} onPointerDown={onClose} />}
      <div
        key={contentKey}
        className="ls-ao-card"
        style={{ left, top, ['--ls-ao-w' as string]: `${w}px` }}
        onPointerEnter={() => window.clearTimeout(closeTimer.current)}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch' || modal || sticky) return
          closeTimer.current = window.setTimeout(onClose, graceMs)
        }}
      >
        {typeof children === 'function' ? children({ shouldIgnoreClick }) : children}
      </div>
    </div>
  )
}
