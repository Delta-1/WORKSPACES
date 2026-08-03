"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, FileDown, Loader2, Plus, Printer, Save, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import {
  BUSINESS_PAGE, EMITENTE_FIELDS, EMPTY_CONTRATO, EMPTY_ORCAMENTO, EMPTY_QUESTIONARIO, EMPTY_RESUMO,
  fmtMoney, orcamentoTotais,
  renderContratoHtml, renderOrcamentoHtml, renderQuestionarioHtml, renderResumoHtml,
  type Contrato, type DocCompany, type Orcamento, type Questionario, type Resumo,
} from "@/lib/doc-templates/business";
import { pageStyle } from "@/lib/doc-templates/types";
import { printDocument } from "@/lib/doc-templates/print";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Row = { id: string; title: string; content: string | null; template: string | null };
export type BusinessModelId = "contrato" | "orcamento" | "questionario" | "resumo" | "resumao";
type AnyDoc = Contrato | Orcamento | Questionario | Resumo;

const emptyFor = (m: BusinessModelId): AnyDoc =>
  m === "contrato" ? EMPTY_CONTRATO()
  : m === "orcamento" ? EMPTY_ORCAMENTO()
  : m === "questionario" ? EMPTY_QUESTIONARIO()
  : EMPTY_RESUMO();

const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-sky-500";
const labelCls = "block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1";

function Field({ label, value, onChange, placeholder, area, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean; rows?: number }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {area
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3} className={`${inputCls} resize-y leading-relaxed`} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />}
    </div>
  );
}

function Card({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-500 uppercase">{title}</span>
        {onRemove && <button onClick={onRemove} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></button>}
      </div>
      {children}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="w-full text-[11px] py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1">
      <Plus size={12} /> {label}
    </button>
  );
}

