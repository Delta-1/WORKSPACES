"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Building2, Database, Download, Folder, FileText, LayoutGrid, Lock, Mail, Monitor, Phone, Search, Table as TableIcon, X } from "lucide-react";

type FolderNode = { id: string; name: string; type: string; parent_id: string | null; url: string | null };
type PortalClient = {
  id: string; name: string; logo_url: string | null; phone: string | null; document: string | null;
  email: string | null; tax_regime: string | null; status: string | null; notes: string | null;
  remote?: { id: string; name: string; os: string | null; status: string | null }[];
  folders?: FolderNode[]; root_folder?: string;
};
type Perms = { info: boolean; folders: boolean; remote: boolean };

export default function TerceirosPortal({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [perms, setPerms] = useState<Perms>({ info: true, folders: false, remote: false });
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [regime, setRegime] = useState("ALL");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [open, setOpen] = useState<PortalClient | null>(null);

  async function fetchPortal(creds?: { email: string; password: string }) {
    const res = await fetch("/api/terceiros/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, email: creds?.email ?? "", password: creds?.password ?? "" }) });
    const d = await res.json();
    return d as { ok: boolean; reason?: string; needs_login?: boolean; name?: string; company?: string; perms?: Perms; clients?: PortalClient[] };
  }

  useEffect(() => {
    fetchPortal().then((d) => {
      if (d.ok) { setName(d.name ?? ""); setCompany(d.company ?? ""); setPerms(d.perms ?? perms); setClients(d.clients ?? []); }
      else if (d.reason === "notfound") setInvalid(true);
      else setNeedLogin(true);
      setLoading(false);
    }).catch(() => { setInvalid(true); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function doLogin() {
    setLoginError(null);
    const d = await fetchPortal({ email, password });
    if (d.ok) { setNeedLogin(false); setName(d.name ?? ""); setCompany(d.company ?? ""); setPerms(d.perms ?? perms); setClients(d.clients ?? []); }
    else setLoginError("E-mail ou senha incorretos.");
  }

  const regimes = useMemo(() => Array.from(new Set(clients.map((c) => c.tax_regime).filter(Boolean))) as string[], [clients]);
  const list = clients.filter((c) => {
    if (status !== "ALL" && (c.status ?? "ativo").toLowerCase() !== status.toLowerCase()) return false;
    if (regime !== "ALL" && c.tax_regime !== regime) return false;
    if (q && !(`${c.name} ${c.document ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  if (loading) return <Center>Carregando…</Center>;
  if (invalid) return <Center><div className="text-center"><div className="w-14 h-14 rounded-2xl bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-4"><Lock size={26} className="text-red-400" /></div><h1 className="text-lg font-bold">Link inválido</h1><p className="text-sm text-gray-400 mt-1">Peça um novo à empresa.</p></div></Center>;
  if (needLogin) return (
    <Center>
      <div className="w-full max-w-sm">
        <div className="text-center mb-5"><div className="w-14 h-14 rounded-2xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3 text-emerald-400"><Lock size={24} /></div><h1 className="text-lg font-bold">Acesso de terceiros</h1><p className="text-sm text-gray-400 mt-1">Entre com o login que a empresa cadastrou.</p></div>
        <div className="liquid-glass rounded-2xl p-6 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="Senha" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
          {loginError && <p className="text-xs text-red-400">{loginError}</p>}
          <button onClick={doLogin} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer">Entrar</button>
        </div>
      </div>
    </Center>
  );

  return (
    <div className="min-h-screen bg-[#060a12] text-gray-100">
      <header className="border-b border-white/10 bg-black/30 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0"><Database size={20} /></div>
            <div className="min-w-0"><h1 className="text-base font-bold truncate">Portal de Terceiros</h1><p className="text-[11px] text-gray-400 truncate">{name} · carteira de {company}</p></div>
          </div>
          <span className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">Somente visualização</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2"><Search size={14} className="text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="bg-transparent outline-none text-sm w-40" /></div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"><option value="ALL">Situação</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
            {regimes.length > 0 && <select value={regime} onChange={(e) => setRegime(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"><option value="ALL">Regime</option>{regimes.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
          </div>
          <div className="flex items-center gap-1 bg-black/30 rounded-lg p-1">
            <button onClick={() => setView("cards")} className={`text-xs px-2.5 py-1.5 rounded-md cursor-pointer flex items-center gap-1 ${view === "cards" ? "bg-emerald-600/40 text-emerald-200" : "text-gray-400"}`}><LayoutGrid size={13} /> Cartões</button>
            <button onClick={() => setView("table")} className={`text-xs px-2.5 py-1.5 rounded-md cursor-pointer flex items-center gap-1 ${view === "table" ? "bg-emerald-600/40 text-emerald-200" : "text-gray-400"}`}><TableIcon size={13} /> Tabela</button>
          </div>
        </div>

        {list.length === 0 ? <p className="text-sm text-gray-500 text-center py-12">Nenhum cliente.</p> : view === "table" ? (
          <div className="overflow-auto border border-white/10 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f16]"><tr>{["Cliente", perms.info ? "Telefone" : "", perms.info ? "CNPJ/CPF" : "", "Situação", ""].filter(Boolean).map((h) => <th key={h} className="text-left text-[11px] text-gray-400 px-3 py-2 border-b border-white/10">{h}</th>)}</tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setOpen(c)}>
                    <td className="px-3 py-2 border-b border-white/5 font-medium">{c.name}</td>
                    {perms.info && <td className="px-3 py-2 border-b border-white/5 text-gray-300">{c.phone || "—"}</td>}
                    {perms.info && <td className="px-3 py-2 border-b border-white/5 text-gray-300">{c.document || "—"}</td>}
                    <td className="px-3 py-2 border-b border-white/5"><Situacao s={c.status} /></td>
                    <td className="px-3 py-2 border-b border-white/5 text-emerald-400 text-xs">abrir</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => (
              <button key={c.id} onClick={() => setOpen(c)} className="text-left bg-black/25 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
                    ) : <div className="w-9 h-9 rounded-lg bg-emerald-950/50 border border-white/10 flex items-center justify-center text-emerald-300"><Building2 size={16} /></div>}
                    <div className="min-w-0"><p className="text-sm font-bold truncate">{c.name}</p>{perms.info && c.document && <p className="text-[11px] text-gray-500 truncate">{c.document}</p>}</div>
                  </div>
                  <Situacao s={c.status} />
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                  {perms.folders && <span className="flex items-center gap-1"><Folder size={11} /> pastas</span>}
                  {perms.remote && <span className="flex items-center gap-1"><Monitor size={11} /> acesso</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {open && <ClientDetail client={open} perms={perms} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#060a12] text-gray-100 p-4">{children}</div>;
}
function Situacao({ s }: { s: string | null }) {
  const active = (s ?? "ativo").toLowerCase() === "ativo";
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${active ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-gray-400 border-white/15"}`}>{active ? "ATIVO" : "INATIVO"}</span>;
}

function ClientDetail({ client, perms, onClose }: { client: PortalClient; perms: Perms; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold truncate flex items-center gap-2">{client.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.logo_url} alt="" className="w-6 h-6 rounded object-cover" />
          ) : <Building2 size={15} className="text-emerald-400" />} {client.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {perms.info && (
            <div className="space-y-1.5 text-sm">
              {client.phone && <p className="flex items-center gap-2 text-gray-300"><Phone size={13} className="text-gray-500" /> {client.phone}</p>}
              {client.email && <p className="flex items-center gap-2 text-gray-300"><Mail size={13} className="text-gray-500" /> {client.email}</p>}
              {client.document && <p className="text-gray-400 text-[13px]">CNPJ/CPF: {client.document}</p>}
              {client.tax_regime && <p className="text-gray-400 text-[13px]">Regime: {client.tax_regime}</p>}
              {client.notes && <p className="text-gray-500 text-[13px] whitespace-pre-wrap">{client.notes}</p>}
            </div>
          )}

          {perms.remote && client.remote && client.remote.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><Monitor size={12} /> Acessos remotos</p>
              <div className="space-y-1">
                {client.remote.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 bg-black/20 rounded-lg p-2 text-[12px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${a.status === "online" ? "bg-emerald-400" : "bg-gray-600"}`} />
                    <span className="truncate">{a.name}</span><span className="text-gray-500">· {a.os || "?"} · {a.status === "online" ? "online" : "offline"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {perms.folders && client.folders && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><Folder size={12} /> Pastas & arquivos (download)</p>
              <FolderTree nodes={client.folders} root={client.root_folder ?? null} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderTree({ nodes, root, depth = 0 }: { nodes: FolderNode[]; root: string | null; depth?: number }) {
  const children = nodes.filter((n) => n.parent_id === root);
  if (children.length === 0) return depth === 0 ? <p className="text-[12px] text-gray-600">Sem arquivos.</p> : null;
  return (
    <div className={depth > 0 ? "ml-4" : ""}>
      {children.map((n) => (
        <div key={n.id}>
          {n.type === "folder" ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] text-gray-300 py-0.5"><Folder size={13} className="text-amber-400" /> {n.name}</p>
              <FolderTree nodes={nodes} root={n.id} depth={depth + 1} />
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="flex items-center gap-1.5 text-[13px] text-gray-400 min-w-0"><FileText size={13} className="text-gray-500 shrink-0" /> <span className="truncate">{n.name}</span></span>
              {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 shrink-0" title="Baixar"><Download size={14} /></a>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
