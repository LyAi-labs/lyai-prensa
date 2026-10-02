import { memo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { NewsItem } from '../../data/newsApi'
import { contraColor, dominio, fechaCorta, hash, hexToRgb, iniciales, legible } from './cardUtils'
import { useDwell } from './useDwell'
import './card.css'

// Alturas de banner por card — da ritmo de "mampostería" sin depender de que
// la noticia tenga foto.
const BANNER_H = [112, 148, 184]
const TILT_MAX = 6

type Props = {
  item: NewsItem
  flipped: boolean
  onToggle: (id: string) => void
  contrarioEnlace?: string
  // Peek (hoja con el resumen completo). Si se pasa, lo controla el padre y la
  // card NO escucha «parar» por su cuenta (overlay del muro WebGL); si no, la
  // card detecta ratón quieto / dedo mantenido (rejilla DOM).
  peek?: boolean
  onPeekChange?: (id: string, peek: boolean) => void
  // Etiqueta «× N medios cuentan esto» sobre la card (misma historia).
  storyCount?: number
  // Rejilla DOM: estado de la card cuando otra está en «misma historia».
  storyState?: 'origin' | 'same' | 'dim' | null
}

function NewsCard({ item, flipped, onToggle, contrarioEnlace, peek: peekProp, onPeekChange, storyCount, storyState }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [peekInternal, setPeekInternal] = useState(false)

  const controlled = peekProp !== undefined
  const peek = (controlled ? peekProp : peekInternal) && !flipped

  const { consumeTouchClick } = useDwell(rootRef, {
    enabled: !controlled && !flipped,
    onDwell: () => {
      setPeekInternal(true)
      onPeekChange?.(item.id, true)
    },
    onEnd: () => {
      setPeekInternal(false)
      onPeekChange?.(item.id, false)
    },
  })

  const contra = item.contradicciones[0]
  const cColor = contra ? contraColor(contra.intensidad) : null
  const { dia, hora } = fechaCorta(item.publishedAt)
  const ini = iniciales(item.source)
  const bannerH = BANNER_H[hash(item.id) % BANNER_H.length]
  const hasPhoto = !!item.imagenUrl && !imgFailed

  // Spotlight (--mx/--my) + tilt (--rx/--ry) por custom properties CSS: solo
  // recomposición GPU, sin re-render de React ni repintado.
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    el.style.setProperty('--ry', `${((px - 0.5) * 2 * TILT_MAX).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - py) * 2 * TILT_MAX).toFixed(2)}deg`)
  }

  const onPointerLeave = () => {
    const el = rootRef.current
    if (!el) return
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onToggle(item.id)
  }

  const style = {
    '--c': item.sourceColor,
    '--c-rgb': hexToRgb(cColor ?? item.sourceColor),
    '--c-text': legible(item.sourceColor),
    '--contra': cColor ?? 'transparent',
    '--banner-h': `${bannerH}px`,
    // Profundidad con la que sale del plano en la rejilla 3D (más intensidad, más Z).
    '--pop': `${Math.round(40 + (contra?.intensidad ?? 0) * 70)}px`,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={`pc${contra ? ' pc-has-contra' : ''}${flipped ? ' is-flipped' : ''}${peek ? ' is-peek' : ''}${storyState ? ` is-${storyState}` : ''}`}
      style={style}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pc-tilt">
        <div
          className="pc-inner"
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={`${item.source}: ${item.headline}`}
          onClick={() => {
            if (consumeTouchClick()) return
            onToggle(item.id)
          }}
          onKeyDown={onKeyDown}
        >
          {/* ── Frente ─────────────────────────────────────────────── */}
          <div className="pc-face pc-front">
            <div className="pc-banner" style={{ height: bannerH }}>
              {hasPhoto ? (
                <img
                  src={item.imagenUrl!}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <span className="pc-mark" aria-hidden="true">{ini}</span>
              )}
              <span className="pc-chip">
                <i />
                {item.source}
              </span>
              {hasPhoto && <span className="pc-photo-tag">FOTO</span>}
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

            {storyState === 'same' && <span className="pc-same-chip">misma historia</span>}

            {contra && (
              <div className="pc-contra-bar">
                <span>⚠ Contradice a {contra.fuenteContraria}</span>
                <b>{contra.intensidad.toFixed(1)}</b>
              </div>
            )}

            {/* Peek: resumen completo y acciones. */}
            <div className="peek-sheet" aria-hidden={!peek}>
              <div className="peek-full">{item.summary || item.headline}</div>
              <div className="peek-acts">
                {item.enlace && (
                  <a href={item.enlace} target="_blank" rel="noreferrer" tabIndex={peek ? 0 : -1} onClick={(e) => e.stopPropagation()}>
                    Leer ↗
                  </a>
                )}
                <button
                  type="button"
                  tabIndex={peek ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(item.id)
                  }}
                >
                  Girar ↻
                </button>
              </div>
            </div>
          </div>

          {/* ── Reverso ────────────────────────────────────────────── */}
          <div className="pc-face pc-back" aria-hidden={!flipped}>
            {contra ? (
              <div className="pc-back-scroll">
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
              </div>
            ) : (
              <div className="pc-back-scroll">
                <div className="pc-back-head">
                  <span className="pc-avatar" aria-hidden="true">{ini}</span>
                  <span className="pc-meta">
                    <b>{item.source}</b>
                    <small>{dia}{hora && ` · ${hora}`}</small>
                  </span>
                </div>
                <h4 className="pc-back-title">{item.headline}</h4>
                {item.summary && <p className="pc-full">{item.summary}</p>}
                {item.enlace && (
                  <a className="pc-readmore" href={item.enlace} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    ↗ {dominio(item.enlace)} — leer noticia original
                  </a>
                )}
              </div>
            )}
            <span className="pc-back-hint">click para volver</span>
          </div>
        </div>
      </div>

      <div className="dwell-ring" aria-hidden="true" />
      {storyCount !== undefined && storyCount > 1 && (
        <span className="story-badge">× {storyCount} medios cuentan esto</span>
      )}
    </div>
  )
}

export default memo(NewsCard)
