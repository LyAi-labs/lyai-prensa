import { useEffect, useRef, useState } from 'react'
import {
  IconLayoutGrid,
  IconGitBranch,
  IconClock,
  IconCalendar,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconBolt,
  IconSun,
  IconX,
  IconNews,
  IconCategory,
  IconArchive,
} from '@tabler/icons-react'
import {
  type NewsFilters,
  fetchContradiccionesConteo,
  type ContradiccionesConteo,
} from '../../data/newsApi'
import { Header17, type NavLink } from '../../shared/components/header-17'
import FluidDropdown, { type DropdownOption } from './FluidDropdown'
import DateCalendar from './DateCalendar'
import SearchResultsDropdown from './SearchResultsDropdown'
import './header-dock.css'

const TIPOS: DropdownOption[] = [
  { id: '', label: 'Todas las fuentes', dot: '#8A93A0' },
  { id: 'nacional', label: 'Prensa Nacional', dot: '#e2e8f0' },
  { id: 'regional', label: 'Prensa Regional', dot: '#94a3b8' },
  { id: 'tv', label: 'TV y Canales (incl. Negocios TV)', dot: '#f59e0b' },
  { id: 'radio', label: 'Radio y Podcasts', dot: '#a78bfa' },
]

const SECCIONES: DropdownOption[] = [
  { id: '', label: 'Todas las secciones' },
  { id: 'economia', label: 'Economía y Finanzas' },
  { id: 'politica', label: 'Política' },
  { id: 'internacional', label: 'Internacional' },
  { id: 'sociedad', label: 'Sociedad' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'cultura', label: 'Cultura' },
  { id: 'opinion', label: 'Opinión' },
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'otros', label: 'Otros' },
]

export interface HeaderDockProps {
  view?: 'muro' | 'tiempo'
  onViewChange?: (view: 'muro' | 'tiempo') => void
  dateAnchor: string | null
  onToday: () => void
  onSelectDate: (iso: string) => void
  filters: NewsFilters
  onFiltersChange: (next: NewsFilters) => void
  totalCount?: number | null
}

function formatDayLabel(iso: string): string {
  try {
    const parts = iso.split('-')
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10)
      const monthIdx = parseInt(parts[1], 10) - 1
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      return `${day} ${months[monthIdx] ?? ''}`
    }
  } catch {
    // fallback
  }
  return iso
}

