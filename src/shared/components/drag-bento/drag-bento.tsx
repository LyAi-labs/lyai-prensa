import { useCallback, useEffect, useRef, type CSSProperties, type HTMLAttributes, type MouseEvent, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react'
import { useSpotlightDelegate } from '../../hooks/use-spotlight'
import './drag-bento.css'

/**
 * Mosaico (bento) HORIZONTAL que se arrastra para explorar: teselas de distinto
 * tamaño en `rows` filas (`BentoTile span="big|tall|wide|sm"`). Arrastre con
 * inercia (ratón), rueda → desplazamiento horizontal, scroll nativo con el dedo,
 * `onNearEnd` para carga infinita y spotlight en las teselas. El click que sigue
 * a un arrastre no llega a la tesela. Referencia visual: «bento-gallery» (21st.dev).
 */
export type BentoSpan = 'big' | 'tall' | 'wide' | 'sm'

export interface DragBentoProps {
  children: ReactNode
  /** Se llama al acercarse (≤2 pantallas) al final: pide la siguiente tanda. */
  onNearEnd?: () => void
  /** Al cambiar (p. ej. la fecha ancla), vuelve al principio. */
  resetKey?: unknown
  scrollRef?: RefObject<HTMLDivElement>
  /** Se muestra a la derecha de las teselas (p. ej. «fin»). */
  end?: ReactNode
  /** Se muestra si no hay teselas. */
  empty?: ReactNode
  className?: string
  /** Variables: --ls-bento-h (alto del mosaico), --ls-bento-col (ancho de columna), --ls-bento-gap. */
  style?: CSSProperties
  rows?: number
  /** Selector de las teselas que reciben spotlight (por defecto `.ls-bento-tile`). */
  spotlightSelector?: string
}

export function DragBento({
  children,
  onNearEnd,
  resetKey,
  scrollRef,
  end,
  empty,
  className,
  style,
  rows = 2,
  spotlightSelector = '.ls-bento-tile',
}: DragBentoProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = scrollRef ?? ownRef
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false, lastX: 0, lastT: 0, v: 0, raf: 0 })

  useSpotlightDelegate(ref, spotlightSelector)

  const stopInertia = () => cancelAnimationFrame(drag.current.raf)

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = ref.current
    if (!el) return
    stopInertia()
    const d = drag.current
    d.down = true
    d.moved = false
    d.startX = e.clientX
    d.startLeft = el.scrollLeft
    d.lastX = e.clientX
    d.lastT = performance.now()
    d.v = 0

    const onMove = (ev: PointerEvent) => {
      if (!d.down) return
      const dx = ev.clientX - d.startX
      if (!d.moved && Math.abs(dx) > 5) {
        d.moved = true
        el.classList.add('is-dragging')
      }
      if (!d.moved) return
      el.scrollLeft = d.startLeft - dx
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT)
      d.v = (-(ev.clientX - d.lastX) / dt) * 16
      d.lastX = ev.clientX
      d.lastT = now
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      d.down = false
      el.classList.remove('is-dragging')
      if (!d.moved) return
      const step = () => {
        el.scrollLeft += d.v
        d.v *= 0.94
        if (Math.abs(d.v) > 0.3) d.raf = requestAnimationFrame(step)
      }
      d.raf = requestAnimationFrame(step)
      window.setTimeout(() => (d.moved = false), 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // El click que sigue a un arrastre no abre la tesela.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.stopPropagation()
      e.preventDefault()
      drag.current.moved = false
    }
  }

  // Rueda → desplazamiento horizontal.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      e.preventDefault()
      stopInertia()
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])

  const maybeLoad = useCallback(() => {
    const el = ref.current
    if (!el || !onNearEnd) return
    if (el.scrollLeft + el.clientWidth * 2 >= el.scrollWidth) onNearEnd()
  }, [ref, onNearEnd])

  // Por si la primera tanda no llena la pantalla; se re-evalúa al cambiar las teselas.
  useEffect(() => {
    const raf = requestAnimationFrame(maybeLoad)
    return () => cancelAnimationFrame(raf)
  }, [maybeLoad, children])

  useEffect(() => {
    ref.current?.scrollTo({ left: 0 })
  }, [resetKey, ref])

  const hasTiles = Array.isArray(children) ? children.length > 0 : !!children

  return (
    <div
      ref={ref}
      className={`ls-bento-scroll${className ? ` ${className}` : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      onScroll={maybeLoad}
    >
      <div className="ls-bento-grid" style={{ ['--ls-bento-rows' as string]: rows }}>{children}</div>
      {!hasTiles && empty && <div className="ls-bento-note">{empty}</div>}
      {hasTiles && end && <div className="ls-bento-note">{end}</div>}
    </div>
  )
}

export interface BentoTileProps extends HTMLAttributes<HTMLElement> {
  span?: BentoSpan
  /** Hex/rgb del acento (spotlight). Acepta cualquier valor CSS para `--ls-accent-rgb`: pasa «r, g, b». */
  accentRgb?: string
  as?: 'article' | 'div'
}

/** Tesela: aporta el tamaño en la rejilla y la base del spotlight; el aspecto lo pone el proyecto. */
export function BentoTile({ span = 'sm', accentRgb, as = 'article', className, style, children, ...rest }: BentoTileProps) {
  const Tag = as
  const st = accentRgb ? ({ ['--ls-accent-rgb' as string]: accentRgb, ...style } as CSSProperties) : style
  return (
    <Tag className={`ls-bento-tile ls-span-${span}${className ? ` ${className}` : ''}`} style={st} {...rest}>
      {children}
    </Tag>
  )
}
