import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import "./theme-toggle.css"

export interface ThemeToggleProps {
  className?: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (isDark: boolean) => void
  disabled?: boolean
  badgeText?: string
  "aria-label"?: string
}

export function ThemeToggle({
  className,
  checked: controlledChecked,
  defaultChecked = true,
  onChange,
  disabled = false,
  "aria-label": ariaLabel = "Cambiar tema de color",
}: ThemeToggleProps) {
  const [internalDark, setInternalDark] = useState<boolean>(() => {
    if (disabled) return true
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme")
      if (stored === "light") return false
      if (stored === "dark") return true
      return !document.documentElement.classList.contains("light")
    }
    return defaultChecked
  })
  const [showHint, setShowHint] = useState(false)
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
    }
  }, [])

  const isControlled = controlledChecked !== undefined
  const isDark = disabled ? true : (isControlled ? controlledChecked : internalDark)

  // Keep instances synchronized
  useEffect(() => {
    const handleSync = () => {
      if (disabled) return
      if (typeof document !== "undefined") {
        const isDocLight = document.documentElement.classList.contains("light")
        setInternalDark(!isDocLight)
      }
    }
    window.addEventListener("theme-change", handleSync)
    window.addEventListener("storage", handleSync)
    return () => {
      window.removeEventListener("theme-change", handleSync)
      window.removeEventListener("storage", handleSync)
    }
  }, [disabled])

  // Synchronize document theme class and localStorage when uncontrolled
  useEffect(() => {
    if (typeof document === "undefined") return

    if (disabled) {
      document.documentElement.classList.remove("light")
      document.documentElement.classList.add("dark")
      try {
        localStorage.setItem("theme", "dark")
      } catch {}
      window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: "dark" } }))
      return
    }

    if (!isControlled) {
      if (internalDark) {
        document.documentElement.classList.remove("light")
        document.documentElement.classList.add("dark")
        try {
          localStorage.setItem("theme", "dark")
        } catch {}
      } else {
        document.documentElement.classList.remove("dark")
        document.documentElement.classList.add("light")
        try {
          localStorage.setItem("theme", "light")
        } catch {}
      }
      window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: internalDark ? "dark" : "light" } }))
    }
  }, [internalDark, isControlled, disabled])

  const handleToggle = useCallback(() => {
    if (disabled) {
      setShowHint(true)
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
      hintTimeoutRef.current = setTimeout(() => setShowHint(false), 2400)
      return
    }
    const next = !isDark
    if (!isControlled) {
      setInternalDark(next)
    }
    onChange?.(next)
  }, [disabled, isDark, isControlled, onChange])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleToggle()
    }
  }

  return (
    <div className="theme-toggle-container">
      <div
        className={cn(
          "theme-toggle-root",
          "flex w-16 h-8 p-1 rounded-full cursor-pointer transition-all duration-300",
          isDark
            ? "is-dark bg-zinc-950 border border-zinc-800"
            : "is-light bg-white border border-zinc-200",
          disabled && "is-disabled opacity-65",
          className
        )}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="switch"
        aria-checked={isDark}
        aria-label={disabled ? "Tema claro: Próximamente" : ariaLabel}
        tabIndex={0}
      >
        <div className="theme-toggle-inner flex justify-between items-center w-full">
          {/* Left icon container / Active thumb in Dark mode */}
          <div
            className={cn(
              "theme-toggle-thumb",
              "flex justify-center items-center w-6 h-6 rounded-full transition-transform duration-300",
              isDark
                ? "thumb-active-dark transform translate-x-0 bg-zinc-800 text-white"
                : "thumb-active-light transform translate-x-8 bg-gray-200 text-gray-700"
            )}
          >
            {isDark ? (
              <Moon className="theme-toggle-icon w-4 h-4 text-white" strokeWidth={1.5} />
            ) : (
              <Sun className="theme-toggle-icon w-4 h-4 text-gray-700" strokeWidth={1.5} />
            )}
          </div>

          {/* Right icon container / Inactive icon */}
          <div
            className={cn(
              "theme-toggle-ghost",
              "flex justify-center items-center w-6 h-6 rounded-full transition-transform duration-300",
              isDark
                ? "ghost-dark bg-transparent text-gray-500"
                : "ghost-light transform -translate-x-8 text-black"
            )}
          >
            {isDark ? (
              <Sun className="theme-toggle-icon w-4 h-4 text-gray-500" strokeWidth={1.5} />
            ) : (
              <Moon className="theme-toggle-icon w-4 h-4 text-black" strokeWidth={1.5} />
            )}
          </div>
        </div>
      </div>

      {showHint && (
        <div className="theme-toggle-hint" role="status" aria-live="polite">
          <span className="theme-toggle-hint-text">Tema claro · Próximamente</span>
        </div>
      )}
    </div>
  )
}

export function DefaultToggle() {
  return (
    <div className="space-y-2 text-center">
      <div className="flex justify-center">
        <ThemeToggle />
      </div>
    </div>
  )
}

export default ThemeToggle
