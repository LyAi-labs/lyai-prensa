import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import './splash-screen.css'

/**
 * Pantalla de carga tipográfica (estilo editorial): palabra grande letra a letra,
 * líneas explicativas, cifras y barra de progreso. Mínimo `minMs`, pero no sale hasta
 * que `ready` sea true. Se muestra UNA vez por sesión (sessionStorage), saltable con
 * botón, click o cualquier tecla; con `prefers-reduced-motion` pasa a un fundido.
 */
export interface SplashStat {
  value: ReactNode
  label: string
}

export interface SplashScreenProps {
  /** true cuando los datos de la vista ya están listos. */
  ready: boolean
  /** Línea pequeña superior («LyAi · observatorio de prensa»). */
  eyebrow?: string
  /** Palabra grande (se anima letra a letra). */
  word: string
  /** Frases explicativas (usa <b> y <em> para resaltar). */
  lines?: ReactNode[]
  stats?: SplashStat[]
  hint?: string
  skipLabel?: string
  ariaLabel?: string
  minMs?: number
  exitMs?: number
  storageKey?: string
}

function seen(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markSeen(key: string) {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    /* sin storage: se mostrará de nuevo en la próxima visita, sin más */
  }
}

export function SplashScreen({
  ready,
  eyebrow,
  word,
  lines = [],
  stats = [],
  hint,
  skipLabel = 'entrar →',
  ariaLabel,
  minMs = 3000,
  exitMs = 900,
  storageKey = 'ls-splash-seen',
}: SplashScreenProps) {
  const [visible, setVisible] = useState(() => !seen(storageKey))
  const [minElapsed, setMinElapsed] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const leave = useCallback(() => {
    setLeaving((already) => {
      if (already) return already
      markSeen(storageKey)
      window.setTimeout(() => setVisible(false), exitMs)
      return true
    })
  }, [storageKey, exitMs])

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => setMinElapsed(true), minMs)
    return () => window.clearTimeout(t)
  }, [visible, minMs])

  useEffect(() => {
    if (visible && minElapsed && ready) leave()
  }, [visible, minElapsed, ready, leave])

  useEffect(() => {
    if (!visible) return
    const onKey = () => leave()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, leave])

  if (!visible) return null

  return (
    <div className={`ls-splash${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label={ariaLabel ?? word} onClick={leave}>
      {eyebrow && <div className="ls-splash-top">{eyebrow}</div>}
      <div className="ls-splash-rule" />
      <h1 className="ls-splash-word" aria-label={word}>
        {word.split('').map((ch, i) => (
          <span key={i} style={{ ['--i' as string]: i } as CSSProperties}>{ch}</span>
        ))}
      </h1>
      <div className="ls-splash-rule ls-splash-rule-b" />
      {lines.length > 0 && (
        <div className="ls-splash-lines">
          {lines.map((l, i) => (
            <p key={i} style={{ ['--i' as string]: i } as CSSProperties}>{l}</p>
          ))}
        </div>
      )}
      {stats.length > 0 && (
        <div className="ls-splash-stats">
          {stats.map((s) => (
            <div key={s.label}><b>{s.value}</b>{s.label}</div>
          ))}
        </div>
      )}
      {hint && <div className="ls-splash-hint">{hint}</div>}
      <button className="ls-splash-skip" onClick={(e) => { e.stopPropagation(); leave() }}>{skipLabel}</button>
      <div className="ls-splash-progress" />
    </div>
  )
}
