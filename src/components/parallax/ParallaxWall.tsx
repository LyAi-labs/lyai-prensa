import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from 'motion/react'
import { generateSampleNews, type NewsItem as MockNewsItem } from '../../data/sampleNews'
import { fetchNoticias, type NewsItem } from '../../data/newsApi'
import NewsCard from './NewsCard'
import DateNav from './DateNav'
import './parallax.css'

const PAGE = 60 // múltiplo de 2, 3, 4 y 5 columnas → reparto parejo
const UNFURL_PX = 560 // scroll necesario para "desplegar" la rejilla por completo
const STAGGER = [0, 84, -28, 110, 32] // desnivel inicial por columna (rejilla plegada)
const LAG = [0.010, -0.016, 0.022, -0.012, 0.018] // desfase por px/s de velocidad de scroll
const LAG_MAX = 90

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

function columnCountFor(width: number): number {
  if (width >= 1500) return 5
  if (width >= 1000) return 4
  if (width >= 640) return 3
  return 2
}

function useColumnCount(): number {
  const [n, setN] = useState(() => columnCountFor(window.innerWidth))
  useEffect(() => {
    const onResize = () => setN(columnCountFor(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return n
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function Column({
  idx,
  progress,
  velocity,
  amp,
  children,
}: {
  idx: number
  progress: MotionValue<number>
  velocity: MotionValue<number>
  amp: number
  children: React.ReactNode
}) {
  const stagger = STAGGER[idx % STAGGER.length]
  const lagK = LAG[idx % LAG.length]
  const y = useTransform([progress, velocity], ([p, v]: number[]) => {
    const furled = (1 - p) * stagger
    const lag = Math.max(-LAG_MAX, Math.min(LAG_MAX, v * lagK))
    return (furled + lag) * amp
  })
  return (
    <motion.div className="pw-col" style={{ y }}>
      {children}
    </motion.div>
  )
}

export default function ParallaxWall({ onReady }: { onReady?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const cols = useColumnCount()
  const reduced = useMemo(prefersReducedMotion, [])
  // amp escala toda la inclinación 3D y el parallax: en móvil (2 columnas) se
  // atenúa para no comerse el ancho útil; con "reducir movimiento" se anula.
  const amp = reduced ? 0 : cols <= 2 ? 0.2 : 1

  const [items, setItems] = useState<NewsItem[]>([])
  const [dateAnchor, setDateAnchor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)
  const [flippedId, setFlippedId] = useState<string | null>(null)

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
    scrollRef.current?.scrollTo({ top: 0 })
    setFlippedId(null)
    void loadMore(true)
  }, [loadMore])

  // Carga infinita: pide la siguiente tanda cuando quedan ~2 pantallas.
  const maybeLoadMore = useCallback(() => {
    const el = scrollRef.current
    if (!el || exhausted || loadingRef.current) return
    if (el.scrollTop + el.clientHeight * 2.2 >= el.scrollHeight) void loadMore(false)
  }, [exhausted, loadMore])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', maybeLoadMore, { passive: true })
    const raf = requestAnimationFrame(maybeLoadMore) // por si la primera tanda no llena la pantalla
    return () => {
      el.removeEventListener('scroll', maybeLoadMore)
      cancelAnimationFrame(raf)
    }
  }, [maybeLoadMore, items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlippedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Movimiento ──────────────────────────────────────────────────────────
  const { scrollY } = useScroll({ container: scrollRef })
  const unfurl = useTransform(scrollY, [0, UNFURL_PX], [0, 1], { clamp: true })
  const progress = useSpring(unfurl, { stiffness: 110, damping: 26, mass: 0.6 })
  const velocity = useSpring(useVelocity(scrollY), { stiffness: 90, damping: 30 })

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const mx = useSpring(mouseX, { stiffness: 60, damping: 20 })
  const my = useSpring(mouseY, { stiffness: 60, damping: 20 })

  const rotateY = useTransform([progress, mx], ([p, m]: number[]) => (-24 * (1 - p) + m * 1.6) * amp)
  const rotateX = useTransform([progress, my], ([p, m]: number[]) => (14 * (1 - p) - m * 1.2) * amp)
  const rotateZ = useTransform(progress, [0, 1], [-4 * amp, 0])
  const scale = useTransform(progress, [0, 1], [1 - 0.16 * amp, 1])
  const vignette = useTransform(progress, [0, 1], [Math.min(1, amp), 0])
  // El plano mide decenas de miles de px (carga infinita): si el origen del
  // giro fuera un % de su alto, quedaría a miles de px del viewport y cualquier
  // inclinación deformaría la rejilla. Se ancla a la línea visible.
  const originY = useTransform(scrollY, (y) => `${Math.round(y + window.innerHeight * 0.42)}px`)

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || amp === 0) return
    mouseX.set((e.clientX / window.innerWidth - 0.5) * 2)
    mouseY.set((e.clientY / window.innerHeight - 0.5) * 2)
  }

  // ── Datos → columnas ────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const arr: NewsItem[][] = Array.from({ length: cols }, () => [])
    items.forEach((it, i) => arr[i % cols].push(it))
    return arr
  }, [items, cols])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const toggle = useCallback((id: string) => setFlippedId((cur) => (cur === id ? null : id)), [])

  const goToday = () => {
    if (dateAnchor !== null) {
      setDateAnchor(null)
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      void loadMore(true)
    }
  }

  return (
    <div className="pw-root">
      <div
        ref={scrollRef}
        className="pw-scroll"
        onPointerMove={onPointerMove}
        onClick={() => setFlippedId(null)}
      >
        <div className="pw-stage">
          <motion.div
            className="pw-plane"
            style={{ rotateX, rotateY, rotateZ, scale, originX: 0.5, originY, transformPerspective: 1500 }}
          >
            <motion.div
              key={dateAnchor ?? 'hoy'}
              className="pw-cols"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45 }}
            >
              {columns.map((colItems, ci) => (
                <Column key={ci} idx={ci} progress={progress} velocity={velocity} amp={amp}>
                  {colItems.map((item) => {
                    const contra = item.contradicciones[0]
                    return (
                      <NewsCard
                        key={item.id}
                        item={item}
                        flipped={flippedId === item.id}
                        onToggle={toggle}
                        contrarioEnlace={contra ? byId.get(contra.noticiaContrariaId)?.enlace : undefined}
                      />
                    )
                  })}
                </Column>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {!loading && items.length === 0 && (
          <div className="pw-empty">No hay noticias {dateAnchor ? `hasta el ${dateAnchor}` : 'todavía'}.</div>
        )}
        {exhausted && items.length > 0 && <div className="pw-end">— fin de las noticias —</div>}
      </div>

      <motion.div className="pw-vignette" style={{ opacity: vignette }} aria-hidden="true" />
      <div className="pw-top-fade" aria-hidden="true" />

      <header className="pw-header">
        <h2 className="pw-title">LyAi · Prensa</h2>
        <p className="pw-subtitle">Lo que cuentan los medios españoles — y cuándo no coinciden</p>
      </header>

      <DateNav dateAnchor={dateAnchor} onToday={goToday} onSelect={setDateAnchor} />

      <div className="pw-legend" aria-live="polite">
        <span className={`pw-legend-dot${loading ? ' is-loading' : ''}`} />
        {loading && items.length === 0
          ? 'Cargando noticias…'
          : `${items.length} noticias${dateAnchor ? ` hasta el ${dateAnchor}` : ''}${loading ? ' · cargando más…' : ''}`}
      </div>
    </div>
  )
}
