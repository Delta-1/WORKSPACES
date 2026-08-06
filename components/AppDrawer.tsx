"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LucideIcon, Pencil, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ShortcutIcon from "@/components/ShortcutIcon";
import type { WorkspaceShortcut } from "@/lib/workspace-shortcuts";

export type AppDef = { id: string; label: string; icon: LucideIcon; accent: string };

export default function AppDrawer({
  apps,
  open,
  editMode,
  onToggleEdit,
  onClose,
  onSelect,
  quickIds,
  onContext,
  shortcuts = [],
  onShortcut,
  onAddShortcut,
}: {
  apps: AppDef[];
  open: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  quickIds: string[];
  onContext?: (id: string, x: number, y: number) => void;
  shortcuts?: WorkspaceShortcut[];
  onShortcut?: (shortcut: WorkspaceShortcut) => void;
  onAddShortcut?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const touchX = useRef<number | null>(null);
  const lastWheel = useRef(0);
  const wheelAccum = useRef(0);

  // Apps por página (celular mostra menos por linha). Só mede no cliente.
  useEffect(() => {
    if (!open) return;
    const calc = () => setPerPage(typeof window !== "undefined" && window.innerWidth < 640 ? 12 : 20);
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [open]);

  // Fora do modo edição, mostra TODOS os apps. No modo edição, some quem já está na barra.
  const menuApps = useMemo(
    () => (editMode ? apps.filter((a) => !quickIds.includes(a.id)) : apps),
    [apps, editMode, quickIds]
  );
  const pages = useMemo(() => {
    const out: AppDef[][] = [];
    for (let i = 0; i < menuApps.length; i += perPage) out.push(menuApps.slice(i, i + perPage));
    return out.length ? out : [[]];
  }, [menuApps, perPage]);

  // Mantém a página dentro do intervalo válido.
  useEffect(() => { setPage((p) => Math.min(p, pages.length - 1)); }, [pages.length]);
  useEffect(() => { if (open) setPage(0); }, [open]);

  if (!open) return null;

  const current = Math.min(page, pages.length - 1);
  const multi = pages.length > 1;
  const go = (p: number) => setPage(Math.max(0, Math.min(pages.length - 1, p)));

  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0]?.clientX ?? null; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null || editMode) { touchX.current = null; return; }
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    if (dx < -40) go(current + 1);
    else if (dx > 40) go(current - 1);
    touchX.current = null;
  }

  // Trackpad de notebook: arrastar com DOIS DEDOS gera deltaX no evento de wheel
  // (o navegador traduz o gesto de rolagem horizontal). Acumula até passar um
  // limite para trocar de página, com um intervalo mínimo entre trocas.
  function onWheel(e: React.WheelEvent) {
    if (editMode || !multi) return;
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (!dx) return;
    wheelAccum.current += dx;
    const now = Date.now();
    if (now - lastWheel.current < 260) return;
    if (Math.abs(wheelAccum.current) > 60) {
      go(current + (wheelAccum.current > 0 ? 1 : -1));
      wheelAccum.current = 0;
      lastWheel.current = now;
    }
  }

  return (
    <div className="workspace-drawer-overlay fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40" onClick={onClose}>
      <div className="workspace-drawer drawer-anim liquid-glass w-full max-w-2xl mb-28 sm:mb-32 rounded-3xl p-5 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-300">Menu de aplicativos</h3>
          <div className="flex items-center gap-2">
            {onAddShortcut && <button onClick={onAddShortcut} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"><Plus size={12} /> Atalho</button>}
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
        </div>
        <p className="text-[11px] text-gray-500 mb-4">
          {editMode ? (
            <>Arraste um app para a <span className="text-emerald-400">barra de baixo</span> para fixá-lo.</>
          ) : multi ? (
            <>Deslize com o dedo, com dois dedos no touchpad, ou use as setas para ver mais aplicativos.</>
          ) : (
            <>Toque num app para abrir. Toque no <span className="text-emerald-400">lápis</span> para personalizar a barra.</>
          )}
        </p>

        {!editMode && shortcuts.length > 0 && (
          <div className="mb-4 grid grid-cols-4 gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3 sm:grid-cols-6">
            {shortcuts.slice(0, 6).map((shortcut) => (
              <button key={shortcut.id} onClick={() => { onShortcut?.(shortcut); onClose(); }} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-white/5" title={shortcut.name}>
                <ShortcutIcon provider={shortcut.provider} size={20} className="h-10 w-10" />
                <span className="w-full truncate text-center text-[10px] text-slate-300">{shortcut.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          {multi && !editMode && (
            <button
              onClick={() => go(current - 1)}
              disabled={current === 0}
              aria-label="Página anterior"
              className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          )}

          {/* Trilho das páginas: desliza suavemente para a página atual. */}
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            className="overflow-hidden"
          >
            <div
              className="flex transition-transform duration-350 ease-out"
              style={{ transform: `translateX(-${current * 100}%)`, transitionDuration: "350ms" }}
            >
              {pages.map((pageApps, pi) => (
                <div key={pi} className="w-full shrink-0 grid grid-cols-4 sm:grid-cols-5 gap-4 sm:gap-5 content-start min-h-[8rem] px-0.5">
                  {pageApps.length === 0 && (
                    <p className="col-span-full text-center text-xs text-gray-500 py-6">
                      Todos os aplicativos estão na barra de acesso rápido.
                    </p>
                  )}
                  {pageApps.map((app) => (
                    <div key={app.id} className="flex flex-col items-center gap-1.5">
                      <button
                        draggable={editMode}
                        onDragStart={(e) => editMode && e.dataTransfer.setData("text/app-id", app.id)}
                        onClick={() => { if (editMode) return; onSelect(app.id); onClose(); }}
                        onContextMenu={(e) => { if (onContext && !editMode) { e.preventDefault(); onContext(app.id, e.clientX, e.clientY); } }}
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 transition-transform hover:scale-105 active:scale-95 ${
                          editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${app.accent}`}
                        title={editMode ? `${app.label} — arraste pra barra` : `Abrir ${app.label}`}
                      >
                        <app.icon size={24} className="text-white" />
                      </button>
                      <span className="text-[11px] sm:text-xs text-gray-300 text-center leading-tight line-clamp-2">{app.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {multi && !editMode && (
            <button
              onClick={() => go(current + 1)}
              disabled={current === pages.length - 1}
              aria-label="Próxima página"
              className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {multi && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Página ${i + 1}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${i === current ? "w-5 bg-emerald-400" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
