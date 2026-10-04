let decoder: HTMLTextAreaElement | null = null

// La ingesta guarda titulares con entidades HTML crudas (&#039;, &amp;…) y
// tanto canvas como React las pintan literales: se decodifican al mapear.
// textarea.innerHTML parsea como RCDATA, sin ejecutar nada.
export function decodeEntities(s: string): string {
  if (!s || !s.includes('&')) return s
  decoder ??= document.createElement('textarea')
  decoder.innerHTML = s
  return decoder.value
}
