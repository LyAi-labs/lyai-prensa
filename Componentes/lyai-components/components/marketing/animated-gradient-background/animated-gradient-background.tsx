import React from "react";

export function AnimatedGradientBackground() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950 flex items-center justify-center">
      {/* Animated fluid mesh gradient blobs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-cyan-500/30 to-blue-600/30 blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-purple-600/30 to-pink-500/30 blur-[120px] animate-bounce [animation-duration:12s]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 blur-[90px]" />

      {/* SVG Grain filter overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative z-10 text-center px-4 max-w-2xl">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white mb-6">
          Atmospheric Mesh
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          High performance, pure CSS animated gradient with sub-pixel blur filters and zero CPU-overhead canvas loops.
        </p>
      </div>
    </div>
  );
}

export default AnimatedGradientBackground;
