import { useEffect, useState } from 'react'

const COARSE = '(pointer: coarse)'
const PORTRAIT = '(orientation: portrait)'

export default function RotateHint() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const coarse = window.matchMedia(COARSE)
    const portrait = window.matchMedia(PORTRAIT)
    const update = () => setShow(coarse.matches && portrait.matches)
    update()
    coarse.addEventListener('change', update)
    portrait.addEventListener('change', update)
    return () => {
      coarse.removeEventListener('change', update)
      portrait.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (!show) setDismissed(false)
  }, [show])

  if (!show || dismissed) return null

  return (
    <div className="rotate-hint" role="status">
      <span className="rotate-hint__icon" aria-hidden="true">⟳</span>
      <span>Gira el móvil: se ve mejor en horizontal</span>
      <button
        className="rotate-hint__close"
        aria-label="Cerrar aviso"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  )
}