export default function BusinessEditor({ row, model, modelLabel, onClose }: { row: Row; model: BusinessModelId; modelLabel: string; onClose: () => void }) {
  const [doc, setDoc] = useState<AnyDoc>(() => {
    try {
      const saved = JSON.parse(row.content || "null");
      if (saved && typeof saved === "object") return { ...emptyFor(model), ...saved } as AnyDoc;
    } catch { /* documento novo */ }
    return emptyFor(model);
  });
  const [company, setCompany] = useState<DocCompany>({});
  const [title, setTitle] = useState(row.title);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(0.72);
  const [prompt, setPrompt] = useState("");
  const [filling, setFilling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dados da empresa para o cabeçalho (mesma fonte dos documentos do TransLog).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.from("company_settings")
        .select("name, logo_url, address, phone, email, logistics_cnpj, logistics_ie")
        .maybeSingle();
      if (!alive || !data) return;
      setCompany({
        nome: data.name, razao_social: data.name,
        cnpj: data.logistics_cnpj, ie: data.logistics_ie,
        endereco: data.address, phone: data.phone, email: data.email, logo_url: data.logo_url,
      });
    })();
    return () => { alive = false; };
  }, []);

  const doSave = useCallback(async (d: AnyDoc, t: string) => {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("studio_documents")
      .update({ title: t.trim() || modelLabel, content: JSON.stringify(d), meta: { modelo: model }, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [row.id, model, modelLabel]);

  function schedule(d: AnyDoc, t: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(d, t), 1000);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function patch(up: Partial<AnyDoc>) {
    setDoc((prev) => { const next = { ...prev, ...up } as AnyDoc; schedule(next, title); return next; });
  }

  const html = (() => {
    if (model === "contrato") return renderContratoHtml(doc as Contrato, company);
    if (model === "orcamento") return renderOrcamentoHtml(doc as Orcamento, company);
    if (model === "questionario") return renderQuestionarioHtml(doc as Questionario, company);
    return renderResumoHtml(doc as Resumo, company, model === "resumao");
  })();

  async function fillWithAi() {
    if (!prompt.trim() || filling) return;
    setFilling(true); setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/studio/fill", {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ model, prompt, current: doc }),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      // Mescla por cima do que já existe — a IA completa, não apaga o seu trabalho.
      const next = { ...doc, ...(data.data as Partial<AnyDoc>) } as AnyDoc;
      setDoc(next);
      void doSave(next, title);
      setPrompt("");
    } catch {
      setErr("Falha de conexão com a IA.");
    } finally { setFilling(false); }
  }

  async function exportDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const { editorHtmlToDocxBlob } = await import("@/lib/studio-docx");
      const holder = document.createElement("div");
      // Sem o <style> (o .docx não usa CSS): só a estrutura vai para o Word.
      holder.innerHTML = html.replace(/<style>[\s\S]*?<\/style>/i, "");
      const blob = await editorHtmlToDocxBlob(holder, title, BUSINESS_PAGE);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(title || modelLabel).slice(0, 60)}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }
  function exportPdf() { printDocument(html, BUSINESS_PAGE, title || modelLabel); }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 flex-wrap shrink-0">
        <button onClick={async () => { await doSave(doc, title); onClose(); }} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(doc, e.target.value); }} className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-white/20 px-1 min-w-[120px]" />
        <span className="text-[10px] text-gray-500">{saving ? "salvando…" : savedAt ? `salvo ${savedAt}` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={exportDocx} disabled={exporting} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Word
          </button>
          <button onClick={exportPdf} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Printer size={13} /> PDF</button>
          <button onClick={() => doSave(doc, title)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Save size={13} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Formulário */}
        <div className="w-full sm:w-[350px] shrink-0 border-r border-white/10 overflow-y-auto custom-scroll p-3 space-y-3 bg-[#0b0f16]">
          {/* Preencher com a Nina */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-2.5 space-y-2">
            <p className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5"><Wand2 size={12} /> Preencher com a Nina</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder={
                model === "contrato" ? "Ex.: contrato de prestação de serviço de design por R$ 3.000, prazo de 30 dias"
                : model === "orcamento" ? "Ex.: orçamento de instalação elétrica: 20 pontos de tomada e 1 quadro de luz"
                : model === "questionario" ? "Ex.: 10 questões de biologia sobre fotossíntese, ensino médio"
                : "Ex.: resumo de Revolução Francesa para prova do 2º ano"
              }
              className={`${inputCls} resize-none`}
            />
            <button onClick={fillWithAi} disabled={filling || !prompt.trim()} className="w-full text-[11px] py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
              {filling ? <><Loader2 size={12} className="animate-spin" /> escrevendo…</> : <>Preencher</>}
            </button>
            {err && <p className="text-[10px] text-red-400">{err}</p>}
            <p className="text-[10px] text-gray-500">Ela completa o que estiver vazio e mantém o que você já escreveu. Tudo continua editável abaixo.</p>
          </div>

          <EmitenteForm
            emitente={{ ...company, ...((doc as { emitente?: DocCompany }).emitente ?? {}) }}
            onChange={(v) => patch({ emitente: v } as Partial<AnyDoc>)}
            onReset={() => patch({ emitente: undefined } as Partial<AnyDoc>)}
            personalizado={!!(doc as { emitente?: DocCompany }).emitente}
          />

          {model === "contrato" && <ContratoForm doc={doc as Contrato} patch={patch} />}
          {model === "orcamento" && <OrcamentoForm doc={doc as Orcamento} patch={patch} />}
          {model === "questionario" && <QuestionarioForm doc={doc as Questionario} patch={patch} />}
          {(model === "resumo" || model === "resumao") && <ResumoForm doc={doc as Resumo} patch={patch} resumao={model === "resumao"} />}
        </div>

        {/* Prévia */}
        <div className="hidden sm:flex flex-1 overflow-auto custom-scroll bg-[#20242c] p-6 justify-center items-start">
          <div className="shrink-0" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
            <div className="bg-white text-black" style={{ ...pageStyle(BUSINESS_PAGE), boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>

      <div className="hidden sm:flex items-center justify-center gap-2 py-1.5 border-t border-white/10 shrink-0">
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">−</button>
        <span className="text-[11px] text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">+</button>
      </div>
    </div>
  );
}

// ── emitente (cabeçalho do documento) ───────────────────────────────────────

// Fica em todos os modelos de negócio: é quem assina o documento. Começa com os
// dados da empresa, mas o que for editado aqui vale só PARA ESTE documento —
// dá para emitir por outra marca sem mexer nas configurações da empresa.
function EmitenteForm({ emitente, onChange, onReset, personalizado }: {
  emitente: DocCompany;
  onChange: (v: DocCompany) => void;
  onReset: () => void;
  personalizado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  function logoUpload(file: File) {
    const r = new FileReader();
    r.onload = () => onChange({ ...emitente, logo_url: String(r.result || "") });
    r.readAsDataURL(file);
  }
  const nome = emitente.razao_social || emitente.nome || "";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-white/5 text-left">
        <span className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 grid place-items-center overflow-hidden shrink-0">
          {emitente.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={emitente.logo_url} alt="" className="w-full h-full object-contain" />
            : <Building2 size={14} className="text-gray-600" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold text-gray-500 uppercase">Emitente (topo do documento)</span>
          <span className="block text-xs truncate">{nome || "sem nome"}</span>
        </span>
        <span className="text-[10px] text-gray-500 shrink-0">{aberto ? "fechar" : "editar"}</span>
      </button>
      {aberto && (
        <div className="p-2.5 pt-0 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[11px] px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer">
              {emitente.logo_url ? "Trocar logo" : "Enviar logo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && logoUpload(e.target.files[0])} />
            </label>
            {emitente.logo_url && (
              <button onClick={() => onChange({ ...emitente, logo_url: "" })} className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer">remover</button>
            )}
          </div>
          {EMITENTE_FIELDS.map((f) => (
            <Field
              key={String(f.id)}
              label={f.label}
              placeholder={f.placeholder}
              value={(emitente[f.id] as string) ?? ""}
              onChange={(v) => onChange({ ...emitente, [f.id]: v })}
            />
          ))}
          {personalizado && (
            <button onClick={onReset} className="w-full text-[11px] py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-gray-400">
              voltar aos dados da empresa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── formulários por modelo ──────────────────────────────────────────────────

type Patch = (up: Partial<AnyDoc>) => void;

function ParteFields({ p, onChange, titulo }: { p: Contrato["contratante"]; onChange: (v: Contrato["contratante"]) => void; titulo: string }) {
  return (
    <Card title={titulo}>
      <Field label="Nome / razão social" value={p.nome} onChange={(v) => onChange({ ...p, nome: v })} />
      <Field label="CPF / CNPJ" value={p.doc} onChange={(v) => onChange({ ...p, doc: v })} />
      <Field label="Endereço" value={p.endereco} onChange={(v) => onChange({ ...p, endereco: v })} />
      <Field label="Representante" value={p.rep} onChange={(v) => onChange({ ...p, rep: v })} />
    </Card>
  );
}

function ContratoForm({ doc, patch }: { doc: Contrato; patch: Patch }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Número" value={doc.numero} onChange={(v) => patch({ numero: v })} placeholder="001/2026" />
        <Field label="Data" value={doc.data} onChange={(v) => patch({ data: v })} />
      </div>
      <Field label="Objeto do contrato" value={doc.objeto} onChange={(v) => patch({ objeto: v })} area />
      <ParteFields titulo="Contratante" p={doc.contratante} onChange={(v) => patch({ contratante: v })} />
      <ParteFields titulo="Contratada" p={doc.contratada} onChange={(v) => patch({ contratada: v })} />
      <Card title="Condições">
        <Field label="Valor" value={doc.valor} onChange={(v) => patch({ valor: v })} placeholder="R$ 3.000,00" />
        <Field label="Forma de pagamento" value={doc.pagamento} onChange={(v) => patch({ pagamento: v })} />
        <Field label="Prazo de execução" value={doc.prazo} onChange={(v) => patch({ prazo: v })} />
        <Field label="Vigência" value={doc.vigencia} onChange={(v) => patch({ vigencia: v })} />
      </Card>
      {doc.clausulas.map((c, i) => (
        <Card key={i} title={`Cláusula ${i + 1}`} onRemove={() => patch({ clausulas: doc.clausulas.filter((_, k) => k !== i) })}>
          <Field label="Título" value={c.titulo} onChange={(v) => patch({ clausulas: doc.clausulas.map((x, k) => (k === i ? { ...x, titulo: v } : x)) })} />
          <Field label="Texto" value={c.texto} onChange={(v) => patch({ clausulas: doc.clausulas.map((x, k) => (k === i ? { ...x, texto: v } : x)) })} area rows={4} />
        </Card>
      ))}
      <AddButton label="adicionar cláusula" onClick={() => patch({ clausulas: [...doc.clausulas, { titulo: "", texto: "" }] })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cidade" value={doc.cidade} onChange={(v) => patch({ cidade: v })} />
        <Field label="Foro" value={doc.foro} onChange={(v) => patch({ foro: v })} />
      </div>
      {doc.testemunhas.map((t, i) => (
        <Card key={i} title={`Testemunha ${i + 1}`} onRemove={() => patch({ testemunhas: doc.testemunhas.filter((_, k) => k !== i) })}>
          <Field label="Nome" value={t.nome} onChange={(v) => patch({ testemunhas: doc.testemunhas.map((x, k) => (k === i ? { ...x, nome: v } : x)) })} />
          <Field label="CPF" value={t.doc} onChange={(v) => patch({ testemunhas: doc.testemunhas.map((x, k) => (k === i ? { ...x, doc: v } : x)) })} />
        </Card>
      ))}
      <AddButton label="adicionar testemunha" onClick={() => patch({ testemunhas: [...doc.testemunhas, { nome: "", doc: "" }] })} />
    </>
  );
}

function OrcamentoForm({ doc, patch }: { doc: Orcamento; patch: Patch }) {
  const { subtotal, total } = orcamentoTotais(doc);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Número" value={doc.numero} onChange={(v) => patch({ numero: v })} placeholder="001/2026" />
        <Field label="Data" value={doc.data} onChange={(v) => patch({ data: v })} />
        <Field label="Validade" value={doc.validade} onChange={(v) => patch({ validade: v })} />
        <Field label="Moeda" value={doc.moeda} onChange={(v) => patch({ moeda: v })} />
      </div>
      <ParteFields titulo="Cliente" p={doc.cliente} onChange={(v) => patch({ cliente: v })} />
      {doc.itens.map((it, i) => (
        <Card key={i} title={`Item ${i + 1}`} onRemove={() => patch({ itens: doc.itens.filter((_, k) => k !== i) })}>
          <Field label="Descrição" value={it.descricao} onChange={(v) => patch({ itens: doc.itens.map((x, k) => (k === i ? { ...x, descricao: v } : x)) })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Qtd." value={it.quant} onChange={(v) => patch({ itens: doc.itens.map((x, k) => (k === i ? { ...x, quant: v } : x)) })} />
            <Field label="Un." value={it.unidade} onChange={(v) => patch({ itens: doc.itens.map((x, k) => (k === i ? { ...x, unidade: v } : x)) })} />
            <Field label="Valor un." value={it.valor} onChange={(v) => patch({ itens: doc.itens.map((x, k) => (k === i ? { ...x, valor: v } : x)) })} />
          </div>
        </Card>
      ))}
      <AddButton label="adicionar item" onClick={() => patch({ itens: [...doc.itens, { descricao: "", quant: "1", unidade: "un", valor: "" }] })} />
      <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-gray-400"><span>Subtotal</span><span>{fmtMoney(subtotal, doc.moeda)}</span></div>
        <Field label="Desconto" value={doc.desconto} onChange={(v) => patch({ desconto: v })} placeholder="0,00" />
        <div className="flex items-center justify-between text-sm font-bold border-t border-white/10 pt-2"><span>Total</span><span className="text-emerald-400">{fmtMoney(total, doc.moeda)}</span></div>
      </div>
      <Field label="Forma de pagamento" value={doc.pagamento} onChange={(v) => patch({ pagamento: v })} />
      <Field label="Prazo de entrega" value={doc.prazoEntrega} onChange={(v) => patch({ prazoEntrega: v })} />
      <Field label="Observações" value={doc.observacoes} onChange={(v) => patch({ observacoes: v })} area />
    </>
  );
}

function QuestionarioForm({ doc, patch }: { doc: Questionario; patch: Patch }) {
  return (
    <>
      <Field label="Título" value={doc.titulo} onChange={(v) => patch({ titulo: v })} placeholder="Avaliação de Biologia — 1º bimestre" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Disciplina" value={doc.disciplina} onChange={(v) => patch({ disciplina: v })} />
        <Field label="Turma" value={doc.turma} onChange={(v) => patch({ turma: v })} />
        <Field label="Professor(a)" value={doc.professor} onChange={(v) => patch({ professor: v })} />
        <Field label="Data" value={doc.data} onChange={(v) => patch({ data: v })} />
      </div>
      <Field label="Instruções" value={doc.instrucoes} onChange={(v) => patch({ instrucoes: v })} area rows={2} />
      <label className="flex items-center gap-2 text-[11px] cursor-pointer bg-black/20 border border-white/10 rounded-lg px-2.5 py-2">
        <input type="checkbox" checked={doc.gabarito} onChange={(e) => patch({ gabarito: e.target.checked })} className="accent-sky-500" />
        Incluir gabarito no fim (em página separada)
      </label>
      {doc.questoes.map((q, i) => (
        <Card key={i} title={`Questão ${i + 1}`} onRemove={() => patch({ questoes: doc.questoes.filter((_, k) => k !== i) })}>
          <Field label="Enunciado" value={q.enunciado} onChange={(v) => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, enunciado: v } : x)) })} area rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={q.tipo} onChange={(e) => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, tipo: e.target.value as "objetiva" | "dissertativa" } : x)) })} className={`${inputCls} cursor-pointer`}>
                <option value="objetiva">Objetiva</option>
                <option value="dissertativa">Dissertativa</option>
              </select>
            </div>
            <Field label="Valor" value={q.valor} onChange={(v) => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, valor: v } : x)) })} placeholder="1,0" />
          </div>
          {q.tipo === "objetiva" && (
            <div className="space-y-1.5">
              <label className={labelCls}>Alternativas</label>
              {q.alternativas.map((a, ai) => (
                <div key={ai} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-3">{String.fromCharCode(97 + ai)}</span>
                  <input value={a} onChange={(e) => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, alternativas: x.alternativas.map((y, yi) => (yi === ai ? e.target.value : y)) } : x)) })} className={inputCls} />
                  <button onClick={() => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, alternativas: x.alternativas.filter((_, yi) => yi !== ai) } : x)) })} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={12} /></button>
                </div>
              ))}
              <button onClick={() => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, alternativas: [...x.alternativas, ""] } : x)) })} className="text-[10px] text-sky-300 hover:text-white cursor-pointer">+ alternativa</button>
            </div>
          )}
          <Field label={q.tipo === "objetiva" ? "Resposta certa (letra)" : "Resposta esperada"} value={q.resposta} onChange={(v) => patch({ questoes: doc.questoes.map((x, k) => (k === i ? { ...x, resposta: v } : x)) })} />
        </Card>
      ))}
      <AddButton label="adicionar questão" onClick={() => patch({ questoes: [...doc.questoes, { enunciado: "", tipo: "objetiva", alternativas: ["", "", "", ""], resposta: "", valor: "" }] })} />
    </>
  );
}

