import React, { useEffect, useRef } from 'react';

export type SpotlightVariant =
  | 'purple'
  | 'cyan'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'blue'
  | 'fuchsia';

export interface SpotlightCardProps {
  children: React.ReactNode;
  variant?: SpotlightVariant;
  rgb?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const spotlightRGB: Record<SpotlightVariant, string> = {
  purple: '192, 132, 252',
  cyan: '34, 211, 238',
  amber: '245, 158, 11',
  emerald: '52, 211, 153',
  rose: '244, 63, 94',
  blue: '96, 165, 250',
  fuchsia: '232, 121, 249',
};

export function SpotlightCard({
  children,
  variant = 'blue',
  rgb,
  className = '',
  style,
  onClick,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    const finalRgb = rgb || spotlightRGB[variant] || spotlightRGB.blue;
    card.style.setProperty('--spotlight-rgb', finalRgb);

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = (((e.clientX - rect.left) / rect.width) * 100).toFixed(2);
      const y = (((e.clientY - rect.top) / rect.height) * 100).toFixed(2);
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    };

    const handlePointerLeave = () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
    };

    card.addEventListener('pointermove', handlePointerMove, {
      signal: controller.signal,
      passive: true,
    });

    card.addEventListener('pointerleave', handlePointerLeave, {
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [variant, rgb]);

  return (
    <div
      ref={cardRef}
      className={`spotlight-card relative overflow-hidden ${className}`}
      style={style}
      onClick={onClick}
    >
      <style>{spotlightCardStyles}</style>
      <div className="spotlight-card-content relative z-0 w-full h-full">{children}</div>
      <div className="spotlight-glow" aria-hidden="true" />
      <div className="spotlight-border" aria-hidden="true" />
    </div>
  );
}

const spotlightCardStyles = `
  .spotlight-card {
    position: relative;
    overflow: hidden;
    --mx: 50%;
    --my: 50%;
  }

  /* Haz de luz interior prominente que sigue al cursor */
  .spotlight-glow,
  .spotlight-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    opacity: 0;
    transition: opacity 0.3s ease;
    background: radial-gradient(
      580px circle at var(--mx, 50%) var(--my, 50%),
      rgba(var(--spotlight-rgb, 96, 165, 250), 0.38) 0%,
      rgba(var(--spotlight-rgb, 96, 165, 250), 0.14) 40%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 20;
    mix-blend-mode: screen;
    will-change: background;
  }

  .spotlight-card:hover .spotlight-glow,
  .spotlight-card:hover::before {
    opacity: 1;
  }

  /* Borde perimetral reactivo al cursor con alta definición */
  .spotlight-border,
  .spotlight-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1.5px solid transparent;
    background: radial-gradient(
      420px circle at var(--mx, 50%) var(--my, 50%),
      rgba(var(--spotlight-rgb, 96, 165, 250), 0.9) 0%,
      transparent 65%
    ) border-box;
    -webkit-mask:
      linear-gradient(#fff 0 0) padding-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: 25;
  }

  .spotlight-card:hover .spotlight-border,
  .spotlight-card:hover::after {
    opacity: 1;
  }
`;

export default SpotlightCard;
