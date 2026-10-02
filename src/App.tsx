import { useCallback, useState } from 'react'
import ParallaxWall from './components/parallax/ParallaxWall'
import Splash from './components/card/Splash'

// Rama feature/muro-parallax-unfurling = versión normal + muro parallax.
// Las cards, el splash y los gestos son los compartidos de components/card/;
// lo único distinto es el muro (galería DOM inclinada en 3D en vez de WebGL).
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