function ResumoForm({ doc, patch, resumao }: { doc: Resumo; patch: Patch; resumao: boolean }) {
  return (
    <>
      <Field label="Título" value={doc.titulo} onChange={(v) => patch({ titulo: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Matéria" value={doc.materia} onChange={(v) => patch({ materia: v })} />
        <Field label="Autor(a)" value={doc.autor} onChange={(v) => patch({ autor: v })} />
      </div>
      {doc.topicos.map((t, i) => (
        <Card key={i} title={`Tópico ${i + 1}`} onRemove={() => patch({ topicos: doc.topicos.filter((_, k) => k !== i) })}>
          <Field label="Título" value={t.titulo} onChange={(v) => patch({ topicos: doc.topicos.map((x, k) => (k === i ? { ...x, titulo: v } : x)) })} />
          <Field label="Conteúdo" value={t.conteudo} onChange={(v) => patch({ topicos: doc.topicos.map((x, k) => (k === i ? { ...x, conteudo: v } : x)) })} area rows={4} />
          <Field label="Guarde isto (destaque)" value={t.destaque} onChange={(v) => patch({ topicos: doc.topicos.map((x, k) => (k === i ? { ...x, destaque: v } : x)) })} />
        </Card>
      ))}
      <AddButton label="adicionar tópico" onClick={() => patch({ topicos: [...doc.topicos, { titulo: "", conteudo: "", destaque: "" }] })} />

      {resumao && (
        <>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pt-1">Extras do resumão</p>
          {doc.conceitos.map((c, i) => (
            <Card key={i} title={`Conceito ${i + 1}`} onRemove={() => patch({ conceitos: doc.conceitos.filter((_, k) => k !== i) })}>
              <Field label="Termo" value={c.termo} onChange={(v) => patch({ conceitos: doc.conceitos.map((x, k) => (k === i ? { ...x, termo: v } : x)) })} />
              <Field label="Definição" value={c.definicao} onChange={(v) => patch({ conceitos: doc.conceitos.map((x, k) => (k === i ? { ...x, definicao: v } : x)) })} area rows={2} />
            </Card>
          ))}
          <AddButton label="adicionar conceito" onClick={() => patch({ conceitos: [...doc.conceitos, { termo: "", definicao: "" }] })} />
          <div>
            <label className={labelCls}>O que mais cai na prova (um por linha)</label>
            <textarea
              value={doc.maisCai.join("\n")}
              onChange={(e) => patch({ maisCai: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              rows={4}
              className={`${inputCls} resize-y`}
            />
          </div>
        </>
      )}
    </>
  );
}
