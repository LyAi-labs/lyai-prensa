import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { useNewsFeed } from '../../data/useNewsFeed'
import CardOverlay, { type OverlayState } from '../card/CardOverlay'
import { contraColor, fechaCorta, hexToRgb, iniciales } from '../card/cardUtils'
import DateNav from '../views/DateNav'
import { buildStoryNodes, type StoryNode } from '../views/stories'
import '../views/views.css'
import './bento.css'

type Span = 'big' | 'tall' | 'wide' | 'sm'

// Muro bento horizontal (referencia: «bento-gallery» de 21st.dev): teselas de
// distinto tamaño en 2 filas que se arrastran para explorar; el tamaño dice la
// importancia (contradicción > historia en varios medios > foto > resto) y el
// click expande la noticia con su detalle.
function spanFor(n: StoryNode, st: { photos: number; clusters: number }): Span {
  if (n.item.contradicciones.length > 0) return 'big'
  if (n.group.length > 1) return st.clusters++ === 0 ? 'big' : 'tall'
  if (n.item.imagenUrl) {
    const k = st.photos++ % 3
    return k === 0 ? 'wide' : k === 1 ? 'tall' : 'big'
  }
  return 'sm'
}

export default function BentoWall({ onReady }: { onReady?: () => void }) {
  const { items, loading, exhausted, dateAnchor, setDateAnchor, loadNext, reload } = useNewsFeed(onReady)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)

  const nodes = useMemo(() => buildStoryNodes(items), [items])
  const spans = useMemo(() => {
    const st = { photos: 0, clusters: 0 }
    return nodes.map((n) => spanFor(n, st))
  }, [nodes])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  // ── Arrastre con inercia (ratón); el dedo usa el scroll nativo ──────────
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false, lastX: 0, lastT: 0, v: 0, raf: 0 })

  const stopInertia = () => cancelAnimationFrame(drag.current.raf)

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    stopInertia()
    const d = drag.current
    d.down = true
    d.moved = false
    d.startX = e.clientX
    d.startLeft = el.scrollLeft
    d.lastX = e.clientX
    d.lastT = performance.now()
    d.v = 0

    const onMove = (ev: PointerEvent) => {
      if (!d.down) return
      const dx = ev.clientX - d.startX
      if (!d.moved && Math.abs(dx) > 5) {
        d.moved = true
        el.classList.add('is-dragging')
      }
      if (!d.moved) return
      el.scrollLeft = d.startLeft - dx
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT)
      d.v = (-(ev.clientX - d.lastX) / dt) * 16
      d.lastX = ev.clientX
      d.lastT = now
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      d.down = false
      el.classList.remove('is-dragging')
      if (!d.moved) return
      const step = () => {
        el.scrollLeft += d.v
        d.v *= 0.94
        if (Math.abs(d.v) > 0.3) d.raf = requestAnimationFrame(step)
      }
      d.raf = requestAnimationFrame(step)
      window.setTimeout(() => (d.moved = false), 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // El click que sigue a un arrastre no abre la tesela.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.stopPropagation()
      e.preventDefault()
      drag.current.moved = false
    }
  }

  // Rueda → desplazamiento horizontal.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      e.preventDefault()
      stopInertia()
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const maybeLoad = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollLeft + el.clientWidth * 2 >= el.scrollWidth) loadNext()
  }, [loadNext])

  useEffect(() => {
    const raf = requestAnimationFrame(maybeLoad)
    return () => cancelAnimationFrame(raf)
  }, [maybeLoad, items.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0 })
    setOverlay(null)
  }, [dateAnchor])

  const onHover = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    const t = (e.target as HTMLElement).closest<HTMLElement>('.bw-t')
    if (!t) return
    const r = t.getBoundingClientRect()
    t.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
    t.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
  }

  const open = (n: StoryNode, e: MouseEvent) => {
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
  }

  const closeOverlay = useCallback(() => setOverlay(null), [])
  const toggleFlip = useCallback(() => setOverlay((o) => (o ? { ...o, flipped: !o.flipped } : o)), [])

  return (
    <div className="vw-root">
      <div
        ref={scrollRef}
        className="bw-scroll"
        onPointerDown={onPointerDown}
        onPointerMove={onHover}
        onClickCapture={onClickCapture}
        onScroll={maybeLoad}
      >
        <div className="bw-grid">
          {nodes.map((n, i) => {
            const { item, group } = n
            const span = spans[i]
            const contra = item.contradicciones[0]
            const isStory = group.length > 1
            const photo = group.find((g) => g.imagenUrl)?.imagenUrl ?? item.imagenUrl
            const color = contra ? contraColor(contra.intensidad) : isStory ? '#00e5ff' : item.sourceColor
            const { dia, hora } = fechaCorta(item.publishedAt)
            const style = {
              ['--c' as string]: item.sourceColor,
              ['--acc' as string]: color,
              ['--rgb' as string]: hexToRgb(color),
            }
            return (
              <article
                key={item.id}
                className={`bw-t s-${span}${contra ? ' is-contra' : ''}${isStory ? ' is-story' : ''}${photo ? ' has-photo' : ' no-photo'}`}
                style={style}
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
                  <div className="bw-media">
                    <img src={photo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />
                  </div>
                ) : (
                  <div className="bw-media bw-grad">
                    <span className="bw-mark" aria-hidden="true">{iniciales(item.source)}</span>
                  </div>
                )}
                <div className="bw-shade" />

                <div className="bw-top">
                  {contra ? (
                    <span className="bw-chip bw-chip-red">⚠ Contradicción · {contra.intensidad.toFixed(1)}</span>
                  ) : isStory ? (
                    <span className="bw-chip bw-chip-cy">× {group.length} medios</span>
                  ) : (
                    <span className="bw-chip">
                      <i />
                      {item.source}
                    </span>
                  )}
                  <span className="bw-time">{hora}</span>
                </div>

                <div className="bw-bottom">
                  <h3 className="bw-ttl">{item.headline}</h3>
                  {contra && (
                    <p className="bw-vs">
                      vs <b>{contra.fuenteContraria}</b>: «{contra.claimContrario.sujeto} {contra.claimContrario.predicado} {contra.claimContrario.objeto}»
                    </p>
                  )}
                  {isStory && !contra && (
                    <div className="bw-stack">
                      {group.slice(0, 6).map((g) => (
                        <span key={g.id} className="bw-av" style={{ ['--c' as string]: g.sourceColor }} title={g.source}>
                          {iniciales(g.source)}
                        </span>
                      ))}
                      {group.length > 6 && <em>+{group.length - 6}</em>}
                    </div>
                  )}
                  {item.summary && <p className="bw-sum">{item.summary}</p>}
                  <span className="bw-foot">
                    {item.source} · {dia}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
        {!loading && nodes.length === 0 && (
          <div className="bw-empty">No hay noticias {dateAnchor ? `hasta el ${dateAnchor}` : 'todavía'}.</div>
        )}
        {exhausted && nodes.length > 0 && <div className="bw-end">fin</div>}
      </div>

      <div className="bw-fade bw-fade-l" aria-hidden="true" />
      <div className="bw-fade bw-fade-r" aria-hidden="true" />
      <div className="vw-top-fade" aria-hidden="true" />
      <header className="vw-header">
        <h2 className="vw-title">LyAi · Prensa</h2>
        <p className="vw-subtitle">Arrastra para explorar · click para abrir</p>
      </header>
      <DateNav
        dateAnchor={dateAnchor}
        onToday={() => {
          if (dateAnchor !== null) setDateAnchor(null)
          else {
            scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
            reload()
          }
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
