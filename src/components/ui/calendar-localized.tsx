import { useState, useEffect, useRef, useCallback, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react'
import { fetchDiasContradiccion, type DiaContradiccionInfo } from '../../data/newsApi'
import { cn } from '@/lib/utils'
import './calendar-localized.css'

export type SupportedLocale = 'es' | 'en' | 'ca' | 'gl' | 'eu'

interface LocaleData {
  name: string
  title: string
  description: string
  months: string[]
  dows: string[]
  today: string
  close: string
  contradictions: string
}

const LOCALES: Record<SupportedLocale, LocaleData> = {
  es: {
    name: 'Español',
    title: 'Explorar por fecha',
    description: 'Selecciona las fechas para consultar noticias históricas',
    months: [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],
    dows: ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'],
    today: 'Hoy',
    close: 'Cerrar',
    contradictions: 'Con contradicciones',
  },
  en: {
    name: 'English',
    title: 'Explore by date',
    description: 'Select dates to browse historical news',
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    dows: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
    today: 'Today',
    close: 'Close',
    contradictions: 'With contradictions',
  },
  ca: {
    name: 'Català',
    title: 'Explorar per data',
    description: 'Selecciona les dates per consultar notícies històriques',
    months: [
      'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
      'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
    ],
    dows: ['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'],
    today: 'Avui',
    close: 'Tancar',
    contradictions: 'Amb contradiccions',
  },
  gl: {
    name: 'Galego',
    title: 'Explorar por data',
    description: 'Selecciona as datas para consultar as novas históricas',
    months: [
      'xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño',
      'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro',
    ],
    dows: ['lu', 'ma', 'mé', 'xo', 've', 'sá', 'do'],
    today: 'Hoxe',
    close: 'Pechar',
    contradictions: 'Con contradicións',
  },
  eu: {
    name: 'Euskara',
    title: 'Arakatu dataren arabera',
    description: 'Hautatu datak albiste historikoak kontsultatzeko',
    months: [
      'urtarrila', 'otsaila', 'martxoa', 'apirila', 'maiatza', 'ekaina',
      'uztaila', 'abuztua', 'iraila', 'urria', 'azaroa', 'abendua',
    ],
    dows: ['al', 'as', 'az', 'og', 'or', 'lr', 'ig'],
    today: 'Gaur',
    close: 'Itxi',
    contradictions: 'Kontraesanak dituztenak',
  },
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface CalendarLocalizedProps {
  selected: string | null
  onSelect: (iso: string) => void
  onClose: () => void
  className?: string
}

export function CalendarLocalized({
  selected,
  onSelect,
  onClose,
  className,
}: CalendarLocalizedProps) {
  const [locale, setLocale] = useState<SupportedLocale>('es')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const langTriggerRef = useRef<HTMLButtonElement>(null)

  const today = useRef(new Date()).current
  const todayIso = isoDate(today)

  const initial = selected ? new Date(`${selected}T00:00:00`) : today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const [contraDays, setContraDays] = useState<Map<string, DiaContradiccionInfo>>(new Map())

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Fetch contradiction days for the viewed window
  useEffect(() => {
    const desde = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
    const hastaDate = new Date(viewYear, viewMonth + 2, 1)
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

  const changeMonth = useCallback((delta: number) => {
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
  }, [viewMonth, viewYear])

  // Helper to build a month grid
  const renderMonth = (year: number, month: number, isFirstMonth: boolean) => {
    const currentLoc = LOCALES[locale]
    const firstDay = new Date(year, month, 1)
    // Convert getDay (0=Sun..6=Sat) to Mon=0..Sun=6
    const leadingBlanks = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: { day: number; iso: string; isCurrentMonth: boolean }[] = []

    // Previous month padding
    for (let i = leadingBlanks - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevDate = new Date(year, month - 1, d)
      cells.push({ day: d, iso: isoDate(prevDate), isCurrentMonth: false })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d)
      cells.push({ day: d, iso: isoDate(curDate), isCurrentMonth: true })
    }

    // Next month padding to fill grid
    const remaining = 35 - cells.length
    if (remaining > 0) {
      for (let d = 1; d <= remaining; d++) {
        const nextDate = new Date(year, month + 1, d)
        cells.push({ day: d, iso: isoDate(nextDate), isCurrentMonth: false })
      }
    }

    return (
      <div className="cal-loc-month" key={`${year}-${month}`}>
        <div className="cal-loc-month-head">
          {isFirstMonth ? (
            <button
              type="button"
              className="cal-loc-nav-btn"
              onClick={() => changeMonth(-1)}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <div style={{ width: 28 }} />
          )}

          <div className="cal-loc-month-title">
            {currentLoc.months[month]} {year}
          </div>

          {!isFirstMonth ? (
            <button
              type="button"
              className="cal-loc-nav-btn"
              onClick={() => changeMonth(1)}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          ) : (
            <div style={{ width: 28 }} />
          )}
        </div>

        {/* Days of week header */}
        <div className="cal-loc-grid">
          {currentLoc.dows.map((dow, idx) => (
            <div key={`${dow}-${idx}`} className="cal-loc-dow">
              {dow}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="cal-loc-grid">
          {cells.map(({ day, iso, isCurrentMonth }, idx) => {
            const isSelected = iso === selected
            const isToday = iso === todayIso
            const contraInfo = contraDays.get(iso)
            const hasContra = isCurrentMonth && !!contraInfo && contraInfo.count > 0

            return (
              <button
                key={`${iso}-${idx}`}
                type="button"
                className={cn(
                  'cal-loc-day-cell',
                  !isCurrentMonth && 'is-outside',
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                  hasContra && 'has-contra'
                )}
                onClick={() => {
                  if (isCurrentMonth) {
                    onSelect(iso)
                  }
                }}
                disabled={!isCurrentMonth}
                title={hasContra ? `${contraInfo.count} ${currentLoc.contradictions} (${contraInfo.noticiasCount} noticias)` : undefined}
              >
                <span>{day}</span>
                {hasContra && (
                  <span className="cal-loc-contra-badge">
                    {contraInfo.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const totalContras = Array.from(contraDays.values()).reduce((acc, c) => acc + c.count, 0)

  // Next month info for dual display
  let nextMonth = viewMonth + 1
  let nextYear = viewYear
  if (nextMonth > 11) {
    nextMonth = 0
    nextYear += 1
  }

  const currentStrings = LOCALES[locale]

  return (
    <div className="cal-loc-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cn('cal-loc-card', className)}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Header with Title, Description and Language Selector */}
        <div className="cal-loc-header">
          <div className="cal-loc-title-group">
            <h2 className="cal-loc-title">{currentStrings.title}</h2>
            <p className="cal-loc-desc">{currentStrings.description}</p>
          </div>

          {/* Language dropdown */}
          <div className="cal-loc-lang-select">
            <button
              ref={langTriggerRef}
              type="button"
              className="cal-loc-lang-trigger"
              onClick={() => setLangMenuOpen((v) => !v)}
              aria-expanded={langMenuOpen}
              aria-haspopup="listbox"
            >
              <span>{LOCALES[locale].name}</span>
              <ChevronDown size={14} />
            </button>

            {langMenuOpen && (
              <div className="cal-loc-lang-menu" role="listbox">
                {(Object.keys(LOCALES) as SupportedLocale[]).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={cn('cal-loc-lang-item', locale === loc && 'is-active')}
                    onClick={() => {
                      setLocale(loc)
                      setLangMenuOpen(false)
                    }}
                    role="option"
                    aria-selected={locale === loc}
                  >
                    <span>{LOCALES[loc].name}</span>
                    {locale === loc && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dual month layout */}
        <div className="cal-loc-body">
          <div className="cal-loc-months-wrap">
            {renderMonth(viewYear, viewMonth, true)}
            {renderMonth(nextYear, nextMonth, false)}
          </div>
        </div>

        {/* Footer with Legend and Action Buttons */}
        <div className="cal-loc-footer">
          <div className="cal-loc-legend">
            <span className="cal-loc-contra-dot" style={{ position: 'static', transform: 'none' }} />
            <span>
              {currentStrings.contradictions}
              {totalContras > 0 ? ` (${totalContras})` : ''}
            </span>
          </div>

          <div className="cal-loc-actions">
            <button
              type="button"
              className="cal-loc-btn cal-loc-btn-secondary"
              onClick={() => {
                onSelect(todayIso)
              }}
            >
              {currentStrings.today}
            </button>
            <button
              type="button"
              className="cal-loc-btn cal-loc-btn-primary"
              onClick={onClose}
            >
              {currentStrings.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalendarLocalized
