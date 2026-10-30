import { useEffect, useState } from 'react'
import { isStandalone, onInstallableChange, promptPWAInstall } from '../../pwa'
import './installPrompt.css'

const DISMISS_KEY = 'lyai-prensa-pwa-dismissed'

export default function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isIosGuide, setIsIosGuide] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const isIos =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream

  const isAndroid =
    typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)

  useEffect(() => {
    // Si ya está ejecutándose como PWA instalada, nunca mostrar nada
    if (isStandalone()) {
      setInstalled(true)
      return
    }

    // Comprobar si el usuario la cerró en esta sesión
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') {
        setIsDismissed(true)
      }
    } catch {
      /* ignore */
    }

    const unsubscribe = onInstallableChange((installable) => {
      setCanInstall(installable)
    })

    // Retardo sutil de 1.2s para que la app cargue y se muestre automáticamente
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 1200)

    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  if (installed || !isVisible) {
    return null
  }

  // Manejar click en "Instalar Ahora"
  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptPWAInstall()
      if (accepted) {
        setInstalled(true)
      }
    } else if (isIos) {
      setIsIosGuide(true)
    } else {
      // Fallback si el navegador no ha disparado el prompt nativo
      setIsIosGuide(true)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* 1. Modal / Banner Automático Prominente */}
      {!isDismissed && (
        <div className="pwa-auto-banner-overlay" onClick={handleDismiss}>
          <div className="pwa-auto-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pwa-auto-close"
              onClick={handleDismiss}
              aria-label="Cerrar aviso de instalación"
            >
              ✕
            </button>

            <div className="pwa-auto-body">
              <div className="pwa-auto-icon-wrap">
                <img
                  src="/icon-192.png"
                  alt="LyAi Prensa"
                  className="pwa-auto-icon"
                />
              </div>

              <div className="pwa-auto-text">
                <div className="pwa-auto-badge">PWA · APLICACIÓN OFICIAL</div>
                <h2 className="pwa-auto-title">Instalar LyAi Prensa</h2>
                <p className="pwa-auto-desc">
                  Instala la app en tu dispositivo para navegar a <b>pantalla completa</b>,
                  con mayor fluidez en el muro 3D y <b>acceso sin conexión</b>.
                </p>

                <div className="pwa-auto-features">
                  <span className="pwa-feat-tag">⚡ Carga instantánea</span>
                  <span className="pwa-feat-tag">📡 Noticias sin conexión</span>
                  <span className="pwa-feat-tag">📱 Cero barras de navegador</span>
                </div>
              </div>
            </div>

            <div className="pwa-auto-actions">
              <button
                type="button"
                className="pwa-btn-primary"
                onClick={handleInstallClick}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pwa-btn-icon"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Instalar ahora
              </button>
              <button
                type="button"
                className="pwa-btn-secondary"
                onClick={handleDismiss}
              >
                Continuar en el navegador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Botón flotante persistente si se cerró el modal automático */}
      {isDismissed && (
        <div className="pwa-install-wrap">
          <button
            type="button"
            className="pwa-install-btn"
            onClick={() => {
              setIsDismissed(false)
              if (canInstall) {
                promptPWAInstall()
              } else {
                setIsIosGuide(true)
              }
            }}
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
      )}

      {/* 3. Guía interactiva paso a paso para iOS / Navegadores sin prompt nativo */}
      {isIosGuide && (
        <div className="pwa-ios-modal" onClick={() => setIsIosGuide(false)}>
          <div className="pwa-ios-card" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <h3>
              {isIos
                ? 'Instalar en tu iPhone o iPad'
                : isAndroid
                  ? 'Instalar en tu Android'
                  : 'Cómo instalar la aplicación'}
            </h3>
              <button
                type="button"
                className="pwa-ios-close"
                onClick={() => setIsIosGuide(false)}
              >
                ✕
              </button>
            </div>
            <p className="pwa-ios-desc">
              {isIos
                ? 'Sigue estos sencillos pasos desde Safari:'
                : isAndroid
                  ? 'Chrome aún no ha ofrecido el instalador automático — hazlo a mano desde su menú:'
                  : 'Puedes añadir la aplicación a tu escritorio o pantalla de inicio:'}
            </p>
            <ol className="pwa-ios-steps">
              {isIos ? (
                <>
                  <li>
                    Pulsa el icono de <b>Compartir</b> (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    ) en la barra inferior de Safari.
                  </li>
                  <li>
                    Desplaza hacia abajo y selecciona <b>«Añadir a pantalla de inicio»</b> (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    ).
                  </li>
                  <li>
                    Pulsa <b>«Añadir»</b> arriba a la derecha. ¡Listo!
                  </li>
                </>
              ) : isAndroid ? (
                <>
                  <li>
                    Pulsa los <b>tres puntos ⋮</b> arriba a la derecha de Chrome.
                  </li>
                  <li>
                    Elige <b>«Instalar aplicación»</b> (o «Añadir a pantalla de inicio» si no aparece
                    esa opción).
                  </li>
                  <li>Confirma con «Instalar». ¡Listo!</li>
                </>
              ) : (
                <>
                  <li>
                    Haz clic en el icono de instalación (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    ) en la barra de direcciones de tu navegador.
                  </li>
                  <li>
                    Confirma haciendo clic en <b>«Instalar»</b>.
                  </li>
                </>
              )}
            </ol>
            <button
              type="button"
              className="pwa-ios-btn"
              onClick={() => setIsIosGuide(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
