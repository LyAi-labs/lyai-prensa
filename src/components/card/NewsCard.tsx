import { memo, useRef, useState, type CSSProperties } from 'react'
import type { NewsItem } from '../../data/newsApi'
import { contraColor, detectSeccion, dominio, fechaCorta, hexToRgb, iniciales, legible } from './cardUtils'
import MastheadLogo from './MastheadLogo'
import { FlipCard } from '../../shared/components/flip-card'
import { SpotlightCard, type SpotlightVariant } from '../../shared/components/spotlight-card'
import './card.css'

function getSpotlightVariant(source: string, isContra: boolean): SpotlightVariant {
  if (isContra) return 'rose'
  const s = source.toLowerCase()
  if (s.includes('país') || s.includes('pais') || s.includes('ser')) return 'blue'
  if (s.includes('mundo') || s.includes('abc') || s.includes('confidencial')) return 'amber'
  if (s.includes('diario') || s.includes('vanguardia')) return 'emerald'
  if (s.includes('rtve') || s.includes('onda') || s.includes('cope')) return 'cyan'
  return 'blue'
}

type Props = {
  item: NewsItem
  flipped: boolean
  onToggle: (id: string) => void
  contrarioEnlace?: string
  // Etiqueta «× N medios cuentan esto» sobre la card (misma historia).
  storyCount?: number
  // Rejilla DOM: estado de la card cuando otra está en «misma historia».
  storyState?: 'origin' | 'same' | 'dim' | null
  // Otros medios que cuentan la misma historia (se listan en el reverso).
  related?: NewsItem[]
  onOpenComparison?: () => void
}

