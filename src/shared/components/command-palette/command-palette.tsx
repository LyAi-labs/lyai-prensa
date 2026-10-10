"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Search, type LucideIcon } from "lucide-react"
import { createPortal } from "react-dom"

export function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const

// Opened via a keyboard shortcut many times a day — entrance must read as
// instant. Tight spring, even faster exit.
const PANEL_SPRING = {
  type: "spring",
  stiffness: 560,
  damping: 40,
  mass: 0.5,
} as const

function useTouchCapable() {
  const [canTouch, setCanTouch] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia?.("(any-pointer: coarse)")
    const update = () =>
      setCanTouch(Boolean(mq?.matches) || navigator.maxTouchPoints > 0)
    update()
    mq?.addEventListener?.("change", update)
    return () => mq?.removeEventListener?.("change", update)
  }, [])
  return canTouch
}

/** Resuelve durante el render del commit en que `open` pasa a true, para que
 * la query/el cursor no sobrevivan a una reapertura. */
function useOnOpen(open: boolean, start: () => void) {
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) start()
  }
}

type Row = { id: string }

/** El resaltado (teclado o pointer) de una lista cuyas filas cambian bajo
 * ella. El cursor guarda el id de la fila, no su posición, y se descarta en
 * cuanto la query cambia — así una tecla que llegue justo tras filtrar no
 * puede ejecutar la fila equivocada. */
export function useRowCursor(rows: readonly Row[], query: string) {
  const [cursor, setCursor] = React.useState<{ id: string; query: string } | null>(null)
  const latest = React.useRef({ rows, query })
  React.useLayoutEffect(() => {
    latest.current = { rows, query }
  })

  const indexOf = (list: readonly Row[], q: string, c: typeof cursor) => {
    if (c === null || c.query !== q) return -1
    return list.findIndex((r) => r.id === c.id)
  }

  const cursorRow = indexOf(rows, query, cursor)
  if (cursor !== null && cursorRow < 0) setCursor(null)

  const moveTo = React.useCallback(
    (id: string | null) =>
      setCursor(id === null ? null : { id, query: latest.current.query }),
    [],
  )

  const moveActive = React.useCallback((direction: 1 | -1) => {
    const { rows: live, query: liveQuery } = latest.current
    const last = live.length - 1
    if (last < 0) return
    setCursor((current) => {
      const at = Math.max(indexOf(live, liveQuery, current), 0)
      const next = Math.min(Math.max(at + direction, 0), last)
      return { id: live[next].id, query: liveQuery }
    })
  }, [])

  return { activeIndex: cursorRow < 0 ? 0 : cursorRow, moveTo, moveActive }
}

type SearchableCommand = { label: string; group?: string; keywords?: string[] }

function normalize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function tokenScore(token: string, field: string) {
  const words = field.split(" ")
  if (words.includes(token)) return 100
  if (words.some((word) => word.startsWith(token))) return 80
  if (field.includes(token)) return 60
  if (token.length < 3) return 0
  for (const word of words) {
    if (word.length - token.length > 2) continue
    let matched = 0
    for (const char of word) {
      if (char === token[matched]) matched++
    }
    if (matched === token.length) return 20
  }
  return 0
}

/** Ordena por coincidencia de cada palabra de la query en label/grupo/keywords,
 * priorizando coincidencias exactas/por prefijo del label. */
