"use client";

import { useEffect, useState } from "react";
import { Bell, Bot, Building2, Image as ImageIcon, Palette, Server, Sliders, Sparkles } from "lucide-react";
import type { CompanySettingsRow } from "@/lib/types";
import AiConfigSection from "./AiConfigSection";
import ChatbotSection from "./ChatbotSection";
import ServersSection from "./ServersSection";

type Corner = CompanySettingsRow["tv_logo_corner"];

const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Superior esquerdo" },
  { id: "top-right", label: "Superior direito" },
  { id: "bottom-left", label: "Inferior esquerdo" },
  { id: "bottom-right", label: "Inferior direito" },
];

const THEME_PRESETS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#14b8a6", "#6366f1"];

type SectionId = "empresa" | "aparencia" | "servidores" | "ia" | "chatbot" | "notificacoes";
const SECTIONS: { id: SectionId; label: string; icon: typeof Building2 }[] = [
  { id: "empresa", label: "Empresa", icon: Building2 },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "servidores", label: "Servidores", icon: Server },
  { id: "ia", label: "Inteligência Artificial", icon: Sparkles },
  { id: "chatbot", label: "Chatbot", icon: Bot },
  { id: "notificacoes", label: "Notificações", icon: Bell },
];

export default function ConfigTab({
  companyName,
  companyCode,
  tvLogoCorner,
  themeColor,
  iconColor,
  logoSize,
  onUpdateCompany,
}: {
  companyName: string;
  companyCode?: string | null;
  tvLogoCorner: Corner;
  googleDriveEnabled: boolean;
  themeColor: string;
  iconColor: string;
  logoSize: number;
  onUpdateCompany: (update: {
    name?: string;
    logoDataUrl?: string;
    tvLogoCorner?: Corner;
    googleDriveEnabled?: boolean;
    themeColor?: string;
    iconColor?: string;
    logoSize?: number;
  }) => void;
}) {
  const [name, setName] = useState(companyName);
  const [notifMuted, setNotifMuted] = useState(false);
  const [active, setActive] = useState<SectionId>("empresa");

  useEffect(() => {
    try {
      setNotifMuted(localStorage.getItem("notif:muted") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleNotif(v: boolean) {
    setNotifMuted(v);
    try {
      localStorage.setItem("notif:muted", v ? "1" : "0");
      window.dispatchEvent(new StorageEvent("storage", { key: "notif:muted", newValue: v ? "1" : "0" }));
    } catch {
      /* ignore */
    }
  }

  function handleLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => onUpdateCompany({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <h3 className="text-lg font-bold flex items-center gap-2 shrink-0">
        <Sliders className="text-amber-400" size={20} /> Configurações
      </h3>

      <div className="flex-1 flex flex-col sm:flex-row gap-4 overflow-hidden">
        {/* Lista de seções (estilo "Ajustes") */}
        <nav className="sm:w-56 shrink-0 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto custom-scroll pb-1 sm:pb-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`flex items-center gap-2.5 text-sm px-3 py-2.5 rounded-xl cursor-pointer whitespace-nowrap shrink-0 sm:w-full text-left transition-colors ${
                active === s.id ? "bg-emerald-500/15 text-emerald-300" : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <s.icon size={16} className={active === s.id ? "text-emerald-400" : "text-gray-400"} />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo da seção ativa */}
        <div className="flex-1 overflow-y-auto custom-scroll">
          {active === "empresa" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nome comercial da empresa</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => onUpdateCompany({ name })}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              {companyCode && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Código empresarial (para os funcionários entrarem)</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black/30 border border-emerald-700/40 rounded-lg px-3 py-2 text-lg font-mono tracking-widest text-emerald-400">{companyCode}</code>
                    <button onClick={() => navigator.clipboard?.writeText(companyCode)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer">
                      Copiar
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Compartilhe este código com seus colaboradores para eles acessarem a empresa no login.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <ImageIcon size={14} /> Logotipo corporativo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                  className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 cursor-pointer"
                />
              </div>
            </div>
          )}

          {active === "aparencia" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cor tema do site</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {THEME_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => onUpdateCompany({ themeColor: c })}
                      title={c}
                      className="w-7 h-7 rounded-full cursor-pointer border-2"
                      style={{ backgroundColor: c, borderColor: themeColor === c ? "#fff" : "transparent" }}
                    />
                  ))}
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => onUpdateCompany({ themeColor: e.target.value })}
                    title="Cor personalizada"
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cor dos ícones e realces</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {THEME_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => onUpdateCompany({ iconColor: c })}
                      title={c}
                      className="w-7 h-7 rounded-full cursor-pointer border-2"
                      style={{ backgroundColor: c, borderColor: iconColor === c ? "#fff" : "transparent" }}
                    />
                  ))}
                  <input
                    type="color"
                    value={iconColor}
                    onChange={(e) => onUpdateCompany({ iconColor: e.target.value })}
                    title="Cor personalizada dos ícones"
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
                  />
                  <button
                    onClick={() => onUpdateCompany({ iconColor: "#10b981" })}
                    className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer ml-1"
                  >
                    padrão (verde)
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Deixe igual à cor tema para um visual uniforme, ou escolha outra para os ícones.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tamanho da logo ({logoSize}px)</label>
                <input type="range" min={24} max={72} value={logoSize} onChange={(e) => onUpdateCompany({ logoSize: Number(e.target.value) })} className="w-full accent-emerald-600 cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Posição do logo no Modo TV</label>
                <select value={tvLogoCorner} onChange={(e) => onUpdateCompany({ tvLogoCorner: e.target.value as Corner })} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                  {CORNERS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {active === "servidores" && <div className="max-w-lg"><ServersSection /></div>}
          {active === "ia" && <div className="max-w-lg"><AiConfigSection /></div>}
          {active === "chatbot" && <div className="max-w-lg"><ChatbotSection /></div>}

          {active === "notificacoes" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-2 max-w-lg">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Bell size={14} /> Som de notificação de novo cliente
                </span>
                <input type="checkbox" checked={!notifMuted} onChange={(e) => toggleNotif(!e.target.checked)} className="accent-emerald-600 w-4 h-4" />
              </label>
              <p className="text-[11px] text-gray-500">Desmarque para silenciar o som e a notificação quando entra um cliente novo no WhatsApp.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
