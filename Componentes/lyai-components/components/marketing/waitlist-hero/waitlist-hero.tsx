import React, { useState } from "react";

export function WaitlistHero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setTimeout(() => {
      setStatus("success");
    }, 1200);
  };

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 overflow-hidden selection:bg-blue-500 selection:text-white">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-600/20 to-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Decorative ambient lines */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center flex flex-col items-center">
        {/* Early access tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs text-zinc-400 mb-6 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Private Alpha Access
        </div>

        {/* Title */}
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white mb-6">
          Take a screenshot. <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            Turn it into code.
          </span>
        </h1>

        <p className="text-zinc-400 text-lg sm:text-xl max-w-xl mb-10 leading-relaxed">
          The next-generation design-to-production AI engine. Join the waitlist to receive your priority developer invitation.
        </p>

        {/* Waitlist Form with 3D Flip state */}
        <div className="w-full max-w-md relative min-h-[64px]">
          {status === "success" ? (
            <div className="w-full h-[60px] rounded-full bg-zinc-900/90 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-medium shadow-lg shadow-emerald-500/10 animate-in fade-in zoom-in duration-300">
              ✓ You are on the priority list! We will reach out soon.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="relative w-full">
              <input
                type="email"
                required
                value={email}
                disabled={status === "loading"}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full h-[60px] pl-6 pr-[140px] rounded-full outline-none bg-zinc-900/80 border border-zinc-800 text-white placeholder-zinc-500 focus:border-blue-500 transition-all text-sm backdrop-blur-md shadow-inner"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="absolute top-1.5 right-1.5 bottom-1.5 px-6 rounded-full font-medium text-white bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all text-sm flex items-center justify-center min-w-[120px] disabled:opacity-50"
              >
                {status === "loading" ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Join waitlist"
                )}
              </button>
            </form>
          )}
        </div>

        {/* Mockup frame preview */}
        <div className="mt-16 w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 p-2 shadow-2xl backdrop-blur-xl">
          <div className="h-6 flex items-center gap-1.5 px-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          </div>
          <div className="aspect-[16/9] w-full rounded-lg bg-zinc-900/60 flex items-center justify-center border border-zinc-800/50">
            <span className="text-zinc-600 font-mono text-sm">Screenshot Engine Live Canvas</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WaitlistHero;
