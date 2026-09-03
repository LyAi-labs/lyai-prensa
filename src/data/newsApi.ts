// Cliente de la API real (ver api/main.py) + adaptación al shape que
// consume WallGL.tsx. Sustituye a sampleNews.ts como fuente de datos;
// sampleNews.ts se mantiene como fallback si la API no responde (ver
// WallGL.tsx), así el muro nunca se queda en blanco.

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export type Contradiccion = {
  id: string
  noticiaContrariaId: string
  fuenteContraria: string
  tema: string
  intensidad: number
  razonamiento: string
}

export type NewsItem = {
  id: string
  source: string
  sourceColor: string
  headline: string
  summary: string
  publishedAt: string
  contradicciones: Contradiccion[]
}

type ApiClaim = {
  sujeto: string
  predicado: string
  objeto: string
}

type ApiContradiccion = {
  id: string
  tema: string
  intensidad: number
  razonamiento: string | null
  noticia_contraria_id: string
  fuente_contraria: string
  claim_propio: ApiClaim
  claim_contrario: ApiClaim
}

type ApiNoticia = {
  id: string
  titular: string
  descripcion: string
  enlace: string
  publicada_en: string
  fuente_nombre: string
  fuente_color: string
  fuente_slug: string
  intensidad_contradiccion: number
  eje_z: number
  contradicciones: ApiContradiccion[]
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// Mismo formato que usaba sampleNews.ts, para que el estilo visual no
// cambie al pasar de mock a datos reales.
function formatPublishedAt(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mapNoticia(n: ApiNoticia): NewsItem {
  return {
    id: n.id,
    source: n.fuente_nombre,
    sourceColor: n.fuente_color,
    headline: n.titular,
    summary: n.descripcion,
    publishedAt: formatPublishedAt(n.publicada_en),
    contradicciones: n.contradicciones.map((c) => ({
      id: c.id,
      noticiaContrariaId: c.noticia_contraria_id,
      fuenteContraria: c.fuente_contraria,
      tema: c.tema,
      intensidad: c.intensidad,
      razonamiento: c.razonamiento ?? '',
    })),
  }
}

export async function fetchNoticias(limit = 200): Promise<NewsItem[]> {
  const res = await fetch(`${API_BASE}/noticias?limit=${limit}`)
  if (!res.ok) throw new Error(`API /noticias respondió ${res.status}`)
  const data: ApiNoticia[] = await res.json()
  return data.map(mapNoticia)
}
