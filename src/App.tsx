import { useCallback, useState } from 'react'
import WallGL from './components/WallGL'
import Splash from './components/card/Splash'
import TimelineView from './components/views/TimelineView'
import InstallPrompt from './components/pwa/InstallPrompt'

// Vista predeterminada: el muro 3D. La línea de tiempo es solo una opción
// (selector en el FloatingDock superior) y no se recuerda entre visitas.
type View = 'muro' | 'tiempo'

export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [view, setView] = useState<View>('muro')
  return (
    <>
      {view === 'muro' ? (
        <WallGL key="muro" onReady={onReady} view={view} onViewChange={setView} />
      ) : (
        <TimelineView key="tiempo" onReady={onReady} view={view} onViewChange={setView} />
      )}
      <InstallPrompt />
      <Splash ready={ready} />
    </>
  )
}
