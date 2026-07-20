"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, FolderCheck, FolderSearch, Link2, Monitor, MonitorSmartphone, Server, Settings2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import AgentFolderPicker from "@/components/AgentFolderPicker";
import type { Profile, RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  if (a.status !== "online" || !a.last_seen) return false;
  return Date.now() - new Date(a.last_seen).getTime() < 60000;
}

export default function RemoteAccessTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewing, setViewing] = useState<RemoteAgent | null>(null);
  const [tick, setTick] = useState(0);
  const [pwFor, setPwFor] = useState<RemoteAgent | null>(null); // máquina aguardando senha p/ virar/deixar de ser servidor
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [rootInput, setRootInput] = useState(""); // diretório escolhido para o servidor
  const [sharedList, setSharedList] = useState<string[]>([]); // pastas liberadas (allowlist)
  const [pickTarget, setPickTarget] = useState<"root" | "shared" | null>(null); // seletor visual aberto
  const [permsFor, setPermsFor] = useState<RemoteAgent | null>(null); // engrenagem: permissões da máquina

  const canManage = profile?.role === "gestor" || profile?.role === "gerente";
  const companyId = profile?.company_id ?? null;
  const [serverPassword, setServerPassword] = useState("1qaz2wsx"); // senha "root" da empresa
  // Esta empresa pode marcar a máquina como servidor? Sim se for DELA, ou se a
  // máquina ainda não tem dono (company_id nulo — máquina antiga/avulsa). Máquinas
  // de OUTRA empresa (só compartilhadas por código) não — lá é computador comum.
  const ownsAgent = (a: RemoteAgent) => !!companyId && (a.company_id === companyId || a.company_id == null);
  const thumbBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/agent-thumbs`;

  // Atualiza as prévias ao vivo a cada 6s (o agente sobe um print nesse ritmo).
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(i);
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !companyId) return;
    // Dispositivos que a empresa possui OU tem acesso pelo código (compartilhados).
    const { data } = await supabase.rpc("my_remote_agents");
    if (data) setAgents(data as RemoteAgent[]);
    const { data: cs } = await supabase.from("company_settings").select("server_password").eq("company_id", companyId).maybeSingle();
    if (cs?.server_password) setServerPassword(cs.server_password);
  }, [companyId]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("remote-agents")
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_agents" }, () => load())
      .subscribe();
    return () => {
      supabase!.removeChannel(ch);
    };
  }, [load]);

  async function syncAgent() {
    const clean = code.replace(/\D/g, "");
    if (!supabase || clean.length < 6) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.rpc("claim_agent", {
        p_code: clean,
        p_name: label.trim() || null,
      });
      if (error) alert(error.message);
      else if (data) {
        setCode("");
        setLabel("");
        await load();
      }
    } finally {
      setSyncing(false);
    }
  }

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Remover esta máquina do acesso remoto?")) return;
    await supabase.rpc("release_agent", { p_id: id });
    load();
  }

  // Só quem tem a senha pode mudar o servidor de arquivos: abre o popup de senha.
  function toggleServer(a: RemoteAgent) {
    setPwInput("");
    setPwError(false);
    setRootInput(a.server_root ?? "");
    setSharedList(a.shared_paths ?? []);
    setPwFor(a);
  }

  // makeServer=true: define/salva servidor (diretório + pastas liberadas).
  // makeServer=false: tira o servidor. Pastas liberadas valem sempre (allowlist).
  async function confirmServerChange(makeServer: boolean) {
    if (!supabase || !pwFor) return;
    if (pwInput !== serverPassword) {
      setPwError(true);
      return;
    }
    const shared = sharedList.map((s) => s.trim()).filter(Boolean);
    const patch: {
      is_server: boolean;
      graph_folder_id?: string;
      server_root?: string | null;
      shared_paths: string[] | null;
      company_id?: string;
    } = { is_server: makeServer, shared_paths: shared.length ? shared : null };
    if (makeServer) patch.server_root = rootInput.trim() || null;
    // Máquina sem dono (company_id nulo) → vira desta empresa ao ser marcada como
    // servidor (senão ela não apareceria como servidor de ninguém).
    if (makeServer && pwFor.company_id == null && companyId) patch.company_id = companyId;
    if (makeServer && !pwFor.graph_folder_id) {
      const { data: folder } = await supabase
        .from("files")
        .insert({ name: `Servidor: ${pwFor.name}`, type: "folder", parent_id: null })
        .select("id")
        .single();
      if (folder) patch.graph_folder_id = folder.id;
    }
    const { error, count } = await supabase
      .from("remote_agents")
      .update(patch, { count: "exact" })
      .eq("id", pwFor.id);
    if (error || !count) {
      alert(error ? "Não consegui salvar: " + error.message : "Não foi possível marcar como servidor (sem permissão nesta máquina).");
      return;
    }
    setPwFor(null);
    setPwInput("");
    load();
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MonitorSmartphone className="text-emerald-400" size={20} /> Acesso Remoto
        </h3>
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none w-44"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && syncAgent()}
              placeholder="Código do cliente"
              inputMode="numeric"
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none w-40 tracking-widest font-mono"
            />
            <button
              onClick={syncAgent}
              disabled={syncing || code.replace(/\D/g, "").length < 6}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Link2 size={14} /> Sincronizar
            </button>
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        O cliente abre o <b>Workspace Acesso Remoto</b> (.exe) na máquina dele e te informa o <b>código de suporte</b>{" "}
        que aparece na tela. Digite o código acima e clique em <b>Sincronizar</b>. A máquina entra na lista e, sempre que
        estiver <b>Online</b>, você clica em <b>Conectar</b> para ver e controlar a tela — sem pedir permissão, pela mesma
        VPN. O app do cliente fica rodando em segundo plano e sobe junto com o Windows.
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {agents.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">
            Nenhuma máquina sincronizada. Peça o código de suporte ao cliente e sincronize acima.
          </p>
        )}
        {agents.map((a) => {
          const online = isOnline(a);
          return (
            <div key={a.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${online ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                    <Monitor size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate flex items-center gap-1.5">
                      {a.name}
                      {a.is_server && ownsAgent(a) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full">
                          <Server size={9} /> SERVIDOR
                        </span>
                      )}
                    </p>
                    <p className={`text-[11px] ${online ? "text-emerald-400" : "text-gray-500"}`}>
                      {online ? "Online" : "Offline"}
                      {a.os ? ` · ${a.os}` : ""}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setPermsFor(a)}
                      title="Permissões desta máquina (controle, arquivos, print)"
                      className="text-gray-500 hover:text-emerald-300 cursor-pointer"
                    >
                      <Settings2 size={14} />
                    </button>
                    {ownsAgent(a) && (
                      <button
                        onClick={() => toggleServer(a)}
                        title={a.is_server ? "É o servidor de arquivos — clique para tirar" : "Definir como servidor de arquivos"}
                        className={`cursor-pointer ${a.is_server ? "text-sky-400" : "text-gray-500 hover:text-sky-300"}`}
                      >
                        <Server size={14} />
                      </button>
                    )}
                    <button onClick={() => remove(a.id)} className="text-gray-500 hover:text-red-400 cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Prévia ao vivo da tela */}
              <button
                onClick={() => online && setViewing(a)}
                disabled={!online}
                className={`relative aspect-video w-full rounded-lg overflow-hidden bg-black/40 border border-white/10 ${
                  online ? "cursor-pointer group" : "cursor-default"
                }`}
                title={online ? "Clique para conectar" : "Offline"}
              >
                {online ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${thumbBase}/${a.id}.jpg?v=${tick}`}
                      alt="Tela ao vivo"
                      className="w-full h-full object-cover"
                      onError={(e) => ((e.currentTarget.style.visibility = "hidden"))}
                    />
                    <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] font-medium bg-black/60 text-red-300 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> AO VIVO
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <Monitor size={22} className="text-white" />
                    </span>
                  </>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-600">
                    Sem prévia (offline)
                  </span>
                )}
              </button>

              <div className="bg-black/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Código de acesso</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono tracking-widest text-emerald-400">
                    {a.access_code.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  </code>
                  <button
                    onClick={() => navigator.clipboard?.writeText(a.access_code)}
                    className="text-gray-400 hover:text-white cursor-pointer"
                    title="Copiar código"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              <button
                onClick={() => setViewing(a)}
                disabled={!online}
                title={online ? "Conectar" : "A máquina precisa estar online (app aberto)"}
                className="w-full flex items-center justify-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Monitor size={13} /> Conectar
              </button>
            </div>
          );
        })}
      </div>

      {pwFor && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setPwFor(null)}>
          <div className="w-full max-w-xs bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Server size={16} className="text-sky-400" />
              <h3 className="text-sm font-bold">Servidor & acesso · {pwFor.name}</h3>
            </div>
            <p className="text-[11px] text-gray-400">Digite a senha para alterar as configurações desta máquina.</p>
            <input
              type="password"
              value={pwInput}
              autoFocus
              onChange={(e) => {
                setPwInput(e.target.value);
                setPwError(false);
              }}
              placeholder="Senha"
              className={`w-full bg-black/20 border rounded-lg px-3 py-2 text-sm outline-none ${pwError ? "border-red-500" : "border-white/10"}`}
            />
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400">Diretório do servidor</label>
              <div className="flex items-center gap-2">
                <input
                  value={rootInput}
                  onChange={(e) => setRootInput(e.target.value)}
                  placeholder="vazio = pasta padrão"
                  className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono outline-none"
                />
                <button onClick={() => setPickTarget("root")} disabled={!isOnline(pwFor)} title="Escolher pasta na máquina" className="flex items-center gap-1 text-[11px] bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0">
                  <FolderSearch size={13} /> Escolher
                </button>
              </div>
              <p className="text-[10px] text-gray-500">Pasta que a máquina vai administrar. Arquivos, Cerebro e Download entram dentro dela.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-gray-400">Pastas liberadas — bloqueia o resto</label>
                <button onClick={() => setPickTarget("shared")} disabled={!isOnline(pwFor)} title="Escolher pasta na máquina" className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-white cursor-pointer disabled:opacity-40">
                  <FolderSearch size={12} /> + adicionar pasta
                </button>
              </div>
              {sharedList.length === 0 ? (
                <p className="text-[10px] text-gray-500">Vazio = acesso total à máquina. Adicione pastas para liberar só elas.</p>
              ) : (
                <div className="space-y-1">
                  {sharedList.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5">
                      <FolderCheck size={13} className="text-emerald-400 shrink-0" />
                      <span className="flex-1 text-[11px] font-mono truncate" title={p}>{p}</span>
                      <button onClick={() => setSharedList((l) => l.filter((_, k) => k !== i))} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              {!isOnline(pwFor) && <p className="text-[10px] text-amber-400/80">A máquina precisa estar online para escolher pastas visualmente.</p>}
            </div>
            {pwError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
            <div className="flex items-center justify-between gap-2">
              {pwFor.is_server ? (
                <button onClick={() => confirmServerChange(false)} className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-red-300 cursor-pointer">Tirar servidor</button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button onClick={() => setPwFor(null)} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
                <button onClick={() => confirmServerChange(true)} className="text-xs px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer">
                  {pwFor.is_server ? "Salvar" : "Definir servidor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing && <RemoteViewer agent={viewing} profile={profile} onClose={() => setViewing(null)} />}

      {permsFor && (
        <PermsModal
          agent={permsFor}
          onClose={() => setPermsFor(null)}
          onSaved={() => { setPermsFor(null); load(); }}
        />
      )}

      {pickTarget && pwFor && (
        <AgentFolderPicker
          agentId={pwFor.id}
          onClose={() => setPickTarget(null)}
          onPick={(path, isDir) => {
            if (!isDir) return; // só pastas
            if (pickTarget === "root") setRootInput(path);
            else setSharedList((l) => (l.includes(path) ? l : [...l, path]));
            setPickTarget(null);
          }}
        />
      )}
    </div>
  );
}

// Engrenagem: permissões da máquina do cliente (o que o técnico pode fazer).
function PermsModal({ agent, onClose, onSaved }: { agent: RemoteAgent; onClose: () => void; onSaved: () => void }) {
  const [control, setControl] = useState(agent.allow_control !== false);
  const [files, setFiles] = useState(agent.allow_files !== false);
  const [screenshot, setScreenshot] = useState(agent.allow_screenshot !== false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!supabase) return;
    setSaving(true);
    await supabase.rpc("set_agent_perms", { p_id: agent.id, p_control: control, p_files: files, p_screenshot: screenshot });
    setSaving(false);
    onSaved();
  }

  const Row = ({ on, set, title, desc }: { on: boolean; set: (v: boolean) => void; title: string; desc: string }) => (
    <button onClick={() => set(!on)} className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border cursor-pointer text-left transition-colors ${on ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}>
      <span className="min-w-0">
        <span className="text-sm font-semibold block">{title}</span>
        <span className="text-[11px] text-gray-400">{desc}</span>
      </span>
      <span className={`text-[11px] font-bold shrink-0 ${on ? "text-emerald-300" : "text-gray-500"}`}>{on ? "LIGADO" : "desligado"}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Settings2 size={16} className="text-emerald-400" /> Permissões — {agent.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
        </div>
        <p className="text-[11px] text-gray-400">Escolha o que é permitido nesta máquina. Vale na próxima sincronização do app (poucos segundos).</p>
        <Row on={control} set={setControl} title="Controlar (mouse e teclado)" desc="Mexer no computador remotamente." />
        <Row on={files} set={setFiles} title="Acessar arquivos" desc="Ver e baixar arquivos da máquina." />
        <Row on={screenshot} set={setScreenshot} title="Tirar print da tela" desc="Permitir o print pelo Copilot/suporte." />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">Cancelar</button>
          <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
