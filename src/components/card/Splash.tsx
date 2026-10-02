import { useCallback, useEffect, useState } from 'react'
import { fetchNumFuentes } from '../../data/newsApi'
import './card.css'

const MIN_MS = 3000
const EXIT_MS = 900
const STORAGE_KEY = 'prensa-splash-visto'

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* sin storage: se mostrará de nuevo en la próxima visita, sin más */
  }
}

// Pantalla de carga inicial: mínimo 3 s, pero no sale hasta que el muro tenga
// datos (`ready`). Una vez por sesión; saltable con botón, click o tecla.
export default function Splash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(() => !seenThisSession())
  const [minElapsed, setMinElapsed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [numFuentes, setNumFuentes] = useState<number | null>(null)

  const leave = useCallback(() => {
    setLeaving((already) => {
      if (already) return already
      markSeen()
      window.setTimeout(() => setVisible(false), EXIT_MS)
      return true
    })
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => setMinElapsed(true), MIN_MS)
    return () => window.clearTimeout(t)
  }, [visible])

  useEffect(() => {
    if (visible && minElapsed && ready) leave()
  }, [visible, minElapsed, ready, leave])

  useEffect(() => {
    if (!visible) return
    fetchNumFuentes().then(setNumFuentes).catch(() => setNumFuentes(null))
    const onKey = () => leave()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, leave])

  if (!visible) return null

  return (
    <div className={`pw-splash${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label="Bienvenida a LyAi Prensa" onClick={leave}>
      <div className="pw-splash-top">LyAi · observatorio de prensa</div>
      <div className="pw-splash-rule" />
      <h1 className="pw-splash-word" aria-label="Prensa">
        {'PRENSA'.split('').map((ch, i) => (
          <span key={i} style={{ ['--i' as string]: i }}>{ch}</span>
        ))}
      </h1>
      <div className="pw-splash-rule pw-splash-rule-b" />
      <div className="pw-splash-lines">
        <p style={{ ['--i' as string]: 0 }}>Todos los medios españoles, <b>en un solo muro</b></p>
        <p style={{ ['--i' as string]: 1 }}>Y una pregunta: <em>¿cuentan lo mismo del mismo hecho?</em></p>
        <p style={{ ['--i' as string]: 2 }}>Cuando dos medios se contradicen, <b>lo señalamos</b></p>
      </div>
      {numFuentes !== null && (
        <div className="pw-splash-stats">
          <div><b>{numFuentes}</b>medios</div>
        </div>
      )}
      <div className="pw-splash-hint">desliza · click en una card</div>
      <button className="pw-splash-skip" onClick={(e) => { e.stopPropagation(); leave() }}>entrar →</button>
      <div className="pw-splash-progress" />
    </div>
  )
}
