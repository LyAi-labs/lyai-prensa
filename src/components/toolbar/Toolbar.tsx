import { useEffect, useRef, useState } from 'react'
import {
  type NewsFilters,
  fetchContradiccionesConteo,
  type ContradiccionesConteo,
} from '../../data/newsApi'
import FluidDropdown, { type DropdownOption } from './FluidDropdown'
import BorderBeam from '../ui/BorderBeam'
import './toolbar.css'

const TIPOS: DropdownOption[] = [
  { id: '', label: 'Todas', dot: '#8A93A0' },
  { id: 'nacional', label: 'Nacional', dot: '#00e5ff' },
  { id: 'regional', label: 'Regional', dot: '#34d399' },
  { id: 'tv', label: 'TV', dot: '#f59e0b' },
  { id: 'radio', label: 'Radio', dot: '#a78bfa' },
]

const SECCIONES: DropdownOption[] = [
  { id: '', label: 'Todas' },
  { id: 'economia', label: 'Economía' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'politica', label: 'Política' },
  { id: 'internacional', label: 'Internacional' },
  { id: 'sociedad', label: 'Sociedad' },
  { id: 'cultura', label: 'Cultura' },
  { id: 'opinion', label: 'Opinión' },
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'otros', label: 'Otros' },
]

const SEARCH_DEBOUNCE_MS = 300

export default function Toolbar({
  filters,
  onChange,
  count,
  total,
}: {
  filters: NewsFilters
  onChange: (next: NewsFilters) => void
  count: number | null
  total: number | null
}) {
  const [qLocal, setQLocal] = useState(filters.q ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [contraStats, setContraStats] = useState<ContradiccionesConteo | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQLocal(filters.q ?? '')
  }, [filters.q])

  // Cargar conteo global de contradicciones
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

  // Cierre al hacer clic fuera del dropdown
  useEffect(() => {
    if (!filtersOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFiltersOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [filtersOpen])

  const handleSearchInput = (value: string) => {
    setQLocal(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, q: value.trim() || undefined })
    }, SEARCH_DEBOUNCE_MS)
  }

  const clearSearch = () => {
    setQLocal('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onChange({ ...filters, q: undefined })
  }

  const resetFilters = () => {
    onChange({
      ...filters,
      fuenteTipo: undefined,
      seccion: undefined,
      soloContradicciones: false,
    })
  }

  const activeFiltersCount =
    (filters.fuenteTipo ? 1 : 0) +
    (filters.seccion ? 1 : 0) +
    (filters.soloContradicciones ? 1 : 0)

  return (
    <div className="toolbar-root" ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <div className="toolbar">
        {/* Campo de búsqueda principal */}
        <BorderBeam size="sm" borderRadius={999} colorVariant="colorful" className="tb-beam-item tb-search-beam">
          <div className={`tb-search${qLocal ? ' has-val' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por palabra clave…"
              value={qLocal}
              onChange={(e) => handleSearchInput(e.target.value)}
            />
            {qLocal && <span className="clear" onClick={clearSearch}>✕</span>}
          </div>
        </BorderBeam>

        {/* Botón trigger para desplegar los filtros (inicialmente ocultos) */}
        <BorderBeam
          size="sm"
          borderRadius={999}
          colorVariant={filters.soloContradicciones ? 'sunset' : activeFiltersCount > 0 ? 'ice' : 'ocean'}
          className="tb-beam-item"
        >
          <button
            type="button"
            className={`tb-filter-trigger${filtersOpen ? ' is-open' : ''}${activeFiltersCount > 0 ? ' has-active' : ''}${filters.soloContradicciones ? ' is-contra-active' : ''}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            title="Filtros de búsqueda"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tb-filter-ico" aria-hidden="true">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
            </svg>
            <span className="tb-filter-trigger-text">Filtros</span>
            {activeFiltersCount > 0 && (
              <span className={`tb-filter-badge${filters.soloContradicciones ? ' is-contra' : ''}`}>
                {activeFiltersCount}
              </span>
            )}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`tb-filter-chev${filtersOpen ? ' is-open' : ''}`} aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </BorderBeam>

        {total !== null && (
          <span className="tb-count">{count !== null ? <><b>{count}</b> de {total}</> : '…'} noticias</span>
        )}
      </div>

      {/* Dropdown panel con los filtros (inicialmente oculto) */}
      {filtersOpen && (
        <div className="tb-dropdown-panel animate-in">
          <div className="tb-dropdown-header">
            <div className="tb-dropdown-title-group">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="tb-panel-ico" aria-hidden="true">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span className="tb-dropdown-title">Filtros de búsqueda</span>
            </div>
            {activeFiltersCount > 0 && (
              <button type="button" className="tb-reset-btn" onClick={resetFilters}>
                ↺ Restablecer
              </button>
            )}
          </div>

          <div className="tb-dropdown-body">
            {/* Filtro por tipo de fuente */}
            <div className="tb-dropdown-item">
              <span className="tb-dropdown-label">Fuente</span>
              <FluidDropdown
                labelPrefix="Fuente"
                options={TIPOS}
                value={filters.fuenteTipo ?? ''}
                variant="ocean"
                onChange={(id) => onChange({ ...filters, fuenteTipo: (id || undefined) as NewsFilters['fuenteTipo'] })}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                }
              />
            </div>

            {/* Filtro por sección */}
            <div className="tb-dropdown-item">
              <span className="tb-dropdown-label">Sección</span>
              <FluidDropdown
                labelPrefix="Sección"
                options={SECCIONES}
                value={filters.seccion ?? ''}
                variant="ice"
                onChange={(id) => onChange({ ...filters, seccion: (id || undefined) as NewsFilters['seccion'] })}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                }
              />
            </div>

            <div className="tb-dropdown-divider" />

            {/* Opción de Solo Contradicciones con el contador */}
            <div
              className={`tb-contra-card${filters.soloContradicciones ? ' is-active' : ''}`}
              onClick={() => onChange({ ...filters, soloContradicciones: !filters.soloContradicciones })}
              role="button"
              tabIndex={0}
            >
              <div className="tb-contra-card-main">
                <div className="tb-contra-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
                  </svg>
                </div>
                <div className="tb-contra-texts">
                  <div className="tb-contra-title-row">
                    <span className="tb-contra-name">Solo contradicciones</span>
                    {contraStats && (
                      <span className="tb-contra-badge-count" title={`${contraStats.totalNoticias} noticias con contradicciones registradas`}>
                        {contraStats.totalNoticias}
                      </span>
                    )}
                  </div>
                  <span className="tb-contra-desc">
                    {contraStats
                      ? `${contraStats.totalNoticias} noticias (${contraStats.totalContradicciones} contradicciones)`
                      : 'Ver discrepancias detectadas'}
                  </span>
                </div>
              </div>

              <span className={`tb-pill-indicator${filters.soloContradicciones ? ' is-on' : ''}`}>
                <span className="tb-pill-indicator-thumb" />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

