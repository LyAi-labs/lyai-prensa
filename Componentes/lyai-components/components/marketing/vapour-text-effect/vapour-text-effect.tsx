import React, { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
}

export function Component() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const words = ["CREATIVE", "PRECISION", "MINIMALISM", "EXCELLENCE"];
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let particles: Particle[] = [];

    const resize = () => {
      canvas.width = 800;
      canvas.height = 300;
    };
    resize();

    // Create particles from text pixels
    const createParticlesFromText = (text: string) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 80px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const newParticles: Particle[] = [];
      const step = 4;
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const idx = (y * canvas.width + x) * 4;
          if (imgData.data[idx + 3] > 128) {
            newParticles.push({
              x,
              y,
              originX: x,
              originY: y,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -Math.random() * 2 - 0.5,
              alpha: 1,
              size: Math.random() * 2 + 1,
            });
          }
        }
      }
      particles = newParticles;
    };

    createParticlesFromText(words[wordIndex]);

    const render = () => {
      ctx.fillStyle = "rgba(10, 10, 10, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.005;

        if (p.alpha > 0) {
          ctx.fillStyle = `rgba(147, 197, 253, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 4000);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(interval);
    };
  }, [wordIndex]);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 rounded-3xl border border-zinc-800">
      <canvas ref={canvasRef} className="w-full max-w-[800px] h-[300px]" />
      <span className="text-xs text-zinc-500 font-mono mt-4 uppercase tracking-widest">
        Canvas Vapour Particle Dispersion
      </span>
    </div>
  );
}

export default Component;
