// Cliente de la API real (ver api/main.py) + adaptación al shape que
// consume WallGL.tsx. Sustituye a sampleNews.ts como fuente de datos;
// sampleNews.ts se mantiene como fallback si la API no responde (ver
// WallGL.tsx), así el muro nunca se queda en blanco.

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export type Claim = {
  sujeto: string
  predicado: string
  objeto: string
}

export type Contradiccion = {
  id: string
  noticiaContrariaId: string
  fuenteContraria: string
  tema: string
  intensidad: number
  razonamiento: string
  claimPropio: Claim
  claimContrario: Claim
}

export type NewsItem = {
  id: string
  source: string
  sourceColor: string
  headline: string
  summary: string
  publishedAt: string
  enlace: string
  imagenUrl: string | null
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
  imagen_url: string | null
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
    enlace: n.enlace,
    imagenUrl: n.imagen_url,
    contradicciones: n.contradicciones.map((c) => ({
      id: c.id,
      noticiaContrariaId: c.noticia_contraria_id,
      fuenteContraria: c.fuente_contraria,
      tema: c.tema,
      intensidad: c.intensidad,
      razonamiento: c.razonamiento ?? '',
      claimPropio: c.claim_propio,
      claimContrario: c.claim_contrario,
    })),
  }
}

export async function fetchNoticias(limit = 108, offset = 0, antes?: string): Promise<NewsItem[]> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (antes) params.set('antes', antes)
  const res = await fetch(`${API_BASE}/noticias?${params}`)
  if (!res.ok) throw new Error(`API /noticias respondió ${res.status}`)
  const data: ApiNoticia[] = await res.json()
  return data.map(mapNoticia)
}

// YYYY-MM-DD de los días (en [desde, hasta)) con al menos una contradicción
// — para marcarlos en el calendario del botón "Hoy". `hasta` es exclusivo.
export async function fetchDiasContradiccion(desde: string, hasta: string): Promise<Set<string>> {
  const params = new URLSearchParams({ desde, hasta })
  const res = await fetch(`${API_BASE}/contradicciones/dias?${params}`)
  if (!res.ok) throw new Error(`API /contradicciones/dias respondió ${res.status}`)
  const data: string[] = await res.json()
  return new Set(data)
}

// Número de medios (para la pantalla de carga) — se cuenta en vivo en vez de
// hardcodear una cifra que se queda vieja.
export async function fetchNumFuentes(): Promise<number> {
  const res = await fetch(`${API_BASE}/fuentes`)
  if (!res.ok) throw new Error(`API /fuentes respondió ${res.status}`)
  const data: unknown[] = await res.json()
  return data.length
}
