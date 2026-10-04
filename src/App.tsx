import { useCallback, useState } from 'react'
import BentoWall from './components/bento/BentoWall'
import Splash from './components/card/Splash'
import TimelineView from './components/views/TimelineView'
import ParallaxGallery from './components/parallax3/ParallaxGallery'
import { ViewSwitch } from './shared/components/view-switch'
import DeploySwitch from './components/DeploySwitch'

// v2 = versión normal + muro bento horizontal (en vez del muro WebGL). Las
// cards, el splash y los gestos son los de components/card/ (sobre lyai-shared);
// la línea de tiempo (components/views/) es la vista alternativa: solo una
// opción, la predeterminada es SIEMPRE el muro y no se recuerda la elección.
//
// v3 (2026-10-02, dev-xplain 2026-10-02-2315, "aplica"): tercera vista —
// galería parallax 3D (components/parallax3/), adaptada del original de
// 21st.dev archivado en Componentes/lyai-components/. Aditiva: no cambia cuál
// es la vista por defecto (sigue siendo el muro).
type View = 'muro' | 'tiempo' | 'parallax'

// view-switch (lyai-shared) solo trae 'grid'/'timeline' de serie — este icono
// se pasa como ReactNode en vez de tocar el componente compartido.
const parallaxIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7l9-4 9 4-9 4-9-4Z" />
    <path d="M3 12l9 4 9-4" />
    <path d="M3 17l9 4 9-4" />
  </svg>
)

export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [view, setView] = useState<View>('muro')
  return (
    <>
      {view === 'muro' ? (
        <BentoWall key="muro" onReady={onReady} />
      ) : view === 'tiempo' ? (
        <TimelineView key="tiempo" onReady={onReady} />
      ) : (
        <ParallaxGallery key="parallax" onReady={onReady} />
      )}
      <ViewSwitch
        value={view}
        onChange={setView}
        options={[
          { id: 'muro', label: 'Muro', icon: 'grid' },
          { id: 'tiempo', label: 'Línea de tiempo', icon: 'timeline' },
          { id: 'parallax', label: 'Parallax', icon: parallaxIcon },
        ]}
      />
      <DeploySwitch />
      <Splash ready={ready} />
    </>
  )
}
