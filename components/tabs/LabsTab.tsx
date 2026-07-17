"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, BrainCircuit, FlaskConical, Plug, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Chatbot, Profile, WhatsappNumber, AiProvider, AgentApi } from "@/lib/types";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

// Capacidades que um agente pode ter dentro do workspace.
const CAPS: { id: string; label: string; desc: string }[] = [
  { id: "files", label: "Arquivos", desc: "Buscar e enviar arquivos/imagens da empresa" },
  { id: "tasks", label: "Tarefas", desc: "Criar e mover tarefas no Kanban" },
  { id: "clients", label: "Clientes", desc: "Consultar e cadastrar clientes (CRM)" },
  { id: "announcements", label: "Mural", desc: "Publicar avisos no mural" },
  { id: "attendance", label: "Atendimento", desc: "Abrir/encerrar atendimentos" },
  { id: "relay", label: "Assessor", desc: "Enviar mensagens no WhatsApp por você" },
  { id: "remote", label: "Acesso remoto (beta)", desc: "Ver/controlar máquinas via acesso remoto" },
];

const ACCENTS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444"];

// Prompt-base já pronto — a pessoa só edita os trechos entre colchetes.
const TEMPLATE_PERSONA = "[Nome], um assistente [ex.: cordial, objetivo] especialista em [área de atuação da empresa].";
const TEMPLATE_INSTRUCTIONS =
  "Entenda bem o que a pessoa quer antes de responder. Seja claro e conciso. Use o histórico e o conhecimento abaixo como verdade. " +
  "Quando precisar de uma informação, pergunte de forma objetiva. Confirme dados importantes antes de agir. " +
  "Nunca invente valores; se não souber, diga que vai verificar.";

type Agent = Chatbot;

