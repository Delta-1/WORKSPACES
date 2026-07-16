"use client";

import { useEffect, useState } from "react";
import { Check, LucideIcon, Pencil, Plus, X } from "lucide-react";

export type AppDef = { id: string; label: string; icon: LucideIcon; accent: string };

export default function AppDrawer({
  apps,
  open,
  onClose,
  onSelect,
  quickIds,
  onSaveQuick,
}: {
  apps: AppDef[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  quickIds: string[];
  onSaveQuick: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(quickIds);

  useEffect(() => {
    setDraft(quickIds);
  }, [quickIds, open]);

  if (!open) return null;

  const byId = new Map(apps.map((a) => [a.id, a]));
  const quickApps = draft.map((id) => byId.get(id)).filter(Boolean) as AppDef[];
  // No modo edição usamos o rascunho (draft) para o "mover" acontecer ao vivo;
  // fora dele, a barra salva (quickIds). O menu mostra só o que sobra.
  const pinned = editing ? draft : quickIds;
  const menuApps = apps.filter((a) => !pinned.includes(a.id));

  function addToQuick(id: string, beforeId?: string) {
    setDraft((prev) => {
      const without = prev.filter((x) => x !== id);
      if (!beforeId) return [...without, id];
      const idx = without.indexOf(beforeId);
      if (idx < 0) return [...without, id];
      return [...without.slice(0, idx), id, ...without.slice(idx)];
    });
  }
  function removeFromQuick(id: string) {
    setDraft((prev) => prev.filter((x) => x !== id));
  }
  function save() {
    onSaveQuick(draft);
    setEditing(false);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40"
      onClick={onClose}
    >
      <div
        className="drawer-anim liquid-glass w-full max-w-2xl mb-24 rounded-3xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-300">Todos os aplicativos</h3>
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setDraft(quickIds);
                  setEditing(false);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Check size={13} /> Salvar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              title="Organizar a barra de acesso rápido"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
            >
              <Pencil size={13} /> Editar barra
            </button>
          )}
        </div>

        {/* Barra de acesso rápido (destino do arrastar) */}
        {editing && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/app-id");
              if (id) addToQuick(id);
            }}
            className="mb-5 rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-950/20 p-3"
          >
            <p className="text-[11px] text-emerald-300/80 mb-2 uppercase tracking-wider">
              Barra de acesso rápido — arraste apps aqui e solte para organizar
            </p>
            <div className="flex items-center gap-2 flex-wrap min-h-[52px]">
              {quickApps.length === 0 && (
                <span className="text-[11px] text-gray-500">Arraste um app de baixo para cá…</span>
              )}
              {quickApps.map((app) => (
                <div
                  key={app.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/app-id", app.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/app-id");
                    if (id) addToQuick(id, app.id);
                  }}
                  className="relative flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl pl-2 pr-1.5 py-1.5 cursor-grab active:cursor-grabbing"
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${app.accent}`}>
                    <app.icon size={13} className="text-white" />
                  </div>
                  <span className="text-[11px]">{app.label}</span>
                  <button
                    onClick={() => removeFromQuick(app.id)}
                    className="text-gray-500 hover:text-red-400 cursor-pointer"
                    title="Remover da barra"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade dos apps que NÃO estão na barra (os que sobram).
            Ao fixar um app, ele "sai" daqui e vai pra barra de acesso rápido. */}
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-5">
          {menuApps.length === 0 && (
            <p className="col-span-full text-center text-xs text-gray-500 py-6">
              Todos os aplicativos estão na barra de acesso rápido.
            </p>
          )}
          {menuApps.map((app) => (
            <div key={app.id} className="flex flex-col items-center gap-2">
              <button
                draggable={editing}
                onDragStart={(e) => editing && e.dataTransfer.setData("text/app-id", app.id)}
                onClick={() => {
                  if (editing) {
                    addToQuick(app.id); // fixa → move pra barra
                  } else {
                    onSelect(app.id);
                    onClose();
                  }
                }}
                className={`relative w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 transition-transform ${
                  editing ? "cursor-grab active:cursor-grabbing" : "hover:scale-105 cursor-pointer"
                } ${app.accent}`}
                title={editing ? "Clique ou arraste p/ a barra de acesso rápido" : app.label}
              >
                <app.icon size={24} className="text-white" />
                {editing && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white bg-gray-700">
                    <Plus size={11} />
                  </span>
                )}
              </button>
              <span className="text-xs text-gray-300 text-center">{app.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
