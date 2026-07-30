"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, FileText, FolderKanban, KeyRound, Link2, MessageCircle, MonitorSmartphone, Network, Server, Sparkles, Upload, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { FEATURES, type FeatureId } from "@/lib/plan";
import type { AiProvider, Company, Profile, RemoteAgent } from "@/lib/types";

const NICHES = ["Suporte técnico / TI", "Escritório / Administrativo", "Comércio / Loja", "Serviços", "Saúde", "Educação", "Restaurante / Food", "Contabilidade", "Imobiliária", "Transportadora / Logística", "Outro"];
const REQUEST_KEYS_URL = `https://wa.me/5519989478465?text=${encodeURIComponent("Olá! Estou configurando meu Workspace e gostaria de solicitar uma chave de API para IA e uma chave da ElevenLabs.")}`;

type Step = "profile" | "apis" | "server" | "tutorial";

const BASE_TOOLS = [
  { name: "Calendário", desc: "Compromissos, prazos e reuniões.", icon: FileText },
  { name: "Kanban", desc: "Tarefas organizadas por andamento.", icon: FolderKanban },
  { name: "Setores", desc: "Estrutura e responsáveis da empresa.", icon: Users },
  { name: "Arquivos", desc: "Pastas armazenadas na máquina-servidor.", icon: Network },
];

