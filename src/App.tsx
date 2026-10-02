import { useCallback, useState } from 'react'
import ParallaxWall from './components/parallax/ParallaxWall'
import Splash from './components/parallax/Splash'

// Rama feature/muro-parallax-unfurling: el muro WebGL (WallGL.tsx) se
// conserva en el repo pero ya no se monta; esta versión es la galería DOM.
export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <>
      <ParallaxWall onReady={onReady} />
      <Splash ready={ready} />
    </>
  )
}
