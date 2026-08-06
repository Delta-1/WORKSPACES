"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileUp, Loader2, Network, Pencil, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import ProjectBoard from "@/components/group/ProjectBoard";
import { extractReferenceFile, type ReferenceMaterial } from "@/lib/reference-file";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type Plan = { id: string; title: string; content: string | null; updated_at: string };
const EMPTY = JSON.stringify({ nodes: [], edges: [], strokes: [] });

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {}; const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export default function PlanTool({ profile, onBack }: { profile: Profile | null; onBack: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]); const [open, setOpen] = useState<Plan | null>(null); const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState(""); const [referenceChoice, setReferenceChoice] = useState<"unknown" | "file" | "none">("unknown");
  const [reference, setReference] = useState<ReferenceMaterial | null>(null); const [reading, setReading] = useState(false); const [generating, setGenerating] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("studio_documents").select("id,title,content,updated_at").eq("kind", "plan").order("updated_at", { ascending: false });
    setPlans((data as Plan[]) || []); setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function insertPlan(title: string, content: string) {
    if (!supabase) return null;
    const { data, error: insertError } = await supabase.from("studio_documents").insert({ company_id: profile?.company_id ?? null, created_by: profile?.id ?? null, kind: "plan", title, template: "mindmap", content, meta: { modelo: "mindmap", criador: "plano" } }).select("id,title,content,updated_at").single();
    if (insertError) throw insertError; return data as Plan;
  }
  async function createBlank() { try { const plan = await insertPlan("Novo plano", EMPTY); if (plan) setOpen(plan); } catch { setError("Não consegui criar o plano."); } }
  async function chooseFile(file: File) {
    setReading(true); setError(null);
    try { setReference(await extractReferenceFile(file)); }
    catch (cause) { setReference(null); setError(cause instanceof Error ? cause.message : "Não consegui ler o arquivo."); }
    finally { setReading(false); }
  }
  async function generate() {
    if (!topic.trim() || generating || referenceChoice === "unknown" || (referenceChoice === "file" && !reference)) return;
    setGenerating(true); setError(null);
    try {
      const response = await fetch("/api/studio/plan", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ prompt: topic, referenceDecision: referenceChoice, referenceText: reference?.text, referenceName: reference?.name }) });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || "Falha ao criar o mapa.");
      const plan = await insertPlan(data.title || topic, JSON.stringify(data.scene)); if (plan) { setOpen(plan); setTopic(""); setReference(null); setReferenceChoice("unknown"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não consegui criar o mapa."); }
    finally { setGenerating(false); }
  }
  async function remove(plan: Plan) { if (!supabase || !confirm(`Excluir o plano "${plan.title}"?`)) return; await supabase.from("studio_documents").delete().eq("id", plan.id); void load(); }
  async function rename(plan: Plan) { const title = prompt("Nome do plano:", plan.title)?.trim(); if (!title || !supabase) return; await supabase.from("studio_documents").update({ title, updated_at: new Date().toISOString() }).eq("id", plan.id); void load(); }

  if (open) return <ProjectBoard projectId={open.id} title={open.title} meId={profile?.id || ""} storage="studio" initialScene={open.content} onBack={() => { setOpen(null); void load(); }} />;

  return (
    <div className="h-full overflow-y-auto custom-scroll pb-8">
      <button onClick={onBack} className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-white"><ArrowLeft size={14} /> Estúdio</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-lg font-bold"><Network size={20} className="text-violet-400" /> Plano</h3><p className="mt-0.5 text-[11px] text-gray-500">Mapas mentais e fluxos editáveis, criados por você ou pela Yumi.</p></div>
        <button onClick={() => void createBlank()} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"><Plus size={14} /> Plano em branco</button>
      </div>

      <div className="mt-5 rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/35 to-blue-950/15 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><Wand2 size={16} className="text-violet-300" /> Criar com a Yumi</div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-gray-200"><Sparkles size={13} className="mr-1 inline text-amber-300" /> Antes de montar o mapa: você tem algum arquivo para eu usar como referência?</p>
          {referenceChoice === "unknown" && <div className="mt-3 flex gap-2"><button onClick={() => setReferenceChoice("file")} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white">Sim, vou enviar</button><button onClick={() => setReferenceChoice("none")} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15">Não tenho arquivo</button></div>}
          {referenceChoice === "file" && <div className="mt-3 flex flex-wrap items-center gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"><FileUp size={13} /> {reading ? "Lendo arquivo…" : reference?.name || "Escolher PDF ou Word"}<input type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.csv" className="hidden" onChange={(event) => event.target.files?.[0] && void chooseFile(event.target.files[0])} /></label><button onClick={() => { setReferenceChoice("none"); setReference(null); }} className="text-[11px] text-gray-500 hover:text-white">Continuar sem arquivo</button></div>}
          {referenceChoice !== "unknown" && <div className="mt-3 space-y-2"><textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} placeholder="Ex.: monte um mapa mental do sistema respiratório, destacando órgãos, funções e percurso do ar" className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-violet-400" /><button onClick={() => void generate()} disabled={generating || !topic.trim() || (referenceChoice === "file" && !reference)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{generating ? <><Loader2 size={13} className="animate-spin" /> Yumi está organizando…</> : <><Sparkles size={13} /> Gerar mapa mental</>}</button></div>}
          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </div>
      </div>

      <div className="mt-6"><p className="mb-2 text-xs font-bold text-gray-300">Seus planos</p>
        {loading ? <div className="py-10 text-center text-gray-500"><Loader2 size={18} className="mx-auto animate-spin" /></div> : plans.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center"><Network size={24} className="mx-auto text-violet-400/60" /><p className="mt-2 text-sm text-gray-400">Nenhum plano ainda.</p></div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{plans.map((plan) => <div key={plan.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-violet-500/40"><button onClick={() => setOpen(plan)} className="w-full text-left"><div className="grid h-24 place-items-center bg-[#0c1018]" style={{ backgroundImage: "radial-gradient(circle, rgba(167,139,250,.12) 1px, transparent 1px)", backgroundSize: "16px 16px" }}><Network size={24} className="text-violet-400/70" /></div><div className="p-3"><p className="truncate text-sm font-semibold">{plan.title}</p><p className="mt-1 text-[10px] text-gray-500">Atualizado em {new Date(plan.updated_at).toLocaleDateString("pt-BR")}</p></div></button><div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100"><button onClick={() => void rename(plan)} className="rounded-lg bg-black/60 p-1.5 text-gray-300 hover:text-white"><Pencil size={12} /></button><button onClick={() => void remove(plan)} className="rounded-lg bg-black/60 p-1.5 text-gray-300 hover:text-red-300"><Trash2 size={12} /></button></div></div>)}</div>}
      </div>
    </div>
  );
}
