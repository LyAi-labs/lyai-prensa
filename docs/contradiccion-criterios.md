# Criterios para etiquetar contradicciones

Documento de referencia para etiquetar pares de claims en `prensa.eval_pares`.
La calidad del detector depende directamente de este criterio: si aquí hay
ambigüedad, los falsos positivos en producción son inevitables.

## Definición operativa

Una **contradicción** es un par de claims cuyo contenido factual no puede ser
simultáneamente verdadero referido al mismo hecho del mundo. Si para que ambos
sean ciertos hace falta forzar interpretaciones, no es contradicción.

Trabajamos con cuatro etiquetas (columna `label` en `eval_pares`):

| Label             | Cuándo aplicar                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| `contradiccion`   | Los claims son mutuamente excluyentes sobre el mismo hecho.             |
| `coincidencia`    | Los claims dicen lo mismo, expresado distinto.                          |
| `no_relacionado`  | Los claims hablan de cosas distintas (aunque compartan tema general).   |
| `ambiguo`         | Hay solapamiento parcial; no se puede decidir sin contexto extra.       |

## Qué SÍ cuenta como contradicción

1. **Datos numéricos opuestos sobre el mismo hecho.**
   - C1: "El SMI sube un 5%." / C2: "El SMI sube un 7%."
   - → `contradiccion`.

2. **Eventos descritos como mutuamente excluyentes.**
   - C1: "El acuerdo se firmó el lunes." / C2: "El acuerdo se firmó el viernes."
   - → `contradiccion`.

3. **Atribuciones de autoría/responsabilidad incompatibles.**
   - C1: "La medida la propuso Hacienda." / C2: "La medida la propuso Trabajo."
   - → `contradiccion`.

4. **Fuente original (no el medio) reportada con contenido literal distinto.**
   - C1: Sánchez dijo: "no habrá amnistía". / C2: Sánchez dijo: "habrá amnistía".
   - → `contradiccion`.

## Qué NO cuenta como contradicción

1. **Framing / encuadre.** Distinta interpretación del mismo hecho factual sin
   afirmar valores incompatibles.
   - C1: "El gobierno saca pecho con los datos del paro."
     C2: "El paro sigue siendo un lastre para el gobierno."
   - → `no_relacionado` o `ambiguo`. No es contradicción.

2. **Opinión / editorial.** Si el claim es opinión (`factual = false`), por
   defecto **no** se etiqueta como `contradiccion`, salvo que sea una
   afirmación sobre un hecho verificable disfrazada de opinión.

3. **Evolución temporal.** Una noticia de las 9:00 dice X, otra de las 14:00
   dice Y porque la situación cambió. Es actualización, no contradicción.
   - → `no_relacionado`.

4. **Citas parciales del mismo evento.** Un medio recoge la frase A del
   discurso, otro recoge la frase B. Que no aparezca A en el segundo no
   significa que la niegue.
   - → `no_relacionado`.

5. **Diferencias de redondeo / aproximación cuando no hay disputa real.**
   - C1: "Asistieron unas 10.000 personas." / C2: "Asistieron cerca de 11.000."
   - → `coincidencia` (margen razonable).
   - PERO si la diferencia es flagrante (10.000 vs 100.000) → `contradiccion`.

## Casos límite

- **Mismo medio, distinto día.** Si un medio se contradice consigo mismo, sí
  cuenta. Es información útil.
- **Cifras oficiales discrepantes.** Si los medios reportan fielmente cifras
  de organismos distintos (INE vs Ministerio), no es contradicción de los
  medios pero sí del mundo, y nos interesa. Etiquetar `contradiccion` con
  `metadata.tipo = 'fuentes_oficiales'`.
- **Declaraciones reportadas con paráfrasis distintas.** Si el sentido es el
  mismo, `coincidencia`. Si la paráfrasis cambia el sentido, `contradiccion`
  y se documenta en `notas`.
- **Claims con condiciones implícitas distintas.** "El SMI sube un 5% en 2026"
  vs "El SMI sube un 7% (incluyendo el extra de baja temporal)" → `ambiguo`,
  no `contradiccion`.

## Procedimiento

1. Lee el par completo, incluyendo la `cita` de cada claim si está.
2. Identifica el hecho del mundo que ambos reclaman describir.
3. Pregúntate: ¿pueden ser ambos ciertos sin forzar?
   - No, claramente → `contradiccion`.
   - Sí, son lo mismo → `coincidencia`.
   - Sí, hablan de cosas distintas → `no_relacionado`.
   - No estoy seguro / depende de contexto → `ambiguo`.
4. Si etiquetas `contradiccion` o `ambiguo`, escribe en `notas` un párrafo
   corto justificando la decisión. Sirve después para validar precisión y
   refinar el prompt del juez LLM.

## Política de duda

Ante duda razonable: `ambiguo`. Es preferible perder ese par que envenenar
el eval set con un caso mal clasificado.
