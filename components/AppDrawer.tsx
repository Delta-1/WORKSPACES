"use client";

import { LucideIcon, Pencil, Check } from "lucide-react";

export type AppDef = { id: string; label: string; icon: LucideIcon; accent: string };

export default function AppDrawer({
  apps,
  open,
  editMode,
  onToggleEdit,
  onClose,
  onSelect,
  quickIds,
}: {
  apps: AppDef[];
  open: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  quickIds: string[];
}) {
  if (!open) return null;

  // Fora do modo edição, mostra TODOS os apps (só para abrir). No modo edição,
  // some quem já está na barra (para arrastar o resto pra lá).
  const menuApps = editMode ? apps.filter((a) => !quickIds.includes(a.id)) : apps;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40" onClick={onClose}>
      <div className="drawer-anim liquid-glass w-full max-w-2xl mb-28 sm:mb-32 rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-300">Menu de aplicativos</h3>
          <button
            onClick={onToggleEdit}
            title={editMode ? "Concluir edição" : "Editar barra de atalho"}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
              editMode ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"
            }`}
          >
            {editMode ? <><Check size={12} /> Concluir</> : <><Pencil size={12} /> Editar</>}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-5">
          {editMode ? (
            <>Arraste um app para a <span className="text-emerald-400">barra de baixo</span> para fixá-lo. Na barra, arraste para reordenar.</>
          ) : (
            <>Toque num app para abrir. Toque no <span className="text-emerald-400">lápis</span> para personalizar a barra de atalho.</>
          )}
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
                draggable={editMode}
                onDragStart={(e) => editMode && e.dataTransfer.setData("text/app-id", app.id)}
                onClick={() => {
                  if (editMode) return; // no modo edição, o clique não abre — só arrasta
                  onSelect(app.id);
                  onClose();
                }}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 transition-transform hover:scale-105 ${
                  editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                } ${app.accent}`}
                title={editMode ? `${app.label} — arraste pra barra` : `Abrir ${app.label}`}
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
