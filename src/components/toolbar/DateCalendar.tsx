import { useEffect, useState } from 'react'
import { fetchDiasContradiccion, type DiaContradiccionInfo } from '../../data/newsApi'

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DateCalendar({
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
  const [viewMonth, setViewMonth] = useState(initial.getMonth()) // 0-11
  const [contraDays, setContraDays] = useState<Map<string, DiaContradiccionInfo>>(new Map())

  useEffect(() => {
    const desde = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
    const hastaDate = new Date(viewYear, viewMonth + 1, 1)
    const hasta = isoDate(hastaDate)
    let cancelled = false
    fetchDiasContradiccion(desde, hasta)
      .then((days) => {
        if (!cancelled) setContraDays(days)
      })
      .catch((err) => console.warn('No se pudo cargar /api/contradicciones/dias:', err))
    return () => {
      cancelled = true
    }
  }, [viewYear, viewMonth])

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  // getDay(): 0=domingo..6=sábado → lo pasamos a L=0..D=6
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayIso = isoDate(today)

  const changeMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewMonth(m)
    setViewYear(y)
  }

  const totalContrasMes = Array.from(contraDays.values()).reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="wall-calendar" onClick={(e) => e.stopPropagation()}>
      <div className="wall-calendar-head">
        <button onClick={() => changeMonth(-1)} aria-label="Mes anterior">‹</button>
        <span>{MESES[viewMonth]} {viewYear}</span>
        <button onClick={() => changeMonth(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="wall-calendar-grid wall-calendar-dow">
        {DIAS_SEMANA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="wall-calendar-grid">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayIso
          const isSelected = iso === selected
          const contraInfo = contraDays.get(iso)
          const hasContra = !!contraInfo && contraInfo.count > 0
          const cls = [
            'wall-calendar-day',
            isSelected ? 'is-selected' : '',
            !isSelected && isToday ? 'is-today' : '',
            hasContra ? 'has-contra' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={iso}
              className={cls}
              onClick={() => onSelect(iso)}
              title={hasContra ? `${day} — ${contraInfo.count} contradicciones (${contraInfo.noticiasCount} noticias)` : undefined}
            >
              <span className="cal-day-num">{day}</span>
              {hasContra && (
                <span className="wall-calendar-contra-badge">
                  {contraInfo.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="wall-calendar-foot">
        {totalContrasMes > 0 ? (
          <div className="wall-calendar-legend-contra" title="Contradicciones registradas este mes">
            <span className="wall-cal-contra-dot" />
            <span>{totalContrasMes} contradicciones</span>
          </div>
        ) : (
          <span />
        )}
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

