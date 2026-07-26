"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LucideIcon, Pencil, Check, ChevronLeft, ChevronRight } from "lucide-react";

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(20);

  // Quantos apps por "página" — depende da largura (celular mostra menos por linha).
  useEffect(() => {
    if (!open) return;
    const calc = () => setPerPage(window.innerWidth < 640 ? 12 : 20); // 4x3 no cel, 5x4 no PC
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

  useEffect(() => { if (page > pages.length - 1) setPage(0); }, [pages.length, page]);
  // Sincroniza a página ao voltar a abrir.
  useEffect(() => { if (open && scrollerRef.current) scrollerRef.current.scrollTo({ left: 0 }); }, [open]);

  if (!open) return null;

  function goTo(p: number) {
    const el = scrollerRef.current; if (!el) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, p));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setPage(clamped);
  }
  function onScroll() {
    const el = scrollerRef.current; if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }

  // Arrastar com o ponteiro do mouse para trocar de página (além do swipe no toque).
  const drag = useRef<{ x: number; left: number; active: boolean }>({ x: 0, left: 0, active: false });
  function onPointerDown(e: React.PointerEvent) {
    if (editMode) return; // no modo edição o arraste é para fixar apps
    const el = scrollerRef.current; if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, active: true };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    const el = scrollerRef.current; if (!el) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  }
  function endDrag() {
    if (!drag.current.active) return;
    drag.current.active = false;
    goTo(Math.round((scrollerRef.current?.scrollLeft || 0) / (scrollerRef.current?.clientWidth || 1)));
  }

  const multi = pages.length > 1;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40" onClick={onClose}>
      <div className="drawer-anim liquid-glass w-full max-w-2xl mb-28 sm:mb-32 rounded-3xl p-5 sm:p-8" onClick={(e) => e.stopPropagation()}>
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
        <p className="text-[11px] text-gray-500 mb-4">
          {editMode ? (
            <>Arraste um app para a <span className="text-emerald-400">barra de baixo</span> para fixá-lo.</>
          ) : multi ? (
            <>Deslize para os lados (ou use as setas) para ver mais aplicativos.</>
          ) : (
            <>Toque num app para abrir. Toque no <span className="text-emerald-400">lápis</span> para personalizar a barra.</>
          )}
        </p>

        <div className="relative">
          {/* Seta / zona de clique esquerda */}
          {multi && !editMode && (
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 0}
              aria-label="Página anterior"
              className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          )}

          <div
            ref={scrollerRef}
            onScroll={onScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar touch-pan-x select-none"
            style={{ scrollbarWidth: "none" }}
          >
            {pages.map((pageApps, pi) => (
              <div key={pi} className="w-full shrink-0 snap-center grid grid-cols-4 sm:grid-cols-5 gap-4 sm:gap-5 content-start" style={{ minHeight: "1px" }}>
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

          {/* Seta / zona de clique direita */}
          {multi && !editMode && (
            <button
              onClick={() => goTo(page + 1)}
              disabled={page === pages.length - 1}
              aria-label="Próxima página"
              className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        {/* Bolinhas de página */}
        {multi && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Página ${i + 1}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${i === page ? "w-5 bg-emerald-400" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
