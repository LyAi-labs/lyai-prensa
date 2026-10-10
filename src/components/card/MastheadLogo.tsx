import { memo } from 'react'
import { parseMasthead } from './cardUtils'

type Props = {
  source: string
  sourceColor?: string
}

function MastheadLogo({ source, sourceColor }: Props) {
  const s = source.toLowerCase()

  // 1. La Verdad de Murcia
  if (s.includes('verdad') && s.includes('murcia')) {
    return (
      <div className="masthead-box masthead-verdad">
        <h2 className="masthead-title-verdad">LA VERDAD</h2>
        <span className="masthead-sub-verdad">DE MURCIA</span>
      </div>
    )
  }

  // 2. El Comercio (Asturias)
  if (s.includes('comercio')) {
    return (
      <div className="masthead-box masthead-comercio">
        <h2 className="masthead-title-comercio">EL COMERCIO</h2>
        <div className="masthead-comercio-bar">
          <div className="masthead-comercio-stripes">
            <span className="comercio-red" />
            <span className="comercio-blue" />
          </div>
          <span className="masthead-sub-comercio">ASTURIAS</span>
        </div>
      </div>
    )
  }

  // 3. El Norte de Castilla
  if (s.includes('norte') && s.includes('castilla')) {
    return (
      <div className="masthead-box masthead-norte">
        <h2 className="masthead-title-norte">El Norte</h2>
        <span className="masthead-sub-norte">DE CASTILLA</span>
      </div>
    )
  }

  // 4. ABC
  if (s === 'abc' || s.startsWith('abc')) {
    return (
      <div className="masthead-box masthead-abc">
        <h2 className="masthead-title-abc">
          AB<span className="abc-c-red">C</span>
        </h2>
      </div>
    )
  }

  // 5. El País
  if (s.includes('país') || s.includes('pais')) {
    return (
      <div className="masthead-box masthead-elpais">
        <h2 className="masthead-title-elpais">EL PAÍS</h2>
      </div>
    )
  }

  // 6. El Mundo
  if (s.includes('mundo') && !s.includes('deportivo')) {
    return (
      <div className="masthead-box masthead-elmundo">
        <h2 className="masthead-title-elmundo">
          EL <span className="elmundo-dot" /> MUNDO
        </h2>
      </div>
    )
  }

  // 7. La Vanguardia
  if (s.includes('vanguardia')) {
    return (
      <div className="masthead-box masthead-vanguardia">
        <h2 className="masthead-title-vanguardia">LA VANGUARDIA</h2>
      </div>
    )
  }

  // 8. elDiario.es
  if (s.includes('eldiario')) {
    return (
      <div className="masthead-box masthead-eldiario">
        <h2 className="masthead-title-eldiario">
          elDiario<span className="eldiario-dot">.es</span>
        </h2>
      </div>
    )
  }

  // 9. 20 Minutos
  if (s.includes('20 minutos') || s.includes('20minutos')) {
    return (
      <div className="masthead-box masthead-20minutos">
        <h2 className="masthead-title-20minutos">
          <span className="minutos-num">20</span> minutos
        </h2>
      </div>
    )
  }

  // 10. El Confidencial
  if (s.includes('confidencial')) {
    return (
      <div className="masthead-box masthead-confidencial">
        <h2 className="masthead-title-confidencial">El Confidencial</h2>
      </div>
    )
  }

  // 11. Negocios TV
  if (s.includes('negocios')) {
    return (
      <div className="masthead-box masthead-negocios">
        <h2 className="masthead-title-negocios">
          NEGOCIOS <span className="negocios-tv-badge">TV</span>
        </h2>
      </div>
    )
  }

  // 12. Generic / Regional Newspapers fallback
  const { main, sub } = parseMasthead(source)
  return (
    <div className="masthead-box masthead-generic">
      <h2 className="masthead-title-generic" style={sourceColor ? { color: sourceColor } : undefined}>{main}</h2>
      {sub && <span className="masthead-sub-generic">{sub}</span>}
    </div>
  )
}

export default memo(MastheadLogo)
