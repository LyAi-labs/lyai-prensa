---
name: anadir-complemento
description: >-
  Añade e integra un nuevo componente o complemento visual en la aplicación LyAi Prensa.
  Soporta sincronización desde la biblioteca compartida lyai-shared (/opt/lyai/app/lyai-shared),
  instalación desde npm, importación de componentes locales (directorio Componentes/) o creación desde código/diseño.
  Activar cuando el usuario pida "añadir complemento", "agregar complemento", "instalar componente"
  o use los comandos slash /anadir-complemento o /añadir-complemento.
---

# Añadir Complemento (LyAi Prensa)

Este comando/habilidad guía al agente y al desarrollador para incorporar e integrar cualquier complemento, componente UI, shader o efecto visual dentro de la aplicación **LyAi Prensa** de manera limpia, tipada y sin romper estilos ni builds.

---

## 1. Identificación del Origen del Complemento

Determina de dónde proviene el complemento solicitado:

1. **Biblioteca Compartida `lyai-shared`** (recomendado para componentes corporativos/reutilizables):
   - Ubicación central: `/opt/lyai/app/lyai-shared/`
   - Registro: `/opt/lyai/app/lyai-shared/registry.json`
   - Comando de listado:
     ```bash
     /opt/lyai/app/lyai-shared/bin/lyai-shared-sync --list
     ```
   - Ejemplos disponibles: `components/spotlight-card`, `components/bento-grid-1`, `components/hover-preview`, `components/apple-dock`, `components/liquid-metal`, `components/command-palette`, `components/flip-card`.

2. **Paquete NPM** (librerías externas como `border-beam`, `lucide-react`, `motion`, etc.):
   - Se instala vía `npm install <paquete>`
   - Se crea una fachada re-exportable en `src/components/ui/<Nombre>.tsx`.

3. **Arsenal Local (`Componentes/`)**:
   - En `/opt/lyai/app/lyai-prensa/Componentes/` existen snippets, archivos de especificación (`Bento Grid`, `Spotlight Card`, `Nova.txt`, `lyai-components`).
   - Se refactorizan a componentes funcionales en `src/components/ui/` o `src/shared/components/`.

4. **Código / Diseño a Medida**:
   - Diseñado directamente según la petición o captura aportada por el usuario.

---

## 2. Protocolo de Incorporación

### A. Si es de `lyai-shared`:
1. Sincronizar el componente hacia `src/shared/`:
   ```bash
   /opt/lyai/app/lyai-shared/bin/lyai-shared-sync /opt/lyai/app/lyai-prensa <id-componente> --to src/shared
   ```
2. Verificar que existe `src/shared/<id-componente>/index.ts` que exporta el componente principal y sus tipos TypeScript. Si falta, crearlo:
   ```typescript
   export * from './<nombre>'
   export { default } from './<nombre>'
   ```
3. El manifiesto `src/shared/lyai-shared.manifest.json` se actualiza automáticamente con el commit y hashes.

### B. Si es un paquete NPM:
1. Instalar la dependencia en el proyecto:
   ```bash
   npm install <paquete>
   ```
2. Crear un archivo envoltorio en `src/components/ui/<NombreComponente>.tsx` para aislar imports y mantener compatibilidad:
   ```typescript
   import { Componente } from '<paquete>'
   import type { ComponenteProps } from '<paquete>'

   export type { ComponenteProps }
   export { Componente }
   export default Componente
   ```

### C. Si es un componente local o de `Componentes/`:
1. Crear el componente en `src/components/ui/<nombre>/` o `src/components/<modulo>/`.
2. Incluir TypeScript estricto, archivo `.css` modular y exportaciones limpias.

---

## 3. Pautas de Diseño y Estilos de LyAi Prensa

Al integrar el componente en las vistas de Prensa:

1. **Paleta de Color y Tema Oscuro:**
   - Fondo de aplicación: `#0b0c10` (negro azulado profundo).
   - Fondo de tarjetas/módulos: `#12151c` o `rgba(18, 21, 28, 0.75)` con `backdrop-filter: blur(12px)`.
   - Bordes: `1px solid rgba(255, 255, 255, 0.09)`.
   - Acentos:
     * Primario / Énfasis: `#00e5ff` (Cyan brillante).
     * Contradicciones / Alertas: `#ef4444` (Rojo / Rose).
     * Fuentes y medios: coloreados dinámicamente con `item.sourceColor`.

2. **Interacciones y Eventos del Puntero:**
   - En efectos de haz de luz o bordes interactivos (`::before`, `::after`), **siempre** usar `pointer-events: none` para no bloquear clics, enlaces ni botones internos.
   - En elementos con menús desplegables (`FluidDropdown`, popovers), evitar aplicar `overflow: hidden` al contenedor padre del desplegable; aplicarlo únicamente al botón o envoltorio del trigger.

---

## 4. Integración en las Vistas

Identificar el punto de montaje dentro de la aplicación:
- **Muro de Prensa (3D / Rejilla DOM):**
  * `src/components/card/NewsCard.tsx`: Cartas de noticias (anverso y reverso).
  * `src/components/card/CardOverlay.tsx`: Tarjeta expandida al hacer clic en el muro WebGL.
  * `src/components/wall/WallGL.tsx`: Lienzo Three.js.
- **Barra de Herramientas y Filtros:**
  * `src/components/toolbar/Toolbar.tsx`: Buscador, selector de fuente/sección, toggle de contradicciones.
  * `src/components/toolbar/FluidDropdown.tsx`: Desplegables animados.
- **Línea de Tiempo:**
  * `src/components/views/TimelineView.tsx`: Teselas cronológicas de historias y contradicciones.
- **Mosaico / Lista:**
  * `src/components/views/ListView.tsx`: Vista densa de noticias.

---

## 5. Verificación Obligatoria

Tras añadir e integrar el complemento:
1. Ejecutar el build de producción para comprobar TypeScript y empaquetado:
   ```bash
   npm run build
   ```
2. Verificar que no haya advertencias críticas ni errores de compilación (`tsc -b && vite build`).
3. Notificar al usuario la integración realizada, los archivos modificados y cómo probar el nuevo complemento visualmente.
