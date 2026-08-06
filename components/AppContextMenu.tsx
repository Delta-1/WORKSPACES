"use client";

import { useEffect } from "react";
import { ExternalLink, Pin, PinOff, SquareArrowOutUpRight } from "lucide-react";

// MENU DO BOTÃO DIREITO nos ícones de app.
//
// Troca o menu de "inspecionar" do navegador por ações do Workspace: abrir o
// app numa janela flutuante, e fixar/desafixar da barra. Aparece onde a pessoa
// clicou e some ao clicar fora ou apertar Esc.

export type AppMenuAlvo = { id: string; label: string; x: number; y: number; fixado: boolean };

export default function AppContextMenu({
  alvo, onAbrirJanela, onFixar, onDesafixar, onAbrirTela, onClose,
}: {
  alvo: AppMenuAlvo | null;
  onAbrirJanela: (id: string) => void;
  onFixar: (id: string) => void;
  onDesafixar: (id: string) => void;
  onAbrirTela: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!alvo) return;
    const fechar = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", fechar);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", fechar); window.removeEventListener("keydown", esc); };
  }, [alvo, onClose]);

  if (!alvo) return null;
  // Não deixa o menu vazar da tela pela direita/baixo.
  const x = Math.min(alvo.x, window.innerWidth - 210);
  const y = Math.min(alvo.y, window.innerHeight - 170);

  const item = "flex items-center gap-2 w-full text-left text-[13px] px-3 py-2 hover:bg-white/10 cursor-pointer";

  return (
    <div
      className="fixed z-[130] w-52 rounded-xl border border-white/15 bg-[#0b0f16] shadow-2xl py-1 overflow-hidden"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] text-gray-500 uppercase tracking-wider px-3 py-1.5">{alvo.label}</p>
      <button className={item} onClick={() => { onAbrirTela(alvo.id); onClose(); }}>
        <ExternalLink size={14} /> Abrir na tela
      </button>
      <button className={item} onClick={() => { onAbrirJanela(alvo.id); onClose(); }}>
        <SquareArrowOutUpRight size={14} /> Abrir em janela
      </button>
      <div className="h-px bg-white/10 my-1" />
      {alvo.fixado ? (
        <button className={item} onClick={() => { onDesafixar(alvo.id); onClose(); }}>
          <PinOff size={14} /> Tirar da barra
        </button>
      ) : (
        <button className={item} onClick={() => { onFixar(alvo.id); onClose(); }}>
          <Pin size={14} /> Fixar na barra
        </button>
      )}
    </div>
  );
}
