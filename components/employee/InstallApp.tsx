"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const sync = () => setInstalled(mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    sync();
    mode.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      mode.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!prompt) { setHelp(true); return; }
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setHelp(true); }
    finally { setPrompt(null); }
  }
  if (installed) return null;
  return <>
    <button onClick={() => void install()} aria-label="Instalar aplicativo de atendimento" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm hover:bg-white/10"><Download size={18} /><span className={compact ? "hidden sm:inline" : ""}>Instalar app</span></button>
    {help && <div className="fixed inset-0 z-[150] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Instalar atendimento">
      <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#111826] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-lg">Instalar Atendimento</h2><button aria-label="Fechar instruções" onClick={() => setHelp(false)} className="min-h-11 min-w-11 grid place-items-center rounded-lg hover:bg-white/10"><X size={20} /></button></div>
        <p className="text-sm text-gray-300"><b>Android / Chrome:</b> abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</p>
        <p className="text-sm text-gray-300"><b>iPhone / Safari:</b> toque em Compartilhar, depois em “Adicionar à Tela de Início” e confirme em “Adicionar”.</p>
        <p className="text-sm text-gray-300"><b>Computador:</b> use o ícone de instalação na barra de endereço do Chrome ou Edge.</p>
        <p className="text-sm text-gray-400">Abra este link no navegador do celular se estiver dentro do WhatsApp. O atendimento precisa de internet.</p>
        <a href="/ajuda/atendimento" className="inline-flex min-h-11 items-center text-emerald-300 underline">Ver manual ilustrado</a>
      </div>
    </div>}
  </>;
}
