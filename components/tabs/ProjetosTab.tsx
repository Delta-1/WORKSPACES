"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, ArrowLeft, Trash2, Copy, Check, StickyNote, Wallet, CalendarDays, Columns3, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { useLive } from "@/lib/use-live";
import type { Profile } from "@/lib/types";

type Project = { id: string; name: string; kind: string; status: string; description: string | null; budget_total: number; deadline: string | null; contact_id: string | null; created_at: string };
type ChecklistItem = { text: string; done: boolean };
type Task = { id: string; project_id: string; title: string; column_name: string; position: number; checklist: ChecklistItem[]; due_date: string | null };
type Note = { id: string; kind: string; title: string | null; body: string; created_at: string };
type BudgetItem = { id: string; descricao: string; valor: number };
type Ev = { id: string; title: string; starts_at: string };

const COLS = [
  { id: "backlog", label: "Backlog" },
  { id: "a_fazer", label: "A fazer" },
  { id: "fazendo", label: "Fazendo" },
  { id: "revisao", label: "Revisão" },
  { id: "concluido", label: "Concluído" },
];
const money = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = { ativo: "bg-emerald-500/15 text-emerald-300", pausado: "bg-amber-500/15 text-amber-300", concluido: "bg-sky-500/15 text-sky-300", cancelado: "bg-zinc-700/40 text-zinc-400" };

