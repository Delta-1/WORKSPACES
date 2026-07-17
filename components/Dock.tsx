"use client";

import { useState } from "react";
import { Grid3x3, LucideIcon, X } from "lucide-react";

export default function Dock({
  apps,
  active,
  onSelect,
  onOpenDrawer,
  drawerOpen = false,
  pinMode = false,
  onPin,
  onUnpin,
  onReorder,
}: {
  apps: { id: string; label: string; icon: LucideIcon }[];
  active: string;
  onSelect: (id: string) => void;
  onOpenDrawer: () => void;
  drawerOpen?: boolean;
  pinMode?: boolean;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onReorder?: (id: string, beforeId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    // No modo edição (pinMode) a barra fica ACIMA do fundo borrado para arrastar.
    <div className={`fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 max-w-[96vw] ${pinMode ? "z-50" : "z-30"}`}>
      {pinMode && (
        <p className="text-center text-[11px] text-emerald-300/90 mb-1.5 select-none">
          Arraste apps pra cá para fixar · arraste na barra para reordenar
        </p>
      )}
      <div
        onDragOver={(e) => {
          if (!pinMode) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          if (!pinMode) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/app-id");
          if (id && !apps.some((a) => a.id === id)) onPin?.(id);
        }}
        className={`liquid-glass rounded-2xl px-2 sm:px-3 py-2 flex items-center gap-1 shadow-2xl transition-all ${
          pinMode ? "ring-2 ring-dashed" : ""
        } ${dragOver ? "ring-emerald-400 scale-105" : pinMode ? "ring-emerald-500/40" : ""}`}
      >
        {apps.length === 0 && pinMode && (
          <span className="text-[11px] text-gray-500 px-3 py-2 whitespace-nowrap">Solte um app aqui…</span>
        )}
        {apps.map((app, i) => {
          const isActive = active === app.id;
          // No celular mostra só os primeiros; o resto fica no menu (grade).
          return (
            <div
              key={app.id}
              className={`relative ${i >= 4 && !isActive ? "hidden sm:block" : "block"} shrink-0`}
              onDragOver={(e) => pinMode && e.preventDefault()}
              onDrop={(e) => {
                if (!pinMode) return;
                e.preventDefault();
                e.stopPropagation();
                const id = e.dataTransfer.getData("text/app-id");
                if (!id) return;
                if (apps.some((a) => a.id === id)) onReorder?.(id, app.id); // reordena
                else onPin?.(id); // fixa novo
              }}
            >
              <button
                draggable={pinMode}
                onDragStart={(e) => pinMode && e.dataTransfer.setData("text/app-id", app.id)}
                onClick={() => onSelect(app.id)}
                title={app.label}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  pinMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                } ${isActive ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
              >
                <app.icon size={20} />
              </button>
              {pinMode && onUnpin && (
                <button
                  onClick={() => onUnpin(app.id)}
                  title="Tirar da barra"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center text-gray-300 hover:bg-red-500 hover:text-white cursor-pointer"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          );
        })}
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onOpenDrawer}
          title="Menu de aplicativos"
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${
            drawerOpen ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Grid3x3 size={20} />
        </button>
      </div>
    </div>
  );
}
