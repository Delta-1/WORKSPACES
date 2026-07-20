"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronRight, Copy, Eye, KeyRound, Monitor, Power, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { RemoteAgent } from "@/lib/types";

type Company = { company_id: string; name: string; company_code: string | null; plan: string | null; segment: string | null; status: string | null; license_until: string | null; monthly_price: number | null; users: number; clients: number; agents: number; created_at: string };
type AiKeys = { provider: string | null; api_key: string | null; elevenlabs_key: string | null; elevenlabs_voice_id: string | null };
type Agent = { id: string; name: string; access_code: string | null; pin: string | null; os: string | null; status: string | null; is_server: boolean; client_name: string | null };

// GERENCIADOR DE EMPRESAS — só para o Administrador Geral. Lista todas as empresas
// que usam o Workspace e permite ver os acessos (código/PIN) para dar suporte.
export default function AdminCompaniesTab() {
  const [rows, setRows] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Company | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [keys, setKeys] = useState<AiKeys>({ provider: "anthropic", api_key: "", elevenlabs_key: "", elevenlabs_voice_id: "" });
  const [savedKeys, setSavedKeys] = useState(false);
  const [liveAgent, setLiveAgent] = useState<RemoteAgent | null>(null); // ver máquina ao vivo (Admin)

  // Constrói um RemoteAgent a partir do que a listagem admin traz, com controle
  // total (o Admin Geral pode ver/controlar para suporte).
  function toFullAgent(a: Agent): RemoteAgent {
    return {
      id: a.id, company_id: null, client_id: null, name: a.name,
      access_code: a.access_code ?? "", pin: a.pin, status: a.status ?? "offline",
      os: a.os, last_seen: null, created_by: null, created_at: new Date().toISOString(),
      specs: null, is_server: a.is_server, server_root: null, graph_folder_id: null,
      shared_paths: null, allow_control: true, allow_files: true, allow_screenshot: true,
    };
  }

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.rpc("admin_list_companies");
    setRows((data as Company[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openCompany(c: Company) {
    setOpen(c);
    setAgents([]);
    setSavedKeys(false);
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_list_agents", { p_company: c.company_id });
    setAgents((data as Agent[]) ?? []);
    const { data: k } = await supabase.rpc("admin_get_ai_keys", { p_company: c.company_id });
    const row = (k as AiKeys[])?.[0];
    setKeys(row ? { provider: row.provider || "anthropic", api_key: row.api_key || "", elevenlabs_key: row.elevenlabs_key || "", elevenlabs_voice_id: row.elevenlabs_voice_id || "" } : { provider: "anthropic", api_key: "", elevenlabs_key: "", elevenlabs_voice_id: "" });
  }

  async function setLicense(status: string, days: number | null) {
    if (!supabase || !open) return;
    await supabase.rpc("admin_set_license", { p_company: open.company_id, p_status: status, p_days: days });
    setOpen({ ...open, status });
    load();
  }

  async function saveKeys() {
    if (!supabase || !open) return;
    await supabase.rpc("admin_set_ai_keys", { p_company: open.company_id, p_provider: keys.provider, p_api_key: keys.api_key || null, p_eleven: keys.elevenlabs_key || null, p_voice: keys.elevenlabs_voice_id || null });
    setSavedKeys(true);
    setTimeout(() => setSavedKeys(false), 1500);
  }

  const list = rows.filter((r) => `${r.name} ${r.company_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold flex items-center gap-2"><Building2 size={18} className="text-amber-400" /> Gerenciador de Empresas</h2>
        <button onClick={load} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300" title="Atualizar"><RefreshCw size={15} /></button>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">Todas as empresas que usam o Workspace. Só você (Administrador Geral) vê isto.</p>

      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 mb-3 max-w-sm">
        <Search size={14} className="text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa ou código…" className="bg-transparent outline-none text-sm w-full" />
      </div>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
      {!loading && list.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">Nenhuma empresa encontrada.</p>}

      <div className="space-y-2">
        {list.map((c) => (
          <button key={c.company_id} onClick={() => openCompany(c)} className="w-full flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl p-3 text-left hover:bg-white/5 cursor-pointer">
            <span className="w-10 h-10 rounded-lg bg-amber-950/50 flex items-center justify-center shrink-0"><Building2 size={18} className="text-amber-300" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              <p className="text-[11px] text-gray-400 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Users size={11} /> {c.users}</span>
                <span className="flex items-center gap-1"><Building2 size={11} /> {c.clients} clientes</span>
                <span className="flex items-center gap-1"><Monitor size={11} /> {c.agents} acessos</span>
                {c.company_code && <span className="font-mono">{c.company_code}</span>}
                {c.plan && <span className="px-1.5 rounded bg-white/10">{c.plan}</span>}
              </p>
            </div>
            <ChevronRight size={16} className="text-gray-500 shrink-0" />
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold flex items-center gap-2"><Building2 size={15} className="text-amber-400" /> {open.name}</h3>
              <button onClick={() => copy(open.company_code ?? "")} title="Copiar código da empresa" className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer font-mono">
                {open.company_code} <Copy size={12} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto custom-scroll space-y-4">
              {/* Licença */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><ShieldCheck size={12} /> Licença</p>
                <p className="text-[11px] text-gray-400 mb-2">Situação: <b className="text-white capitalize">{open.status || "trial"}</b>{open.monthly_price ? <> · R$ {open.monthly_price}/mês</> : null}{open.license_until ? <> · até {new Date(open.license_until).toLocaleDateString("pt-BR")}</> : null}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setLicense("test", 7)} className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/30 text-sky-200 hover:bg-sky-600/50 cursor-pointer"><Power size={12} /> Teste 7 dias</button>
                  <button onClick={() => setLicense("active", null)} className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/50 cursor-pointer"><Power size={12} /> Ativar licença</button>
                  <button onClick={() => setLicense("blocked", 0)} className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600/30 text-red-200 hover:bg-red-600/50 cursor-pointer"><Power size={12} /> Bloquear</button>
                </div>
                {open.segment && <p className="text-[10px] text-gray-500 mt-1.5">Segmento: {open.segment}</p>}
              </div>

              {/* Chaves de IA / Voz — o super admin configura pela empresa */}
              <div className="pt-3 border-t border-white/10">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><KeyRound size={12} /> Chaves de IA / Voz</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <select value={keys.provider ?? "anthropic"} onChange={(e) => setKeys({ ...keys, provider: e.target.value })} className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs outline-none">
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select>
                  <input value={keys.api_key ?? ""} onChange={(e) => setKeys({ ...keys, api_key: e.target.value })} placeholder="Chave de API (Gemini/Anthropic/OpenAI)" className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs outline-none font-mono" />
                  <input value={keys.elevenlabs_key ?? ""} onChange={(e) => setKeys({ ...keys, elevenlabs_key: e.target.value })} placeholder="Chave ElevenLabs (voz)" className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs outline-none font-mono" />
                  <input value={keys.elevenlabs_voice_id ?? ""} onChange={(e) => setKeys({ ...keys, elevenlabs_voice_id: e.target.value })} placeholder="ID da voz (ElevenLabs)" className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs outline-none font-mono" />
                  <button onClick={saveKeys} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer self-start">{savedKeys ? "✓ Salvo" : "Salvar chaves"}</button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Fica no Copilot (slot interno) da empresa — os agentes sem chave usam esta.</p>
              </div>

              <p className="text-[11px] text-gray-500">Acessos remotos (para dar suporte):</p>
              {agents.length === 0 && <p className="text-xs text-gray-500 py-6 text-center">Nenhum acesso remoto nesta empresa.</p>}
              <div className="space-y-1.5">
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 bg-black/20 rounded-lg p-2">
                    <Monitor size={15} className={`shrink-0 ${a.status === "online" ? "text-emerald-400" : "text-gray-500"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{a.name}{a.is_server ? " · servidor" : ""}</p>
                      <p className="text-[10px] text-gray-500 truncate">{a.client_name || "—"} · {a.os || "?"} · {a.status === "online" ? "online" : "offline"}</p>
                    </div>
                    <button
                      onClick={() => setLiveAgent(toFullAgent(a))}
                      disabled={a.status !== "online"}
                      title={a.status === "online" ? "Ver a tela ao vivo (suporte)" : "Máquina offline"}
                      className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-fuchsia-600/30 text-fuchsia-200 hover:bg-fuchsia-600/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <Eye size={12} /> Ao vivo
                    </button>
                    {a.access_code && (
                      <button onClick={() => copy(a.access_code!)} title="Copiar código de acesso" className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer font-mono">
                        <KeyRound size={11} /> {a.access_code} <Copy size={11} />
                      </button>
                    )}
                    {a.pin && <span className="text-[10px] text-gray-400 font-mono">PIN {a.pin}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {liveAgent && <RemoteViewer agent={liveAgent} onClose={() => setLiveAgent(null)} />}
    </div>
  );
}
