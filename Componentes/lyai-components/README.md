# LyAi Components & Design Arsenal (`lyai-components`)

Repositorio centralizado de componentes de interfaz, snippets de referencia, shaders y prompts de ingeniería UI/UX para todos los proyectos y verticales de **LyAi Labs**.

---

## Estructura del Repositorio

```text
lyai-components/
├── components/          # Componentes interactivos modulares listos para producción
│   └── hover-preview/   # Componente Hover Preview (tooltip flotante reactivo)
├── prompts/             # Catálogo de prompts de UI/UX, generación y dirección de arte
└── references/          # Algoritmos, snippets de shaders GLSL, utilidades matemáticas
```

---

## Convenciones de Contribución

1. **Autonomía:** Cada componente debe ser autocontenido o especificar dependencias mínimas requeridas.
2. **Documentación:** Cada subcarpeta en `components/` debe incluir su propio `README.md` con:
   - Origen o autor original (con enlace markdown).
   - Props y API pública tipada con TypeScript.
   - Ejemplo de uso (`demo.tsx`).
3. **Determinismo:** Preferir TypeScript estricto, sin frameworks pesados ni dependencias innecesarias.