export default function ProjetosTab({ profile }: { profile: Profile | null }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const cid = profile?.company_id ?? null;

  const loadProjects = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    setProjects((data as Project[]) ?? []);
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  useLive(["projects"], cid, loadProjects);

  async function criar() {
    if (!supabase || !profile?.id) return;
    const name = prompt("Nome do projeto:")?.trim();
    if (!name) return;
    const meu = confirm("É um projeto SEU (sua ideia)?  OK = meu  ·  Cancelar = de cliente");
    const { data } = await supabase.from("projects").insert({ company_id: cid, owner_id: profile.id, name, kind: meu ? "meu" : "cliente" }).select("*").single();
    if (data) { await loadProjects(); setSelId((data as Project).id); }
  }

  const sel = projects.find((p) => p.id === selId) ?? null;
  if (sel) return <ProjectDetail project={sel} cid={cid} onBack={() => { setSelId(null); loadProjects(); }} onChanged={loadProjects} />;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2"><FolderKanban className="text-indigo-400" size={20} /> Projetos</h3>
        <button onClick={criar} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"><Plus size={14} /> Novo projeto</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll">
        {projects.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-16">
            Nenhum projeto ainda. Crie um, ou deixe a <b className="text-fuchsia-300">Nina</b> montar pelos atendimentos. ✨
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => (
              <button key={p.id} onClick={() => setSelId(p.id)} className="text-left liquid-glass rounded-2xl p-4 hover:-translate-y-0.5 transition cursor-pointer border border-white/10">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${p.kind === "meu" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-cyan-500/15 text-cyan-300"}`}>{p.kind === "meu" ? "Meu" : "Cliente"}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS[p.status] || ""}`}>{p.status}</span>
                </div>
                <p className="font-semibold truncate">{p.name}</p>
                {p.description && <p className="text-[11px] text-gray-400 line-clamp-2 mt-1">{p.description}</p>}
                <p className="text-xs text-amber-300 mt-2">{p.budget_total > 0 ? money(p.budget_total) : "—"}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDetail({ project, cid, onBack, onChanged }: { project: Project; cid: string | null; onBack: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"kanban" | "notas" | "orcamento" | "agenda">("kanban");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const pid = project.id;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [t, n, b, e] = await Promise.all([
      supabase.from("project_tasks").select("*").eq("project_id", pid).order("position"),
      supabase.from("project_notes").select("*").eq("project_id", pid).order("created_at", { ascending: false }),
      supabase.from("project_budget_items").select("*").eq("project_id", pid),
      supabase.from("project_events").select("*").eq("project_id", pid).order("starts_at"),
    ]);
    setTasks((t.data as Task[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    setBudget((b.data as BudgetItem[]) ?? []);
    setEvents((e.data as Ev[]) ?? []);
  }, [pid]);
  useEffect(() => { load(); }, [load]);
  useLive(["project_tasks", "project_notes", "project_budget_items", "project_events"], cid, load);

  // Progresso = itens de checklist concluídos / total (ou fração de cards concluídos).
  const progress = useMemo(() => {
    let done = 0, total = 0;
    for (const t of tasks) for (const it of t.checklist || []) { total++; if (it.done) done++; }
    if (total === 0) { const c = tasks.filter((t) => t.column_name === "concluido").length; return tasks.length ? Math.round((c / tasks.length) * 100) : 0; }
    return Math.round((done / total) * 100);
  }, [tasks]);

  // ── Kanban + checklist sincronizados ──────────────────────────────────
  async function saveTask(id: string, patch: Partial<Task>) {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (supabase) await supabase.from("project_tasks").update(patch).eq("id", id);
  }
  async function toggleItem(t: Task, i: number) {
    const checklist = t.checklist.map((it, j) => (j === i ? { ...it, done: !it.done } : it));
    const allDone = checklist.length > 0 && checklist.every((it) => it.done);
    await saveTask(t.id, { checklist, ...(allDone ? { column_name: "concluido" } : {}) });
  }
  async function moveTask(t: Task, dir: -1 | 1) {
    const idx = COLS.findIndex((c) => c.id === t.column_name);
    const next = COLS[Math.min(COLS.length - 1, Math.max(0, idx + dir))];
    if (!next || next.id === t.column_name) return;
    // Concluir o card marca todo o checklist; e vice-versa (o toggle já cuida).
    const checklist = next.id === "concluido" ? t.checklist.map((it) => ({ ...it, done: true })) : t.checklist;
    await saveTask(t.id, { column_name: next.id, checklist });
  }
  async function addCard(col: string) {
    const title = prompt("Título do card:")?.trim();
    if (!title || !supabase) return;
    await supabase.from("project_tasks").insert({ project_id: pid, company_id: cid, title, column_name: col, checklist: [] });
    load();
  }
  async function addChecklistItem(t: Task) {
    const text = prompt("Item do checklist:")?.trim();
    if (!text) return;
    await saveTask(t.id, { checklist: [...(t.checklist || []), { text, done: false }] });
  }
  async function delTask(id: string) { if (supabase && confirm("Excluir card?")) { await supabase.from("project_tasks").delete().eq("id", id); load(); } }

  // ── Notas ─────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState<string | null>(null);
  async function addNote(kind: "ponto" | "prompt") {
    const body = prompt(kind === "prompt" ? "Prompt (pra colar no Claude):" : "Ponto/anotação:")?.trim();
    if (!body || !supabase) return;
    await supabase.from("project_notes").insert({ project_id: pid, company_id: cid, kind, body });
    load();
  }
  async function delNote(id: string) { if (supabase) { await supabase.from("project_notes").delete().eq("id", id); load(); } }

  // ── Orçamento ─────────────────────────────────────────────────────────
  const total = budget.reduce((a, b) => a + (Number(b.valor) || 0), 0);
  async function addBudget() {
    const descricao = prompt("Descrição do item:")?.trim();
    if (!descricao || !supabase) return;
    const valor = Number(prompt("Valor (R$):")?.replace(",", ".")) || 0;
    await supabase.from("project_budget_items").insert({ project_id: pid, company_id: cid, descricao, valor });
    const novo = total + valor;
    await supabase.from("projects").update({ budget_total: novo }).eq("id", pid);
    load(); onChanged();
  }
  async function delBudget(id: string, valor: number) {
    if (!supabase) return;
    await supabase.from("project_budget_items").delete().eq("id", id);
    await supabase.from("projects").update({ budget_total: Math.max(0, total - valor) }).eq("id", pid);
    load(); onChanged();
  }

  // ── Agenda ────────────────────────────────────────────────────────────
  async function addEvent() {
    const title = prompt("Etapa/prazo:")?.trim();
    if (!title || !supabase) return;
    const when = prompt("Quando? (AAAA-MM-DD ou AAAA-MM-DD HH:MM)")?.trim();
    const d = when ? new Date(when.replace(" ", "T")) : null;
    if (!d || isNaN(d.getTime())) { alert("Data inválida."); return; }
    await supabase.from("project_events").insert({ project_id: pid, company_id: cid, title, starts_at: d.toISOString() });
    load();
  }
  async function delEvent(id: string) { if (supabase) { await supabase.from("project_events").delete().eq("id", id); load(); } }

  const tabBtn = (id: typeof tab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(id)} className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg cursor-pointer ${tab === id ? "bg-indigo-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>{icon} {label}</button>
  );

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Cabeçalho / visão geral */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onBack} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 mb-1 cursor-pointer"><ArrowLeft size={13} /> Projetos</button>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold truncate">{project.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${project.kind === "meu" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-cyan-500/15 text-cyan-300"}`}>{project.kind === "meu" ? "Meu" : "Cliente"}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS[project.status] || ""}`}>{project.status}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-amber-300">{money(project.budget_total)}</div>
          <div className="text-[11px] text-gray-500">{progress}% concluído</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>

      <div className="flex items-center gap-1.5">
        {tabBtn("kanban", "Kanban", <Columns3 size={13} />)}
        {tabBtn("notas", "Notas", <StickyNote size={13} />)}
        {tabBtn("orcamento", "Orçamento", <Wallet size={13} />)}
        {tabBtn("agenda", "Agenda", <CalendarDays size={13} />)}
      </div>

      <div className="flex-1 overflow-auto custom-scroll">
        {tab === "kanban" && (
          <div className="flex gap-3 h-full min-h-0" style={{ minWidth: "max-content" }}>
            {COLS.map((c) => (
              <div key={c.id} className="w-64 shrink-0 flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-gray-300">{c.label}</span>
                  <button onClick={() => addCard(c.id)} className="text-gray-500 hover:text-white cursor-pointer"><Plus size={14} /></button>
                </div>
                <div className="space-y-2">
                  {tasks.filter((t) => t.column_name === c.id).map((t) => {
                    const done = (t.checklist || []).filter((i) => i.done).length;
                    return (
                      <div key={t.id} className="rounded-xl border border-white/10 bg-[#11161f] p-2.5">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium">{t.title}</p>
                          <button onClick={() => delTask(t.id)} className="text-gray-600 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={12} /></button>
                        </div>
                        {(t.checklist || []).length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {t.checklist.map((it, i) => (
                              <label key={i} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                                <input type="checkbox" checked={it.done} onChange={() => toggleItem(t, i)} className="accent-emerald-500" />
                                <span className={it.done ? "line-through text-gray-500" : "text-gray-300"}>{it.text}</span>
                              </label>
                            ))}
                            <p className="text-[9px] text-gray-500">{done}/{t.checklist.length} feito</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <button onClick={() => addChecklistItem(t)} className="text-[10px] text-indigo-300 hover:text-white cursor-pointer flex items-center gap-0.5"><Plus size={10} /> item</button>
                          <div className="flex gap-1">
                            <button onClick={() => moveTask(t, -1)} className="p-0.5 rounded hover:bg-white/10 text-gray-400 cursor-pointer"><ChevronLeft size={13} /></button>
                            <button onClick={() => moveTask(t, 1)} className="p-0.5 rounded hover:bg-white/10 text-gray-400 cursor-pointer"><ChevronRight size={13} /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "notas" && (
          <div className="space-y-2 max-w-2xl">
            <div className="flex gap-2">
              <button onClick={() => addNote("ponto")} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer flex items-center gap-1"><Plus size={12} /> Ponto</button>
              <button onClick={() => addNote("prompt")} className="text-xs px-3 py-1.5 rounded-lg bg-fuchsia-600/15 text-fuchsia-300 hover:bg-fuchsia-600/25 cursor-pointer flex items-center gap-1"><Sparkles size={12} /> Prompt pro Claude</button>
            </div>
            {notes.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">Sem notas. A Nina anota os pontos e cria prompts aqui.</p>}
            {notes.map((n) => (
              <div key={n.id} className={`rounded-xl border p-3 ${n.kind === "prompt" ? "border-fuchsia-500/30 bg-fuchsia-950/15" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${n.kind === "prompt" ? "bg-fuchsia-500/20 text-fuchsia-200" : "bg-white/10 text-gray-300"}`}>{n.kind === "prompt" ? "Prompt" : "Ponto"}{n.title ? ` · ${n.title}` : ""}</span>
                  <div className="flex items-center gap-2">
                    {n.kind === "prompt" && (
                      <button onClick={() => { navigator.clipboard?.writeText(n.body); setCopied(n.id); setTimeout(() => setCopied(null), 1200); }} className="text-[11px] text-fuchsia-300 hover:text-white cursor-pointer flex items-center gap-1">{copied === n.id ? <><Check size={12} /> copiado</> : <><Copy size={12} /> copiar</>}</button>
                    )}
                    <button onClick={() => delNote(n.id)} className="text-gray-600 hover:text-red-400 cursor-pointer"><Trash2 size={12} /></button>
                  </div>
                </div>
                <p className="text-[13px] text-gray-200 whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "orcamento" && (
          <div className="max-w-xl space-y-2">
            <button onClick={addBudget} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer flex items-center gap-1"><Plus size={12} /> Item</button>
            {budget.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-sm truncate">{b.descricao}</span>
                <span className="flex items-center gap-3 shrink-0"><b className="text-amber-300 text-sm tabular-nums">{money(b.valor)}</b><button onClick={() => delBudget(b.id, b.valor)} className="text-gray-600 hover:text-red-400 cursor-pointer"><Trash2 size={12} /></button></span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-1">
              <span className="text-sm font-semibold">Total</span>
              <b className="text-amber-300">{money(total)}</b>
            </div>
          </div>
        )}

        {tab === "agenda" && (
          <div className="max-w-xl space-y-2">
            <button onClick={addEvent} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer flex items-center gap-1"><Plus size={12} /> Agendar</button>
            {events.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">Sem etapas agendadas.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="min-w-0"><span className="text-sm block truncate">{e.title}</span><span className="text-[11px] text-gray-500">{new Date(e.starts_at).toLocaleString("pt-BR")}</span></span>
                <button onClick={() => delEvent(e.id)} className="text-gray-600 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
