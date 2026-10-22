import { useEffect, useState } from 'react'
import { fetchNumFuentes } from '../../data/newsApi'
import { SplashScreen } from '../../shared/components/splash-screen'

const STORAGE_KEY = 'prensa-splash-visto'

// Pantalla de carga de prensa: textos propios sobre el componente compartido.
export default function Splash({ ready }: { ready: boolean }) {
  const [numFuentes, setNumFuentes] = useState<number | null>(null)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return // ya vista: no hace falta la cifra
    } catch {
      /* sin storage: se pide igualmente */
    }
    fetchNumFuentes().then(setNumFuentes).catch(() => setNumFuentes(null))
  }, [])

  return (
    <SplashScreen
      ready={ready}
      storageKey={STORAGE_KEY}
      ariaLabel="Bienvenida a LyAi Prensa"
      eyebrow="LyAi · observatorio de prensa"
      word="PRENSA"
      lines={[
        <>Todos los medios españoles, <b>en un solo muro</b></>,
        <>Y una pregunta: <em>¿cuentan lo mismo del mismo hecho?</em></>,
        <>Cuando dos medios se contradicen, <b>lo señalamos</b></>,
      ]}
      stats={numFuentes !== null ? [{ value: numFuentes, label: 'medios' }] : []}
      hint="desliza · click en una card"
    />
  )
}
