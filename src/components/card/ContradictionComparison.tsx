import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiCloseLine,
  RiArrowRightLine,
  RiAlertLine,
  RiScales3Line,
  RiFocus3Line,
  RiArrowLeftRightLine,
  RiLayoutGridLine,
} from '@remixicon/react'

import type { NewsItem, Contradiccion, Claim } from '../../data/newsApi'
import { fetchNoticiaById } from '../../data/newsApi'
import { contraColor, fechaCorta, hexToRgb, iniciales, detectSeccion } from './cardUtils'
import MastheadLogo from './MastheadLogo'
import { SpotlightCard } from '../../shared/components/spotlight-card'
import { BorderBeam } from '../ui/BorderBeam'
import { Badge } from '@/components/ui/badge'
import { Comparison03 } from '../ui/comparison-03'
import { DragBento, BentoTile } from '../../shared/components/drag-bento'

export interface ContradictionComparisonProps {
  item: NewsItem
  contra: Contradiccion
  contrarioItem?: NewsItem
  contrarioEnlace?: string
  onClose: () => void
}

const STOPWORDS = new Set([
  'para', 'sobre', 'este', 'esta', 'estos', 'estas', 'como', 'entre',
  'desde', 'hacia', 'hasta', 'tras', 'ante', 'bajo', 'cabe', 'pero',
  'porque', 'pues', 'aunque', 'sino', 'cuando', 'donde', 'quien',
  'cual', 'cuyo', 'unos', 'unas', 'otro', 'otra', 'otros', 'otras',
  'todo', 'toda', 'todos', 'todas', 'tanto', 'tanta', 'tantos', 'tantas',
  'este', 'esta', 'esto', 'estos', 'estas', 'aquel', 'aquella', 'aquellos',
])

function extractKeyTokens(claim?: Claim | null): string[] {
  if (!claim) return []
  const tokens = new Set<string>()
  const inspect = (txt?: string | null) => {
    if (!txt || typeof txt !== 'string') return
    const numMatches = txt.match(/\b\d+[\w%ºª]*\b/g)
    if (numMatches) numMatches.forEach((n) => tokens.add(n.trim()))

    const words = txt.split(/[\s,.;:«»"()]+/).filter((w) => w.length >= 3)
    for (const w of words) {
      if (!STOPWORDS.has(w.toLowerCase())) {
        tokens.add(w)
      }
    }
  }

  inspect(claim.objeto)
  inspect(claim.predicado)
  return Array.from(tokens).sort((a, b) => b.length - a.length)
}

function HighlightedText({
  text,
  tokens,
  color,
}: {
  text: string
  tokens: string[]
  color: string
}) {
  if (!text || tokens.length === 0) return <span>{text}</span>

  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
  if (escaped.length === 0) return <span>{text}</span>

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase())
        if (isMatch) {
          return (
            <mark
              key={i}
              className="pc-fact-token-mark"
              style={{
                backgroundColor: `${color}35`,
                borderColor: color,
                color: '#ffffff',
              }}
              title="Dato en cuestión"
            >
              {part}
              <span className="pc-fact-token-dot" style={{ backgroundColor: color }} />
            </mark>
          )
        }
        return part
      })}
    </span>
  )
}

/**
 * TruncatedText: Oculta el exceso de texto para mantener la altura nivelada
 * con la otra card, con botón de toggle '...más' / '...menos'.
 */
function TruncatedText({
  text,
  tokens,
  color,
  maxLines = 3,
  threshold = 120,
  className = 'pc-popout-summary',
}: {
  text: string
  tokens: string[]
  color: string
  maxLines?: 2 | 3
  threshold?: number
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > threshold

  return (
    <div className="pc-popout-expandable-wrap">
      <div
        className={`pc-popout-expandable-text ${
          !expanded && isLong
            ? maxLines === 2
              ? 'is-clamped-2'
              : 'is-clamped'
            : ''
        }`}
      >
        <p className={className}>
          <HighlightedText text={text} tokens={tokens} color={color} />
        </p>
      </div>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((prev) => !prev)
          }}
          className="pc-popout-more-btn"
          aria-expanded={expanded}
          title={expanded ? 'Ver menos' : 'Ver más'}
        >
          {expanded ? '...menos' : '...más'}
        </button>
      )}
    </div>
  )
}

