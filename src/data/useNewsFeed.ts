import { useCallback, useEffect, useRef, useState } from 'react'
import { generateSampleNews, type NewsItem as MockNewsItem } from './sampleNews'
import { fetchNoticias, type NewsItem } from './newsApi'

const PAGE = 60

function mockToNewsItem(m: MockNewsItem): NewsItem {
  return {
    id: m.id,
    source: m.source,
    sourceColor: m.sourceColor,
    headline: m.headline,
    summary: m.summary,
    publishedAt: m.publishedAt,
    enlace: '',
    imagenUrl: null,
    contradicciones: m.contradiction
      ? [
          {
            id: `mock-${m.id}`,
            noticiaContrariaId: '',
            fuenteContraria: m.contradiction.counterSource,
            tema: 'general',
            intensidad: 0.7,
            razonamiento: m.contradiction.note,
            claimPropio: { sujeto: m.source, predicado: 'afirma', objeto: m.headline },
            claimContrario: { sujeto: m.contradiction.counterSource, predicado: 'afirma lo contrario', objeto: '' },
          },
        ]
      : [],
  }
}

// Cargador común de las vistas DOM (bento, línea de tiempo): tandas de 60,
// fecha ancla (Hoy / calendario) y fallback a datos de ejemplo si la API falla.
export function useNewsFeed(onReady?: () => void) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [dateAnchor, setDateAnchor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)

  const offsetRef = useRef(0)
  const versionRef = useRef(0)
  const loadingRef = useRef(false)
  const readyFiredRef = useRef(false)

  const loadMore = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current && !reset) return
      if (reset) {
        versionRef.current += 1
        offsetRef.current = 0
        setExhausted(false)
      }
      const version = versionRef.current
      loadingRef.current = true
      setLoading(true)

      let batch: NewsItem[]
      let fromApi = true
      try {
        const antes = dateAnchor ? `${dateAnchor}T23:59:59.999` : undefined
        batch = await fetchNoticias(PAGE, offsetRef.current, antes)
      } catch (err) {
        console.warn('No se pudo cargar /api/noticias, usando datos de ejemplo:', err)
        batch = generateSampleNews(PAGE).map(mockToNewsItem)
        fromApi = false
      }
      if (version !== versionRef.current) return // llegó una recarga más nueva

      offsetRef.current += batch.length
      setItems((prev) => {
        if (reset) return batch
        const seen = new Set(prev.map((i) => i.id))
        return prev.concat(batch.filter((i) => !seen.has(i.id)))
      })
      if (batch.length < PAGE || !fromApi) setExhausted(true)
      loadingRef.current = false
      setLoading(false)
      if (!readyFiredRef.current) {
        readyFiredRef.current = true
        onReady?.()
      }
    },
    [dateAnchor, onReady],
  )

  // Recarga desde cero al montar y cada vez que cambia la fecha ancla.
  useEffect(() => {
    void loadMore(true)
  }, [loadMore])

  const loadNext = useCallback(() => {
    if (exhausted || loadingRef.current) return
    void loadMore(false)
  }, [exhausted, loadMore])

  const reload = useCallback(() => void loadMore(true), [loadMore])

  return { items, loading, exhausted, dateAnchor, setDateAnchor, loadNext, reload }
}
