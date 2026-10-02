import { useEffect, useState } from 'react'
import { fetchDiasContradiccion } from '../../data/newsApi'

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Props = {
  dateAnchor: string | null
  onToday: () => void
  onSelect: (iso: string) => void
}

export default function DateNav({ dateAnchor, onToday, onSelect }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pw-date-nav">
      <button className="pw-date-btn pw-date-btn-today" onClick={() => { setOpen(false); onToday() }} title="Volver a lo más reciente">
        ↺ HOY
      </button>
      <button className="pw-date-btn pw-date-btn-cal" onClick={() => setOpen((v) => !v)} title="Saltar a una fecha" aria-label="Abrir calendario">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <DateCalendar
          selected={dateAnchor}
          onSelect={(iso) => { setOpen(false); onSelect(iso) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function DateCalendar({
  selected,
  onSelect,
  onClose,
}: {
  selected: string | null
  onSelect: (iso: string) => void
  onClose: () => void
}) {
  const today = new Date()
  const initial = selected ? new Date(`${selected}T00:00:00`) : today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [contraDays, setContraDays] = useState<Set<string>>(new Set())

  useEffect(() => {
    const desde = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
    const hasta = isoDate(new Date(viewYear, viewMonth + 1, 1))
    let cancelled = false
    fetchDiasContradiccion(desde, hasta)
      .then((days) => { if (!cancelled) setContraDays(days) })
      .catch((err) => console.warn('No se pudo cargar /api/contradicciones/dias:', err))
    return () => { cancelled = true }
  }, [viewYear, viewMonth])

  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayIso = isoDate(today)

  const changeMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 } else if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  return (
    <div className="pw-calendar" onClick={(e) => e.stopPropagation()}>
      <div className="pw-calendar-head">
        <button onClick={() => changeMonth(-1)} aria-label="Mes anterior">‹</button>
        <span>{MESES[viewMonth]} {viewYear}</span>
        <button onClick={() => changeMonth(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="pw-calendar-grid pw-calendar-dow">
        {DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="pw-calendar-grid">
        {Array.from({ length: leadingBlanks }).map((_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const cls = [
            'pw-calendar-day',
            iso === selected ? 'is-selected' : '',
            iso !== selected && iso === todayIso ? 'is-today' : '',
            contraDays.has(iso) ? 'has-contra' : '',
          ].filter(Boolean).join(' ')
          return <button key={iso} className={cls} onClick={() => onSelect(iso)}>{day}</button>
        })}
      </div>
      <div className="pw-calendar-foot">
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}