/**
 * TruncatedClaimObject: Mantiene el badge del dato en cuestión compacto
 * con toggle '...más' si el objeto de la afirmación es extenso.
 */
function TruncatedClaimObject({
  text,
  accentColor,
}: {
  text: string
  accentColor: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 80
  const displayed = !expanded && isLong ? text.slice(0, 80) + '…' : text

  return (
    <span
      className="pc-fact-beacon-object"
      style={{
        borderColor: accentColor,
        backgroundColor: `${accentColor}30`,
        color: '#ffffff',
      }}
    >
      «{displayed}»
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((prev) => !prev)
          }}
          className="pc-popout-more-btn ml-1 inline-block text-[10px] text-white underline"
        >
          {expanded ? '...menos' : '...más'}
        </button>
      )}
    </span>
  )
}

function PopoutCardItem({
  item,
  claim,
  tokens,
  isOpposite,
  accentColor,
  targetEnlace,
  defaultSource,
  intensidad,
}: {
  item?: NewsItem
  claim?: Claim | null
  tokens: string[]
  isOpposite?: boolean
  accentColor: string
  targetEnlace?: string
  defaultSource?: string
  /** Si se pasa, añade un pill "N%" junto al de «Dato en cuestión» (grupos N-way). */
  intensidad?: number
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const sourceName = item?.source || defaultSource || (isOpposite ? 'Medio opuesto' : 'Medio fuente')
  const sourceColor = item?.sourceColor || accentColor
  const date = item ? fechaCorta(item.publishedAt) : { dia: '', hora: '' }
  const headline = item?.headline || `Relato de ${sourceName}`
  const summary = item?.summary || ''
  const hasPhoto = !!item?.imagenUrl && !imgFailed
  const proxyUrl = item?.imagenUrl ? `/api/image-proxy?url=${encodeURIComponent(item.imagenUrl)}` : null
  const seccion = detectSeccion(item?.enlace, sourceName, headline)
  const enlace = item?.enlace || targetEnlace
  const safeClaim = claim || {
    sujeto: sourceName,
    predicado: 'sostiene discrepancia',
    objeto: 'sobre este dato',
  }

  return (
    <div className="pc-popout-card-col">
      {/* ── Sutil Indicador del Dato en Cuestión (Beacon Flotante) ── */}
      <div
        className="pc-fact-beacon"
        style={{
          borderColor: `${accentColor}75`,
          background: `linear-gradient(135deg, ${accentColor}18, rgba(13, 16, 23, 0.95))`,
          boxShadow: `0 8px 28px -4px ${accentColor}40`,
        }}
      >
        <div className="pc-fact-beacon-top">
          <div className="pc-fact-beacon-pulse">
            <span className="pc-fact-beacon-ping" style={{ backgroundColor: accentColor }} />
            <span className="pc-fact-beacon-core" style={{ backgroundColor: accentColor }} />
          </div>
          <span className="pc-fact-beacon-source">
            {sourceName} sostiene:
          </span>
          <span className="pc-fact-beacon-badge">Dato en cuestión</span>
        </div>

        {intensidad != null && (
          <div className="pc-popout-nway-intensity-row">
            <span className="pc-popout-nway-intensity" style={{ color: contraColor(intensidad) }}>
              <RiAlertLine className="size-3" />
              Intensidad {(intensidad * 100).toFixed(0)}%
            </span>
          </div>
        )}

        <div className="pc-fact-beacon-claim">
          <span className="pc-fact-beacon-subject">{safeClaim.sujeto}</span>{' '}
          <span className="pc-fact-beacon-predicate">{safeClaim.predicado}</span>{' '}
          <TruncatedClaimObject text={safeClaim.objeto} accentColor={accentColor} />
        </div>
      </div>

      {/* ── Tarjeta Real Desplazada hacia el Usuario ── */}
      <div className={`pc-popout-card ${!hasPhoto ? 'is-paper' : ''}`}>
        {hasPhoto ? (
          <div className="pc-popout-banner">
            <img
              src={proxyUrl!}
              alt=""
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImgFailed(true)}
            />
            <div className="pc-popout-banner-overlay" />
            <span
              className="pc-popout-source-chip"
              style={{ backgroundColor: sourceColor }}
            >
              {iniciales(sourceName)} · {sourceName}
            </span>
          </div>
        ) : (
          <div className="pc-popout-paper-head">
            <div className="pc-popout-paper-source-pill">
              <span className="pc-paper-pill-dot" style={{ backgroundColor: sourceColor }} />
              <span>{sourceName}</span>
            </div>
            <div className="pc-popout-masthead">
              <MastheadLogo source={sourceName} sourceColor={sourceColor} />
            </div>
          </div>
        )}

        <div className="pc-popout-content">
          <div className="pc-popout-meta">
            <span className="pc-popout-section">{seccion.text}</span>
            {date.dia && (
              <span className="pc-popout-date">
                {date.dia} {date.hora && `· ${date.hora}`}
              </span>
            )}
          </div>

          <TruncatedText
            text={headline}
            tokens={tokens}
            color={accentColor}
            className="pc-popout-headline"
            maxLines={2}
            threshold={95}
          />

          {summary && (
            <TruncatedText
              text={summary}
              tokens={tokens}
              color={accentColor}
              className="pc-popout-summary"
              maxLines={3}
              threshold={120}
            />
          )}
        </div>

        {enlace && (
          <div className="pc-popout-footer">
            <a
              href={enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="pc-popout-link-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Ver noticia original en {sourceName}</span>
              <RiArrowRightLine className="size-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ContradictionComparison({
  item,
  contra,
  contrarioItem: initialContrarioItem,
  contrarioEnlace,
  onClose,
}: ContradictionComparisonProps) {
  const [contrarioItem, setContrarioItem] = useState<NewsItem | undefined>(initialContrarioItem)

  // Grupo completo de contradicciones de `item` (puede implicar >2 noticias:
  // cada entrada es un par item↔otra noticia — ver api/queries.py). Con más
  // de una, «Tarjetas 3D» las muestra todas en vez de solo A-vs-B.
  const allContras = item.contradicciones && item.contradicciones.length > 1 ? item.contradicciones : [contra]
  // «Comparativa 03» solo puede mostrar UN par (2 columnas) — con 3+ noticias
  // implicadas, abrir ahí por defecto esconde el resto sin que el usuario
  // sepa que falta darle a «Tarjetas 3D». Con grupo N-way, arranca ya ahí.
  const [viewMode, setViewMode] = useState<'comparison03' | 'cards'>(
    allContras.length > 1 ? 'cards' : 'comparison03',
  )
  const [contrariosMap, setContrariosMap] = useState<Record<string, NewsItem>>({})

  useEffect(() => {
    if (allContras.length <= 1) return
    let isSubscribed = true
    allContras.forEach((c) => {
      if (contrariosMap[c.noticiaContrariaId]) return
      fetchNoticiaById(c.noticiaContrariaId).then((fetched) => {
        if (isSubscribed && fetched) {
          setContrariosMap((prev) => ({ ...prev, [c.noticiaContrariaId]: fetched }))
        }
      })
    })
    return () => {
      isSubscribed = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  useEffect(() => {
    document.body.classList.add('has-contradiction-popout')
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.classList.remove('has-contradiction-popout')
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  useEffect(() => {
    if (!contrarioItem && contra.noticiaContrariaId) {
      let isSubscribed = true
      fetchNoticiaById(contra.noticiaContrariaId).then((fetched) => {
        if (isSubscribed && fetched) {
          setContrarioItem(fetched)
        }
      })
      return () => {
        isSubscribed = false
      }
    }
  }, [contra.noticiaContrariaId, contrarioItem])

  const intensityColor = contraColor(contra.intensidad)
  const intensityLabel =
    contra.intensidad > 0.7
      ? 'Fuerte'
      : contra.intensidad > 0.4
      ? 'Moderada'
      : 'Leve'

  const colorA = item.sourceColor || '#0284c7'
  const colorB = contrarioItem?.sourceColor || '#e11d48'

  const tokensA = useMemo(() => extractKeyTokens(contra.claimPropio), [contra.claimPropio])
  const tokensB = useMemo(() => extractKeyTokens(contra.claimContrario), [contra.claimContrario])

  const targetEnlaceB = contrarioItem?.enlace || contrarioEnlace || item.enlace
  const contrarioFuente = contrarioItem?.source || contra.fuenteContraria || 'Medio alternativo'

  return createPortal(
    <AnimatePresence>
      <div className="pc-popout-overlay" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 35, rotateX: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, scale: 0.76, y: 25, rotateX: 4 }}
          transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
          className="pc-popout-window"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Barra Superior con título, selector de vistas y botón Volver */}
          <div className="pc-popout-topbar">
            <div className="pc-popout-title-wrap">
              <div className="pc-popout-title-icon">
                <RiAlertLine className="size-5 text-rose-400" />
              </div>
              <div>
                <h2 className="pc-popout-title">
                  Contradicción detectada · Vista comparativa
                </h2>
                <p className="pc-popout-subtitle">
                  Contraste fáctico entre {item.source} y {contrarioFuente} con texto nivelado y datos clave
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Selector de modo de vista: Comparison 03 vs Tarjetas 3D */}
              <div className="pc-popout-view-tabs">
                <button
                  type="button"
                  onClick={() => setViewMode('comparison03')}
                  className={`pc-popout-view-tab ${viewMode === 'comparison03' ? 'is-active' : ''}`}
                  title="Bloque de comparación de 2 paneles (Comparison-03)"
                >
                  <RiScales3Line className="size-4" />
                  <span>Comparativa 03</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`pc-popout-view-tab ${viewMode === 'cards' ? 'is-active' : ''}`}
                  title="Tarjetas 3D cara a cara"
                >
                  <RiLayoutGridLine className="size-4" />
                  <span>Tarjetas 3D</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="pc-popout-close-btn"
                title="Cerrar y volver al muro (Esc)"
              >
                <RiCloseLine className="size-4" />
                <span>Volver al muro</span>
              </button>
            </div>
          </div>

          {/* Renderizado condicional según el modo seleccionado */}
          {viewMode === 'comparison03' ? (
            <div className="pc-popout-comparison03-box rounded-2xl border border-white/10 bg-[#0c1017]/90 backdrop-blur-md overflow-hidden">
              <Comparison03
                badge={`Contradicción detectada · ${contra.tema}`}
                title={`Discrepancia entre ${item.source} y ${contrarioFuente}`}
                description={
                  contra.razonamiento ||
                  'Contraste directo de los datos clave emitidos por ambas fuentes informativas.'
                }
                beforeTitle={`${item.source} sostiene`}
                beforeItems={[
                  `Dato en cuestión: «${contra.claimPropio.sujeto} ${contra.claimPropio.predicado} ${contra.claimPropio.objeto}»`,
                  `Titular: ${item.headline}`,
                  ...(item.summary ? [`Resumen: ${item.summary}`] : []),
                ]}
                strikeBefore={false}
                beforeIcon={<RiAlertLine className="size-4 text-sky-400" />}
                afterTitle={`${contrarioFuente} sostiene`}
                afterItems={[
                  `Dato en cuestión: «${contra.claimContrario.sujeto} ${contra.claimContrario.predicado} ${contra.claimContrario.objeto}»`,
                  `Titular: ${contrarioItem?.headline || `Relato de ${contrarioFuente}`}`,
                  ...(contrarioItem?.summary ? [`Resumen: ${contrarioItem.summary}`] : []),
                ]}
                afterIcon={<RiScales3Line className="size-4 text-rose-400" />}
                outcomes={[
                  {
                    value: `${(contra.intensidad * 100).toFixed(0)}%`,
                    label: `Intensidad (${intensityLabel})`,
                  },
                  { value: contra.tema, label: 'Área temática' },
                  {
                    value: contra.razonamiento ? 'Fáctico' : 'Editorial',
                    label: 'Tipo de divergencia',
                  },
                ]}
                actionText={targetEnlaceB ? `Ver noticia en ${contrarioFuente}` : undefined}
                actionHref={targetEnlaceB}
                compact={true}
              />
            </div>
          ) : allContras.length > 1 ? (
            /* Grupo N-way: todas las noticias implicadas, en una fila arrastrable
               (DragBento de lyai-shared) — sin un único VS, cada tarjeta lleva su
               propio claim resaltado y badge de intensidad frente a `item`. */
            <div className="pc-popout-nway">
              <p className="pc-popout-nway-hint">
                {allContras.length} noticias en contradicción sobre este dato — arrastra para ver todas
              </p>
              <div className="pc-popout-nway-bento-wrap">
              <DragBento rows={1}>
                <BentoTile span="tall" accentRgb={hexToRgb(colorA) ?? undefined} className="pc-popout-nway-tile">
                  <SpotlightCard variant="blue" rgb={hexToRgb(colorA)} className="h-full rounded-[18px]">
                    <PopoutCardItem item={item} claim={allContras[0]?.claimPropio} tokens={tokensA} accentColor={colorA} />
                  </SpotlightCard>
                </BentoTile>
                {allContras.map((c) => {
                  const cItem = contrariosMap[c.noticiaContrariaId]
                  const cColor = cItem?.sourceColor || '#e11d48'
                  const cTokens = extractKeyTokens(c.claimContrario)
                  return (
                    <BentoTile
                      key={c.id}
                      span="tall"
                      accentRgb={hexToRgb(cColor) ?? undefined}
                      className="pc-popout-nway-tile"
                    >
                      <SpotlightCard variant="rose" rgb={hexToRgb(cColor)} className="h-full rounded-[18px]">
                        <PopoutCardItem
                          item={cItem}
                          claim={c.claimContrario}
                          tokens={cTokens}
                          isOpposite
                          accentColor={cColor}
                          targetEnlace={cItem?.enlace}
                          defaultSource={c.fuenteContraria}
                          intensidad={c.intensidad}
                        />
                      </SpotlightCard>
                    </BentoTile>
                  )
                })}
              </DragBento>
              </div>
            </div>
          ) : (
            /* Grid Principal de Tarjetas 3D: Tarjeta A · VS Columna · Tarjeta B */
            <div className="pc-popout-grid">
              {/* Tarjeta A */}
              <BorderBeam size="md" colorVariant="ocean" borderRadius={18} className="pc-popout-card-frame">
                <SpotlightCard
                  variant="blue"
                  rgb={hexToRgb(colorA)}
                  className="h-full rounded-[18px]"
                >
                  <PopoutCardItem
                    item={item}
                    claim={contra.claimPropio}
                    tokens={tokensA}
                    accentColor={colorA}
                  />
                </SpotlightCard>
              </BorderBeam>

              {/* Columna Central VS con indicador de tema, intensidad y razonamiento */}
              <div className="pc-popout-vs-col">
                <div
                  className="pc-popout-vs-ring"
                  style={{
                    borderColor: intensityColor,
                    boxShadow: `0 0 35px ${intensityColor}45, inset 0 0 16px ${intensityColor}20`,
                  }}
                >
                  <RiArrowLeftRightLine className="size-5 text-white/80" />
                  <span className="text-base font-black text-white tracking-widest leading-none mt-0.5">
                    VS
                  </span>
                </div>

                <Badge
                  variant="outline"
                  className="gap-1.5 px-3 py-1 font-bold text-xs uppercase tracking-wider"
                  style={{
                    borderColor: intensityColor,
                    color: intensityColor,
                    backgroundColor: `${intensityColor}18`,
                  }}
                >
                  <RiAlertLine className="size-3.5" />
                  {intensityLabel} · {(contra.intensidad * 100).toFixed(0)}%
                </Badge>

                <Badge variant="secondary" className="gap-1.5 text-xs text-white/80 bg-white/10">
                  <RiScales3Line className="size-3.5" />
                  {contra.tema}
                </Badge>

                {contra.razonamiento && (
                  <div className="pc-popout-reasoning-box">
                    <div className="pc-popout-reasoning-title">
                      <RiFocus3Line className="size-3.5" />
                      <span>Conflicto fáctico</span>
                    </div>
                    <TruncatedText
                      text={contra.razonamiento}
                      tokens={tokensA}
                      color={intensityColor}
                      maxLines={3}
                      threshold={120}
                      className="text-xs text-white/80"
                    />
                  </div>
                )}
              </div>

              {/* Tarjeta B */}
              <BorderBeam size="md" colorVariant="sunset" borderRadius={18} className="pc-popout-card-frame">
                <SpotlightCard
                  variant="rose"
                  rgb={hexToRgb(colorB)}
                  className="h-full rounded-[18px]"
                >
                  <PopoutCardItem
                    item={contrarioItem}
                    claim={contra.claimContrario}
                    tokens={tokensB}
                    isOpposite
                    accentColor={colorB}
                    targetEnlace={targetEnlaceB}
                    defaultSource={contra.fuenteContraria}
                  />
                </SpotlightCard>
              </BorderBeam>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  )
}
