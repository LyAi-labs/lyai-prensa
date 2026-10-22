import { ViewSwitch } from '../shared/components/view-switch'

type Deploy = 'normal' | 'v2' | 'v3'

const DEPLOYS: { id: Deploy; label: string; path: string }[] = [
  { id: 'normal', label: 'Normal', path: '/' },
  { id: 'v2', label: 'v2 · Bento', path: '/v2/' },
  { id: 'v3', label: 'v3 · Parallax', path: '/v3/' },
]

function current(): Deploy {
  const p = window.location.pathname
  if (p.startsWith('/v3')) return 'v3'
  if (p.startsWith('/v2')) return 'v2'
  return 'normal'
}

// Interruptor entre las versiones del muro desplegadas en paralelo en
// prensa.lyai.es (/, /v2/, /v3/). Son builds y contenedores distintos (no
// rutas de una misma app), así que elegir una opción navega de verdad —no
// cambia estado de React como el ViewSwitch de Muro/Línea de tiempo.
export default function DeploySwitch() {
  return (
    <ViewSwitch
      className="ls-vs-deploy"
      value={current()}
      onChange={(id) => {
        const d = DEPLOYS.find((x) => x.id === id)
        if (d && d.id !== current()) window.location.href = d.path
      }}
      options={DEPLOYS.map(({ id, label }) => ({ id, label }))}
    />
  )
}
