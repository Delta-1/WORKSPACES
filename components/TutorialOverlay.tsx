"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, X } from "lucide-react";
import { TUTORIALS } from "@/lib/tutorials";

// O cartão de tutorial que aparece na primeira vez de cada app.
//
// Puramente de apresentação: quem decide SE aparece (e marca como visto) é o
// page.tsx, que conhece o estado da pessoa. Aqui é só passar os passos e chamar
// onClose quando terminar ou pular — assim a mesma peça serve para o guia de
// boas-vindas e para o de cada app, sem lógica duplicada.

export default function TutorialOverlay({ appId, onClose }: { appId: string; onClose: () => void }) {
  const tut = TUTORIALS[appId];
  const [i, setI] = useState(0);
  if (!tut) return null;

  const passo = tut.passos[i];
  const ultimo = i === tut.passos.length - 1;

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-[#0b0f16] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <div className="w-9 h-9 rounded-xl bg-emerald-950/60 border border-emerald-700/40 grid place-items-center shrink-0">
            <GraduationCap size={18} className="text-emerald-300" />
          </div>
          <h2 className="text-sm font-bold flex-1 leading-tight">{tut.titulo}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5 min-h-[120px]">
          <p className="text-[13px] font-semibold text-emerald-300 mb-1">{passo.titulo}</p>
          <p className="text-[13px] text-gray-300 leading-relaxed">{passo.texto}</p>
        </div>

        <div className="flex items-center gap-1.5 px-5">
          {tut.passos.map((_, k) => (
            <span
              key={k}
              className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-emerald-400" : "w-1.5 bg-white/15"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <button
            onClick={onClose}
            className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer"
          >
            Pular
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI((v) => v - 1)}
                className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
              >
                <ChevronLeft size={13} /> Voltar
              </button>
            )}
            <button
              onClick={() => (ultimo ? onClose() : setI((v) => v + 1))}
              className="flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              {ultimo ? "Entendi!" : "Próximo"} {!ultimo && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
