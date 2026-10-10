import React from "react";

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-background text-foreground min-h-screen flex flex-col justify-center items-center px-4">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      {/* Glow Effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full border border-border bg-muted/50 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Next.js Conf 2026 Announcements
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-foreground max-w-3xl leading-tight">
          Build and deploy on the{" "}
          <span className="bg-gradient-to-r from-blue-500 via-teal-400 to-indigo-500 bg-clip-text text-transparent">
            AI Cloud
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl">
          Vercel's frontend cloud provides developers with the collaborative tools, infrastructure, and compute needed to scale modern applications.
        </p>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <button className="cursor-pointer rounded-full px-8 py-3 bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20">
            Start Deploying
          </button>
          <a
            href="https://cal.com"
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer rounded-full px-8 py-3 border border-border bg-background/50 hover:bg-muted font-medium text-sm text-foreground transition-all backdrop-blur-sm"
          >
            Get a Demo
          </a>
        </div>

        {/* Avatar and Grid Floor Preview */}
        <div className="mt-16 w-full relative">
          <div className="grid grid-cols-8 gap-px bg-border/40 border border-border/50 rounded-2xl overflow-hidden p-px">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-card/40 hover:bg-primary/5 transition-colors flex items-center justify-center p-2"
              >
                {i === 11 && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shadow-md">
                    ▲
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
