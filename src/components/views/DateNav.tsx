import { useState } from 'react'
import { CalendarLocalized } from '../ui/calendar-localized'

type Props = {
  dateAnchor: string | null
  onToday: () => void
  onSelect: (iso: string) => void
}

export default function DateNav({ dateAnchor, onToday, onSelect }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pw-date-nav">
      <button
        className="pw-date-btn pw-date-btn-today"
        onClick={() => {
          setOpen(false)
          onToday()
        }}
        title="Volver a lo más reciente"
      >
        ↺ HOY
      </button>
      <button
        className="pw-date-btn pw-date-btn-cal"
        onClick={() => setOpen((v) => !v)}
        title="Saltar a una fecha"
        aria-label="Abrir calendario"
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <CalendarLocalized
          selected={dateAnchor}
          onSelect={(iso) => {
            setOpen(false)
            onSelect(iso)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
