import React, { useEffect, useRef } from "react";

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const chars = " .:-=+*#%@";

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let time = 0;
    const render = () => {
      time += 0.02;
      ctx.fillStyle = "rgba(10, 10, 10, 0.3)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = "14px monospace";
      ctx.fillStyle = "#38bdf8";

      const cols = Math.floor(canvas.width / 14);
      const rows = Math.floor(canvas.height / 18);

      for (let y = 0; y < rows; y += 2) {
        for (let x = 0; x < cols; x += 2) {
          const dx = x - cols / 2;
          const dy = y - rows / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const v = Math.sin(dist * 0.15 - time) * Math.cos((x * 0.1) + time);
          const charIdx = Math.floor(Math.abs(v) * (chars.length - 1));
          ctx.fillText(chars[charIdx], x * 14, y * 18);
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-950 text-white flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-40" />
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-6xl sm:text-8xl font-black font-mono tracking-tighter text-white uppercase mb-6">
          ASCII Matrix One
        </h1>
        <p className="text-zinc-400 font-mono text-base sm:text-lg max-w-xl mx-auto mb-10">
          Real-time procedural terminal graphics computed directly on Canvas 2D.
        </p>
        <button className="font-mono text-sm px-8 py-3 rounded border border-sky-400 text-sky-400 hover:bg-sky-400/10 transition-colors">
          Initialize System
        </button>
      </div>
    </div>
  );
}

export default Hero;
