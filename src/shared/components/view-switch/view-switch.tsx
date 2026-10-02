import type { ReactNode } from 'react'
import './view-switch.css'

export type BuiltinIcon = 'grid' | 'timeline'

export interface ViewOption<T extends string> {
  id: T
  label: string
  /** Icono propio, o uno de los incluidos (`grid`, `timeline`). */
  icon?: BuiltinIcon | ReactNode
}

const ICONS: Record<BuiltinIcon, ReactNode> = {
  grid: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  timeline: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
      <path d="M14 7h6M4 17h6" />
    </svg>
  ),
}

/** Selector segmentado de vista (tabs). Por defecto flota arriba al centro (`position: fixed`). */
export function ViewSwitch<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: ViewOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`ls-vs${className ? ` ${className}` : ''}`} role="tablist" aria-label="Cambiar de vista">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          className={`ls-vs-btn${value === o.id ? ' is-on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {typeof o.icon === 'string' ? ICONS[o.icon as BuiltinIcon] : o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
