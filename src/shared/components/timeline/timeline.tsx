import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useSpotlightDelegate } from '../../hooks/use-spotlight'
import './timeline.css'

/**
 * Línea de tiempo vertical: columna central con la hora y los nodos a los lados
 * (alternando), separadores de día y nodos de ancho completo (`full`: p. ej. una
 * comparación lado a lado). Scroll propio con `onNearEnd` (carga infinita).
 * El aspecto de cada nodo lo pone el proyecto (`content`); aquí solo el esqueleto.
 */
export interface TimelineNode {
  id: string
  /** Clave de día: al cambiar entre nodos consecutivos se inserta un separador. */
  day?: string
  dayLabel?: string
  time?: string
  timeSub?: string
  /** Color del punto de la línea (CSS). */
  accent?: string
  /** Ancho completo, sin lado ni punto; reinicia la alternancia. */
  full?: boolean
  content: ReactNode
}

export interface TimelineProps {
  nodes: TimelineNode[]
  onNearEnd?: () => void
  resetKey?: unknown
  scrollRef?: RefObject<HTMLDivElement>
  empty?: ReactNode
  end?: ReactNode
  className?: string
  /** Selector de los elementos con spotlight (por defecto `.ls-tl-tile`). */
  spotlightSelector?: string
}

export function Timeline({ nodes, onNearEnd, resetKey, scrollRef, empty, end, className, spotlightSelector = '.ls-tl-tile' }: TimelineProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = scrollRef ?? ownRef
  useSpotlightDelegate(ref, spotlightSelector)

  const maybeLoad = useCallback(() => {
    const el = ref.current
    if (!el || !onNearEnd) return
    if (el.scrollTop + el.clientHeight * 2 >= el.scrollHeight) onNearEnd()
  }, [ref, onNearEnd])

  useEffect(() => {
    const raf = requestAnimationFrame(maybeLoad)
    return () => cancelAnimationFrame(raf)
  }, [maybeLoad, nodes.length])

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
  }, [resetKey, ref])

  let side = 0
  let lastDay: string | undefined

  return (
    <div ref={ref} className={`ls-tl-scroll${className ? ` ${className}` : ''}`} onScroll={maybeLoad}>
      <div className="ls-tl">
        {nodes.map((n) => {
          const sep = n.day !== undefined && n.day !== lastDay
          lastDay = n.day
          if (n.full) {
            side = 0
            return (
              <div key={n.id}>
                {sep && <div className="ls-tl-sep"><span>— {n.dayLabel ?? n.day} —</span></div>}
                <div className="ls-tl-nd ls-tl-full">{n.content}</div>
              </div>
            )
          }
          const cls = side++ % 2 === 0 ? 'ls-tl-l' : 'ls-tl-r'
          return (
            <div key={n.id}>
              {sep && <div className="ls-tl-sep"><span>— {n.dayLabel ?? n.day} —</span></div>}
              <div className={`ls-tl-nd ${cls}`} style={n.accent ? ({ ['--ls-tl-c' as string]: n.accent }) : undefined}>
                <div className="ls-tl-side">{n.content}</div>
                <span className="ls-tl-dot" />
                {n.time && (
                  <span className="ls-tl-time">
                    {n.time}
                    {n.timeSub && <small>{n.timeSub}</small>}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {nodes.length === 0 && empty && <div className="ls-tl-note ls-tl-empty">{empty}</div>}
      {nodes.length > 0 && end && <div className="ls-tl-note">{end}</div>}
    </div>
  )
}
