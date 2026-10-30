import { cn } from "@/lib/utils"
import { IconLayoutNavbarCollapse } from "@tabler/icons-react"
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion"
import React, { useRef, useState } from "react"

export interface DockItem {
  title: string
  icon: React.ReactNode
  href?: string
  onClick?: (e: React.MouseEvent) => void
  active?: boolean
  badge?: React.ReactNode
  isBrand?: boolean
  className?: string
}

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: DockItem[]
  desktopClassName?: string
  mobileClassName?: string
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  )
}

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: DockItem[]
  className?: string
}) => {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute top-full mt-2 inset-x-0 flex flex-col gap-2 items-center bg-neutral-900/90 backdrop-blur-md p-3 rounded-2xl border border-neutral-700/60 shadow-2xl z-50"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: -10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: -10,
                  transition: {
                    delay: idx * 0.04,
                  },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.04 }}
              >
                {item.href ? (
                  <a
                    href={item.href}
                    onClick={(e) => {
                      if (item.onClick) item.onClick(e)
                      setOpen(false)
                    }}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center border transition-colors relative",
                      item.isBrand
                        ? "bg-white text-neutral-900 border-white/80 shadow-md"
                        : item.active
                          ? "bg-sky-500/20 text-sky-400 border-sky-400/50"
                          : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                    )}
                  >
                    <div className="h-4 w-4">{item.icon}</div>
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (item.onClick) item.onClick(e)
                      setOpen(false)
                    }}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center border transition-colors relative",
                      item.isBrand
                        ? "bg-white text-neutral-900 border-white/80 shadow-md"
                        : item.active
                          ? "bg-sky-500/20 text-sky-400 border-sky-400/50"
                          : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                    )}
                  >
                    <div className="h-4 w-4">{item.icon}</div>
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-10 w-10 rounded-full bg-neutral-900/80 backdrop-blur-md flex items-center justify-center border border-neutral-700 text-neutral-300 hover:text-white"
        aria-label="Toggle navigation dock"
      >
        <IconLayoutNavbarCollapse className="h-5 w-5" />
      </button>
    </div>
  )
}

const FloatingDockDesktop = ({
  items,
  className,
}: {
  items: DockItem[]
  className?: string
}) => {
  const mouseX = useMotionValue(Infinity)

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden md:flex h-16 gap-3.5 items-center rounded-2xl bg-neutral-900/80 backdrop-blur-xl px-4 py-2 border border-neutral-700/60 shadow-2xl shadow-black/50",
        className
      )}
    >
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  )
}

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
  active,
  badge,
  isBrand,
  className,
}: {
  mouseX: MotionValue
  title: string
  icon: React.ReactNode
  href?: string
  onClick?: (e: React.MouseEvent) => void
  active?: boolean
  badge?: React.ReactNode
  isBrand?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - bounds.x - bounds.width / 2
  })

  // Escala del contenedor exterior (de 40px base a 76px en hover máximo; brand ligeramente mayor)
  const minSize = isBrand ? 44 : 40
  const maxSize = isBrand ? 80 : 76
  const widthTransform = useTransform(distance, [-150, 0, 150], [minSize, maxSize, minSize])
  const heightTransform = useTransform(distance, [-150, 0, 150], [minSize, maxSize, minSize])

  // Escala del icono interior (de 20px base a 38px)
  const minIconSize = isBrand ? 24 : 20
  const maxIconSize = isBrand ? 42 : 38
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [minIconSize, maxIconSize, minIconSize])
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [minIconSize, maxIconSize, minIconSize])

  const width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })
  const height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })

  const widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })
  const heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })

  const [hovered, setHovered] = useState(false)

  const innerContent = (
    <motion.div
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "aspect-square rounded-full flex items-center justify-center relative cursor-pointer select-none transition-colors",
        isBrand
          ? "rounded-2xl bg-white text-neutral-900 shadow-lg shadow-white/10 hover:shadow-white/20"
          : active
            ? "bg-neutral-800 text-sky-400 border border-sky-400/50 shadow-md shadow-sky-500/20"
            : "bg-neutral-800/80 text-neutral-300 border border-neutral-700/60 hover:bg-neutral-700/80 hover:text-white",
        className
      )}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: -6, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -4, x: "-50%" }}
            className="px-2.5 py-1 whitespace-pre rounded-lg bg-neutral-900/95 border border-neutral-700 text-neutral-100 absolute left-1/2 top-full mt-2.5 w-fit text-xs font-semibold shadow-2xl pointer-events-none backdrop-blur-md z-50 tracking-wide"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{ width: widthIcon, height: heightIcon }}
        className="flex items-center justify-center"
      >
        {icon}
      </motion.div>

      {/* Indicador de activo estilo macOS dot */}
      {active && !isBrand && (
        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
      )}

      {/* Badge contador */}
      {badge && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-neutral-900">
          {badge}
        </span>
      )}
    </motion.div>
  )

  if (href) {
    return (
      <a href={href} onClick={onClick} className="inline-block focus:outline-none">
        {innerContent}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-block bg-transparent border-0 p-0 focus:outline-none"
    >
      {innerContent}
    </button>
  )
}

