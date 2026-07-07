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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
      <div className="liquid-glass rounded-2xl px-3 py-2 flex items-center gap-1 shadow-2xl">
        {apps.map((app) => {
          const isActive = active === app.id;
          return (
            <button
              key={app.id}
              onClick={() => onSelect(app.id)}
              title={app.label}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
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
          className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <Grid3x3 size={20} />
        </button>
      </div>
    </div>
  );
}
