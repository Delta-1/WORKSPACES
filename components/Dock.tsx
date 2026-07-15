"use client";

import { Grid3x3, LucideIcon } from "lucide-react";

export default function Dock({
  apps,
  active,
  onSelect,
  onOpenDrawer,
}: {
  apps: { id: string; label: string; icon: LucideIcon }[];
  active: string;
  onSelect: (id: string) => void;
  onOpenDrawer: () => void;
}) {
  return (
    <div className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[96vw]">
      <div className="liquid-glass rounded-2xl px-2 sm:px-3 py-2 flex items-center gap-1 shadow-2xl">
        {apps.map((app, i) => {
          const isActive = active === app.id;
          // No celular mostra só os primeiros; o resto fica no menu (grade).
          return (
            <button
              key={app.id}
              onClick={() => onSelect(app.id)}
              title={app.label}
              className={`${i >= 4 && !isActive ? "hidden sm:flex" : "flex"} w-10 h-10 sm:w-11 sm:h-11 rounded-xl items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isActive ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <app.icon size={20} />
            </button>
          );
        })}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onOpenDrawer}
          title="Todos os aplicativos"
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white cursor-pointer shrink-0"
        >
          <Grid3x3 size={20} />
        </button>
      </div>
    </div>
  );
}
