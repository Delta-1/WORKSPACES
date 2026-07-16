"use client";

import { LucideIcon } from "lucide-react";

export type AppDef = { id: string; label: string; icon: LucideIcon; accent: string };

export default function AppDrawer({
  apps,
  open,
  onClose,
  onSelect,
  quickIds,
}: {
  apps: AppDef[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  quickIds: string[];
}) {
  if (!open) return null;

  // O menu mostra o que NÃO está na barra de acesso rápido; ao arrastar um app
  // pra barra (embaixo), ele "sai" daqui — estilo inventário de jogo.
  const menuApps = apps.filter((a) => !quickIds.includes(a.id));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40" onClick={onClose}>
      <div className="drawer-anim liquid-glass w-full max-w-2xl mb-28 sm:mb-32 rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-300">Todos os aplicativos</h3>
        </div>
        <p className="text-[11px] text-gray-500 mb-5">
          Arraste um app para a <span className="text-emerald-400">barra de baixo</span> para fixá-lo no acesso rápido.
        </p>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-5">
          {menuApps.length === 0 && (
            <p className="col-span-full text-center text-xs text-gray-500 py-6">
              Todos os aplicativos estão na barra de acesso rápido.
            </p>
          )}
          {menuApps.map((app) => (
            <div key={app.id} className="flex flex-col items-center gap-2">
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/app-id", app.id)}
                onClick={() => {
                  onSelect(app.id);
                  onClose();
                }}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 transition-transform hover:scale-105 cursor-pointer active:cursor-grabbing ${app.accent}`}
                title={`${app.label} — clique para abrir, ou arraste pra barra`}
              >
                <app.icon size={24} className="text-white" />
              </button>
              <span className="text-xs text-gray-300 text-center">{app.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
