import { useCallback, useEffect, type PointerEvent, type RefObject } from 'react'

/**
 * Spotlight + tilt por custom properties CSS (`--mx/--my` en %, `--rx/--ry` en grados).
 * Solo recomposición GPU: sin re-render de React ni repintado. El CSS dibuja el
 * resplandor con `radial-gradient(... at var(--mx) var(--my) ...)`.
 */
export function applySpotlight(el: HTMLElement, clientX: number, clientY: number, tilt = 0) {
  const r = el.getBoundingClientRect()
  const px = (clientX - r.left) / r.width
  const py = (clientY - r.top) / r.height
  el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
  if (tilt) {
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * tilt).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - py) * 2 * tilt).toFixed(2)}deg`)
  }
}

export function resetSpotlight(el: HTMLElement) {
  el.style.setProperty('--mx', '50%')
  el.style.setProperty('--my', '50%')
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

/** Handlers para UN elemento React (`onPointerMove`/`onPointerLeave`). */
export function useSpotlight<T extends HTMLElement>(ref: RefObject<T>, tilt = 0) {
  const onPointerMove = useCallback(
    (e: PointerEvent<T>) => {
      if (e.pointerType === 'touch' || !ref.current) return
      applySpotlight(ref.current, e.clientX, e.clientY, tilt)
    },
    [ref, tilt],
  )
  const onPointerLeave = useCallback(() => {
    if (ref.current) resetSpotlight(ref.current)
  }, [ref])
  return { onPointerMove, onPointerLeave }
}

/**
 * Delegación para MUCHOS elementos (rejillas): un solo listener en el contenedor
 * aplica el spotlight al ancestro que coincida con `selector` bajo el cursor.
 */
export function useSpotlightDelegate(rootRef: RefObject<HTMLElement>, selector: string, tilt = 0) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onMove = (e: PointerEvent | globalThis.PointerEvent) => {
      if ((e as globalThis.PointerEvent).pointerType === 'touch') return
      const t = (e.target as HTMLElement).closest<HTMLElement>(selector)
      if (t) applySpotlight(t, e.clientX, e.clientY, tilt)
    }
    root.addEventListener('pointermove', onMove as EventListener, { passive: true })
    return () => root.removeEventListener('pointermove', onMove as EventListener)
  }, [rootRef, selector, tilt])
}