export default function InitialSetupWizard({
  profile,
  company,
  enabledFeatures,
  onDone,
  onLogout,
}: {
  profile: Profile;
  company: Company;
  enabledFeatures: FeatureId[];
  onDone: () => void;
  onLogout: () => void;
}) {
  const isHome = company.company_type === "Casa";
  const [step, setStep] = useState<Step>("profile");
  const [name, setName] = useState(company.name);
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState<string | null>(company.logo_url);
  const [niche, setNiche] = useState(isHome ? "Pessoal / Casa" : NICHES[0]);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [elevenKey, setElevenKey] = useState("");
  const [hasAi, setHasAi] = useState(false);
  const [hasEleven, setHasEleven] = useState(false);
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [serverId, setServerId] = useState<string | null>(null);
  const [serverRoot, setServerRoot] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: { id: Step; label: string }[] = [
    { id: "profile", label: isHome ? "Seu espaço" : "Empresa" },
    { id: "apis", label: "APIs" },
    { id: "server", label: "Servidor" },
    { id: "tutorial", label: "Tutorial" },
  ];
  const stepIndex = steps.findIndex((item) => item.id === step);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [settings, config, remote] = await Promise.all([
      supabase.from("company_settings").select("name,logo_url,website,onboarding_niche").eq("company_id", company.id).maybeSingle(),
      supabase.from("ai_config").select("provider,api_key,elevenlabs_key").eq("user_id", profile.id).maybeSingle(),
      supabase.rpc("my_remote_agents"),
    ]);
    if (settings.data) {
      setName(settings.data.name || company.name);
      setLogo(settings.data.logo_url || company.logo_url);
      setWebsite(settings.data.website || "");
      setNiche(settings.data.onboarding_niche || (isHome ? "Pessoal / Casa" : NICHES[0]));
    }
    if (config.data) {
      setProvider((config.data.provider || "gemini") as AiProvider);
      setHasAi(Boolean(config.data.api_key));
      setHasEleven(Boolean(config.data.elevenlabs_key));
    }
    const list = (remote.data as RemoteAgent[] | null) ?? [];
    setAgents(list);
    const currentServer = list.find((agent) => agent.is_server && agent.company_id === company.id);
    if (currentServer) {
      setServerId(currentServer.id);
      setServerRoot(currentServer.server_root || "");
    }
  }, [company.id, company.logo_url, company.name, isHome, profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function readLogo(file: File) {
    if (file.size > 2_000_000) {
      setError("Escolha uma imagem de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!supabase || !name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("company_settings")
      .update({
        name: name.trim(),
        logo_url: logo,
        website: website.trim() || null,
        onboarding_niche: niche,
        enabled_features: enabledFeatures,
        wa_number_limit: 1,
        remote_access_limit: 1,
      })
      .eq("company_id", company.id);
    setBusy(false);
    if (saveError) setError(saveError.message);
    else setStep("apis");
  }

  async function saveApis() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const patch: Record<string, string> = { provider };
    if (apiKey.trim()) patch.api_key = apiKey.trim();
    if (elevenKey.trim()) patch.elevenlabs_key = elevenKey.trim();
    let saveError = null;
    if (hasAi || hasEleven) {
      ({ error: saveError } = await supabase.from("ai_config").update(patch).eq("user_id", profile.id));
    } else if (apiKey.trim() || elevenKey.trim()) {
      ({ error: saveError } = await supabase.from("ai_config").insert({
        user_id: profile.id,
        provider,
        api_key: apiKey.trim(),
        elevenlabs_key: elevenKey.trim() || null,
      }));
    }
    setBusy(false);
    if (saveError) setError(saveError.message);
    else setStep("server");
  }

  async function claimMachine() {
    const clean = code.replace(/\D/g, "");
    if (!supabase || clean.length < 6) return;
    setBusy(true);
    setError(null);
    const { error: claimError } = await supabase.rpc("claim_agent", { p_code: clean, p_name: label.trim() || null });
    setBusy(false);
    if (claimError) setError(claimError.message);
    else {
      setCode("");
      setLabel("");
      await load();
    }
  }

  async function configureServer() {
    if (!supabase || !serverId) return;
    const agent = agents.find((item) => item.id === serverId);
    if (!agent) return;
    setBusy(true);
    setError(null);
    let folderId = agent.graph_folder_id;
    if (!folderId) {
      const { data: folder, error: folderError } = await supabase
        .from("files")
        .insert({ name: `Servidor: ${agent.name}`, type: "folder", parent_id: null, company_id: company.id })
        .select("id")
        .single();
      if (folderError) {
        setBusy(false);
        setError(folderError.message);
        return;
      }
      folderId = folder?.id ?? null;
    }
    const { error: serverError } = await supabase
      .from("remote_agents")
      .update({
        is_server: true,
        company_id: company.id,
        graph_folder_id: folderId,
        server_root: serverRoot.trim() || null,
      })
      .eq("id", serverId);
    setBusy(false);
    if (serverError) setError(serverError.message);
    else {
      await load();
      setStep("tutorial");
    }
  }

  async function finish() {
    if (!supabase) return;
    setBusy(true);
    const { error: finishError } = await supabase
      .from("company_settings")
      .update({ onboarding_completed: true })
      .eq("company_id", company.id);
    setBusy(false);
    if (finishError) setError(finishError.message);
    else onDone();
  }

  const tutorialTools = useMemo(() => {
    const optional = enabledFeatures
      .map((id) => FEATURES.find((feature) => feature.id === id))
      .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))
      .map((feature) => ({ name: feature.label, desc: feature.desc, icon: feature.id === "mensagens" ? MessageCircle : feature.id === "remoto" ? MonitorSmartphone : Sparkles }));
    return [
      ...BASE_TOOLS,
      ...(isHome ? [{ name: "Group", desc: "Grupos, listas e organização compartilhada.", icon: Users }] : []),
      ...optional,
    ];
  }, [enabledFeatures, isHome]);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#07101b]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-24 top-16 w-96 h-96 rounded-full bg-emerald-500/20 blur-[100px]" />
        <div className="absolute right-0 bottom-0 w-[520px] h-[520px] rounded-full bg-indigo-500/20 blur-[130px]" />
        <div className="absolute inset-5 md:inset-10 rounded-[36px] border border-white/10 bg-white/[0.035] blur-[7px]" />
      </div>
      <div className="fixed inset-0 backdrop-blur-xl bg-black/45" />

      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0a111c]/95 shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] text-emerald-400 uppercase tracking-[0.22em] font-bold">Primeiros passos</p>
              <h1 className="text-lg font-bold">Prepare seu Workspace</h1>
            </div>
            <button onClick={onLogout} title="Sair" className="p-2 rounded-xl hover:bg-white/10 text-gray-500 cursor-pointer"><X size={17} /></button>
          </div>

          <div className="px-5 pt-4 grid grid-cols-4 gap-2">
            {steps.map((item, index) => (
              <div key={item.id} className={`rounded-xl border px-2 py-2 text-center text-[10px] ${index <= stepIndex ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-200" : "border-white/10 text-gray-600"}`}>
                <span className="font-bold">{index + 1}</span> · {item.label}
              </div>
            ))}
          </div>

          <div className="p-5 md:p-7 min-h-[430px]">
            {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</div>}

            {step === "profile" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">{isHome ? <Users className="text-emerald-400" /> : <Building2 className="text-emerald-400" />} {isHome ? "Seu espaço pessoal" : "Identidade da empresa"}</h2>
                  <p className="text-sm text-gray-400 mt-1">O Básico é gratuito: Calendário, Kanban, Setores e Arquivos. {isHome && "Sua conta também inclui Group, Mensagens, uma máquina e um WhatsApp."}</p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="w-20 h-20 rounded-2xl border border-dashed border-white/20 bg-black/20 flex items-center justify-center overflow-hidden cursor-pointer shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {logo ? <img src={logo} alt="Logo" className="w-full h-full object-cover" /> : <Upload size={20} className="text-gray-500" />}
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && readLogo(event.target.files[0])} />
                  </label>
                  <div className="flex-1 space-y-2">
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder={isHome ? "Nome do seu espaço" : "Nome da empresa"} className="w-full in" />
                    <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Site (opcional) — https://..." className="w-full in" />
                  </div>
                </div>
                {!isHome && (
                  <label className="block">
                    <span className="text-xs text-gray-400 block mb-1">Nicho da empresa</span>
                    <select value={niche} onChange={(event) => setNiche(event.target.value)} className="w-full in">
                      {NICHES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <span className="text-[10px] text-gray-500 mt-1 block">O Workspace usa o nicho para sugerir ferramentas e configurações iniciais.</span>
                  </label>
                )}
                <button onClick={saveProfile} disabled={busy || !name.trim()} className="primary w-full">{busy ? "Salvando…" : "Continuar"}</button>
              </div>
            )}

            {step === "apis" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound className="text-indigo-400" /> Conecte suas inteligências</h2>
                  <p className="text-sm text-gray-400 mt-1">As chaves ficam protegidas no seu usuário. Você pode continuar sem elas e configurar depois.</p>
                </div>
                <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} className="w-full in">
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                </select>
                <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasAi ? "Chave de IA já configurada — deixe vazio para manter" : "Chave da API de IA"} className="w-full in font-mono" />
                <input type="password" value={elevenKey} onChange={(event) => setElevenKey(event.target.value)} placeholder={hasEleven ? "ElevenLabs já configurada — deixe vazio para manter" : "Chave da ElevenLabs (voz)"} className="w-full in font-mono" />
                <a href={REQUEST_KEYS_URL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full rounded-xl border border-emerald-500/30 bg-emerald-950/25 py-3 text-sm text-emerald-200 hover:bg-emerald-950/40">
                  <MessageCircle size={16} /> Solicitar as chaves pelo WhatsApp
                </a>
                <button onClick={saveApis} disabled={busy} className="primary w-full">{busy ? "Salvando…" : apiKey || elevenKey ? "Salvar e continuar" : "Continuar sem chaves"}</button>
              </div>
            )}

            {step === "server" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><Server className="text-sky-400" /> Máquina-servidor obrigatória</h2>
                  <p className="text-sm text-gray-400 mt-1">Arquivos precisam de uma máquina vinculada. Instale o agente de acesso remoto, copie o código e conecte aqui.</p>
                </div>
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nome da máquina" className="in" />
                  <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código do acesso remoto" inputMode="numeric" className="in font-mono" />
                  <button onClick={claimMachine} disabled={busy || code.replace(/\D/g, "").length < 6} className="secondary"><Link2 size={15} /> Vincular</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {agents.map((agent) => (
                    <button key={agent.id} onClick={() => { setServerId(agent.id); setServerRoot(agent.server_root || ""); }} className={`rounded-xl border p-3 text-left ${serverId === agent.id ? "border-sky-400 bg-sky-950/25" : "border-white/10 bg-black/20"}`}>
                      <p className="text-sm font-semibold">{agent.name}</p>
                      <p className="text-[10px] text-gray-500">{agent.is_server ? "Já configurada como servidor" : "Disponível para configurar"}</p>
                    </button>
                  ))}
                </div>
                {agents.length === 0 && <p className="text-xs text-amber-200 rounded-xl border border-amber-500/20 bg-amber-950/20 p-3">Nenhuma máquina vinculada. Este passo é obrigatório para liberar os Arquivos.</p>}
                <input value={serverRoot} onChange={(event) => setServerRoot(event.target.value)} placeholder="Pasta do servidor (opcional, ex.: C:\\Workspace)" className="w-full in font-mono" />
                <p className="text-[11px] text-gray-500">{isHome ? "Seu plano pessoal inclui uma máquina. Máquinas adicionais custam R$ 5 por acesso." : "Cada máquina custa R$ 5 por acesso. O plano ilimitado pode ser solicitado pelo atendimento."}</p>
                <button onClick={configureServer} disabled={busy || !serverId} className="primary w-full">{busy ? "Configurando…" : "Configurar servidor e continuar"}</button>
              </div>
            )}

            {step === "tutorial" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-amber-400" /> Seu Workspace está pronto</h2>
                  <p className="text-sm text-gray-400 mt-1">Este resumo mostra somente as ferramentas ativadas na sua conta.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 max-h-[290px] overflow-y-auto custom-scroll pr-1">
                  {tutorialTools.map(({ name: toolName, desc, icon: Icon }) => (
                    <div key={toolName} className="rounded-xl border border-white/10 bg-black/20 p-3 flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-950/40 text-emerald-400 flex items-center justify-center shrink-0"><Icon size={17} /></div>
                      <div><p className="text-sm font-semibold">{toolName}</p><p className="text-[10px] text-gray-500">{desc}</p></div>
                    </div>
                  ))}
                </div>
                <button onClick={finish} disabled={busy} className="primary w-full"><Check size={16} /> {busy ? "Finalizando…" : "Entrar no Workspace"}</button>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
            <button onClick={() => stepIndex > 0 && setStep(steps[stepIndex - 1].id)} disabled={stepIndex === 0 || busy} className="text-xs text-gray-400 hover:text-white disabled:opacity-30 flex items-center gap-1 cursor-pointer"><ChevronLeft size={14} /> Voltar</button>
            <span className="text-[10px] text-gray-600">{stepIndex + 1} de {steps.length}</span>
            <span className="text-xs text-gray-500 flex items-center gap-1">Workspace <ChevronRight size={13} /></span>
          </div>
        </div>
      </div>
      <style jsx>{`
        .in { background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.1); border-radius: .75rem; padding: .7rem .85rem; font-size: .875rem; outline: none; }
        .in:focus { border-color: rgba(16,185,129,.55); }
        .primary { display:flex; align-items:center; justify-content:center; gap:.45rem; border-radius:.75rem; background:#059669; color:white; padding:.75rem 1rem; font-size:.875rem; font-weight:600; cursor:pointer; }
        .primary:disabled { opacity:.45; cursor:default; }
        .secondary { display:flex; align-items:center; justify-content:center; gap:.4rem; border-radius:.75rem; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.07); padding:.65rem .9rem; font-size:.75rem; cursor:pointer; }
        .secondary:disabled { opacity:.4; }
      `}</style>
    </div>
  );
}
