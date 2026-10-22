"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn, useRowCursor } from "./command-palette"

const EASE_OUT = [0.16, 1, 0.3, 1] as const

export type DropdownItem = {
  id: string
  label: string
  group?: string
  hint?: React.ReactNode
  badge?: React.ReactNode
  icon?: LucideIcon
  tone?: "default" | "warning"
  onSelect: () => void
}

export interface CommandDropdownProps {
  /** Ya filtrados/agrupados por el consumidor (viene de una API, no de una lista estática en memoria). */
  items: DropdownItem[]
  /** Controla la visibilidad; el consumidor decide cuándo abrir/cerrar (focus del input, query vacía, etc). */
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  emptyMessage?: string
  loading?: boolean
  footer?: React.ReactNode
  className?: string
}

/**
 * Variante inline/anclada de CommandPalette: sin portal, sin backdrop, sin
 * atajo global ⌘K. Para cuando los resultados vienen de una query async
 * (debounce + fetch) en vez de filtrar una lista en memoria con fuzzy match
 * — por eso no reusa `searchCommands`, solo el cursor de teclado.
 */
export function CommandDropdown({
  items,
  open,
  onOpenChange,
  query,
  emptyMessage = "Sin resultados.",
  loading = false,
  footer,
  className,
}: CommandDropdownProps) {
  const reduce = useReducedMotion()
  const uid = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)

  const grouped = React.useMemo(() => {
    const map = new Map<string, DropdownItem[]>()
    items.forEach((it) => {
      const g = it.group ?? "Resultados"
      const groupItems = map.get(g) ?? []
      groupItems.push(it)
      map.set(g, groupItems)
    })
    return Array.from(map.entries())
  }, [items])

  const { activeIndex: active, moveTo, moveActive } = useRowCursor(items, query)

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        moveActive(1)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        moveActive(-1)
      } else if (e.key === "Enter") {
        const it = items[active]
        if (it) {
          e.preventDefault()
          it.onSelect()
          onOpenChange(false)
        }
      } else if (e.key === "Escape") {
        onOpenChange(false)
      }
    },
    [open, items, active, moveActive, onOpenChange],
  )

  React.useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  return (
    <div onKeyDown={onKeyDown}>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="listbox"
            aria-label="Resultados"
            initial={{ opacity: 0, y: reduce ? 0 : -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: reduce ? 0 : -6, height: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.18, ease: EASE_OUT }}
            className={cn(
              "overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl",
              className,
            )}
          >
            <div
              ref={listRef}
              id={`${uid}-list`}
              className="max-h-[60vh] overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {loading ? (
                <div className="p-4 text-center text-xs text-neutral-500">Buscando…</div>
              ) : items.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">{emptyMessage}</div>
              ) : (
                grouped.map(([group, list]) => (
                  <div key={group} className="py-1 first:pt-2">
                    <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      {group}
                    </div>
                    {list.map((it) => {
                      const idx = items.indexOf(it)
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
                            onOpenChange(false)
                          }}
                          className={cn(
                            "relative isolate flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors border-t border-neutral-800/60 first:border-t-0",
                            it.tone === "warning" && "bg-red-500/[0.06]",
                            isActive ? "bg-neutral-800/80" : "",
                          )}
                        >
                          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" /> : null}
                          <span
                            className={cn(
                              "flex-1 truncate",
                              it.tone === "warning" ? "text-red-300" : "text-neutral-200",
                            )}
                          >
                            {it.label}
                          </span>
                          {it.badge ? <span className="shrink-0">{it.badge}</span> : null}
                          {it.hint ? <span className="shrink-0 text-[10px] text-neutral-500">{it.hint}</span> : null}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
            {footer ? (
              <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-1.5 text-[10px] text-neutral-500">
                {footer}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
