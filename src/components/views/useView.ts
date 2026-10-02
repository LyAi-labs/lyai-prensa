import { useState } from 'react'

// Vista activa (muro / línea de tiempo). La línea de tiempo es solo una
// opción: NO se recuerda entre visitas, siempre se entra por la vista
// predeterminada (`fallback`).
export function useView<T extends string>(fallback: T): [T, (v: T) => void] {
  return useState<T>(fallback)
}
