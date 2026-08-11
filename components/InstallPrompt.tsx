"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

// BANNER "INSTALAR O APP" — deixa o Workspaces instalável no celular como um
// aplicativo de verdade (ícone na tela inicial, tela cheia, sem barra do
// navegador). No Android/Chrome usa o evento beforeinstallprompt; no iPhone,
// que não tem esse evento, mostra o passo a passo (Compartilhar → Adicionar à
// Tela de Início). Some quando já está instalado ou quando a pessoa fecha.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Já instalado (rodando como app)? Não mostra nada.
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("pwa:dismissed") === "1"; } catch { /* ignore */ }
    if (dismissed) return;

    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); setShow(true); };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iPhone/iPad (Safari): não dispara beforeinstallprompt — mostramos o guia.
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    if (isIOS) { setShow(true); setIosHelp(true); }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  function fechar() {
    setShow(false);
    try { localStorage.setItem("pwa:dismissed", "1"); } catch { /* ignore */ }
  }
  async function instalar() {
    if (!deferred) return;
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    fechar();
  }

  if (!show) return null;

  return (
    <div className="fixed z-[150] left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-md">
      <div className="rounded-2xl border border-emerald-500/30 bg-[#0b0f16]/95 backdrop-blur shadow-2xl p-3.5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Instalar o Workspaces</p>
          {iosHelp ? (
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              Toque em <Share size={12} className="inline text-sky-400" /> e depois em <b className="text-gray-200">&quot;Adicionar à Tela de Início&quot;</b>.
            </p>
          ) : (
            <p className="text-[11px] text-gray-400 mt-0.5">Tenha o app no seu celular — tela cheia e mais rápido.</p>
          )}
        </div>
        {!iosHelp && (
          <button onClick={instalar} className="shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <Download size={14} /> Instalar
          </button>
        )}
        <button onClick={fechar} className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 cursor-pointer"><X size={16} /></button>
      </div>
    </div>
  );
}
