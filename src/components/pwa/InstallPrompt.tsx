import { useEffect, useState } from 'react'
import { isStandalone, onInstallableChange, promptPWAInstall } from '../../pwa'
import './installPrompt.css'

export default function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [isIosPromptOpen, setIsIosPromptOpen] = useState(false)

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true)
      return
    }
    const unsubscribe = onInstallableChange((installable) => {
      setCanInstall(installable)
    })
    return unsubscribe
  }, [])

  if (installed) {
    return null
  }

  // Detect iOS Safari if not installable via beforeinstallprompt
  const isIos =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream

  if (!canInstall && !isIos) {
    return null
  }

  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptPWAInstall()
      if (accepted) {
        setInstalled(true)
      }
    } else if (isIos) {
      setIsIosPromptOpen((prev) => !prev)
    }
  }

  return (
    <>
      <div className="pwa-install-wrap">
        <button
          type="button"
          className="pwa-install-btn"
          onClick={handleInstallClick}
          title="Instalar aplicación en tu dispositivo"
        >
          <svg
            className="pwa-install-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="pwa-install-label">Instalar App</span>
        </button>
      </div>

      {isIosPromptOpen && (
        <div className="pwa-ios-modal" onClick={() => setIsIosPromptOpen(false)}>
          <div className="pwa-ios-card" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <h3>Instalar en tu iPhone / iPad</h3>
              <button className="pwa-ios-close" onClick={() => setIsIosPromptOpen(false)}>
                ✕
              </button>
            </div>
            <p className="pwa-ios-desc">
              Para instalar <b>LyAi Prensa</b> en tu pantalla de inicio:
            </p>
            <ol className="pwa-ios-steps">
              <li>
                Toca el botón <b>Compartir</b> (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                ) en la barra de Safari.
              </li>
              <li>
                Desplaza hacia abajo y selecciona <b>«Añadir a pantalla de inicio»</b>.
              </li>
            </ol>
            <button className="pwa-ios-btn" onClick={() => setIsIosPromptOpen(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
