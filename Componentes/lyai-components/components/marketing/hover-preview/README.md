# Hover Preview

Componente interactivo que muestra tarjetas flotantes de previsualización (*cursor-following preview card*) al posicionar el cursor sobre enlaces de texto clave.

- **Autor original:** [Le Thanh (@minhxthanh)](https://21st.dev/@minhxthanh)
- **Referencia upstream:** [21st.dev/@minhxthanh/components/hover-preview](https://21st.dev/@minhxthanh/components/hover-preview)
- **Stack:** React 18+, TypeScript, CSS encapsulado / Tailwind compatible

---

## Características

- **Precarga en memoria:** Las imágenes se instancian al montar el componente vía `new Image()` para eliminar parpadeos de carga en el primer hover.
- **Detección de bordes (Viewport Collision Detection):** Ajuste automático en ejes X e Y (`clientX`, `clientY`) evitando que la tarjeta quede oculta fuera del viewport.
- **Suavizado y aceleración GPU:** Transiciones cúbicas `cubic-bezier(0.34, 1.56, 0.64, 1)` con propiedad `will-change: transform, opacity`.
- **Filtros visuales:** Backdrop-filter blur, ruido SVG y resplandor radial dinámico (*ambient glow*).

---

## Archivos

- [`hover-preview.tsx`](file:///C:/lyai-components/components/hover-preview/hover-preview.tsx): Lógica del hook y componentes `HoverLink`, `PreviewCard` y `HoverPreview`.
- [`demo.tsx`](file:///C:/lyai-components/components/hover-preview/demo.tsx): Ejemplo de implementación directa.