export default function LabsTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [editing, setEditing] = useState<Partial<Agent> | null>(null);
  const canManage = profile?.role === "gestor" || profile?.role === "gerente";

  const load = useCallback(async () => {
    if (!supabase) return;
    let list = ((await supabase.from("chatbots").select("*").order("created_at")).data as Agent[]) ?? [];
    // Garante os agentes de sistema (Orb e Copiloto interno) na lista do Labs.
    if (canManage && profile?.company_id) {
      const allCaps = CAPS.map((c) => c.id);
      const need: { slot: string; name: string; accent: string; caps: string[]; persona: string }[] = [];
      if (!list.some((x) => x.slot === "orb"))
        need.push({ slot: "orb", name: "Orb", accent: "#6366f1", caps: ["files", "tasks", "clients", "attendance", "remote"], persona: "Orb, o copiloto de voz do acesso remoto — objetivo, calmo e prestativo." });
      if (!list.some((x) => x.slot === "internal"))
        need.push({ slot: "internal", name: "Copilot", accent: "#10b981", caps: allCaps, persona: "Copilot, o copiloto de voz e ADMINISTRADOR do sistema — tem acesso a tudo, é confiante, claro e direto." });
      if (need.length) {
        await supabase.from("chatbots").insert(need.map((s) => ({ name: s.name, slot: s.slot, provider: "gemini", accent: s.accent, capabilities: s.caps, persona: s.persona, instructions: TEMPLATE_INSTRUCTIONS, enabled: true, test_mode: false, company_id: profile.company_id })));
        list = ((await supabase.from("chatbots").select("*").order("created_at")).data as Agent[]) ?? list;
      }
    }
    setAgents(list);
    setNumbers(((await supabase.from("whatsapp_numbers").select("*").order("created_at")).data as WhatsappNumber[]) ?? []);
  }, [canManage, profile?.company_id]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("labs")
      .on("postgres_changes", { event: "*", schema: "public", table: "chatbots" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_numbers" }, () => load())
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  function newAgent() {
    setEditing({ name: "", provider: "gemini", api_key: "", persona: TEMPLATE_PERSONA, instructions: TEMPLATE_INSTRUCTIONS, greeting: "", knowledge: "", enabled: true, test_mode: false, capabilities: ["files"], accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)] });
  }

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Excluir este agente?")) return;
    await supabase.from("chatbots").delete().eq("id", id);
    load();
  }

  async function assignNumber(agentId: string, numberId: string, on: boolean) {
    if (!supabase) return;
    await supabase.from("whatsapp_numbers").update({ chatbot_id: on ? agentId : null, auto_reply: on }).eq("id", numberId);
    load();
  }

  const numbersFor = (agentId: string) => numbers.filter((n) => n.chatbot_id === agentId);

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FlaskConical className="text-indigo-400" size={20} /> Labs — Agentes de IA
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Crie, treine e dê poderes a agentes. Cada um com sua chave de IA, personalidade, memória e número de WhatsApp.</p>
        </div>
        {canManage && (
          <button onClick={newAgent} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
            <Plus size={14} /> Novo agente
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {agents.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-10">Nenhum agente ainda. Clique em “Novo agente”.</p>
        )}
        {agents.map((ag) => (
          <div key={ag.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: (ag.accent || "#6366f1") + "33", color: ag.accent || "#818cf8" }}>
                  <Bot size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate flex items-center gap-1.5">
                    {ag.name || "Sem nome"}
                    {ag.slot && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">sistema</span>}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{ag.provider} · {ag.enabled ? "ativo" : "pausado"}</p>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(ag)} className="text-[11px] text-indigo-300 hover:text-white cursor-pointer">editar</button>
                  {!ag.slot && <button onClick={() => remove(ag.id)} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></button>}
                </div>
              )}
            </div>
            {ag.persona && <p className="text-[11px] text-gray-400 line-clamp-2">{ag.persona}</p>}
            <div className="flex flex-wrap gap-1">
              {(ag.capabilities ?? []).map((c) => (
                <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">{CAPS.find((x) => x.id === c)?.label ?? c}</span>
              ))}
            </div>
            {canManage && !ag.slot && numbers.length > 0 && (
              <div className="mt-1 border-t border-white/10 pt-2">
                <p className="text-[10px] text-gray-500 mb-1">Responde nos números:</p>
                <div className="space-y-1">
                  {numbers.map((n) => (
                    <label key={n.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input type="checkbox" checked={n.chatbot_id === ag.id} onChange={(e) => assignNumber(ag.id, n.id, e.target.checked)} className="accent-indigo-500" />
                      {n.label}{n.phone_number ? ` · ${n.phone_number}` : ""}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {numbersFor(ag.id).length === 0 && numbers.length > 0 && <p className="text-[10px] text-gray-600">Nenhum número atribuído.</p>}
          </div>
        ))}
      </div>

      {editing && <AgentEditor agent={editing} profile={profile} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function AgentEditor({ agent, profile, onClose, onSaved }: { agent: Partial<Agent>; profile: Profile | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Agent>>(agent);
  const [saving, setSaving] = useState(false);
  const [studying, setStudying] = useState(false);
  const [studyMsg, setStudyMsg] = useState<string | null>(null);
  const set = (patch: Partial<Agent>) => setF((p) => ({ ...p, ...patch }));
  const caps = f.capabilities ?? [];
  const toggleCap = (id: string) => set({ capabilities: caps.includes(id) ? caps.filter((c) => c !== id) : [...caps, id] });
  const apis = f.apis ?? [];
  const setApi = (i: number, patch: Partial<AgentApi>) => set({ apis: apis.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const addApi = () => set({ apis: [...apis, { name: "", url: "", description: "" }] });
  const removeApi = (i: number) => set({ apis: apis.filter((_, k) => k !== i) });

  // "Estudar": extrai o texto do arquivo (PDF/DOCX/HTML/texto), a IA do agente
  // transforma em memória (.txt de dados + .md de lógica) e grava no cérebro dele.
  async function studyFile(file: File) {
    if (!f.id) {
      alert("Salve o agente primeiro para ele poder estudar e guardar na memória.");
      return;
    }
    setStudying(true);
    setStudyMsg("Lendo o arquivo…");
    try {
      let text = "";
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc")) {
        const dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(file);
        });
        const ex = await fetch("/api/extract-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, name: file.name }) });
        text = (await ex.json()).text || "";
      } else {
        text = await file.text().catch(() => "");
      }
      if (!text.trim()) {
        setStudyMsg("Não consegui ler texto desse arquivo.");
        return;
      }
      setStudyMsg("Estudando e organizando a memória…");
      const headers = await authHeaders();
      const res = await fetch("/api/labs/study", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ agentId: f.id, filename: file.name, text }),
      });
      const data = await res.json();
      if (data.ok) setStudyMsg(`✓ Aprendido! Criou na memória: ${data.created.join(", ")}`);
      else setStudyMsg(data.error || "Falha ao estudar.");
    } catch {
      setStudyMsg("Erro ao estudar o arquivo.");
    } finally {
      setStudying(false);
    }
  }

  async function save() {
    if (!supabase || !f.name?.trim() || saving) return;
    setSaving(true);
    const payload = {
      name: f.name.trim(),
      provider: (f.provider || "gemini") as AiProvider,
      api_key: f.api_key || null,
      persona: f.persona || null,
      instructions: f.instructions || null,
      greeting: f.greeting || null,
      knowledge: f.knowledge || null,
      capabilities: caps,
      accent: f.accent || null,
      apis: apis.filter((a) => a.name && a.url),
      test_mode: f.test_mode ?? true,
      enabled: f.enabled ?? true,
      company_id: profile?.company_id ?? null,
    };
    let agentId = f.id;
    if (f.id) {
      await supabase.from("chatbots").update(payload).eq("id", f.id);
    } else {
      const { data } = await supabase.from("chatbots").insert(payload).select("id").single();
      agentId = data?.id;
      // Cria a pasta de MEMÓRIA do agente no grafo (o cérebro dele).
      if (agentId) {
        const { data: folder } = await supabase.from("files").insert({ name: `Agente: ${f.name.trim()}`, type: "folder", parent_id: null }).select("id").single();
        if (folder) await supabase.from("chatbots").update({ folder_id: folder.id }).eq("id", agentId);
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scroll bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><FlaskConical size={15} className="text-indigo-400" /> {f.id ? "Editar agente" : "Novo agente"}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
        </div>

        <div className="flex items-center gap-2">
          <input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Nome do agente (ex.: Nina)" className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <div className="flex gap-1">
            {ACCENTS.map((c) => (
              <button key={c} onClick={() => set({ accent: c })} className="w-5 h-5 rounded-full border-2 cursor-pointer" style={{ background: c, borderColor: f.accent === c ? "#fff" : "transparent" }} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={f.provider ?? "gemini"} onChange={(e) => set({ provider: e.target.value as AiProvider })} className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
          </select>
          <input value={f.api_key ?? ""} onChange={(e) => set({ api_key: e.target.value })} placeholder="Chave de API" type="password" className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none font-mono" />
        </div>

        <input value={f.persona ?? ""} onChange={(e) => set({ persona: e.target.value })} placeholder="Personalidade / papel (ex.: especialista fiscal, calma e objetiva)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <textarea value={f.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} rows={2} placeholder="Instruções (como agir, o que priorizar)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
        <input value={f.greeting ?? ""} onChange={(e) => set({ greeting: e.target.value })} placeholder="Saudação inicial (opcional)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-gray-400">Conhecimento base (colar direto)</label>
            <label className={`text-[11px] cursor-pointer flex items-center gap-1 ${studying ? "text-gray-500" : "text-indigo-300 hover:text-white"}`}>
              <BrainCircuit size={12} /> {studying ? "estudando…" : "estudar arquivo"}
              <input type="file" accept=".txt,.csv,.md,.json,.html,.htm,.pdf,.docx" className="hidden" disabled={studying} onChange={(e) => e.target.files?.[0] && studyFile(e.target.files[0])} />
            </label>
          </div>
          <textarea value={f.knowledge ?? ""} onChange={(e) => set({ knowledge: e.target.value })} rows={3} placeholder="Cole informações fixas aqui. Para PDFs/planilhas/HTML, use 'estudar arquivo' — o agente lê, resume em .txt (dados) + .md (lógica) e guarda na memória dele." className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none resize-none" />
          {studyMsg && <p className={`text-[10px] mt-1 ${studyMsg.startsWith("✓") ? "text-emerald-400" : "text-gray-400"}`}>{studyMsg}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-gray-400 flex items-center gap-1"><Plug size={11} /> APIs do agente (opcional)</label>
            <button onClick={addApi} className="text-[11px] text-indigo-300 hover:text-white cursor-pointer">+ adicionar API</button>
          </div>
          {apis.length === 0 && <p className="text-[10px] text-gray-600">Sem API própria — o agente usa a IA/API já registrada.</p>}
          <div className="space-y-1.5">
            {apis.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={a.name} onChange={(e) => setApi(i, { name: e.target.value })} placeholder="Nome" className="w-24 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none" />
                <input value={a.url} onChange={(e) => setApi(i, { url: e.target.value })} placeholder="https://..." className="flex-1 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-mono outline-none" />
                <button onClick={() => removeApi(i)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-gray-400">O que ele pode fazer no workspace</label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {CAPS.map((c) => (
              <label key={c.id} className={`flex items-start gap-2 text-[11px] rounded-lg px-2 py-1.5 border cursor-pointer ${caps.includes(c.id) ? "border-indigo-500 bg-indigo-950/30" : "border-white/10 bg-black/20"}`} title={c.desc}>
                <input type="checkbox" checked={caps.includes(c.id)} onChange={() => toggleCap(c.id)} className="accent-indigo-500 mt-0.5" />
                <span><b>{c.label}</b><br /><span className="text-gray-500">{c.desc}</span></span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={f.enabled ?? true} onChange={(e) => set({ enabled: e.target.checked })} className="accent-indigo-500" /> Agente ativo
        </label>
        <label className="flex items-start gap-2 text-xs cursor-pointer rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
          <input type="checkbox" checked={f.test_mode ?? true} onChange={(e) => set({ test_mode: e.target.checked })} className="accent-amber-500 mt-0.5" />
          <span>
            <b className="text-amber-300">Modo teste</b> — o agente <b>pede confirmação</b> antes de qualquer ação e checa se os dados estão certos.
            <br /><span className="text-gray-500">Desligue quando confiar nele: passa a agir sozinho, perguntando só o essencial.</span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving || !f.name?.trim()} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50">
            <Save size={13} /> {saving ? "Salvando..." : "Salvar agente"}
          </button>
        </div>
      </div>
    </div>
  );
}
