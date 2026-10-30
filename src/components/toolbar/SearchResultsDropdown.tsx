import { useEffect, useRef, useState } from 'react'
import { CommandDropdown, type DropdownItem } from '../../shared/components/command-palette'
import { fetchNoticias, type NewsItem } from '../../data/newsApi'

const MIN_QUERY_LENGTH = 2
const RESULTS_LIMIT = 6
const DEBOUNCE_MS = 250

/**
 * Dropdown de resultados en vivo anclado al buscador del dock, adaptado de
 * `lyai-shared/components/command-palette` (CommandDropdown): aquí los
 * resultados vienen de `/api/archivo` vía fetchNoticias, no de una lista
 * estática filtrada en memoria. Abre el artículo original al seleccionar,
 * igual que hacen las cards del muro (NewsCard.tsx).
 */
export default function SearchResultsDropdown({ query, inputFocused }: { query: string; inputFocused: boolean }) {
  const [results, setResults] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setTotal(null)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current
      fetchNoticias(RESULTS_LIMIT, 0, undefined, { q: trimmed })
        .then((items) => {
          if (requestId !== requestIdRef.current) return
          setResults(items)
          setTotal(items.length)
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return
          setResults([])
          setTotal(null)
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const open = inputFocused && query.trim().length >= MIN_QUERY_LENGTH

  const items: DropdownItem[] = results.map((n) => {
    const tieneContradicciones = n.contradicciones.length > 0
    return {
      id: n.id,
      label: n.headline,
      group: n.source,
      tone: tieneContradicciones ? 'warning' : 'default',
      badge: tieneContradicciones ? (
        <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
          contradice
        </span>
      ) : undefined,
      onSelect: () => {
        if (n.enlace) window.open(n.enlace, '_blank', 'noreferrer')
      },
    }
  })

  return (
    <div className="relative">
      <CommandDropdown
        items={items}
        open={open}
        onOpenChange={() => {}}
        query={query}
        loading={loading}
        emptyMessage="Sin resultados para esa búsqueda."
        footer={
          total !== null && total > 0 ? (
            <>
              <span>↑↓ navegar · ↵ abrir</span>
              <span>{total === RESULTS_LIMIT ? `${total}+ resultados` : `${total} resultado${total === 1 ? '' : 's'}`}</span>
            </>
          ) : undefined
        }
        className="absolute left-0 right-0 top-2 z-20"
      />
    </div>
  )
}
