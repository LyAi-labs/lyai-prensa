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