export default function HeaderDock({
  view = 'muro',
  onViewChange,
  dateAnchor,
  onToday,
  onSelectDate,
  filters,
  onFiltersChange,
  totalCount,
}: HeaderDockProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [qLocal, setQLocal] = useState(filters.q ?? '')
  const [searchFocused, setSearchFocused] = useState(false)
  const [contraStats, setContraStats] = useState<ContradiccionesConteo | null>(null)
  const [themeToast, setThemeToast] = useState(false)

  const dockRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQLocal(filters.q ?? '')
  }, [filters.q])

  useEffect(() => {
    let cancelled = false
    fetchContradiccionesConteo()
      .then((stats) => {
        if (!cancelled) setContraStats(stats)
      })
      .catch((err) => console.warn('Error cargando conteo de contradicciones:', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-focus al abrir los filtros
  useEffect(() => {
    if (filtersOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [filtersOpen])

  // Cierre de popovers al hacer click fuera
  useEffect(() => {
    if (!calendarOpen && !filtersOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setCalendarOpen(false)
        setFiltersOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [calendarOpen, filtersOpen])

  const handleSearchInput = (value: string) => {
    setQLocal(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: value.trim() || undefined })
    }, 280)
  }

  const clearSearch = () => {
    setQLocal('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onFiltersChange({ ...filters, q: undefined })
  }

  const resetFilters = () => {
    setQLocal('')
    onFiltersChange({
      q: undefined,
      fuenteTipo: undefined,
      seccion: undefined,
      soloContradicciones: false,
    })
  }

  const activeFiltersCount =
    (filters.q ? 1 : 0) +
    (filters.fuenteTipo ? 1 : 0) +
    (filters.seccion ? 1 : 0)

  // Enlaces de navegación con etiquetas de texto claras e iconos funcionales
  const navLinks: NavLink[] = [
    {
      label: 'Muro 3D',
      href: '#muro',
      icon: <IconLayoutGrid className="size-4 shrink-0" strokeWidth={2.2} />,
      active: view === 'muro',
      onClick: () => {
        onViewChange?.('muro')
        setCalendarOpen(false)
        setFiltersOpen(false)
      },
    },
    {
      label: 'Línea de tiempo',
      href: '#linea-tiempo',
      icon: <IconGitBranch className="size-4 shrink-0" strokeWidth={2.2} />,
      active: view === 'tiempo',
      onClick: () => {
        onViewChange?.('tiempo')
        setCalendarOpen(false)
        setFiltersOpen(false)
      },
    },
    {
      label: 'Hoy',
      href: '#hoy',
      icon: <IconClock className="size-4 shrink-0" strokeWidth={2.2} />,
      active: dateAnchor === null && !calendarOpen,
      onClick: () => {
        onToday()
        setCalendarOpen(false)
        setFiltersOpen(false)
      },
    },
    {
      label: dateAnchor ? `Fecha: ${formatDayLabel(dateAnchor)}` : 'Calendario',
      href: '#calendario',
      icon: <IconCalendar className="size-4 shrink-0" strokeWidth={2.2} />,
      active: calendarOpen || dateAnchor !== null,
      badge: dateAnchor ? (
        <span className="size-2 rounded-full bg-amber-400" title="Fecha histórica activa" />
      ) : undefined,
      onClick: () => {
        setCalendarOpen((o) => !o)
        setFiltersOpen(false)
      },
    },
    {
      label: activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Buscar y Filtrar',
      href: '#filtros',
      icon: <IconSearch className="size-4 shrink-0" strokeWidth={2.2} />,
      active: filtersOpen || activeFiltersCount > 0,
      badge: activeFiltersCount > 0 ? (
        <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-neutral-200 text-neutral-900 text-[10.5px] font-bold leading-none">
          {activeFiltersCount}
        </span>
      ) : undefined,
      onClick: () => {
        setFiltersOpen((o) => !o)
        setCalendarOpen(false)
      },
    },
    {
      label: 'Archivo',
      href: '/archivo',
      icon: <IconArchive className="size-4 shrink-0" strokeWidth={2.2} />,
    },
  ]

  // Logo y Marca Editorial
  const brandLogo = (
    <div
      className="flex items-center gap-2.5 cursor-pointer select-none group"
      onClick={() => {
        resetFilters()
        onToday()
        setCalendarOpen(false)
        setFiltersOpen(false)
      }}
      title="Restablecer filtros y volver al inicio"
    >
      <div className="size-8 rounded-lg bg-neutral-900 border border-neutral-700/80 flex items-center justify-center shadow-sm group-hover:border-neutral-500 transition-colors">
        <span className="font-serif font-black text-lg text-white leading-none">Λ</span>
      </div>
      <div className="flex flex-col text-left">
        <span className="font-semibold text-sm text-white tracking-tight group-hover:text-neutral-200 transition-colors">
          LyAi · Prensa
        </span>
        <span className="hidden sm:inline-block text-[10px] text-neutral-400 uppercase tracking-widest font-mono">
          Observatorio de medios
        </span>
      </div>
    </div>
  )

  // Botones de acción de la cabecera (Contradicciones destacada + Tema sutil)
  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Botón destacado de Contradicciones con rayo y contador en vivo */}
      <button
        type="button"
        onClick={() => {
          onFiltersChange({
            ...filters,
            soloContradicciones: !filters.soloContradicciones,
          })
        }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
          filters.soloContradicciones
            ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.45)]'
            : 'bg-neutral-900/90 text-rose-300 border-rose-500/30 hover:bg-neutral-800 hover:border-rose-500/60 hover:text-rose-200'
        }`}
        title="Mostrar únicamente noticias con contradicciones editoriales detectadas entre medios"
      >
        <IconBolt
          className={`size-3.5 ${
            filters.soloContradicciones ? 'fill-white text-white' : 'text-amber-400 fill-amber-400/20'
          }`}
          strokeWidth={2.4}
        />
        <span>Contradicciones</span>
        {contraStats && contraStats.totalContradicciones > 0 && (
          <span
            className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold leading-none ${
              filters.soloContradicciones
                ? 'bg-white text-rose-700'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {contraStats.totalContradicciones}
          </span>
        )}
      </button>

      {/* Botón sutil de cambio de tema (sol) */}
      <button
        type="button"
        onClick={() => {
          setThemeToast(true)
          if (themeTimerRef.current) clearTimeout(themeTimerRef.current)
          themeTimerRef.current = setTimeout(() => setThemeToast(false), 2400)
        }}
        className="size-8 rounded-full border border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors cursor-pointer"
        title="Cambiar tema visual"
        aria-label="Cambiar tema visual"
      >
        <IconSun className="size-4" strokeWidth={2} />
      </button>
    </div>
  )

  // Acciones en la versión móvil del menú (Sheet lateral)
  const mobileActions = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          onFiltersChange({
            ...filters,
            soloContradicciones: !filters.soloContradicciones,
          })
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold border ${
          filters.soloContradicciones
            ? 'bg-rose-600 text-white border-rose-500'
            : 'bg-neutral-900 text-rose-300 border-rose-500/30'
        }`}
      >
        <span className="flex items-center gap-2">
          <IconBolt className="size-4 text-amber-400" />
          Solo Contradicciones
        </span>
        {contraStats && contraStats.totalContradicciones > 0 && (
          <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-xs font-bold border border-rose-500/40">
            {contraStats.totalContradicciones}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          setThemeToast(true)
          if (themeTimerRef.current) clearTimeout(themeTimerRef.current)
          themeTimerRef.current = setTimeout(() => setThemeToast(false), 2400)
        }}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-neutral-300 bg-neutral-900 border border-neutral-800"
      >
        <IconSun className="size-4" />
        Tema claro
      </button>
    </div>
  )

  return (
    <div className="header-dock-container" ref={dockRef} onClick={(e) => e.stopPropagation()}>
      {/* ── CABECERA PRINCIPAL MODERNA (Header17 de Blockus UI / lyai-shared) ── */}
      <Header17
        brandName="LyAi · Prensa"
        logo={brandLogo}
        navLinks={navLinks}
        actions={headerActions}
        mobileActions={mobileActions}
        className="bg-neutral-950/85 backdrop-blur-md border-b border-neutral-800/80 text-neutral-100"
      >
        {/* ── POPOVER: BÚSQUEDA Y FILTROS ── */}
        {filtersOpen && (
          <div className="dock-popover-panel animate-in">
            <div className="dock-panel-head">
              <div className="dock-panel-title">
                <IconAdjustmentsHorizontal size={17} strokeWidth={2.2} className="text-neutral-300" />
                <span>Búsqueda y Filtros</span>
                {typeof totalCount === 'number' && (
                  <span className="text-[11px] font-normal text-neutral-400">({totalCount} noticias)</span>
                )}
                {activeFiltersCount > 0 && (
                  <span className="dock-badge-counter">{activeFiltersCount}</span>
                )}
              </div>
              {activeFiltersCount > 0 && (
                <button type="button" className="dock-panel-reset" onClick={resetFilters}>
                  ↺ Restablecer
                </button>
              )}
            </div>

            <div className="dock-panel-body">
              {/* Buscador de texto */}
              <div className="dock-panel-row">
                <span className="dock-row-label">Buscar titular o tema</span>
                <div className="dock-search-box">
                  <IconSearch size={16} strokeWidth={2.2} className="dock-search-icon" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Ej. Elecciones, inflación, energía…"
                    value={qLocal}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') clearSearch()
                    }}
                  />
                  {qLocal && (
                    <button
                      type="button"
                      className="dock-search-clear"
                      onClick={clearSearch}
                      title="Borrar búsqueda"
                    >
                      <IconX size={14} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
                <SearchResultsDropdown query={qLocal} inputFocused={searchFocused} />
              </div>

              {/* Tipo de Fuente */}
              <div className="dock-panel-row">
                <span className="dock-row-label">Tipo de Fuente</span>
                <FluidDropdown
                  icon={<IconNews size={15} />}
                  labelPrefix="Fuente"
                  options={TIPOS}
                  value={filters.fuenteTipo ?? ''}
                  variant="mono"
                  onChange={(id) =>
                    onFiltersChange({
                      ...filters,
                      fuenteTipo: (id || undefined) as NewsFilters['fuenteTipo'],
                    })
                  }
                />
              </div>

              {/* Sección Temática */}
              <div className="dock-panel-row">
                <span className="dock-row-label">Sección Temática</span>
                <FluidDropdown
                  icon={<IconCategory size={15} />}
                  labelPrefix="Sección"
                  options={SECCIONES}
                  value={filters.seccion ?? ''}
                  variant="mono"
                  onChange={(id) =>
                    onFiltersChange({
                      ...filters,
                      seccion: (id || undefined) as NewsFilters['seccion'],
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* ── POPOVER: CALENDARIO DE FECHAS ── */}
        {calendarOpen && (
          <div className="dock-popover-calendar animate-in">
            <DateCalendar
              selected={dateAnchor}
              onSelect={(iso) => {
                onSelectDate(iso)
                setCalendarOpen(false)
              }}
              onClose={() => setCalendarOpen(false)}
            />
          </div>
        )}

        {/* ── TOAST: TEMA CLARO · PRÓXIMAMENTE ── */}
        {themeToast && (
          <div className="dock-theme-toast animate-in">
            <span className="dock-toast-dot" />
            <span>Tema claro · Próximamente</span>
          </div>
        )}
      </Header17>
    </div>
  )
}
