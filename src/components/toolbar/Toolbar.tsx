import { useEffect, useRef, useState } from 'react'
import type { NewsFilters } from '../../data/newsApi'
import FluidDropdown, { type DropdownOption } from './FluidDropdown'
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
  // El texto se mantiene localmente y se debounce antes de disparar el
  // refetch — si no, cada tecla relanzaría /api/noticias.
  const [qLocal, setQLocal] = useState(filters.q ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQLocal(filters.q ?? '')
  }, [filters.q])

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

  return (
    <div className="toolbar" onClick={(e) => e.stopPropagation()}>
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

      <FluidDropdown
        labelPrefix="Fuente"
        options={TIPOS}
        value={filters.fuenteTipo ?? ''}
        onChange={(id) => onChange({ ...filters, fuenteTipo: (id || undefined) as NewsFilters['fuenteTipo'] })}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
        }
      />

      <FluidDropdown
        labelPrefix="Sección"
        options={SECCIONES}
        value={filters.seccion ?? ''}
        onChange={(id) => onChange({ ...filters, seccion: (id || undefined) as NewsFilters['seccion'] })}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
        }
      />

      <button
        type="button"
        className={`tb-toggle${filters.soloContradicciones ? ' is-on' : ''}`}
        onClick={() => onChange({ ...filters, soloContradicciones: !filters.soloContradicciones })}
        aria-pressed={!!filters.soloContradicciones}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
        </svg>
        Solo contradicciones
      </button>

      {total !== null && (
        <span className="tb-count">{count !== null ? <><b>{count}</b> de {total}</> : '…'} noticias</span>
      )}
    </div>
  )
}
