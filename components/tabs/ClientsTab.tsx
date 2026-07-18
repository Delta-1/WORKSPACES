"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Cpu, FolderTree, HardDrive, MemoryStick, Monitor, Plus, Search, Trash2, Upload, UserPlus, Wifi, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { Client, Profile, RemoteAgent } from "@/lib/types";

const TAX_REGIMES = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real", "Isento / Outro"];
// Ramificações padrão criadas dentro da pasta de cada cliente (configurável em
// Configurações › Empresa; aqui fica o padrão quando não há configuração).
const DEFAULT_CLIENT_SUBFOLDERS = ["Documentos", "Contratos", "Artes", "Aplicativos"];

function isOnline(a: RemoteAgent) {
  if (a.status !== "online" || !a.last_seen) return false;
  return Date.now() - new Date(a.last_seen).getTime() < 60000;
}

// Reduz uma imagem (logo do cliente) para um quadrado pequeno em dataURL.
function resizeImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Garante a pasta "Clientes" (raiz) da empresa, cria a subpasta do cliente e as
// ramificações padrão dentro dela. Devolve o id da pasta do cliente.
async function ensureClientFolders(companyId: string, clientName: string, subfolders: string[]): Promise<string | null> {
  if (!supabase) return null;
  // 1) Pasta raiz "Clientes".
  let rootId: string | null = null;
  const { data: root } = await supabase
    .from("files")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", "folder")
    .is("parent_id", null)
    .eq("name", "Clientes")
    .maybeSingle();
  if (root) rootId = root.id;
  else {
    const { data } = await supabase.from("files").insert({ name: "Clientes", type: "folder", parent_id: null, company_id: companyId }).select("id").single();
    rootId = data?.id ?? null;
  }
  if (!rootId) return null;
  // 2) Subpasta do cliente.
  const { data: cf } = await supabase.from("files").insert({ name: clientName, type: "folder", parent_id: rootId, company_id: companyId }).select("id").single();
  const clientFolderId = cf?.id ?? null;
  if (!clientFolderId) return null;
  // 3) Ramificações padrão.
  const subs = (subfolders && subfolders.length ? subfolders : DEFAULT_CLIENT_SUBFOLDERS).filter(Boolean);
  if (subs.length) {
    await supabase.from("files").insert(subs.map((name) => ({ name, type: "folder", parent_id: clientFolderId, company_id: companyId })));
  }
  return clientFolderId;
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
                <div className="flex items-start gap-2.5 min-w-0">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-gray-500 shrink-0"><Building2 size={16} /></div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {[c.phone, c.document].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                    {c.tax_regime && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">{c.tax_regime}</span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => removeClient(c.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {canManage && c.folder_id && <ClientUpload client={c} companyId={companyId} />}

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
      {adding && <AddClientModal onClose={() => setAdding(false)} onSaved={load} createdBy={profile?.id ?? null} companyId={companyId} />}
      {viewing && <RemoteViewer agent={viewing} profile={profile} onClose={() => setViewing(null)} />}
    </div>
  );
}

function AddClientModal({
  onClose,
  onSaved,
  createdBy,
  companyId,
}: {
  onClose: () => void;
  onSaved: () => void;
  createdBy: string | null;
  companyId: string | null;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [regime, setRegime] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!supabase || !name.trim()) return;
    setSaving(true);
    // Cria a pasta do cliente no grafo (Clientes › <cliente> › ramificações).
    let folderId: string | null = null;
    if (companyId) {
      const { data: cfg } = await supabase.from("company_settings").select("client_subfolders").maybeSingle();
      const subs = Array.isArray(cfg?.client_subfolders) ? cfg.client_subfolders : DEFAULT_CLIENT_SUBFOLDERS;
      folderId = await ensureClientFolders(companyId, name.trim(), subs);
    }
    const { error } = await supabase.from("clients").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      document: document.trim() || null,
      email: email.trim() || null,
      tax_regime: regime || null,
      logo_url: logo,
      folder_id: folderId,
      notes: notes.trim() || null,
      company_id: companyId,
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
        <div className="grid grid-cols-2 gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <select
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="">Regime tributário…</option>
            {TAX_REGIMES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        {/* Logo/imagem da empresa cliente */}
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-gray-500"><Building2 size={18} /></div>
          )}
          <label className="text-xs text-emerald-300 hover:text-white cursor-pointer flex items-center gap-1">
            <Upload size={13} /> {logo ? "Trocar logo" : "Logo da empresa"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(await resizeImage(f).catch(() => null)); }} />
          </label>
          {logo && <button onClick={() => setLogo(null)} className="text-[11px] text-gray-400 hover:text-red-400 underline cursor-pointer">remover</button>}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observações"
          rows={2}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
        <p className="text-[10px] text-gray-500 flex items-center gap-1"><FolderTree size={11} className="text-emerald-400" /> Ao salvar, cria a pasta deste cliente no grafo (Clientes › {name || "cliente"} › ramificações).</p>
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

// Envio de arquivo para a pasta interna do cliente (no grafo). Escolhe a
// ramificação (Documentos/Artes/Contratos…) = o "tipo" do arquivo. NÃO vai para
// a máquina do cliente — fica no servidor/grafo da empresa.
function ClientUpload({ client, companyId }: { client: Client; companyId: string | null }) {
  const [subs, setSubs] = useState<{ id: string; name: string }[]>([]);
  const [dest, setDest] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !client.folder_id) return;
    supabase
      .from("files")
      .select("id,name")
      .eq("parent_id", client.folder_id)
      .eq("type", "folder")
      .order("name")
      .then(({ data }) => {
        const list = (data as { id: string; name: string }[]) ?? [];
        setSubs(list);
        setDest(list[0]?.id ?? client.folder_id ?? "");
      });
  }, [client.folder_id]);

  async function upload(file: File) {
    if (!supabase || !companyId) return;
    setBusy(true);
    setMsg("Enviando…");
    try {
      const parent = dest || client.folder_id;
      const path = `clients/${client.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: up } = await supabase.storage.from("company-files").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: true });
      if (up) throw up;
      const { error: ins } = await supabase.from("files").insert({
        name: file.name,
        type: "file",
        parent_id: parent,
        company_id: companyId,
        storage_path: path,
        mime: file.type || null,
      });
      if (ins) throw ins;
      setMsg("✓ Enviado para a pasta do cliente.");
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : "falha ao enviar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-black/20 rounded-lg p-2.5 space-y-1.5">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1"><FolderTree size={11} /> Arquivos do cliente</p>
      <div className="flex items-center gap-1.5">
        <select value={dest} onChange={(e) => setDest(e.target.value)} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none cursor-pointer">
          {client.folder_id && <option value={client.folder_id}>Pasta do cliente</option>}
          {subs.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <label className={`flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg cursor-pointer ${busy ? "bg-white/5 text-gray-500" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
          <Upload size={12} /> {busy ? "…" : "Enviar"}
          <input type="file" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {msg && <p className={`text-[10px] ${msg.startsWith("✓") ? "text-emerald-400" : "text-gray-400"}`}>{msg}</p>}
    </div>
  );
}
