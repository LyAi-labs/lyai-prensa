import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNewsFeed } from '../../data/useNewsFeed'
import CardOverlay, { type OverlayState } from '../card/CardOverlay'
import { contraColor, fechaCorta, hexToRgb, iniciales } from '../card/cardUtils'
import { Timeline, type TimelineNode } from '../../shared/components/timeline'
import DateNav from './DateNav'
import { buildStoryNodes, type StoryNode } from './stories'
import '../views/views.css'
import './timeline.css'

// Línea de tiempo (dev-xplain 2026-10-02-2012, opción C): el esqueleto (eje,
// lados, separadores de día) es shared/timeline; aquí solo el contenido de los
// nodos: historias agrupadas y contradicciones enfrentadas lado a lado.
export default function TimelineView({ onReady }: { onReady?: () => void }) {
  const { items, loading, exhausted, dateAnchor, setDateAnchor, loadNext, reload } = useNewsFeed(onReady)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)

  const nodes = useMemo(() => buildStoryNodes(items), [items])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  useEffect(() => setOverlay(null), [dateAnchor])

  const open = useCallback(
    (n: StoryNode, e: React.MouseEvent) => {
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

  const tlNodes = useMemo<TimelineNode[]>(
    () =>
      nodes.map((n) => {
        const { item, group } = n
        const contra = item.contradicciones[0]
        const isStory = group.length > 1
        const { dia, hora } = fechaCorta(item.publishedAt)
        const color = contra ? contraColor(contra.intensidad) : isStory ? '#00e5ff' : item.sourceColor
        const style = { ['--c' as string]: color, ['--rgb' as string]: hexToRgb(color) }

        let content
        if (contra) {
          const other = contra.claimContrario
          content = (
            <div className="ls-tl-tile tl-t tl-contra" style={style} onClick={(e) => open(n, e)} role="button" tabIndex={0}>
              <i className="tl-bar" />
              <div className="tl-row">
                <span className="tl-chip tl-chip-red">⚠ Contradicción · {contra.tema}</span>
                <span className="tl-meta">intensidad {contra.intensidad.toFixed(1)}</span>
                <span className="tl-meta tl-right">{dia} · {hora}</span>
              </div>
              <div className="tl-vs">
                <div className="tl-cl"><b>{item.source.toUpperCase()} dice</b>«{item.headline}»</div>
                <div className="tl-cl">
                  <b>{contra.fuenteContraria.toUpperCase()} dice</b>«{other.sujeto} {other.predicado} {other.objeto}»
                </div>
              </div>
              <div className="tl-meter"><i style={{ width: `${Math.min(100, contra.intensidad * 100)}%` }} /></div>
              {contra.razonamiento && <p className="tl-sum">{contra.razonamiento}</p>}
            </div>
          )
        } else {
          content = (
            <div className={`ls-tl-tile tl-t${isStory ? ' tl-story' : ''}`} style={style} onClick={(e) => open(n, e)} role="button" tabIndex={0}>
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
        }

        return {
          id: item.id,
          day: n.day,
          dayLabel: dia,
          time: hora,
          timeSub: dia,
          accent: color,
          full: !!contra,
          content,
        }
      }),
    [nodes, open],
  )

  return (
    <div className="vw-root">
      <Timeline
        nodes={tlNodes}
        onNearEnd={loadNext}
        resetKey={dateAnchor}
        empty={loading ? undefined : `No hay noticias ${dateAnchor ? `hasta el ${dateAnchor}` : 'todavía'}.`}
        end={exhausted ? '— fin de las noticias —' : undefined}
      />

      <div className="vw-top-fade" aria-hidden="true" />
      <header className="vw-header">
        <h2 className="vw-title">LyAi · Prensa</h2>
        <p className="vw-subtitle">Línea de tiempo — quién cuenta qué, y cuándo</p>
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
