"use client";

import { useEffect, useState } from "react";
import { Bell, Bot, Building2, Download, FolderTree, Image as ImageIcon, MonitorDown, Palette, Server, Sliders, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
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

// Estilos visuais completos do site (aplicados via data-style no <html>).
const SITE_STYLES: { id: string; name: string; desc: string; swatch: string }[] = [
  { id: "aurora", name: "Aurora", desc: "Vidro translúcido (padrão)", swatch: "linear-gradient(135deg,#0b1220,#1e293b)" },
  { id: "midnight", name: "Midnight", desc: "Escuro sólido, minimalista", swatch: "#14141c" },
  { id: "slate", name: "Slate", desc: "Corporativo cinza-azulado", swatch: "#1e293b" },
  { id: "sunset", name: "Sunset", desc: "Fundo quente com brilho", swatch: "linear-gradient(135deg,#3b1d3a,#fbbf24)" },
  { id: "paper", name: "Paper", desc: "Claro e limpo (documento)", swatch: "#ffffff" },
];

type SectionId = "empresa" | "aparencia" | "instalacao" | "servidores" | "ia" | "chatbot" | "notificacoes";
const SECTIONS: { id: SectionId; label: string; icon: typeof Building2 }[] = [
  { id: "empresa", label: "Empresa", icon: Building2 },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "instalacao", label: "Instalação Acesso Remoto", icon: MonitorDown },
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
  themeStyle,
  address,
  addressLink,
  phone,
  email,
  website,
  reviewLink,
  photoUrl,
  autoCloseMinutes,
  description,
  remoteAgentUrl,
  onUpdateCompany,
}: {
  companyName: string;
  companyCode?: string | null;
  tvLogoCorner: Corner;
  googleDriveEnabled: boolean;
  themeColor: string;
  iconColor: string;
  logoSize: number;
  themeStyle: string;
  address: string | null;
  addressLink: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  reviewLink: string | null;
  photoUrl: string | null;
  autoCloseMinutes: number;
  description: string | null;
  remoteAgentUrl: string | null;
  onUpdateCompany: (update: {
    name?: string;
    description?: string;
    remoteAgentUrl?: string;
    address?: string;
    addressLink?: string;
    phone?: string;
    email?: string;
    website?: string;
    reviewLink?: string;
    photoUrl?: string;
    autoCloseMinutes?: number;
    logoDataUrl?: string;
    tvLogoCorner?: Corner;
    googleDriveEnabled?: boolean;
    themeColor?: string;
    iconColor?: string;
    logoSize?: number;
    themeStyle?: string;
  }) => void;
}) {
  const [name, setName] = useState(companyName);
  const [notifMuted, setNotifMuted] = useState(false);
  const [active, setActive] = useState<SectionId>("empresa");
  // Rascunhos dos campos de contato (salvam ao sair do campo).
  const [draftAddress, setDraftAddress] = useState(address ?? "");
  const [draftAddressLink, setDraftAddressLink] = useState(addressLink ?? "");
  const [draftPhone, setDraftPhone] = useState(phone ?? "");
  const [draftEmail, setDraftEmail] = useState(email ?? "");
  const [draftWebsite, setDraftWebsite] = useState(website ?? "");
  const [draftReview, setDraftReview] = useState(reviewLink ?? "");
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftRemoteUrl, setDraftRemoteUrl] = useState(remoteAgentUrl ?? "");
  useEffect(() => { setDraftRemoteUrl(remoteAgentUrl ?? ""); }, [remoteAgentUrl]);
  useEffect(() => { setDraftDescription(description ?? ""); }, [description]);
  useEffect(() => { setDraftAddress(address ?? ""); }, [address]);
  useEffect(() => { setDraftAddressLink(addressLink ?? ""); }, [addressLink]);
  useEffect(() => { setDraftPhone(phone ?? ""); }, [phone]);
  useEffect(() => { setDraftEmail(email ?? ""); }, [email]);
  useEffect(() => { setDraftWebsite(website ?? ""); }, [website]);
  useEffect(() => { setDraftReview(reviewLink ?? ""); }, [reviewLink]);

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

  function handlePhoto(file: File) {
    // Reduz a foto do local antes de salvar (evita base64 gigante).
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, c.width, c.height);
          onUpdateCompany({ photoUrl: c.toDataURL("image/jpeg", 0.82) });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
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
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descrição (aparece embaixo do nome)</label>
                <input
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onBlur={() => onUpdateCompany({ description: draftDescription.trim() })}
                  placeholder="Ex.: Soluções em tecnologia · Suporte 24h"
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">Uma frase curta que aparece embaixo do nome da empresa no topo. Cada empresa tem a sua.</p>
              </div>
              <ClientSubfoldersField />
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

              {/* Contato da empresa — o robô usa para responder endereço, telefone,
                  convidar para o site e pedir avaliação. */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Contato & endereço (o robô usa isso)</p>
                <CfgField label="Endereço (escrito)" value={draftAddress} onChange={setDraftAddress} onSave={(v) => onUpdateCompany({ address: v })} placeholder="Rua Exemplo, 123 — Bairro, Cidade/UF" />
                <CfgField label="Link do endereço (Google Maps)" value={draftAddressLink} onChange={setDraftAddressLink} onSave={(v) => onUpdateCompany({ addressLink: v })} placeholder="https://maps.google.com/..." />
                <div className="grid grid-cols-2 gap-3">
                  <CfgField label="Telefone" value={draftPhone} onChange={setDraftPhone} onSave={(v) => onUpdateCompany({ phone: v })} placeholder="(00) 0000-0000" />
                  <CfgField label="E-mail" value={draftEmail} onChange={setDraftEmail} onSave={(v) => onUpdateCompany({ email: v })} placeholder="contato@empresa.com" />
                </div>
                <CfgField label="Site" value={draftWebsite} onChange={setDraftWebsite} onSave={(v) => onUpdateCompany({ website: v })} placeholder="https://www.empresa.com" />
                <CfgField label="Link de avaliação (Google/etc.)" value={draftReview} onChange={setDraftReview} onSave={(v) => onUpdateCompany({ reviewLink: v })} placeholder="https://g.page/r/.../review" />
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <ImageIcon size={14} /> Foto do escritório / local
                  </label>
                  <div className="flex items-center gap-3">
                    {photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
                      className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 cursor-pointer"
                    />
                    {photoUrl && (
                      <button onClick={() => onUpdateCompany({ photoUrl: "" })} className="text-[11px] text-gray-400 hover:text-red-400 underline cursor-pointer shrink-0">remover</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Encerrar atendimento por inatividade</label>
                  <select
                    value={autoCloseMinutes}
                    onChange={(e) => onUpdateCompany({ autoCloseMinutes: Number(e.target.value) })}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                  >
                    <option value={0}>Desligado (só manual)</option>
                    <option value={30}>Após 30 minutos sem resposta</option>
                    <option value={60}>Após 1 hora sem resposta</option>
                    <option value={120}>Após 2 horas sem resposta</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">Quando o cliente some, o robô encerra o atendimento e pede avaliação (se houver link).</p>
                </div>
              </div>
            </div>
          )}

          {active === "aparencia" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Estilo do site</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SITE_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onUpdateCompany({ themeStyle: s.id })}
                      className={`rounded-xl p-2.5 text-left cursor-pointer border transition-colors ${
                        themeStyle === s.id ? "border-emerald-400 ring-1 ring-emerald-400/40" : "border-white/10 hover:border-white/25"
                      }`}
                    >
                      <span className="block h-8 rounded-lg mb-1.5" style={{ background: s.swatch }} />
                      <span className="text-xs font-semibold block">{s.name}</span>
                      <span className="text-[10px] text-gray-500">{s.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Muda toda a cara do site: fundo, superfícies e clima. A cor tema continua valendo por cima.</p>
              </div>
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

          {active === "instalacao" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-lg">
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2"><MonitorDown size={16} className="text-emerald-400" /> Instalar o Acesso Remoto</h4>
                <p className="text-[11px] text-gray-400 mt-1">
                  Baixe e instale o aplicativo na máquina que você quer controlar (ou usar como servidor). Ao abrir, ele gera um <b>código</b> para você conectar aqui pelo Acesso Remoto. Funciona no Windows e no Linux.
                </p>
              </div>

              {/* Botão de download — sempre aponta para a ÚLTIMA versão no Drive. */}
              {draftRemoteUrl.trim() ? (
                <a
                  href={draftRemoteUrl.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-3 rounded-xl cursor-pointer"
                >
                  <Download size={16} /> Baixar o aplicativo (última versão)
                </a>
              ) : (
                <div className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded-lg px-3 py-2">
                  Nenhum link cadastrado ainda. Cole abaixo o link do Drive onde fica sempre a última versão do app.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Link do aplicativo no Drive (última versão)</label>
                <input
                  value={draftRemoteUrl}
                  onChange={(e) => setDraftRemoteUrl(e.target.value)}
                  onBlur={() => onUpdateCompany({ remoteAgentUrl: draftRemoteUrl.trim() })}
                  placeholder="https://drive.google.com/…"
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-1">Link para a 1ª instalação (download manual). Para a <b>atualização automática</b>, use o publicador abaixo.</p>
              </div>

              <ReleasePublisher />
            </div>
          )}

          {active === "servidores" && <div className="max-w-lg"><ServersSection /></div>}
          {active === "ia" && <div className="max-w-lg"><AiConfigSection /></div>}
          {active === "chatbot" && <div className="max-w-lg"><ChatbotSection /></div>}

          {active === "notificacoes" && (
            <div className="liquid-glass rounded-2xl p-5 space-y-2 max-w-lg">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Bell size={14} /> Som de "Aguardando atendimento"
                </span>
                <input type="checkbox" checked={!notifMuted} onChange={(e) => toggleNotif(!e.target.checked)} className="accent-emerald-600 w-4 h-4" />
              </label>
              <p className="text-[11px] text-gray-500">Toca um som e mostra uma notificação sempre que um contato entra na fila <b>Aguardando atendimento</b> (cliente novo ou mensagem sem resposta). Desmarque para silenciar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Campo de texto que salva ao sair do foco (onBlur) — usado no contato da empresa.
function CfgField({
  label,
  value,
  onChange,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onSave(value.trim())}
        placeholder={placeholder}
        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

// Ramificações padrão das pastas de clientes (cada cliente novo nasce com elas).
function ClientSubfoldersField() {
  const [val, setVal] = useState("");
  const [cid, setCid] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("company_settings").select("company_id, client_subfolders").maybeSingle().then(({ data }) => {
      const arr = Array.isArray(data?.client_subfolders) ? data.client_subfolders : ["Documentos", "Contratos", "Artes", "Aplicativos"];
      setVal(arr.join(", "));
      setCid((data?.company_id as string) ?? null);
      setLoaded(true);
    });
  }, []);
  async function save() {
    if (!supabase || !cid) return;
    const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
    await supabase.from("company_settings").update({ client_subfolders: arr }).eq("company_id", cid);
  }
  if (!loaded) return null;
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <FolderTree size={13} className="text-emerald-400" /> Ramificações padrão dos clientes
      </label>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        placeholder="Documentos, Contratos, Artes, Aplicativos"
        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
      />
      <p className="text-[10px] text-gray-500 mt-1">Separadas por vírgula. Cada cliente novo já nasce com essas pastinhas dentro da pasta dele no grafo.</p>
    </div>
  );
}

// Publicador de versões do app de Acesso Remoto: o gestor sobe o .exe/.AppImage,
// o site gera o link direto (Supabase Storage) e publica em app_releases — aí
// todas as máquinas se atualizam sozinhas. Sem link manual, sem SQL.
function ReleasePublisher() {
  const [version, setVersion] = useState("");
  const [current, setCurrent] = useState<{ version: string; url_win: string | null; url_linux: string | null } | null>(null);
  const [winUrl, setWinUrl] = useState<string | null>(null);
  const [linuxUrl, setLinuxUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("app_releases").select("version,url_win,url_linux").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        setCurrent(data as { version: string; url_win: string | null; url_linux: string | null });
        setWinUrl(data.url_win ?? null);
        setLinuxUrl(data.url_linux ?? null);
      }
    });
  }, []);

  async function upload(kind: "win" | "linux", file: File) {
    if (!supabase) return;
    setBusy(kind);
    setMsg(null);
    try {
      const ext = kind === "win" ? "exe" : "AppImage";
      const path = `${kind}/workspace-remote-${Date.now()}.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage.from("downloads").upload(path, buf, { contentType: "application/octet-stream", upsert: true });
      if (error) throw error;
      const url = supabase.storage.from("downloads").getPublicUrl(path).data.publicUrl;
      if (kind === "win") setWinUrl(url); else setLinuxUrl(url);
      setMsg(`✓ ${kind === "win" ? "Windows" : "Linux"} enviado.`);
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : "falha no envio"));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!supabase) return;
    if (!version.trim()) { setMsg("Informe a versão (ex.: 1.1.0)."); return; }
    setBusy("publish");
    const { error } = await supabase.from("app_releases").update({ version: version.trim(), url_win: winUrl, url_linux: linuxUrl, updated_at: new Date().toISOString() }).eq("id", true);
    setBusy(null);
    if (error) { setMsg("Erro ao publicar: " + error.message); return; }
    setCurrent({ version: version.trim(), url_win: winUrl, url_linux: linuxUrl });
    setMsg("✓ Atualização publicada! As máquinas vão se atualizar sozinhas.");
  }

  return (
    <div className="pt-3 border-t border-white/10 space-y-3">
      <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Publicar atualização automática</p>
      <p className="text-[11px] text-gray-400">
        Suba aqui o instalador gerado no seu build (GitHub Actions). O site guarda e gera o link direto; ao publicar, todas as máquinas atualizam sozinhas.
        {current && <> Versão publicada hoje: <b className="text-white">{current.version}</b>.</>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-black/20 rounded-lg p-2.5">
          <p className="text-[11px] font-semibold mb-1.5">Windows (.exe)</p>
          <label className={`text-[11px] px-2 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1 ${busy === "win" ? "bg-white/5 text-gray-500" : "bg-white/10 hover:bg-white/20"}`}>
            <ImageIcon size={12} /> {busy === "win" ? "Enviando…" : winUrl ? "Trocar" : "Enviar .exe"}
            <input type="file" accept=".exe" className="hidden" disabled={busy !== null} onChange={(e) => e.target.files?.[0] && upload("win", e.target.files[0])} />
          </label>
          {winUrl && <p className="text-[9px] text-emerald-400 mt-1 truncate">✓ pronto</p>}
        </div>
        <div className="bg-black/20 rounded-lg p-2.5">
          <p className="text-[11px] font-semibold mb-1.5">Linux (.AppImage)</p>
          <label className={`text-[11px] px-2 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1 ${busy === "linux" ? "bg-white/5 text-gray-500" : "bg-white/10 hover:bg-white/20"}`}>
            <ImageIcon size={12} /> {busy === "linux" ? "Enviando…" : linuxUrl ? "Trocar" : "Enviar .AppImage"}
            <input type="file" accept=".AppImage,application/octet-stream" className="hidden" disabled={busy !== null} onChange={(e) => e.target.files?.[0] && upload("linux", e.target.files[0])} />
          </label>
          {linuxUrl && <p className="text-[9px] text-emerald-400 mt-1 truncate">✓ pronto</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Nova versão (ex.: 1.1.0)" className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <button onClick={publish} disabled={busy !== null || (!winUrl && !linuxUrl)} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
          {busy === "publish" ? "Publicando…" : "Publicar"}
        </button>
      </div>
      {msg && <p className={`text-[11px] ${msg.startsWith("✓") ? "text-emerald-400" : "text-gray-400"}`}>{msg}</p>}
    </div>
  );
}
