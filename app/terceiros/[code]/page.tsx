"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Building2, Database, Mail, Phone, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type PortalClient = {
  id: string; name: string; phone: string | null; document: string | null;
  email: string | null; tax_regime: string | null; status: string | null; notes: string | null;
};

// PORTAL DE TERCEIROS (ex.: contabilidades) — espelha o modelo GestaSheet. O
// terceiro abre /terceiros/<CÓDIGO> e vê SÓ os clientes atribuídos a ele, apenas
// para consulta (sem editar). Filtros por busca, situação e regime.
export default function TerceirosPortal({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [thirdParty, setThirdParty] = useState("");
  const [company, setCompany] = useState("");
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [regime, setRegime] = useState("ALL");

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("third_party_portal", { p_code: code }).then(({ data }) => {
      const d = data as { ok: boolean; third_party?: string; company?: string; clients?: PortalClient[] } | null;
      if (!d?.ok) { setInvalid(true); setLoading(false); return; }
      setThirdParty(d.third_party ?? "");
      setCompany(d.company ?? "");
      setClients(d.clients ?? []);
      setLoading(false);
    });
  }, [code]);

  const regimes = useMemo(() => Array.from(new Set(clients.map((c) => c.tax_regime).filter(Boolean))) as string[], [clients]);
  const list = clients.filter((c) => {
    if (status !== "ALL" && (c.status ?? "ativo").toLowerCase() !== status.toLowerCase()) return false;
    if (regime !== "ALL" && c.tax_regime !== regime) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(`${c.name} ${c.document ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(s))) return false;
    }
    return true;
  });
  const activeCount = clients.filter((c) => (c.status ?? "ativo").toLowerCase() === "ativo").length;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#060a12] text-gray-400 text-sm">Carregando…</div>;
  if (invalid) return (
    <div className="min-h-screen flex items-center justify-center bg-[#060a12] text-gray-100 p-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-4"><ShieldCheck size={26} className="text-red-400" /></div>
        <h1 className="text-lg font-bold">Link inválido</h1>
        <p className="text-sm text-gray-400 mt-1">Este link de acesso não é válido. Peça um novo à empresa.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060a12] text-gray-100">
      <header className="border-b border-white/10 bg-black/30 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0"><Database size={20} /></div>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">Portal de Terceiros</h1>
              <p className="text-[11px] text-gray-400 truncate">{thirdParty} · carteira de {company}</p>
            </div>
          </div>
          <span className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">Somente visualização</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <Kpi label="Clientes atribuídos" value={clients.length} />
          <Kpi label="Ativos" value={activeCount} accent="text-emerald-400" />
          <Kpi label="Regimes" value={regimes.length} />
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2 sm:col-span-1">
            <Search size={14} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, CNPJ, telefone…" className="bg-transparent outline-none text-sm w-full" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="ALL">Todas as situações</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <select value={regime} onChange={(e) => setRegime(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="ALL">Todos os regimes</option>
            {regimes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">Nenhum cliente correspondente.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => {
              const active = (c.status ?? "ativo").toLowerCase() === "ativo";
              return (
                <div key={c.id} className="bg-black/25 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-emerald-950/50 border border-white/10 flex items-center justify-center text-emerald-300 shrink-0"><Building2 size={16} /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{c.name}</p>
                        {c.document && <p className="text-[11px] text-gray-500 truncate">{c.document}</p>}
                      </div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${active ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-gray-400 border-white/15"}`}>{active ? "ATIVO" : "INATIVO"}</span>
                  </div>
                  <div className="mt-2.5 space-y-1 text-[11px] text-gray-400">
                    {c.tax_regime && <p><span className="text-gray-500">Regime:</span> {c.tax_regime}</p>}
                    {c.phone && <p className="flex items-center gap-1.5"><Phone size={11} /> {c.phone}</p>}
                    {c.email && <p className="flex items-center gap-1.5 truncate"><Mail size={11} /> {c.email}</p>}
                    {c.notes && <p className="text-gray-500 line-clamp-2">{c.notes}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-gray-600 text-center mt-6">Acesso de terceiro — apenas leitura dos clientes atribuídos. Workspace.</p>
      </main>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-black/25 border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