function NewsCard({
  item,
  flipped,
  onToggle,
  contrarioEnlace,
  storyCount,
  storyState,
  related,
  onOpenComparison,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [imgFailed, setImgFailed] = useState(false)

  const contra = item.contradicciones[0]
  const cColor = contra ? contraColor(contra.intensidad) : null
  const spotVariant = getSpotlightVariant(item.source, !!contra)
  // Bordes neutros naturales para tarjetas normales, reservando el color para contradicciones
  const spotRgb = (contra && cColor) ? (hexToRgb(cColor) ?? undefined) : '225, 231, 239'
  const { dia, hora } = fechaCorta(item.publishedAt)
  const ini = iniciales(item.source)
  const hasPhoto = !!item.imagenUrl && !imgFailed
  const proxyUrl = item.imagenUrl ? `/api/image-proxy?url=${encodeURIComponent(item.imagenUrl)}` : null
  const seccion = detectSeccion(item.enlace, item.source, item.headline)

  const backPhoto = hasPhoto && proxyUrl ? (
    <img className="pc-back-photo" src={proxyUrl} alt="" referrerPolicy="no-referrer" draggable={false} />
  ) : null

  const others = related?.filter((r) => r.id !== item.id) ?? []
  const relatedList =
    others.length > 0 ? (
      <div className="pc-related">
        <span className="pc-related-title">También lo cuentan · {others.length}</span>
        <div className="pc-related-list">
          {others.slice(0, 10).map((r) => (
            <a
              key={r.id}
              className="pc-rel"
              href={r.enlace || undefined}
              target="_blank"
              rel="noreferrer"
              style={{ ['--c' as string]: r.sourceColor }}
              onClick={(e) => e.stopPropagation()}
            >
              <i />
              {r.source}
            </a>
          ))}
        </div>
      </div>
    ) : null

  const style = {
    '--c': item.sourceColor,
    '--c-rgb': (contra && cColor) ? (hexToRgb(cColor) ?? '225, 231, 239') : '225, 231, 239',
    '--c-text': legible(item.sourceColor),
    '--contra': cColor ?? 'transparent',
    '--pop': `${Math.round(40 + (contra?.intensidad ?? 0) * 70)}px`,
  } as CSSProperties

  return (
    <FlipCard
      rootRef={rootRef}
      className={`pc${contra ? ' pc-has-contra' : ''}${storyState ? ` is-${storyState}` : ''}${!hasPhoto ? ' pc-is-newspaper' : ''}`}
      style={style}
      flipped={flipped}
      onFlippedChange={() => onToggle(item.id)}
      ariaLabel={`${item.source}: ${item.headline}`}
      frontClassName="pc-face pc-front"
      backClassName="pc-face pc-back"
      front={
        <SpotlightCard variant={contra ? spotVariant : 'blue'} rgb={spotRgb} className={`pc-spotlight${!hasPhoto ? ' pc-spotlight-paper' : ''}`}>
          {hasPhoto ? (
            <>
              <div className="pc-banner pc-banner-hero">
                <img
                  src={proxyUrl!}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => setImgFailed(true)}
                />
                <span className="pc-chip">
                  <i />
                  {item.source}
                </span>
              </div>

              <div className="pc-body">
                <h3 className="pc-title">{item.headline}</h3>
                {item.summary && <p className="pc-sum">{item.summary}</p>}
              </div>

              <div className="pc-foot">
                <span className="pc-avatar" aria-hidden="true">{ini}</span>
                <span className="pc-meta">
                  <b>{item.source}</b>
                  <small>{dia}{hora && ` · ${hora}`}</small>
                </span>
                <span className="pc-go" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
            </>
          ) : (
            <div className="pc-paper-container">
              <div className="pc-paper-top">
                <div className="pc-paper-pill">
                  <span className="pc-paper-pill-dot" style={{ background: item.sourceColor || '#22c55e' }} />
                  <span className="pc-paper-pill-text">{item.source.toUpperCase()}</span>
                </div>
              </div>

              <div className="pc-paper-sheet">
                <div className="pc-paper-masthead">
                  <MastheadLogo source={item.source} sourceColor={item.sourceColor} />
                </div>

                <div className="pc-paper-divider" />

                <div className={`pc-paper-section${seccion.isRed ? ' is-red' : ''}`}>
                  {seccion.text}
                </div>

                <div className="pc-paper-body">
                  <h3 className="pc-paper-headline">{item.headline}</h3>
                  {item.summary && <p className="pc-paper-summary">{item.summary}</p>}
                </div>

                <div className="pc-paper-foot">
                  <div className="pc-paper-foot-left">
                    <span className="pc-paper-avatar" style={{ background: item.sourceColor || '#0284c7' }}>
                      {ini}
                    </span>
                    <span className="pc-paper-meta-inline">
                      <b className="pc-paper-source">{item.source}</b>
                      <span className="pc-paper-sep">·</span>
                      <span className="pc-paper-date">{dia}{hora && ` · ${hora}`}</span>
                    </span>
                  </div>
                  <a
                    className="pc-paper-go"
                    href={item.enlace || undefined}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Leer noticia original"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}

          {storyState === 'same' && <span className="pc-same-chip">misma historia</span>}

          {contra && (
            <div className="pc-contra-bar">
              <span>⚠ Contradice a {contra.fuenteContraria}</span>
              <b>{contra.intensidad.toFixed(1)}</b>
            </div>
          )}
        </SpotlightCard>
      }
      back={
        <div className="pc-spotlight pc-back-inner">
            {contra ? (
              <div
                className="pc-back-scroll"
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('a')) return
                  e.stopPropagation()
                  onOpenComparison?.()
                }}
              >
                {backPhoto}
                <div className="pc-hl-icon" style={{ background: `linear-gradient(135deg, ${cColor}, ${cColor}99)` }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                </div>
                <div className="pc-hl-title">Contradicción detectada</div>
                <div className="pc-hl-sub" style={{ color: cColor ?? undefined }}>
                  {contra.tema} · {contra.intensidad > 0.7 ? 'fuerte' : contra.intensidad > 0.4 ? 'moderada' : 'leve'}
                </div>
                <ul className="pc-hl-lines">
                  <li>
                    <span>
                      <b>{item.source}:</b> «{contra.claimPropio.sujeto} {contra.claimPropio.predicado} {contra.claimPropio.objeto}»
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>{contra.fuenteContraria}:</b> «{contra.claimContrario.sujeto} {contra.claimContrario.predicado} {contra.claimContrario.objeto}»
                    </span>
                  </li>
                </ul>
                <div className="pc-meter">
                  <div className="pc-meter-labels">
                    <span>Intensidad del desacuerdo</span>
                    <span style={{ color: cColor ?? undefined }}>{contra.intensidad.toFixed(1)}</span>
                  </div>
                  <div className="pc-meter-track">
                    <div className="pc-meter-fill" style={{ width: `${Math.min(100, contra.intensidad * 100)}%`, background: cColor ?? undefined }} />
                  </div>
                </div>
                {contra.razonamiento && <p className="pc-reason">{contra.razonamiento}</p>}
                <div className="pc-links">
                  {item.enlace && (
                    <a href={item.enlace} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      ↗ {item.source}
                    </a>
                  )}
                  {contrarioEnlace && (
                    <a href={contrarioEnlace} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      ↗ {contra.fuenteContraria}
                    </a>
                  )}
                </div>
                {contra && (
                  <div className="pc-compare-trigger-group">
                    <button
                      type="button"
                      className="pc-compare-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenComparison?.()
                      }}
                    >
                      <span className="pc-compare-btn-badge">2º Click</span>
                      <span>⚔ Comparar ambas versiones cara a cara</span>
                    </button>
                    <span className="pc-compare-hint">
                      Haz un 2º click en esta tarjeta para salir del muro
                    </span>
                  </div>
                )}
                {relatedList}
              </div>
            ) : (
              <div className="pc-back-scroll">
                {backPhoto}
                <div className="pc-back-head">
                  <span className="pc-avatar" aria-hidden="true">{ini}</span>
                  <span className="pc-meta">
                    <b>{item.source}</b>
                    <small>{dia}{hora && ` · ${hora}`}</small>
                  </span>
                </div>
                <h4 className="pc-back-title">{item.headline}</h4>
                {item.summary ? (
                  <p className="pc-full">{item.summary}</p>
                ) : (
                  <div className="pc-dossier-box">
                    <div className="pc-dossier-header">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                      <span>Análisis LyAi · Cobertura contrastada</span>
                    </div>
                    <p className="pc-dossier-text">
                      Información analizada y contrastada en tiempo real. No se han detectado contradicciones fácticas ni discrepancias con otros medios sobre esta información.
                    </p>
                    <div className="pc-dossier-meta">
                      <span><b>Medio:</b> {item.source}</span>
                      <span><b>Captura:</b> {dia} {hora ? `· ${hora}` : ''}</span>
                    </div>
                  </div>
                )}
                {item.enlace && (
                  <a
                    className="pc-read-btn"
                    href={item.enlace}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Leer noticia completa en {dominio(item.enlace) || item.source}</span>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
                {relatedList}
              </div>
            )}
            <span className="pc-back-hint">click para volver</span>
        </div>
      }
      overlay={
        <>
          <div className="ls-flip-ring" aria-hidden="true" />
      {storyCount !== undefined && storyCount > 1 && (
        <span className="story-badge">× {storyCount} medios cuentan esto</span>
      )}
        </>
      }
    />
  )
}

export default memo(NewsCard)
