import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useNewsFeed } from '../../data/useNewsFeed'
import CardOverlay, { type OverlayState } from '../card/CardOverlay'
import { contraColor, fechaCorta, hexToRgb, iniciales } from '../card/cardUtils'
import DateNav from './DateNav'
import { buildStoryNodes, type StoryNode } from './stories'
import './views.css'
import './timeline.css'

type Node = StoryNode

// Línea de tiempo (dev-xplain 2026-10-02-2012, opción C): una columna central
// con la hora y las noticias a los lados, agrupadas por historia; las
// contradicciones se enfrentan lado a lado y los saltos de día se marcan.
export default function TimelineView({ onReady }: { onReady?: () => void }) {
  const { items, loading, exhausted, dateAnchor, setDateAnchor, loadNext, reload } = useNewsFeed(onReady)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)

  const nodes = useMemo<Node[]>(() => buildStoryNodes(items), [items])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setOverlay(null)
  }, [dateAnchor])

  const maybeLoad = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight * 2 >= el.scrollHeight) loadNext()
  }, [loadNext])

  useEffect(() => {
    const raf = requestAnimationFrame(maybeLoad)
    return () => cancelAnimationFrame(raf)
  }, [maybeLoad, items.length])

  // Spotlight que sigue al cursor (custom properties, sin re-render).
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tl-t')
    if (!t) return
    const r = t.getBoundingClientRect()
    t.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
    t.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
  }

  const open = (n: Node, e: React.MouseEvent) => {
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

  let side = 0
  let lastDay = ''

  return (
    <div className="vw-root">
      <div ref={scrollRef} className="tl-scroll" onScroll={maybeLoad} onPointerMove={onPointerMove}>
        <div className="tl">
          {nodes.map((n) => {
            const { item, group } = n
            const contra = item.contradicciones[0]
            const { dia, hora } = fechaCorta(item.publishedAt)
            const sep = n.day !== lastDay
            lastDay = n.day
            const color = contra ? contraColor(contra.intensidad) : group.length > 1 ? '#00e5ff' : item.sourceColor
            const style = { ['--c' as string]: color, ['--rgb' as string]: hexToRgb(color) }

            let body
            if (contra) {
              const other = contra.claimContrario
              body = (
                <div className="tl-t tl-contra" style={style} onClick={(e) => open(n, e)} role="button" tabIndex={0}>
                  <i className="tl-bar" />
                  <div className="tl-row">
                    <span className="tl-chip tl-chip-red">⚠ Contradicción · {contra.tema}</span>
                    <span className="tl-meta">intensidad {contra.intensidad.toFixed(1)}</span>
                    <span className="tl-meta tl-right">{dia} · {hora}</span>
                  </div>
                  <div className="tl-vs">
                    <div className="tl-cl">
                      <b>{item.source.toUpperCase()} dice</b>«{item.headline}»
                    </div>
                    <div className="tl-cl">
                      <b>{contra.fuenteContraria.toUpperCase()} dice</b>«{other.sujeto} {other.predicado} {other.objeto}»
                    </div>
                  </div>
                  <div className="tl-meter"><i style={{ width: `${Math.min(100, contra.intensidad * 100)}%` }} /></div>
                  {contra.razonamiento && <p className="tl-sum">{contra.razonamiento}</p>}
                </div>
              )
              side = 0
              return (
                <div key={item.id}>
                  {sep && <div className="tl-sep"><span>— {dia} —</span></div>}
                  <div className="tl-nd tl-full">{body}</div>
                </div>
              )
            }

            const isStory = group.length > 1
            body = (
              <div className={`tl-t${isStory ? ' tl-story' : ''}`} style={style} onClick={(e) => open(n, e)} role="button" tabIndex={0}>
                <i className="tl-bar" />
                {isStory ? (
                  <span className="tl-chip tl-chip-cy">× {group.length} medios cuentan esto</span>
                ) : (
                  <div className="tl-row">
                    <span className="tl-src">{item.source}</span>
                    {item.imagenUrl && <span className="tl-meta">· foto</span>}
                  </div>
                )}
                <h3 className="tl-ttl">{item.headline}</h3>
                {isStory && (
                  <div className="tl-row">
                    <div className="tl-stack">
                      {group.slice(0, 7).map((g) => (
                        <span key={g.id} className="tl-av" style={{ ['--c' as string]: g.sourceColor }} title={g.source}>
                          {iniciales(g.source)}
                        </span>
                      ))}
                    </div>
                    <span className="tl-meta">{group.slice(0, 3).map((g) => g.source).join(' · ')}…</span>
                  </div>
                )}
              </div>
            )
            const cls = side++ % 2 === 0 ? 'tl-l' : 'tl-r'
            return (
              <div key={item.id}>
                {sep && <div className="tl-sep"><span>— {dia} —</span></div>}
                <div className={`tl-nd ${cls}`} style={{ ['--c' as string]: color }}>
                  <div className="tl-side">{body}</div>
                  <span className="tl-dot" />
                  <span className="tl-time">
                    {hora}
                    <small>{dia}</small>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {!loading && nodes.length === 0 && (
          <div className="tl-empty">No hay noticias {dateAnchor ? `hasta el ${dateAnchor}` : 'todavía'}.</div>
        )}
        {exhausted && nodes.length > 0 && <div className="tl-end">— fin de las noticias —</div>}
      </div>

      <div className="vw-top-fade" aria-hidden="true" />
      <header className="vw-header">
        <h2 className="vw-title">LyAi · Prensa</h2>
        <p className="vw-subtitle">Línea de tiempo — quién cuenta qué, y cuándo</p>
      </header>
      <DateNav
        dateAnchor={dateAnchor}
        onToday={() => {
          if (dateAnchor !== null) setDateAnchor(null)
          else {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
