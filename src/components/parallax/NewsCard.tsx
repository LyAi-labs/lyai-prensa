import { memo, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { NewsItem } from '../../data/newsApi'
import { contraColor, decodeEntities, dominio, fechaCorta, hash, hexToRgb, iniciales, legible } from './cardUtils'

// Alturas de banner por card — da ritmo de "mampostería" a las columnas
// sin depender de que la noticia tenga foto.
const BANNER_H = [112, 148, 184]
const TILT_MAX = 6

type Props = {
  item: NewsItem
  flipped: boolean
  onToggle: (id: string) => void
  contrarioEnlace?: string
}

function NewsCard({ item: raw, flipped, onToggle, contrarioEnlace }: Props) {
  const item = useMemo(
    () => ({ ...raw, headline: decodeEntities(raw.headline), summary: decodeEntities(raw.summary) }),
    [raw],
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const [imgFailed, setImgFailed] = useState(false)

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
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={`pc${contra ? ' pc-has-contra' : ''}${flipped ? ' is-flipped' : ''}`}
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
          onClick={() => onToggle(item.id)}
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

            {contra && (
              <div className="pc-contra-bar">
                <span>⚠ Contradice a {contra.fuenteContraria}</span>
                <b>{contra.intensidad.toFixed(1)}</b>
              </div>
            )}
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
    </div>
  )
}

export default memo(NewsCard)
