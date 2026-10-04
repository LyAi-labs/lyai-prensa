export type NewsItem = {
  id: string
  source: string
  sourceColor: string
  headline: string
  summary: string
  publishedAt: string
  contradiction?: {
    counterSource: string
    note: string
  }
}

const SOURCES: { name: string; color: string }[] = [
  { name: 'El País', color: '#c8102e' },
  { name: 'El Mundo', color: '#0a3d62' },
  { name: 'ABC', color: '#e30613' },
  { name: 'La Vanguardia', color: '#1f3a5f' },
  { name: 'El Confidencial', color: '#222222' },
  { name: 'eldiario.es', color: '#e85a4f' },
  { name: 'Público', color: '#d62828' },
  { name: '20 Minutos', color: '#00853e' },
  { name: 'La Razón', color: '#0033a0' },
  { name: 'ARA', color: '#003366' },
  { name: 'Heraldo de Aragón', color: '#a32035' },
  { name: 'Faro de Vigo', color: '#0d6efd' },
  { name: 'Diario Vasco', color: '#005ca9' },
  { name: 'La Voz de Galicia', color: '#1a5b8e' },
  { name: 'Levante-EMV', color: '#e3000f' },
]

const HEADLINES = [
  'El Gobierno aprueba un nuevo paquete de medidas económicas',
  'La inflación se modera por debajo del 3% en abril',
  'El Constitucional rechaza el recurso sobre la amnistía',
  'Acuerdo histórico entre patronal y sindicatos',
  'La Moncloa convoca un Consejo de Ministros extraordinario',
  'Récord de turistas internacionales en el primer trimestre',
  'Aumenta el paro juvenil pese a la recuperación',
  'Bruselas valida el plan de recuperación español',
  'La crisis del sector pesquero llega al Congreso',
  'Detenidos cinco implicados en una trama de corrupción',
  'El BCE mantiene los tipos de interés sin cambios',
  'La AEMET activa alerta roja en cuatro comunidades',
  'Cataluña presenta nuevo modelo de financiación',
  'Sumar y PSOE pactan los Presupuestos Generales',
  'Vox abandona el gobierno autonómico de Aragón',
  'Polémica por las declaraciones del fiscal general',
  'Subida histórica del salario mínimo interprofesional',
  'La OCDE revisa al alza el crecimiento de España',
  'Ayuso anuncia nuevas rebajas fiscales en Madrid',
  'Sánchez se reúne con Macron en el Elíseo',
  'Fallece un periodista referente del periodismo español',
  'El Real Madrid anuncia su nueva incorporación estrella',
  'El precio de la luz cae a mínimos del año',
  'Investigación abierta por irregularidades en contratos sanitarios',
  'Se confirma el primer caso de la nueva variante en España',
  'La Audiencia Nacional cita a declarar a varios cargos',
  'Récord histórico de la Bolsa española',
  'Convocada huelga general en el sector del transporte',
  'Reabre el debate sobre la jornada laboral de cuatro días',
  'La Reina Letizia inaugura una nueva sede cultural',
]

const SUMMARIES = [
  'Fuentes del ministerio confirman que el nuevo plan se aplicará en las próximas semanas tras la aprobación parlamentaria.',
  'El INE publica datos que confirman la tendencia a la baja, aunque algunos analistas advierten de riesgos al alza.',
  'La decisión se ha tomado por mayoría y el voto particular discrepante apunta a posibles efectos colaterales.',
  'Los firmantes destacan el valor del diálogo social tras meses de negociaciones difíciles y bloqueos puntuales.',
  'La reunión, prevista para mañana, abordará varios asuntos urgentes incluida la situación internacional.',
  'Las cifras superan las expectativas previas y consolidan a España como uno de los principales destinos europeos.',
  'Pese a la mejora del empleo agregado, el colectivo de menores de 25 años sigue mostrando indicadores preocupantes.',
  'La Comisión Europea avala los avances pero solicita reformas adicionales en materia fiscal y energética.',
  'Los representantes del sector exigen medidas urgentes ante la caída sostenida de capturas en aguas comunitarias.',
  'La operación se ha desarrollado en varias provincias y continúa abierta a nuevas detenciones.',
]

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function formatDate(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function generateSampleNews(count: number): NewsItem[] {
  const items: NewsItem[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const src = SOURCES[i % SOURCES.length]
    const headline = HEADLINES[i % HEADLINES.length]
    const summary = SUMMARIES[i % SUMMARIES.length]
    const minutesAgo = Math.floor((count - i) * 17 + (i % 5) * 4)
    const date = new Date(now.getTime() - minutesAgo * 60_000)

    const isContradiction = i % 9 === 4 || i % 13 === 7
    const counter = SOURCES[(i + 3) % SOURCES.length]

    items.push({
      id: `news-${i}`,
      source: src.name,
      sourceColor: src.color,
      headline,
      summary,
      publishedAt: formatDate(date),
      contradiction: isContradiction
        ? {
            counterSource: counter.name,
            note: `Contradicción detectada con ${counter.name}`,
          }
        : undefined,
    })
  }
  return items
}
