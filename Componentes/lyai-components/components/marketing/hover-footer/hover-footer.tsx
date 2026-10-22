import React from "react";
import { Mail, Phone, MapPin, Facebook, Instagram, Twitter, Dribbble, Globe } from "lucide-react";

export function TextHoverEffect({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`relative w-full flex items-center justify-center select-none overflow-hidden ${className}`}>
      <h2 className="text-8xl sm:text-[14rem] font-black uppercase tracking-tighter text-zinc-800/30 hover:text-sky-500/80 transition-colors duration-500 cursor-pointer">
        {text}
      </h2>
    </div>
  );
}

export function FooterBackgroundGradient() {
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-gradient-to-t from-sky-500/10 via-transparent to-transparent pointer-events-none" />
  );
}

export function HoverFooter() {
  return (
    <footer className="bg-[#0F0F11] relative rounded-3xl overflow-hidden m-8 border border-zinc-800 text-zinc-300">
      <div className="max-w-7xl mx-auto p-12 z-40 relative">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pb-12 border-b border-zinc-800">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-sky-400 text-3xl font-extrabold">&hearts;</span>
              <span className="text-white text-3xl font-bold">LyAi UI</span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
              Modular, high-performance UI components engineered for real-time applications.
            </p>
          </div>

          <div>
            <h4 className="text-white text-lg font-semibold mb-4">Contact</h4>
            <div className="space-y-3 text-sm text-zinc-400">
              <p className="flex items-center gap-2"><Mail size={16} className="text-sky-400" /> contact@lyai.pro</p>
              <p className="flex items-center gap-2"><MapPin size={16} className="text-sky-400" /> Europe / Global</p>
            </div>
          </div>

          <div>
            <h4 className="text-white text-lg font-semibold mb-4">Social</h4>
            <div className="flex space-x-4 text-zinc-400">
              <a href="#" className="hover:text-sky-400 transition-colors"><Twitter size={20} /></a>
              <a href="#" className="hover:text-sky-400 transition-colors"><Instagram size={20} /></a>
              <a href="#" className="hover:text-sky-400 transition-colors"><Globe size={20} /></a>
            </div>
          </div>
        </div>

        <div className="py-6 flex flex-col sm:flex-row justify-between items-center text-xs text-zinc-500">
          <p>&copy; {new Date().getFullYear()} LyAi Labs. All rights reserved.</p>
          <p>Designed with surgical minimalism.</p>
        </div>
      </div>

      <div className="lg:flex hidden h-[22rem] -mt-24 -mb-16">
        <TextHoverEffect text="LYAI" className="z-20" />
      </div>

      <FooterBackgroundGradient />
    </footer>
  );
}

export default HoverFooter;
