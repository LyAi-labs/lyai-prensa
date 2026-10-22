import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useSpotlight } from '../../hooks/use-spotlight'
import './flip-card.css'

/**
 * Card con giro (frente/reverso), spotlight al hover y tilt 3D suave.
 *
 * El giro son DOS GIROS DE 90° que se relevan (el frente queda de canto y se
 * oculta, entra el reverso): NO usa `preserve-3d` ni `backface-visibility`,
 * porque algunos navegadores los aplanan/ignoran y se veían las dos caras
 * superpuestas (una en espejo). Ver README.
 */
export interface FlipCardProps {
  front: ReactNode
  back: ReactNode
  /** Controlado. Si se omite, la card gestiona su estado (`defaultFlipped`). */
  flipped?: boolean
  defaultFlipped?: boolean
  onFlippedChange?: (flipped: boolean) => void
  disabled?: boolean
  /** Color de acento (hex). Alimenta `--ls-accent-rgb` (spotlight, bordes). */
  accent?: string
  /** Grados máximos de tilt con el cursor (0 = sin tilt). Por defecto 6. */
  tilt?: number
  ariaLabel?: string
  /** Si devuelve true, ese click no gira (p. ej. `consumeTouchClick` de use-dwell). */
  shouldIgnoreClick?: () => boolean
  /** Se pinta dentro de la raíz, fuera de las caras (anillos, etiquetas flotantes). */
  overlay?: ReactNode
  /** Para enlazar hooks externos (`useDwell`) a la misma raíz. */
  rootRef?: RefObject<HTMLDivElement>
  className?: string
  style?: CSSProperties
  frontClassName?: string
  backClassName?: string
  /** Por defecto true: el click de la card no burbujea (evita cerrar overlays/paneles padre). */
  stopClickPropagation?: boolean
}

function hexToRgb(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : null
}

export function FlipCard({
  front,
  back,
  flipped,
  defaultFlipped = false,
  onFlippedChange,
  disabled = false,
  accent,
  tilt = 6,
  ariaLabel,
  shouldIgnoreClick,
  overlay,
  rootRef,
  className,
  style,
  frontClassName,
  backClassName,
  stopClickPropagation = true,
}: FlipCardProps) {
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = rootRef ?? ownRef
  const [internal, setInternal] = useState(defaultFlipped)
  const controlled = flipped !== undefined
  const isFlipped = controlled ? flipped : internal
  // Cuando la tarjeta está girada mostrando el reverso, desactivar por completo el tilt 3D y hover
  const spot = useSpotlight(ref, isFlipped ? 0 : tilt)

  const toggle = () => {
    if (disabled) return
    const next = !isFlipped
    if (!controlled) setInternal(next)
    onFlippedChange?.(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    toggle()
  }

  const rgb = accent ? hexToRgb(accent) : null
  const rootStyle = (rgb ? { ['--ls-accent-rgb' as string]: rgb, ...style } : style) as CSSProperties | undefined

  return (
    <div
      ref={ref}
      className={`ls-flip${isFlipped ? ' is-flipped' : ''}${className ? ` ${className}` : ''}`}
      style={rootStyle}
      onPointerMove={isFlipped ? undefined : spot.onPointerMove}
      onPointerLeave={isFlipped ? undefined : spot.onPointerLeave}
      onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <div className="ls-flip-tilt">
        <div
          className="ls-flip-inner"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-pressed={isFlipped}
          aria-disabled={disabled}
          aria-label={ariaLabel}
          onClick={() => {
            if (shouldIgnoreClick?.()) return
            toggle()
          }}
          onKeyDown={onKeyDown}
        >
          <div className={`ls-flip-face ls-flip-front${frontClassName ? ` ${frontClassName}` : ''}`}>{front}</div>
          <div className={`ls-flip-face ls-flip-back${backClassName ? ` ${backClassName}` : ''}`} aria-hidden={!isFlipped}>
            {back}
          </div>
        </div>
      </div>
      {overlay}
    </div>
  )
}
