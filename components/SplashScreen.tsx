"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

export default function SplashScreen({
  companyName,
  logoDataUrl,
  onDone,
}: {
  companyName: string;
  logoDataUrl: string | null;
  onDone: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHidden(true), 1700);
    const done = setTimeout(onDone, 1900);
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, [onDone]);

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
      <div className="splash-door-left absolute inset-y-0 left-0 w-1/2 bg-[#060a12] border-r border-white/5" />
      <div className="splash-door-right absolute inset-y-0 right-0 w-1/2 bg-[#060a12] border-l border-white/5" />
      <div className="splash-logo absolute inset-0 flex flex-col items-center justify-center gap-4">
        {logoDataUrl ? (
          <img src={logoDataUrl} alt="Logo" className="w-20 h-20 rounded-2xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-emerald-950 border border-emerald-500 flex items-center justify-center text-emerald-400">
            <Layers size={36} />
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-[0.2em] text-white uppercase">
          {companyName}
        </h1>
      </div>
    </div>
  );
}
