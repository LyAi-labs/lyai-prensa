# 3D Parallax Unfurling Gallery

Galería de imágenes en columnas con parallax 3D ligado al scroll: un banner que se expande de
`90vw/80vh` a pantalla completa y luego revela una rejilla de columnas en perspectiva
(`rotateX/Y/Z` + `translateZ`) que se endereza a medida que se avanza, con cada columna
desplazándose a su propia velocidad vertical.

- **Referencia upstream:** [21st.dev — 3d-parallax-unfurling-gallery](https://21st.dev/) (slug `3d-parallax-unfurling-gallery`; el snippet entregado por 21st.dev no incluye handle de autor — no se ha podido confirmar el `@usuario` original, a diferencia de otros componentes de este catálogo).
- **Categoría:** `marketing`
- **Stack:** React 18+ (`"use client"`), TypeScript, Tailwind CSS, [Framer Motion](https://www.framer.com/motion/) (`useScroll`, `useTransform`, `useSpring`)

---

## Origen de esta copia

Código **exactamente como lo entrega 21st.dev** al pedir la integración (sin adaptar a ningún
proyecto todavía). Se archiva aquí tal cual, antes de cualquier modificación, junto con el
[prompt de integración original](./PROMPT.md) que 21st.dev genera para pegarlo en un agente de
código (instrucciones de shadcn/Tailwind/TypeScript, dependencias NPM, pasos de integración).

Esta copia es la que inspiró inicialmente `feature/muro-parallax-unfurling` en `lyai-prensa`
(sustituida luego por `feature/muro-v2-bento`); se guarda aquí como referencia reutilizable para
cualquier vertical de LyAi, no solo prensa.

## Características

- **Scroll acoplado a un contenedor concreto** (`useScroll({ target, container })`), no a la
  ventana — pensado para incrustarse dentro de un layout con su propio scroll interno.
- **Suavizado con spring** (`useSpring`, `stiffness: 100, damping: 20, mass: 0.5`) sobre el
  progreso de scroll antes de derivar cualquier transformación.
- **Dos fases de animación:** 0–15% del scroll expande el banner contenedor (ancho/alto/radio/
  borde); 15–100% gira y traslada en 3D la rejilla de columnas (`rotateX/Y/Z`, `z`) mientras cada
  columna hace parallax vertical a velocidad distinta.
- **Máscara de sombra ambiental** (`inset shadow` en los cuatro bordes) para desvanecer la
  rejilla contra los bordes del banner en vez de recortarla en seco.
- Imágenes de ejemplo servidas desde `cdn.21st.dev` + una de Unsplash, solo para la demo.

## Archivos

- [`3d-parallax-unfurling-gallery.tsx`](./3d-parallax-unfurling-gallery.tsx): componente completo
  (`ImageCard` + `Component` por defecto).
- [`demo.tsx`](./demo.tsx): uso directo tal como lo genera 21st.dev (import desde
  `@/components/ui/3d-parallax-unfurling-gallery` — ruta shadcn, hay que ajustarla al integrarlo
  en un proyecto que no siga esa convención).
- [`PROMPT.md`](./PROMPT.md): prompt de integración original de 21st.dev, sin editar.

## Dependencias para integrar

```bash
npm install framer-motion
```

Requiere Tailwind CSS configurado (usa utilidades arbitrarias como `h-[600vh]`, `w-[22vw]`,
`shadow-[inset_...]`) y TypeScript. No depende de shadcn/ui en sí — solo asume esa convención de
rutas (`@/components/ui/...`) en el `demo.tsx` tal como lo entrega 21st.dev.
