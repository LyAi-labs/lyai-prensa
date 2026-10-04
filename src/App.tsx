import { useCallback, useState } from 'react'
import WallGL from './components/WallGL'
import Splash from './components/card/Splash'
import TimelineView from './components/views/TimelineView'
import { ViewSwitch } from './shared/components/view-switch'
import DeploySwitch from './components/DeploySwitch'

// Vista predeterminada: el muro 3D. La línea de tiempo es solo una opción
// (selector arriba) y no se recuerda entre visitas.
type View = 'muro' | 'tiempo'

export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [view, setView] = useState<View>('muro')
  return (
    <>
      {view === 'muro' ? <WallGL key="muro" onReady={onReady} /> : <TimelineView key="tiempo" onReady={onReady} />}
      <ViewSwitch
        value={view}
        onChange={setView}
        options={[
          { id: 'muro', label: 'Muro 3D', icon: 'grid' },
          { id: 'tiempo', label: 'Línea de tiempo', icon: 'timeline' },
        ]}
      />
      <DeploySwitch />
      <Splash ready={ready} />
    </>
  )
}
