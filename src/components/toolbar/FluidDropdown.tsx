import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export type DropdownOption = { id: string; label: string; dot?: string; count?: number }

// Dropdown con resaltado deslizante entre opciones — portado del
// `fluid-dropdown` de 21st.dev a motion/react (el proyecto ya lo trae; no
// hace falta framer-motion) y sin Tailwind/shadcn. Ver dev-xplain
// 2026-10-04-1745-prensa-toolbar-filtros-busqueda para el origen.
export default function FluidDropdown({
  icon,
  labelPrefix,
  options,
  value,
  onChange,
}: {
  icon: ReactNode
  labelPrefix: string
  options: DropdownOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [open])

  const selected = options.find((o) => o.id === value)
  const activeId = hovered ?? value
  const activeIdx = Math.max(0, options.findIndex((o) => o.id === activeId))

  return (
    <div className="fdrop" ref={rootRef}>
      <button type="button" className="fdrop-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="ico" aria-hidden="true">{icon}</span>
        <span>{labelPrefix}: <b>{selected?.label ?? 'Todas'}</b></span>
        <svg className="chev" style={{ transform: open ? 'rotate(180deg)' : undefined }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fdrop-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="fdrop-list" onMouseLeave={() => setHovered(null)}>
              <motion.div
                className="fdrop-hl"
                animate={{ y: activeIdx * 36 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34, mass: 1 }}
              />
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`fdrop-item${o.id === value ? ' is-sel' : ''}`}
                  onMouseEnter={() => setHovered(o.id)}
                  onClick={() => { onChange(o.id); setOpen(false) }}
                >
                  {o.dot && <span className="dot" style={{ background: o.dot }} aria-hidden="true" />}
                  <span>{o.label}</span>
                  {o.count !== undefined && <span className="n">{o.count}</span>}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
