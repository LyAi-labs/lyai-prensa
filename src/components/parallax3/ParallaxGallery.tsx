import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'framer-motion'
import { useNewsFeed } from '../../data/useNewsFeed'
import CardOverlay, { type OverlayState } from '../card/CardOverlay'
import { contraColor, iniciales } from '../card/cardUtils'
import DateNav from '../views/DateNav'
import { buildStoryNodes, type StoryNode } from '../views/stories'
import '../views/views.css'
import './parallax.css'

const COLS = 4

// Muro v3 — adaptación del original archivado en
// Componentes/lyai-components/components/marketing/3d-parallax-unfurling-gallery/
// (código + prompt de 21st.dev sin editar). Mismo mecanismo de scroll
// (useScroll/useTransform/useSpring: el banner se expande 0→15%, la rejilla
// en perspectiva se endereza y hace parallax por columna 15→100%); las 4
// columnas se rellenan con historias reales (useNewsFeed) en vez de
// UNSPLASH_IMAGES. Mockup previo: dev-xplain 2026-10-02-2315.
//
// A diferencia de Muro (WebGL) y Bento (v2) —ambos "cámara libre, arrastra
// para explorar"— esta vista es scroll narrativo acotado a la tanda cargada,
// no feed infinito: se parece más a una portada editorial que a un muro de
// vigilancia. Ver nota en el selector de vistas: nunca es la opción por
// defecto.
export default function ParallaxGallery({ onReady }: { onReady?: () => void }) {
  const { items, loading, exhausted, dateAnchor, setDateAnchor, loadNext, reload } = useNewsFeed(onReady)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)

  const nodes = useMemo(() => buildStoryNodes(items), [items])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const columns = useMemo(() => {
    const cols: StoryNode[][] = Array.from({ length: COLS }, () => [])
    nodes.forEach((n, i) => cols[i % COLS].push(n))
    return cols
  }, [nodes])

  const rows = Math.max(1, Math.ceil(nodes.length / COLS))
  const trackVh = Math.min(900, Math.max(320, rows * 95))

  const scrollWrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    container: scrollWrapperRef,
    offset: ['start start', 'end end'],
  })
  const smooth = useSpring(scrollYProgress, { stiffness: 100, damping: 22, mass: 0.5 })

  // Fase 1 (0 → 0.15): el banner se expande de ventana a pantalla completa.
  const bannerWidth = useTransform(smooth, [0, 0.15], ['90vw', '100vw'])
  const bannerHeight = useTransform(smooth, [0, 0.15], ['84vh', '100vh'])
  const bannerRadius = useTransform(smooth, [0, 0.15], ['28px', '0px'])

  // Fase 2 (0.15 → 1): la rejilla en perspectiva se endereza + parallax por columna.
  const rotateX = useTransform(smooth, [0.15, 1], [20, 3])
  const rotateY = useTransform(smooth, [0.15, 1], [-38, -6])
  const rotateZ = useTransform(smooth, [0.15, 1], [12, 1])
  const translateZ = useTransform(smooth, [0.15, 1], [-650, 0])

  // 4 columnas, cada una a su propia velocidad vertical (igual que el original).
  const yCol0 = useTransform(smooth, [0.15, 1], ['0%', '-32%'])
  const yCol1 = useTransform(smooth, [0.15, 1], ['-30%', '8%'])
  const yCol2 = useTransform(smooth, [0.15, 1], ['0%', '-32%'])
  const yCol3 = useTransform(smooth, [0.15, 1], ['-24%', '16%'])
  const yCols = [yCol0, yCol1, yCol2, yCol3]

  const handleScroll = useCallback(() => {
    const el = scrollWrapperRef.current
    if (!el || loading || exhausted) return
    if (el.scrollTop + el.clientHeight > el.scrollHeight - el.clientHeight * 0.6) loadNext()
  }, [loading, exhausted, loadNext])

  const open = useCallback(
    (n: StoryNode, e: MouseEvent) => {
      const contra = n.item.contradicciones[0]
      setOverlay({
        item: n.item,
        cx: e.clientX,
        cy: e.clientY,
        flipped: true,
        sticky: false,
        storyCount: n.group.length,
        related: n.group,
        contrarioEnlace: contra ? byId.get(contra.noticiaContrariaId)?.enlace : undefined,
      })
    },
    [byId],
  )
  const closeOverlay = useCallback(() => setOverlay(null), [])
  const toggleFlip = useCallback(() => setOverlay((o) => (o ? { ...o, flipped: !o.flipped } : o)), [])

  return (
    <div className="vw-root">
      <div className="pg-stage" ref={scrollWrapperRef} onScroll={handleScroll}>
        <div className="pg-track" ref={containerRef} style={{ height: `${trackVh}vh` }}>
          <div className="pg-sticky">
            <motion.div className="pg-banner" style={{ width: bannerWidth, height: bannerHeight, borderRadius: bannerRadius }}>
              <div className="pg-perspective">
                <div className="pg-mask" />
                <motion.div className="pg-grid" style={{ rotateX, rotateY, rotateZ, z: translateZ, transformStyle: 'preserve-3d' }}>
                  {columns.map((col, ci) => (
                    <motion.div key={ci} className="pg-col" style={{ y: yCols[ci] }}>
                      {col.map((n) => {
                        const { item, group } = n
                        const contra = item.contradicciones[0]
                        const isStory = group.length > 1
                        const photo = group.find((g) => g.imagenUrl)?.imagenUrl ?? item.imagenUrl
                        const accent = contra ? contraColor(contra.intensidad) : isStory ? '#00e5ff' : item.sourceColor
                        return (
                          <div
                            key={item.id}
                            className={`pg-card${contra ? ' is-contra' : ''}`}
                            style={{ ['--acc' as string]: accent }}
                            onClick={(e) => open(n, e)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setOverlay({
                                  item,
                                  cx: window.innerWidth / 2,
                                  cy: window.innerHeight / 2,
                                  flipped: true,
                                  sticky: false,
                                  storyCount: group.length,
                                  related: group,
                                })
                              }
                            }}
                            aria-label={`${item.source}: ${item.headline}`}
                          >
                            {photo ? (
                              <img src={photo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />
                            ) : (
                              <div className="pg-grad">
                                <span>{iniciales(item.source)}</span>
                              </div>
                            )}
                            <div className="pg-shade" />
                            <span className="pg-pill" style={{ background: accent }}>
                              {contra ? '⚠ contradicción' : isStory ? `× ${group.length} medios` : item.source}
                            </span>
                            <h3 className="pg-ttl">{item.headline}</h3>
                          </div>
                        )
                      })}
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="vw-top-fade" aria-hidden="true" />
      <header className="vw-header">
        <h2 className="vw-title">LyAi · Prensa</h2>
        <p className="vw-subtitle">Parallax 3D — desplázate para revelar los titulares</p>
      </header>
      <DateNav
        dateAnchor={dateAnchor}
        onToday={() => {
          if (dateAnchor !== null) setDateAnchor(null)
          else reload()
        }}
        onSelect={setDateAnchor}
      />
      <div className="vw-legend" aria-live="polite">
        <span className={`vw-dot${loading ? ' is-loading' : ''}`} />
        {loading && items.length === 0
          ? 'Cargando noticias…'
          : `${nodes.length} historias · ${items.length} noticias${dateAnchor ? ` hasta el ${dateAnchor}` : ''}${loading ? ' · cargando más…' : ''}`}
      </div>

      {overlay && <CardOverlay state={overlay} onToggle={toggleFlip} onClose={closeOverlay} />}
    </div>
  )
}
