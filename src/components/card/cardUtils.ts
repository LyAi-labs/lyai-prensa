// Rojo >0.7 (contradicción fuerte), ámbar 0.4-0.7, amarillo <0.4 — mismos
// umbrales que el muro anterior (sin validar contra volumen real).
export function contraColor(intensidad: number): string {
  if (intensidad > 0.7) return '#ef4444'
  if (intensidad > 0.4) return '#f59e0b'
  return '#eab308'
}

export function hexToRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '99, 102, 241'
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
}

// Los colores de medio (30 de 82 son rojizos) tienen contraste 1,8–3,9 sobre
// el fondo de la card: se aclaran mezclándolos con blanco hasta ser legibles.
export function legible(hex: string, t = 0.5): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return '#e6eaf0'
  const mix = (h: string) => Math.round(parseInt(h, 16) * (1 - t) + 255 * t)
  return `rgb(${mix(m[1])}, ${mix(m[2])}, ${mix(m[3])})`
}

const ARTICULOS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y'])

export function iniciales(nombre: string): string {
  if (nombre.toLowerCase() === 'abc') return 'abc'
  const palabras = nombre
    .replace(/\(.*?\)/g, '')
    .split(/[\s.]+/)
    .filter((p) => p && !ARTICULOS.has(p.toLowerCase()))
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase()
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
}

const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

// newsApi formatea la fecha como "DD/MM HH:MM" → "29 SEP · 23:48".
export function fechaCorta(publishedAt: string): { dia: string; hora: string } {
  const m = /^(\d{2})\/(\d{2}) (\d{2}:\d{2})$/.exec(publishedAt)
  if (!m) return { dia: publishedAt, hora: '' }
  return { dia: `${m[1]} ${MESES_CORTOS[parseInt(m[2], 10) - 1] ?? m[2]}`, hora: m[3] }
}

export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Clave de «misma historia»: titular normalizado (sin tildes ni signos).
export function storyKey(headline: string): string {
  return headline
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Descompone el nombre del medio en cabecera principal y subtítulo (ej: "LA VERDAD" y "DE MURCIA")
export function parseMasthead(source: string): { main: string; sub: string } {
  const m = source.match(/^(.+?)(?:\s+(?:de|del|-|\()\s*(.+?)\)?$)/i)
  if (m) {
    const main = m[1].trim().toUpperCase()
    const rawSub = m[2].trim().replace(/\)$/, '').toUpperCase()
    let sub = rawSub
    if (!source.includes('(') && !source.includes('-')) {
      sub = (source.toLowerCase().includes(' del ') ? 'DEL ' : 'DE ') + rawSub
    }
    return { main, sub }
  }
  return { main: source.toUpperCase(), sub: '' }
}

export type SeccionInfo = {
  text: string
  isRed?: boolean
}

export function detectSeccion(enlace: string = '', source: string = '', headline: string = ''): SeccionInfo {
  const url = (enlace || '').toLowerCase()
  const head = (headline || '').toLowerCase()
  const src = (source || '').toLowerCase()

  // Deportes (rojo si es ABC, como en el mockup)
  if (
    url.includes('/deportes') ||
    url.includes('/deporte') ||
    url.includes('/futbol') ||
    url.includes('/baloncesto') ||
    head.includes('copa del rey') ||
    head.includes('champions') ||
    head.includes('nations league') ||
    head.includes('fútbol') ||
    head.includes('partido') ||
    head.includes('derbi') ||
    src.includes('marca') ||
    src.includes('as') ||
    src.includes('sport') ||
    src.includes('mundo deportivo')
  ) {
    return { text: 'DEPORTES', isRed: src.includes('abc') }
  }

  // Cultura
  if (
    url.includes('/cultura') ||
    url.includes('/libros') ||
    url.includes('/ocio') ||
    head.includes('libro') ||
    head.includes('escritor') ||
    head.includes('novela') ||
    head.includes('poesía') ||
    head.includes('museo') ||
    head.includes('teatro') ||
    head.includes('cine') ||
    (head.includes('premio') && (head.includes('liter') || head.includes('novela')))
  ) {
    return { text: 'CULTURA' }
  }

  // Sociedad / Gala
  if (
    url.includes('/sociedad') ||
    url.includes('/gala') ||
    url.includes('/gente') ||
    url.includes('/sucesos') ||
    head.includes('gala') ||
    head.includes('premios')
  ) {
    return { text: head.includes('gala') ? 'SOCIEDAD / GALA' : 'SOCIEDAD' }
  }

  // Política / Regional
  if (
    url.includes('/politica') ||
    url.includes('/espana') ||
    head.includes('partidos') ||
    head.includes('elecciones') ||
    head.includes('gobierno') ||
    head.includes('candidaturas') ||
    head.includes('congreso') ||
    head.includes('senado') ||
    head.includes('ministr') ||
    head.includes('sánchez') ||
    head.includes('feijóo') ||
    head.includes('voto')
  ) {
    if (
      src.includes('murcia') ||
      src.includes('asturias') ||
      src.includes('castilla') ||
      src.includes('galicia') ||
      src.includes('andalucía') ||
      src.includes('sevilla') ||
      src.includes('comercio') ||
      src.includes('verdad') ||
      src.includes('norte')
    ) {
      return { text: 'POLÍTICA / REGIONAL' }
    }
    return { text: 'POLÍTICA' }
  }

  // Economía
  if (
    src.includes('negocios') ||
    url.includes('/economia') ||
    url.includes('/empresas') ||
    url.includes('/finanzas') ||
    url.includes('/cincodias') ||
    head.includes('pib') ||
    head.includes('inflación') ||
    head.includes('empleo') ||
    head.includes('bolsa') ||
    head.includes('ibex') ||
    head.includes('cripto') ||
    head.includes('bitcoin')
  ) {
    return { text: 'ECONOMÍA' }
  }

  // Internacional
  if (url.includes('/internacional') || url.includes('/mundo') || head.includes('ucrania') || head.includes('eeuu') || head.includes('gaza')) {
    return { text: 'INTERNACIONAL' }
  }

  // Tecnología
  if (url.includes('/tecnologia') || url.includes('/ciencia') || head.includes('inteligencia artificial') || head.includes('apple') || head.includes('google')) {
    return { text: 'TECNOLOGÍA' }
  }

  // Opinión
  if (url.includes('/opinion') || url.includes('/editorial') || url.includes('/columnas') || url.includes('/tribuna')) {
    return { text: 'OPINIÓN' }
  }

  // Regional por cabecera
  if (
    src.includes('murcia') ||
    src.includes('asturias') ||
    src.includes('castilla') ||
    src.includes('sevilla') ||
    src.includes('málaga') ||
    src.includes('cádiz') ||
    src.includes('córdoba') ||
    src.includes('granada') ||
    src.includes('huelva') ||
    src.includes('norte') ||
    src.includes('comercio') ||
    src.includes('verdad')
  ) {
    return { text: 'ACTUALIDAD REGIONAL' }
  }

  return { text: 'ACTUALIDAD' }
}
