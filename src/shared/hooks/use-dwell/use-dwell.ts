import { useEffect, useRef, type RefObject } from 'react'

/**
 * «Parar» sobre un elemento (peek / vista previa).
 *
 * Ratón: cursor quieto `mouseMs` dentro del elemento (moverse más de
 * `mouseJitter` px reinicia la cuenta). Dedo (Android/iOS): apoyar y mantener
 * `touchMs` sin moverse más de `touchSlop` px; si se mueve antes es scroll y se
 * cancela. Con el dedo la activación es «pegajosa»: sigue activa al levantar
 * (para poder pulsar botones) hasta tocar fuera o hacer scroll.
 *
 * Escribe `data-arming` y `--dwell` (0→1) en el elemento mientras se llena, para
 * dibujar un anillo de progreso con CSS (ver components/flip-card).
 */
export interface UseDwellOptions {
  enabled: boolean
  onDwell: () => void
  onEnd: () => void
  mouseMs?: number
  touchMs?: number
  mouseJitter?: number
  touchSlop?: number
}

const CLICK_GUARD_MS = 700

export function useDwell(
  rootRef: RefObject<HTMLElement>,
  { enabled, onDwell, onEnd, mouseMs = 450, touchMs = 350, mouseJitter = 3, touchSlop = 10 }: UseDwellOptions,
) {
  const cb = useRef({ onDwell, onEnd })
  cb.current = { onDwell, onEnd }
  const touchDwellAt = useRef(0)

  useEffect(() => {
    const el = rootRef.current
    if (!el || !enabled) return

    let timer = 0
    let raf = 0
    let sx = 0
    let sy = 0
    let t0 = 0
    let ms = mouseMs
    let active = false
    let isTouch = false

    const stopArming = () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      delete el.dataset.arming
      el.style.setProperty('--dwell', '0')
    }

    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms)
      el.style.setProperty('--dwell', p.toFixed(3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }

    const arm = (e: PointerEvent) => {
      if (active) return
      stopArming()
      sx = e.clientX
      sy = e.clientY
      isTouch = e.pointerType === 'touch'
      ms = isTouch ? touchMs : mouseMs
      t0 = performance.now()
      el.dataset.arming = '1'
      raf = requestAnimationFrame(tick)
      timer = window.setTimeout(() => {
        stopArming()
        active = true
        if (isTouch) {
          touchDwellAt.current = performance.now()
          navigator.vibrate?.(12)
          window.addEventListener('pointerdown', onOutside, true)
        }
        window.addEventListener('scroll', onScroll, true)
        cb.current.onDwell()
      }, ms)
    }

    const end = () => {
      stopArming()
      if (!active) return
      active = false
      window.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('scroll', onScroll, true)
      cb.current.onEnd()
    }

    function onOutside(e: PointerEvent) {
      if (!el!.contains(e.target as Node)) end()
    }

    // El scroll del propio contenido (p. ej. la hoja de peek) no debe cerrarlo.
    function onScroll(e: Event) {
      if (e.target instanceof Node && el!.contains(e.target)) return
      end()
    }

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') arm(e)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') arm(e)
    }
    const onMove = (e: PointerEvent) => {
      const d = Math.hypot(e.clientX - sx, e.clientY - sy)
      if (e.pointerType === 'touch') {
        if (!active && d > touchSlop) stopArming()
      } else if (!active && d > mouseJitter) {
        arm(e)
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') end()
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (active) touchDwellAt.current = performance.now()
      else stopArming()
    }
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') end()
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('contextmenu', onContextMenu)

    return () => {
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('contextmenu', onContextMenu)
      end()
    }
  }, [rootRef, enabled, mouseMs, touchMs, mouseJitter, touchSlop])

  // Tras un «mantener» con el dedo, Android puede lanzar un click al soltar:
  // el elemento lo ignora para no accionarse justo después de abrir el peek.
  return {
    consumeTouchClick: () => {
      const recent = performance.now() - touchDwellAt.current < CLICK_GUARD_MS
      if (recent) touchDwellAt.current = 0
      return recent
    },
  }
}
