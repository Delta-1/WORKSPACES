"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Cpu, HardDrive, MemoryStick, Monitor, Plus, Search, Trash2, UserPlus, Wifi, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { Client, Profile, RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  if (a.status !== "online" || !a.last_seen) return false;
  return Date.now() - new Date(a.last_seen).getTime() < 60000;
}

// Painel de panorama que aparece ao passar o mouse num computador.
function AgentInfoPanel({ agent }: { agent: RemoteAgent }) {
  const online = isOnline(agent);
  const s = agent.specs;
  const secs = agent.last_seen ? Math.round((Date.now() - new Date(agent.last_seen).getTime()) / 1000) : null;
  const quality = !online ? { label: "Offline", color: "text-gray-400", bar: "bg-gray-600", pct: 0 }
    : secs != null && secs < 25 ? { label: "Ótima", color: "text-emerald-400", bar: "bg-emerald-500", pct: 100 }
    : secs != null && secs < 45 ? { label: "Boa", color: "text-lime-400", bar: "bg-lime-500", pct: 66 }
    : { label: "Instável", color: "text-amber-400", bar: "bg-amber-500", pct: 33 };
  const plat = s?.platform === "win32" ? "Windows" : s?.platform === "darwin" ? "macOS" : s?.platform === "linux" ? "Linux" : null;
  return (
    <div className="fixed top-20 right-6 z-40 w-72 liquid-glass rounded-2xl p-4 border border-white/10 shadow-2xl pointer-events-none">
      <p className="text-sm font-bold flex items-center gap-2 mb-1">
        <Monitor size={15} className="text-emerald-400" /> {agent.name}
      </p>
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-gray-400 flex items-center gap-1"><Wifi size={11} /> Conexão</span>
          <span className={quality.color}>{quality.label}</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full ${quality.bar}`} style={{ width: `${quality.pct}%` }} />
        </div>
      </div>
      {s ? (
        <div className="space-y-1.5 text-[11px] text-gray-300">
          {plat && <p className="flex items-center gap-1.5"><Monitor size={11} className="text-gray-500" /> {plat} · {s.arch}</p>}
          {s.cpu && <p className="flex items-center gap-1.5"><Cpu size={11} className="text-gray-500" /> <span className="truncate">{s.cpu} ({s.cores}n)</span></p>}
          {s.memTotalGB != null && (
            <p className="flex items-center gap-1.5">
              <MemoryStick size={11} className="text-gray-500" /> RAM {s.memTotalGB} GB (livre {s.memFreeGB} GB)
            </p>
          )}
          {s.networks && s.networks.length > 0 && (
            <div className="flex items-start gap-1.5">
              <HardDrive size={11} className="text-gray-500 mt-0.5 shrink-0" />
              <span className="min-w-0">
                {s.networks.map((n) => (
                  <span key={n.ip} className="block truncate">{n.name}: {n.ip}</span>
                ))}
              </span>
            </div>
          )}
          {s.uptimeH != null && <p className="text-gray-500">Ligado há {s.uptimeH}h</p>}
          <p className={`flex items-center gap-1.5 ${s.elevated ? "text-emerald-400" : "text-amber-400"}`}>
            <Cpu size={11} className={s.elevated ? "text-emerald-400" : "text-amber-400"} />
            {s.elevated ? "Acesso completo (admin)" : "Acesso limitado (sem admin)"}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          Sem detalhes ainda. Atualize o app na máquina do cliente para ver rede, CPU e memória aqui.
        </p>
      )}
    </div>
  );
}

export default function ClientsTab({ profile }: { profile: Profile | null }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<RemoteAgent | null>(null);
  const [hovered, setHovered] = useState<RemoteAgent | null>(null);
  const canManage = profile?.role === "gestor" || profile?.role === "gerente";
  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!supabase || !companyId) return;
    const [cRes, aRes] = await Promise.all([
      supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
      supabase.from("remote_agents").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    setClients((cRes.data as Client[]) ?? []);
    setAgents((aRes.data as RemoteAgent[]) ?? []);
  }, [companyId]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("clients-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_agents" }, () => load())
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  async function removeClient(id: string) {
    if (!supabase) return;
    if (!confirm("Remover este cliente? Os computadores dele ficam sem vínculo (não são apagados).")) return;
    await supabase.from("clients").delete().eq("id", id);
    load();
  }

  async function linkAgent(agentId: string, clientId: string | null) {
    if (!supabase) return;
    if (clientId) {
      await supabase.rpc("link_agent_to_client", { p_agent_id: agentId, p_client_id: clientId });
    } else {
      await supabase.from("remote_agents").update({ client_id: null }).eq("id", agentId);
    }
    load();
  }

  const filtered = clients.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.document ?? "").toLowerCase().includes(q)
    );
  });
  const unlinked = agents.filter((a) => !a.client_id);

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Building2 className="text-emerald-400" size={20} /> Clientes
          <span className="text-xs font-normal text-gray-500">({clients.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="liquid-glass rounded-lg flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome, telefone, CNPJ/CPF..."
              className="bg-transparent outline-none text-xs w-56"
            />
          </div>
          {canManage && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
            >
              <Plus size={14} /> Novo cliente
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">
            Nenhum cliente cadastrado. Clique em “Novo cliente”.
          </p>
        )}
        {filtered.map((c) => {
          const machines = agents.filter((a) => a.client_id === c.id);
          return (
            <div key={c.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {[c.phone, c.document].filter(Boolean).join(" · ") || "Sem contato"}
                  </p>
                </div>
                {canManage && (
                  <button onClick={() => removeClient(c.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="bg-black/20 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Monitor size={11} /> Computadores ({machines.length})
                </p>
                {machines.length === 0 ? (
                  <p className="text-[11px] text-gray-600">Nenhum vinculado.</p>
                ) : (
                  <ul className="space-y-1">
                    {machines.map((m) => {
                      const online = isOnline(m);
                      return (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                          onMouseEnter={() => setHovered(m)}
                          onMouseLeave={() => setHovered((h) => (h?.id === m.id ? null : h))}
                        >
                          <span className="flex items-center gap-1.5 min-w-0 cursor-help">
                            <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-gray-600"}`} />
                            <span className="truncate">{m.name}</span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => online && setViewing(m)}
                              disabled={!online}
                              title={online ? "Acessar esta máquina" : "Offline"}
                              className="flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-1.5 py-0.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Monitor size={10} /> Acessar
                            </button>
                            {canManage && (
                              <button
                                onClick={() => linkAgent(m.id, null)}
                                className="text-gray-500 hover:text-red-400 cursor-pointer"
                                title="Desvincular"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canManage && unlinked.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && linkAgent(e.target.value, c.id)}
                    className="mt-2 w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none cursor-pointer"
                  >
                    <option value="">+ Vincular computador…</option>
                    {unlinked.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.access_code})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hovered && !viewing && <AgentInfoPanel agent={hovered} />}
      {adding && <AddClientModal onClose={() => setAdding(false)} onSaved={load} createdBy={profile?.id ?? null} />}
      {viewing && <RemoteViewer agent={viewing} profile={profile} onClose={() => setViewing(null)} />}
    </div>
  );
}

function AddClientModal({
  onClose,
  onSaved,
  createdBy,
}: {
  onClose: () => void;
  onSaved: () => void;
  createdBy: string | null;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!supabase || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("clients").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      document: document.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      created_by: createdBy,
    });
    setSaving(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="liquid-glass rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold flex items-center gap-2">
            <UserPlus size={18} className="text-emerald-400" /> Novo cliente
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome / Razão social *"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <input
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="CNPJ / CPF"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observações"
          rows={2}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
