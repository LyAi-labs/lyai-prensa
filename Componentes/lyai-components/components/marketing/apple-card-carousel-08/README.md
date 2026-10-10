# Apple Card Carousel (carousel-08)

Tira horizontal de cards tipo Apple (estilo "Get to know shadcnspace"): cards verticales con
foto a sangre completa, categoría + titular en la esquina superior y un botón circular de
flecha (↗) abajo a la derecha que gira 45° al hover. Arrastre libre (`dragFree`) vía Embla
Carousel, con flechas prev/next abajo a la derecha que se deshabilitan en los extremos.

- **Referencia upstream:** 21st.dev, slug `carousel-08` (el snippet entregado no incluye handle
  de autor — no se ha podido confirmar el `@usuario` original).
- **Categoría:** `marketing`
- **Stack:** React 18+ (`"use client"`), TypeScript, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com/)
  (`Button`, `Carousel` sobre [Embla Carousel](https://www.embla-carousel.com/)), `lucide-react`,
  `class-variance-authority`, `@radix-ui/react-slot`.

---

## Origen de esta copia

Código **exactamente como lo entrega 21st.dev** al pedir la integración (sin adaptar a ningún
proyecto todavía), junto con el [prompt de integración original](./PROMPT.md) que 21st.dev genera
para pegarlo en un agente de código (instrucciones de shadcn/Tailwind/TypeScript, dependencias
NPM, pasos de integración).

A diferencia de otros componentes de este catálogo, este trae sus **dependencias shadcn** (que el
propio prompt pide copiar aparte, en `/components/ui/`) — se guardan en [`shadcn/`](./shadcn/)
dentro de esta misma carpeta para que el componente quede autocontenido, en vez de dispersarlas
por un `components/ui/` global que este repo todavía no tiene.

## Características

- **Cards verticales a sangre completa** (`w-70 h-115` hasta `lg:w-92.5 lg:h-150`): foto de fondo
  absoluta, overlay de texto (categoría + titular en dos tamaños) y un CTA circular blanco que
  gira 45° al `hover` (`group-hover:rotate-45`).
- **Arrastre libre** (`opts={{ align: "start", dragFree: true }}` de Embla) — no hace snap a cada
  card, se desliza como una tira física.
- **Controles prev/next** fuera del carrusel (abajo a la derecha), con `disabled` automático en
  los extremos vía el estado `canScrollPrev`/`canScrollNext` de la API de Embla.
- Cabecera simple (`<h2>`) encima de la tira — en el original dice "Get to know shadcnspace".

## Archivos

- [`carousel-08.tsx`](./carousel-08.tsx): componente completo (`AppleCardCarousel`, exportado por
  defecto).
- [`demo.tsx`](./demo.tsx): uso directo tal como lo genera 21st.dev (import desde
  `@/components/ui/carousel-08` — ruta shadcn, hay que ajustarla al integrarlo en un proyecto que
  no siga esa convención).
- [`shadcn/button.tsx`](./shadcn/button.tsx), [`shadcn/carousel.tsx`](./shadcn/carousel.tsx),
  [`shadcn/card.tsx`](./shadcn/card.tsx): primitivos shadcn/ui de los que depende (el componente en
  sí solo usa `Button` y `Carousel`/`CarouselContent`/`CarouselItem`; `card.tsx` se incluye porque
  el prompt original lo entregó como dependencia, aunque `carousel-08.tsx` no lo importa).
- [`PROMPT.md`](./PROMPT.md): prompt de integración original de 21st.dev, sin editar.

## Dependencias para integrar

```bash
npm install lucide-react @radix-ui/react-slot class-variance-authority embla-carousel-react
```

Requiere Tailwind CSS con los tokens de color de shadcn (`border`, `background`, `foreground`,
`card`, `card-foreground`, `muted-foreground`, `primary`, `destructive`, `secondary`, `accent`,
`ring`, etc. — normalmente los que genera `shadcn init`) y una función `cn()` en `@/lib/utils`
(típicamente `clsx` + `tailwind-merge`), que el prompt original asume pero no incluye.
