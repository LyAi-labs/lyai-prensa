import { useCallback, useState } from 'react'
import WallGL from './components/WallGL'
import Splash from './components/card/Splash'

export default function App() {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <>
      <WallGL onReady={onReady} />
      <Splash ready={ready} />
    </>
  )
}