function searchCommands<T extends SearchableCommand>(items: T[], query: string): T[] {
  const normalized = normalize(query)
  if (!normalized) return items
  const tokens = normalized.split(/\s+/)
  return items
    .map((item) => {
      const label = normalize(item.label)
      const fields = [label, normalize(item.group ?? ""), ...(item.keywords ?? []).map(normalize)]
      let score = label === normalized ? 10000 : label.startsWith(normalized) ? 2000 : 0
      for (const token of tokens) {
        const best = Math.max(
          ...fields.map((field, index) => {
            const match = tokenScore(token, field)
            return match ? match + (index === 0 ? 40 : 0) : 0
          }),
        )
        if (!best) return { item, score: 0 }
        score += best
      }
      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}

export type CommandItem = {
  id: string
  label: string
  group?: string
  hint?: string
  keywords?: string[]
  icon?: LucideIcon
  badge?: React.ReactNode
  onSelect: () => void
}

export interface CommandPaletteProps {
  items: CommandItem[]
  /** Abre con Cmd/Ctrl + esta tecla. Por defecto "k". */
  shortcut?: string
  placeholder?: string
  emptyMessage?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function CommandPalette({
  items,
  shortcut = "k",
  placeholder = "Escribe un comando o búsqueda…",
  emptyMessage = "Sin resultados.",
  open: controlledOpen,
  onOpenChange,
  className,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : internalOpen
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!controlled) setInternalOpen(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )

  const [query, setQuery] = React.useState("")
  // El portal solo existe en cliente; no renderiza nada durante SSR/hidratación.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const uid = React.useId()
  const reduce = useReducedMotion()
  const canTouch = useTouchCapable()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === shortcut.toLowerCase()) {
        e.preventDefault()
        setOpen(!open)
        return
      }
      if (e.key === "Escape" && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, shortcut, setOpen])

  React.useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const prevRoot = root.style.overflow
    const prevBody = document.body.style.overflow
    root.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    return () => {
      root.style.overflow = prevRoot
      document.body.style.overflow = prevBody
    }
  }, [open])

  const filtered = React.useMemo(() => searchCommands(items, query), [items, query])
  const hasIcons = React.useMemo(() => items.some((it) => it.icon), [items])

  const grouped = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    filtered.forEach((it) => {
      const g = it.group ?? "Resultados"
      const groupItems = map.get(g) ?? []
      groupItems.push(it)
      map.set(g, groupItems)
    })
    return Array.from(map.entries())
  }, [filtered])

  // El agrupado reordena la lista: todo lo que tenga que estar de acuerdo en
  // "qué fila" (resaltado, ids, Enter, scroll) lee este mismo array.
  const rows = React.useMemo(() => grouped.flatMap(([, list]) => list), [grouped])

  const { activeIndex: active, moveTo, moveActive } = useRowCursor(rows, query)

  useOnOpen(open, () => {
    setQuery("")
    moveTo(null)
  })

  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const it = rows[active]
      if (it) {
        it.onSelect()
        setOpen(false)
      }
    }
  }

  React.useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  if (!mounted) return null

  // Portal a <body>: un ancestro con transform/filter/fixed no puede atrapar
  // el overlay en su stacking context.
  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.button
          key="backdrop"
          type="button"
          aria-label="Cerrar paleta de comandos"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          onClick={() => setOpen(false)}
          className="pointer-events-auto fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
        />
      ) : null}

      {open ? (
        <div
          key="panel-layer"
          className="pointer-events-none fixed inset-x-4 bottom-4 top-[18vh] z-[100] flex items-start justify-center"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: reduce ? 0 : -8,
              scale: reduce ? 1 : 0.97,
              transition: { duration: 0.12, ease: EASE_OUT },
            }}
            transition={reduce ? { duration: 0.1 } : PANEL_SPRING}
            onKeyDown={onKeyDown}
            className={cn(
              "pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl will-change-transform",
              className,
            )}
          >
            <div className="flex items-center gap-3 border-b border-neutral-800 px-4">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={rows.length > 0 ? `${uid}-opt-${active}` : undefined}
                aria-autocomplete="list"
                className={cn(
                  "h-12 flex-1 bg-transparent text-sm text-neutral-200 placeholder:text-neutral-500 outline-none",
                  // El móvil hace zoom en un input enfocado <16px; en pointer fino 14px.
                  canTouch && "text-base",
                )}
              />
              <kbd className="hidden rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-400 sm:inline-block">
                ESC
              </kbd>
            </div>
            <div
              ref={listRef}
              id={`${uid}-list`}
              role="listbox"
              aria-label="Comandos"
              className="max-h-[60vh] overflow-y-auto overscroll-contain p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">{emptyMessage}</div>
              ) : (
                grouped.map(([group, list]) => (
                  <div key={group} className="mb-1 last:mb-0">
                    <div
                      aria-hidden
                      className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500"
                    >
                      {group}
                    </div>
                    {list.map((it) => {
                      const idx = rows.indexOf(it)
                      const isActive = idx === active
                      const Icon = it.icon
                      return (
                        <button
                          key={it.id}
                          type="button"
                          id={`${uid}-opt-${idx}`}
                          role="option"
                          aria-selected={isActive}
                          data-index={idx}
                          onMouseEnter={() => moveTo(it.id)}
                          onClick={() => {
                            it.onSelect()
                            setOpen(false)
                          }}
                          className={cn(
                            "relative isolate flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                            isActive ? "text-neutral-100" : "text-neutral-400",
                          )}
                        >
                          {isActive ? (
                            <motion.span
                              layoutId={`${uid}-active`}
                              className="absolute inset-0 z-0 rounded-md bg-neutral-800"
                              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
                            />
                          ) : null}
                          {Icon ? (
                            <Icon className="relative z-10 h-4 w-4" />
                          ) : hasIcons ? (
                            <span className="relative z-10 h-4 w-4" />
                          ) : null}
                          <span className="relative z-10 flex-1 truncate">{it.label}</span>
                          {it.badge ? <span className="relative z-10 shrink-0">{it.badge}</span> : null}
                          {it.hint ? (
                            <kbd className="relative z-10 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-400">
                              {it.hint}
                            </kbd>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
