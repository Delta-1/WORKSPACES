"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Check, Download, FileSpreadsheet, GripVertical, Link2, PartyPopper, Pencil, Plus, Save, Table as TableIcon, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { MASKS, type MaskId } from "@/lib/mask";
import type { Profile } from "@/lib/types";

type FieldType = "short_text" | "long_text" | "number" | "email" | "phone" | "date" | "choice" | "multichoice" | "photo" | "file" | "section";
type Field = { id: string; label: string; type: FieldType; required?: boolean; options?: string[]; category?: string; mask?: MaskId };
type Form = { id: string; company_id: string; title: string; description: string | null; theme: { color?: string; bg?: string; celebrate?: boolean } | null; fields: Field[]; ai_agent_id?: string | null; created_at: string };
type Response = { id: string; data: Record<string, unknown>; created_at: string };

const TYPE_LABEL: Record<FieldType, string> = {
  short_text: "Texto curto", long_text: "Texto longo", number: "Número", email: "E-mail",
  phone: "Telefone", date: "Data", choice: "Escolha única", multichoice: "Múltipla escolha",
  photo: "Foto (câmera/upload)", file: "Arquivo (upload)", section: "Título de seção",
};
const uid = () => Math.random().toString(36).slice(2, 9);

export default function FormsTab({ profile }: { profile: Profile | null }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Form | null>(null);
  const [viewing, setViewing] = useState<Form | null>(null);
  const [picking, setPicking] = useState<Form | null>(null); // balão: planilha x editar
  const companyId = profile?.company_id ?? null;
  const canManage = profile?.role === "gestor" || profile?.role === "gerente" || !!(profile?.tool_access?.formularios);

  const load = useCallback(async () => {
    if (!supabase || !companyId) { setLoading(false); return; }
    const { data } = await supabase.from("forms").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    setForms((data as Form[]) ?? []);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function createForm() {
    if (!supabase || !companyId) return;
    const { data } = await supabase.from("forms").insert({ company_id: companyId, title: "Novo formulário", created_by: profile?.id ?? null, fields: [] }).select("*").single();
    if (data) { await load(); setEditing(data as Form); }
  }
  async function removeForm(id: string) {
    if (!supabase) return;
    if (!confirm("Excluir este formulário e todas as respostas?")) return;
    await supabase.from("forms").delete().eq("id", id);
    load();
  }

  if (editing) return <FormBuilder form={editing} onClose={() => { setEditing(null); load(); }} />;
  if (viewing) return <FormResponses form={viewing} onClose={() => setViewing(null)} />;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><ClipboardList className="text-emerald-400" size={20} /> Formulários <span className="text-xs font-normal text-gray-500">({forms.length})</span></h3>
        {canManage && (
          <button onClick={createForm} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><Plus size={14} /> Novo formulário</button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">Crie formulários (estilo Google Forms), compartilhe o link e veja as respostas numa planilha em tempo real. Exporte quando quiser.</p>

      <div className="flex-1 overflow-y-auto custom-scroll">
        {loading ? <p className="text-sm text-gray-500 p-4">Carregando…</p> : forms.length === 0 ? (
          <p className="text-sm text-gray-500 p-4 text-center">Nenhum formulário ainda. Clique em “Novo formulário”.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {forms.map((f) => (
              <button key={f.id} onClick={() => setPicking(f)} className="text-left liquid-glass rounded-2xl p-4 hover:border-emerald-500/40 border border-transparent cursor-pointer" style={{ borderTopColor: f.theme?.color || "#10b981", borderTopWidth: 3 }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold truncate">{f.title}</p>
                  {canManage && <span onClick={(e) => { e.stopPropagation(); removeForm(f.id); }} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={14} /></span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{f.description || `${(f.fields || []).length} campo(s)`}</p>
                <p className="text-[10px] text-gray-600 mt-2 flex items-center gap-1"><FileSpreadsheet size={11} /> Ver respostas / editar</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Balão: ver planilha ou editar (como pedido) */}
      {picking && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPicking(null)}>
          <div className="liquid-glass rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-bold truncate">{picking.title}</h4>
              <button onClick={() => setPicking(null)} className="text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-400 mb-4">O que você quer fazer?</p>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => { setViewing(picking); setPicking(null); }} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><FileSpreadsheet size={16} /> Ver a planilha (respostas)</button>
              {canManage && <button onClick={() => { setEditing(picking); setPicking(null); }} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 cursor-pointer"><Pencil size={16} /> Editar o formulário</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Construtor do formulário ─────────────────────────────────────────────────
function FormBuilder({ form, onClose }: { form: Form; onClose: () => void }) {
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description ?? "");
  const [color, setColor] = useState(form.theme?.color ?? "#10b981");
  const [celebrate, setCelebrate] = useState<boolean>(form.theme?.celebrate ?? true);
  const [fields, setFields] = useState<Field[]>(Array.isArray(form.fields) ? form.fields : []);
  const [aiAgent, setAiAgent] = useState<string>(form.ai_agent_id ?? "");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("chatbots").select("id,name").eq("company_id", form.company_id).order("name").then(({ data }) => setAgents((data as { id: string; name: string }[])?.filter((a) => a.name) ?? []));
  }, [form.company_id]);

  // Arrastar para reordenar: quando o card arrastado passa por cima de outro, ele
  // troca de posição na hora.
  function reorderTo(overId: string) {
    if (!dragId || dragId === overId) return;
    setFields((fs) => {
      const from = fs.findIndex((f) => f.id === dragId);
      const to = fs.findIndex((f) => f.id === overId);
      if (from < 0 || to < 0) return fs;
      const c = [...fs]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c;
    });
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/f/${form.id}` : "";
  function addField(type: FieldType) { setFields((f) => [...f, { id: uid(), label: type === "section" ? "Nova seção" : "Nova pergunta", type, required: false, options: (type === "choice" || type === "multichoice") ? ["Opção 1"] : undefined }]); }
  function patchField(id: string, up: Partial<Field>) { setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...up } : f))); }
  function removeField(id: string) { setFields((fs) => fs.filter((f) => f.id !== id)); }
  function move(id: string, dir: -1 | 1) {
    setFields((fs) => { const i = fs.findIndex((f) => f.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= fs.length) return fs; const c = [...fs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  }
  async function save() {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("forms").update({ title: title.trim() || "Formulário sem título", description: description.trim() || null, theme: { color, bg: "#0b0f16", celebrate }, fields, ai_agent_id: aiAgent || null, updated_at: new Date().toISOString() }).eq("id", form.id);
    setSaving(false);
    onClose();
  }
  function copyLink() { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><X size={14} /> Voltar</button>
        <div className="flex items-center gap-2">
          <button onClick={copyLink} className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer">{copied ? <><Check size={13} /> Copiado</> : <><Link2 size={13} /> Copiar link</>}</button>
          <button onClick={save} disabled={saving} className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"><Save size={13} /> {saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll max-w-2xl w-full mx-auto space-y-3">
        <div className="rounded-2xl p-4 bg-black/20 border-t-4" style={{ borderTopColor: color }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent text-lg font-bold outline-none" placeholder="Título do formulário" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descrição (opcional)" className="w-full bg-transparent text-sm text-gray-300 outline-none resize-none mt-1" />
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Tema:</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Preenchido pela IA:</span>
              <select value={aiAgent} onChange={(e) => setAiAgent(e.target.value)} className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[11px] outline-none cursor-pointer">
                <option value="">— nenhum —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-2 text-[11px] text-gray-300 cursor-pointer">
            <input type="checkbox" checked={celebrate} onChange={(e) => setCelebrate(e.target.checked)} className="accent-emerald-500" />
            <PartyPopper size={13} className="text-amber-400" /> Comemorar com confete ao enviar
          </label>
          <p className="text-[10px] text-gray-500 mt-1">Vinculando um agente, a IA pode preencher esta planilha a partir das conversas no WhatsApp (coleta e registro de dados).</p>
        </div>

        {fields.map((f) => (
          <div
            key={f.id}
            onDragOver={(e) => { e.preventDefault(); reorderTo(f.id); }}
            className={`rounded-xl p-3 bg-black/20 border transition-all ${dragId === f.id ? "border-emerald-500 opacity-60" : "border-white/10"}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-0.5 pt-1 text-gray-500">
                <button onClick={() => move(f.id, -1)} className="hover:text-white cursor-pointer text-[10px]">▲</button>
                <span
                  draggable
                  onDragStart={() => setDragId(f.id)}
                  onDragEnd={() => setDragId(null)}
                  title="Arraste para reordenar"
                  className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white"
                ><GripVertical size={14} /></span>
                <button onClick={() => move(f.id, 1)} className="hover:text-white cursor-pointer text-[10px]">▼</button>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} className={`w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 outline-none ${f.type === "section" ? "text-base font-bold" : "text-sm"}`} placeholder={f.type === "section" ? "Título da seção" : "Pergunta"} />
                {(f.type === "choice" || f.type === "multichoice") && (
                  <div className="space-y-1">
                    {(f.options ?? []).map((op, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={op} onChange={(e) => patchField(f.id, { options: (f.options ?? []).map((o, k) => (k === i ? e.target.value : o)) })} className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-[12px] outline-none" />
                        <button onClick={() => patchField(f.id, { options: (f.options ?? []).filter((_, k) => k !== i) })} className="text-gray-500 hover:text-red-400 cursor-pointer"><X size={13} /></button>
                      </div>
                    ))}
                    <button onClick={() => patchField(f.id, { options: [...(f.options ?? []), `Opção ${(f.options?.length ?? 0) + 1}`] })} className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer">+ opção</button>
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <select value={f.type} onChange={(e) => patchField(f.id, { type: e.target.value as FieldType })} className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[11px] outline-none cursor-pointer">
                    {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {f.type !== "section" && (
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer">
                      <input type="checkbox" checked={!!f.required} onChange={(e) => patchField(f.id, { required: e.target.checked })} className="accent-emerald-500" /> Obrigatório
                    </label>
                  )}
                  {(f.type === "short_text" || f.type === "number") && (
                    <select value={f.mask ?? "none"} onChange={(e) => patchField(f.id, { mask: e.target.value as MaskId })} title="Máscara de digitação" className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[11px] outline-none cursor-pointer">
                      {MASKS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  )}
                  <input value={f.category ?? ""} onChange={(e) => patchField(f.id, { category: e.target.value || undefined })} placeholder="Categoria (opcional)" className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[11px] outline-none w-32" />
                </div>
              </div>
              <button onClick={() => removeField(f.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}

        <div className="rounded-xl p-3 bg-black/10 border border-dashed border-white/15">
          <p className="text-[11px] text-gray-400 mb-2">Adicionar campo:</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
              <button key={t} onClick={() => addField(t)} className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-emerald-600/40 cursor-pointer">+ {TYPE_LABEL[t]}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Planilha de respostas (tempo real) ───────────────────────────────────────
function FormResponses({ form, onClose }: { form: Form; onClose: () => void }) {
  const [rows, setRows] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const cols = useMemo(() => (form.fields || []).filter((f) => f.type !== "section"), [form.fields]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("form_responses").select("id,data,created_at").eq("form_id", form.id).order("created_at", { ascending: false });
    setRows((data as Response[]) ?? []);
    setLoading(false);
  }, [form.id]);
  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel(`form-${form.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "form_responses", filter: `form_id=eq.${form.id}` }, (p) => setRows((r) => [p.new as Response, ...r])).subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [load, form.id]);

  function cell(v: unknown): string {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "string" && v.startsWith("data:")) return "[arquivo]";
    return String(v);
  }
  function exportCsv() {
    const header = ["Data", ...cols.map((c) => c.label)];
    const lines = rows.map((r) => [new Date(r.created_at).toLocaleString("pt-BR"), ...cols.map((c) => `"${cell(r.data[c.id]).replace(/"/g, '""')}"`)].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${form.title}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><X size={14} /> Voltar</button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{rows.length} resposta(s)</span>
          <button onClick={exportCsv} className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Download size={13} /> Exportar CSV</button>
        </div>
      </div>
      <h3 className="text-base font-bold flex items-center gap-2"><TableIcon size={16} className="text-emerald-400" /> {form.title}</h3>

      <div className="flex-1 overflow-auto custom-scroll border border-white/10 rounded-xl">
        {loading ? <p className="text-sm text-gray-500 p-4">Carregando…</p> : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-[#0b0f16]">
              <tr>
                <th className="text-left text-[11px] text-gray-400 font-semibold px-3 py-2 border-b border-white/10 whitespace-nowrap">Data</th>
                {cols.map((c) => <th key={c.id} className="text-left text-[11px] text-gray-400 font-semibold px-3 py-2 border-b border-white/10 whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={cols.length + 1} className="text-center text-gray-500 py-8">Nenhuma resposta ainda. Compartilhe o link do formulário.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 border-b border-white/5 text-[11px] text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  {cols.map((c) => <td key={c.id} className="px-3 py-2 border-b border-white/5 text-gray-200 max-w-[240px] truncate">{cell(r.data[c.id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
