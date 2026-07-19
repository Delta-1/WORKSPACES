"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronRight, Copy, KeyRound, Monitor, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type Company = { company_id: string; name: string; company_code: string | null; plan: string | null; users: number; clients: number; agents: number; created_at: string };
type Agent = { id: string; name: string; access_code: string | null; pin: string | null; os: string | null; status: string | null; is_server: boolean; client_name: string | null };

// GERENCIADOR DE EMPRESAS — só para o Administrador Geral. Lista todas as empresas
// que usam o Workspace e permite ver os acessos (código/PIN) para dar suporte.
export default function AdminCompaniesTab() {
  const [rows, setRows] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Company | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

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
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_list_agents", { p_company: c.company_id });
    setAgents((data as Agent[]) ?? []);
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
            <div className="p-3 overflow-y-auto custom-scroll">
              <p className="text-[11px] text-gray-500 mb-2">Acessos remotos (para dar suporte):</p>
              {agents.length === 0 && <p className="text-xs text-gray-500 py-6 text-center">Nenhum acesso remoto nesta empresa.</p>}
              <div className="space-y-1.5">
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 bg-black/20 rounded-lg p-2">
                    <Monitor size={15} className={`shrink-0 ${a.status === "online" ? "text-emerald-400" : "text-gray-500"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{a.name}{a.is_server ? " · servidor" : ""}</p>
                      <p className="text-[10px] text-gray-500 truncate">{a.client_name || "—"} · {a.os || "?"}</p>
                    </div>
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
    </div>
  );
}
