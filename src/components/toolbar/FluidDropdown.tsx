import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import BorderBeam, { type BorderBeamColorVariant } from '../ui/BorderBeam'
import './fluid-dropdown.css'

export type DropdownOption = { id: string; label: string; dot?: string; count?: number }

export default function FluidDropdown({
  icon,
  labelPrefix,
  options,
  value,
  variant = 'ocean',
  onChange,
}: {
  icon: ReactNode
  labelPrefix: string
  options: DropdownOption[]
  value: string
  variant?: BorderBeamColorVariant
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
      <BorderBeam size="sm" borderRadius={12} colorVariant={variant} className="tb-beam-item">
        <button
          type="button"
          className="fdrop-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="fdrop-btn-content">
            <span className="ico" aria-hidden="true">{icon}</span>
            <span className="fdrop-btn-label">
              <span className="prefix">{labelPrefix}:</span>
              <b>{selected?.label ?? 'Todas'}</b>
            </span>
          </div>
          <ChevronDown size={14} strokeWidth={2.4} className="chev" aria-hidden="true" />
        </button>
      </BorderBeam>
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
              {activeIdx >= 0 && (
                <motion.div
                  className="fdrop-hl"
                  animate={{ y: activeIdx * 34 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 34, mass: 1 }}
                />
              )}
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`fdrop-item${o.id === value ? ' is-sel' : ''}`}
                  onMouseEnter={() => setHovered(o.id)}
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                >
                  {o.dot && <span className="dot" style={{ background: o.dot }} aria-hidden="true" />}
                  <span className="label-text">{o.label}</span>
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
