"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";

// GERENCIADOR DE JANELAS — o "desktop" do Workspace.
//
// Deixa abrir vários apps ao mesmo tempo em janelas que se movem, redimensionam,
// minimizam e fecham — como no Windows. Cada janela desenha o MESMO app da tela
// principal (via `render(id)`), então nada é reimplementado: é a mesma
// ferramenta, só que numa moldura flutuante.
//
// Embaixo fica a barra de tarefas: um botão por janela aberta, para restaurar a
// que foi minimizada. Se nenhuma janela está aberta, nada disto aparece.

type Win = { id: string; z: number; min: boolean };

export default function WindowManager({
  windows, titleOf, render, onClose, onFocus, onMinimize,
}: {
  windows: Win[];
  titleOf: (id: string) => string;
  render: (id: string) => ReactNode;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMinimize: (id: string) => void;
}) {
  if (windows.length === 0) return null;
  return (
    <>
      {windows.map((w) => (
        <FloatingWindow
          key={w.id}
          title={titleOf(w.id)}
          z={w.z}
          minimized={w.min}
          onClose={() => onClose(w.id)}
          onFocus={() => onFocus(w.id)}
          onMinimize={() => onMinimize(w.id)}
        >
          {render(w.id)}
        </FloatingWindow>
      ))}

      {/* barra de tarefas das janelas abertas */}
      <div className="workspace-window-taskbar fixed bottom-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 liquid-glass rounded-xl px-2 py-1 max-w-[92vw] overflow-x-auto">
        {windows.map((w) => (
          <button
            key={w.id}
            onClick={() => (w.min ? onMinimize(w.id) : onFocus(w.id))}
            className={`workspace-window-task text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${w.min ? "text-gray-400 hover:bg-white/10" : "is-active bg-white/10 text-white"}`}
          >
            {titleOf(w.id)}
          </button>
        ))}
      </div>
    </>
  );
}

function FloatingWindow({
  title, z, minimized, children, onClose, onFocus, onMinimize,
}: {
  title: string; z: number; minimized: boolean; children: ReactNode;
  onClose: () => void; onFocus: () => void; onMinimize: () => void;
}) {
  // Posição inicial escalonada, para janelas novas não caírem exatamente uma
  // sobre a outra. `max` mantém tudo dentro da tela em telas pequenas.
  const [rect, setRect] = useState(() => ({
    x: Math.min(120 + Math.round(Math.random() * 80), Math.max(0, window.innerWidth - 480)),
    y: 90 + Math.round(Math.random() * 60),
    w: Math.min(720, Math.round(window.innerWidth * 0.7)),
    h: Math.min(520, Math.round(window.innerHeight * 0.7)),
    max: false,
  }));
  const drag = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const resz = useRef<{ mx: number; my: number; ow: number; oh: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function closeAnimated() {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = setTimeout(onClose, reducedMotion ? 20 : 460);
  }

  function onMove(e: React.PointerEvent) {
    if (drag.current) {
      const d = drag.current;
      setRect((r) => ({ ...r, x: Math.max(0, d.ox + (e.clientX - d.mx)), y: Math.max(0, d.oy + (e.clientY - d.my)) }));
    } else if (resz.current) {
      const s = resz.current;
      setRect((r) => ({ ...r, w: Math.max(320, s.ow + (e.clientX - s.mx)), h: Math.max(220, s.oh + (e.clientY - s.my)) }));
    }
  }
  const soltar = () => { drag.current = null; resz.current = null; };

  if (minimized) return null;

  const estilo = rect.max
    ? { left: 8, top: 76, width: "calc(100vw - 16px)", height: "calc(100dvh - 150px)", zIndex: z }
    : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z };

  return (
    <div
      onPointerDown={onFocus}
      className={`workspace-window app-anim fixed rounded-xl border border-white/15 bg-[#0b0f16] shadow-2xl flex flex-col overflow-hidden ${closing ? "is-closing" : ""} ${rect.max ? "is-maximized" : ""}`}
      style={estilo}
    >
      {/* barra de título — arrasta a janela */}
      <div
        onPointerDown={(e) => { onFocus(); drag.current = { mx: e.clientX, my: e.clientY, ox: rect.x, oy: rect.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={onMove}
        onPointerUp={soltar}
        onDoubleClick={() => setRect((r) => ({ ...r, max: !r.max }))}
        className="workspace-window-titlebar h-9 shrink-0 flex items-center gap-2 px-2 bg-white/5 border-b border-white/10 cursor-move select-none"
      >
        <span className="workspace-window-title text-[12px] font-semibold truncate flex-1 px-1">{title}</span>
        <div className="workspace-window-controls flex items-center">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onMinimize} className="workspace-window-control is-minimize p-1 rounded text-gray-400 cursor-pointer" title="Minimizar" aria-label="Minimizar"><Minus size={13} /></button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setRect((r) => ({ ...r, max: !r.max }))} className="workspace-window-control is-maximize p-1 rounded text-gray-400 cursor-pointer" title={rect.max ? "Restaurar" : "Maximizar"} aria-label={rect.max ? "Restaurar" : "Maximizar"}><Square size={12} /></button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={closeAnimated} className="workspace-window-control is-close p-1 rounded text-gray-400 cursor-pointer" title="Fechar" aria-label="Fechar"><X size={14} /></button>
        </div>
      </div>

      {/* conteúdo do app */}
      <div className="workspace-window-content flex-1 overflow-auto p-3">{children}</div>

      {/* alça de redimensionar */}
      {!rect.max && (
        <div
          onPointerDown={(e) => { onFocus(); resz.current = { mx: e.clientX, my: e.clientY, ow: rect.w, oh: rect.h }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={onMove}
          onPointerUp={soltar}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)" }}
        />
      )}
    </div>
  );
}
