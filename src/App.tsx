import { useCallback, useState } from 'react'
import BentoWall from './components/bento/BentoWall'
import Splash from './components/card/Splash'
import TimelineView from './components/views/TimelineView'
import ViewSwitch from './components/views/ViewSwitch'
import { useView } from './components/views/useView'

// v2 = versión normal + muro bento horizontal (en vez del muro WebGL). Las
// cards, el splash y los gestos son los compartidos de components/card/; la
// línea de tiempo (components/views/) es la vista alternativa.
type View = 'muro' | 'tiempo'

export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [view, setView] = useView<View>('muro')
  return (
    <>
      {view === 'muro' ? <BentoWall key="muro" onReady={onReady} /> : <TimelineView key="tiempo" onReady={onReady} />}
      <ViewSwitch
        value={view}
        onChange={setView}
        options={[
          { id: 'muro', label: 'Muro', icon: 'grid' },
          { id: 'tiempo', label: 'Línea de tiempo', icon: 'timeline' },
        ]}
      />
      <Splash ready={ready} />
    </>
  )
}
