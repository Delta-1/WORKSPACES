"use client";

// ============================ Logística Internacional ============================
// Ferramenta para empresas de exportação/importação (transporte rodoviário
// MERCOSUL). Módulos: Kanban de cargas, Frota & Manutenção, Estoque & Fumigação,
// Motoristas (+ portal), Gerador de Documentos aduaneiros (DUE/MIC-DTA/CRT/
// Proforma/Invoice), DRE (Operação vs Empresa) e Configurações. Um passo a passo
// prepara o app na primeira vez. A IA (Labs) cuida do WhatsApp e entrega
// localização de motoristas e arquivos da pasta da ferramenta.

import { useCallback, useEffect, useState } from "react";
import {
  Anchor, Boxes, Check, FileText, LineChart, Link2, MapPin, MessageSquare, Navigation,
  Plus, Route, Settings, Ship, ShieldCheck, Sprout, Trash2, Truck, Users, Wrench, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { LOGI_DOCS, docDef, renderLogisticsDoc, type LogiDocType } from "@/lib/logistics-docs";

// ---- Tipos locais (refletem as tabelas logistics_*) ----
type Carga = {
  id: string; codigo: string | null; cliente_nome: string | null; produto: string | null;
  origem: string | null; destino: string | null; pais_destino: string | null; incoterm: string | null;
  moeda: string | null; valor_declarado: number | null; cfop: string | null; peso: number | null;
  volumes: number | null; stage: string; vehicle_id: string | null; driver_id: string | null;
  transbordo_local: string | null; obs: string | null; created_at: string;
};
type Vehicle = { id: string; tipo: string; placa: string; modelo: string | null; ano: string | null; driver_id: string | null; obs: string | null };
type VExpense = { id: string; vehicle_id: string | null; descricao: string; categoria: string | null; valor: number; data: string | null };
type Stock = { id: string; produto: string; lote: string | null; quantidade: number; unidade: string | null; local_armazenamento: string | null; status: string | null };
type Fumigation = { id: string; stock_id: string | null; lote: string | null; certificado_num: string | null; quantidade_baixa: number | null; data: string | null; status: string | null };
type Driver = { id: string; nome: string; telefone: string | null; veiculo: string | null; cnh: string | null; access_token: string | null; gps_ativo: boolean | null; last_lat: number | null; last_lng: number | null; last_ping_at: string | null };
type Finance = { id: string; escopo: string; tipo: string; categoria: string | null; descricao: string | null; valor: number; carga_id: string | null; vehicle_id: string | null; status: string | null; data: string | null };
type LogiDoc = { id: string; carga_id: string | null; tipo: string; numero: string | null; created_at: string; dados: Record<string, string> };

const STAGES: { id: string; label: string; hint: string; color: string }[] = [
  { id: "proforma", label: "Fatura Proforma", hint: "Negociação e proposta", color: "text-zinc-300" },
  { id: "pedido", label: "Pedido / Contas a Pagar", hint: "Pedido de compra lançado", color: "text-blue-300" },
  { id: "entrada", label: "Entrada & Romaneio", hint: "Carga registrada no estoque", color: "text-emerald-300" },
  { id: "fumigacao", label: "Fumigação", hint: "Tratamento fitossanitário", color: "text-lime-300" },
  { id: "documentacao", label: "Documentação Aduaneira", hint: "DUE, MIC/DTA, CRT", color: "text-sky-300" },
  { id: "transbordo", label: "Transbordo (Fronteira)", hint: "Troca de cavalo/reboque", color: "text-amber-300" },
  { id: "exportacao", label: "Exportação & Invoice", hint: "Faturamento definitivo", color: "text-purple-300" },
  { id: "concluido", label: "Concluído", hint: "Entregue", color: "text-emerald-400" },
];
const stageIndex = (s: string) => Math.max(0, STAGES.findIndex((x) => x.id === s));

type Mod = "kanban" | "fleet" | "stock" | "drivers" | "docgen" | "dre" | "settings";
const MODULES: { id: Mod; label: string; icon: typeof Ship; group: string }[] = [
  { id: "kanban", label: "Visão Kanban", icon: Route, group: "Operações & Rastreio" },
  { id: "fleet", label: "Frota & Manutenção", icon: Wrench, group: "Operações & Rastreio" },
  { id: "stock", label: "Estoque & Fumigação", icon: Boxes, group: "Operações & Rastreio" },
  { id: "drivers", label: "Motoristas & Portal", icon: Users, group: "Operações & Rastreio" },
  { id: "docgen", label: "Gerador de Documentos", icon: FileText, group: "Docs & Financeiro" },
  { id: "dre", label: "DRE Operação × Empresa", icon: LineChart, group: "Docs & Financeiro" },
  { id: "settings", label: "Dados da Empresa & Servidor", icon: Settings, group: "Configurações" },
];

const money = (n: number, c = "R$") => `${c} ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function LogisticsTab({ profile }: { profile: Profile | null }) {
  const cid = profile?.company_id ?? null;
  const isGestor = profile?.role === "gestor";
  const [mod, setMod] = useState<Mod>("kanban");
  const [toast, setToast] = useState<{ t: string; d?: string; kind?: string } | null>(null);
  const flash = useCallback((t: string, d?: string, kind = "success") => { setToast({ t, d, kind }); setTimeout(() => setToast(null), 4000); }, []);

  // Config da empresa (dados fiscais + servidor + onboarding).
  const [cfg, setCfg] = useState<{ onboarded: boolean; server: string; razao: string; cnpj: string; nome: string; logo: string | null }>({ onboarded: true, server: "", razao: "", cnpj: "", nome: "", logo: null });
  const [cfgLoaded, setCfgLoaded] = useState(false);

  // Dados dos módulos
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expenses, setExpenses] = useState<VExpense[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [fumi, setFumi] = useState<Fumigation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [finance, setFinance] = useState<Finance[]>([]);
  const [docs, setDocs] = useState<LogiDoc[]>([]);

  const loadAll = useCallback(async () => {
    if (!supabase || !cid) return;
    const [c, v, e, s, f, d, fi, dc] = await Promise.all([
      supabase.from("logistics_cargas").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_vehicles").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_vehicle_expenses").select("*").eq("company_id", cid).order("data", { ascending: false }),
      supabase.from("logistics_stock").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_fumigations").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_drivers").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_finance").select("*").eq("company_id", cid).order("data", { ascending: false }),
      supabase.from("logistics_documents").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
    ]);
    setCargas((c.data as Carga[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
    setExpenses((e.data as VExpense[]) ?? []);
    setStock((s.data as Stock[]) ?? []);
    setFumi((f.data as Fumigation[]) ?? []);
    setDrivers((d.data as Driver[]) ?? []);
    setFinance((fi.data as Finance[]) ?? []);
    setDocs((dc.data as LogiDoc[]) ?? []);
  }, [cid]);

  useEffect(() => {
    if (!supabase || !cid) return;
    supabase.from("company_settings")
      .select("logistics_onboarded,logistics_server_path,logistics_razao_social,logistics_cnpj,name,logo_url")
      .eq("company_id", cid).maybeSingle()
      .then(({ data }) => {
        setCfg({
          onboarded: !!data?.logistics_onboarded,
          server: data?.logistics_server_path || "",
          razao: data?.logistics_razao_social || "",
          cnpj: data?.logistics_cnpj || "",
          nome: data?.name || "",
          logo: data?.logo_url || null,
        });
        setCfgLoaded(true);
      });
    loadAll();
  }, [cid, loadAll]);

  // Realtime: cargas e motoristas (kanban e localização ao vivo).
  useEffect(() => {
    if (!supabase || !cid) return;
    const ch = supabase.channel("logistics")
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_cargas", filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_drivers", filter: `company_id=eq.${cid}` }, () => loadAll())
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [cid, loadAll]);

  if (cfgLoaded && !cfg.onboarded) {
    return <Onboarding profile={profile} initial={cfg} onDone={() => { setCfg((c) => ({ ...c, onboarded: true })); loadAll(); }} />;
  }

  return (
    <div className="h-full flex bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar de módulos */}
      <aside className="w-56 shrink-0 border-r border-white/10 bg-zinc-950 flex-col hidden md:flex overflow-y-auto">
        <div className="p-3 border-b border-white/10 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center"><Ship size={16} /></div>
          <div><div className="text-sm font-bold leading-tight">TransLog</div><div className="text-[10px] font-mono text-zinc-500">MERCOSUL</div></div>
        </div>
        <div className="p-2 space-y-3 flex-1">
          {["Operações & Rastreio", "Docs & Financeiro", "Configurações"].map((g) => (
            <div key={g}>
              <div className="px-2 mb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{g}</div>
              <div className="space-y-0.5">
                {MODULES.filter((m) => m.group === g).map((m) => (
                  <button key={m.id} onClick={() => setMod(m.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${mod === m.id ? "bg-zinc-800/80 text-white border border-zinc-700/50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>
                    <m.icon size={16} className={mod === m.id ? "text-amber-400" : ""} /> {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-white/10">
          <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg">
            <div className="flex justify-between text-[10px] font-mono"><span className="text-zinc-300 font-semibold">CFOP 6501 / 6502</span><span className="text-emerald-400 font-bold">Ativo</span></div>
            <p className="text-[11px] text-zinc-500 mt-0.5">Exportação direta e remessa fim específico.</p>
          </div>
        </div>
      </aside>

      {/* Mobile module picker */}
      <div className="md:hidden absolute top-2 left-2 right-2 z-20">
        <select value={mod} onChange={(e) => setMod(e.target.value as Mod)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
          {MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-5 pt-16 md:pt-5">
        {mod === "kanban" && <KanbanModule cid={cid} cargas={cargas} vehicles={vehicles} drivers={drivers} finance={finance} reload={loadAll} flash={flash} />}
        {mod === "fleet" && <FleetModule cid={cid} vehicles={vehicles} expenses={expenses} drivers={drivers} reload={loadAll} flash={flash} />}
        {mod === "stock" && <StockModule cid={cid} stock={stock} fumi={fumi} reload={loadAll} flash={flash} />}
        {mod === "drivers" && <DriversModule cid={cid} drivers={drivers} reload={loadAll} flash={flash} />}
        {mod === "docgen" && <DocGenModule cid={cid} cargas={cargas} docs={docs} company={cfg} reload={loadAll} flash={flash} />}
        {mod === "dre" && <DreModule finance={finance} expenses={expenses} />}
        {mod === "settings" && <SettingsModule cid={cid} cfg={cfg} setCfg={setCfg} isGestor={isGestor} flash={flash} />}
      </main>

      <style jsx global>{`
        .logi-scope .in, .in { width:100%; background:#09090b; border:1px solid #27272a; border-radius:8px; padding:8px 10px; font-size:13px; color:#fff; }
        .in:focus { outline:none; border-color:#52525b; box-shadow:0 0 0 1px #52525b; }
        .in:disabled { opacity:.6; }
        .btn-primary { display:inline-flex; align-items:center; gap:6px; justify-content:center; background:#f4f4f5; color:#09090b; font-weight:600; font-size:13px; padding:8px 14px; border-radius:9px; transition:.15s; }
        .btn-primary:hover { background:#fff; }
        .btn-primary:disabled { opacity:.5; }
        .btn-secondary { display:inline-flex; align-items:center; gap:6px; justify-content:center; background:rgba(255,255,255,.06); color:#e4e4e7; font-weight:500; font-size:13px; padding:8px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.1); transition:.15s; }
        .btn-secondary:hover { background:rgba(255,255,255,.12); }
        .btn-ghost { display:inline-flex; align-items:center; gap:6px; justify-content:center; background:rgba(255,255,255,.05); color:#a1a1aa; font-size:13px; padding:8px 14px; border-radius:9px; transition:.15s; }
        .btn-ghost:hover { background:rgba(255,255,255,.1); color:#fff; }
      `}</style>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-xs bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-2xl animate-in">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 w-2 h-2 rounded-full ${toast.kind === "info" ? "bg-sky-400" : toast.kind === "error" ? "bg-red-400" : "bg-emerald-400"}`} />
            <div><div className="text-sm font-semibold">{toast.t}</div>{toast.d && <div className="text-xs text-zinc-400 mt-0.5">{toast.d}</div>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================== ONBOARDING WIZARD ===============================
function Onboarding({ profile, initial, onDone }: { profile: Profile | null; initial: { server: string; razao: string; cnpj: string; nome: string }; onDone: () => void }) {
  const cid = profile?.company_id ?? null;
  const [step, setStep] = useState(0);
  const [razao, setRazao] = useState(initial.razao || initial.nome || "");
  const [cnpj, setCnpj] = useState(initial.cnpj || "");
  const [server, setServer] = useState(initial.server || "/Volumes/Data/Cargas_2026/");
  const [drvNome, setDrvNome] = useState(""); const [drvTel, setDrvTel] = useState("");
  const [vehPlaca, setVehPlaca] = useState(""); const [vehTipo, setVehTipo] = useState("cavalo");
  const [busy, setBusy] = useState(false);

  const steps = ["Bem-vindo", "Dados da empresa", "Servidor local", "1º veículo", "1º motorista", "Pronto"];

  async function finish() {
    if (!supabase || !cid) return;
    setBusy(true);
    try {
      await supabase.from("company_settings").update({
        logistics_onboarded: true, logistics_razao_social: razao || null, logistics_cnpj: cnpj || null, logistics_server_path: server || null,
      }).eq("company_id", cid);
      if (vehPlaca.trim()) await supabase.from("logistics_vehicles").insert({ company_id: cid, tipo: vehTipo, placa: vehPlaca.trim().toUpperCase() });
      if (drvNome.trim()) await supabase.from("logistics_drivers").insert({ company_id: cid, nome: drvNome.trim(), telefone: drvTel.trim() || null });
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-zinc-900/70 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1"><Ship size={20} className="text-amber-400" /><h2 className="text-lg font-bold">Configurar a Logística Internacional</h2></div>
        <p className="text-xs text-zinc-400 mb-4">Um passo a passo rápido para deixar o app pronto. {step + 1}/{steps.length} — {steps[step]}</p>
        <div className="flex gap-1 mb-5">{steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-amber-400" : "bg-zinc-800"}`} />)}</div>

        {step === 0 && (
          <div className="space-y-3 text-sm text-zinc-300">
            <p>Esta ferramenta cuida de ponta a ponta das suas operações de exportação/importação rodoviária no MERCOSUL: rastreio de cargas, frota, estoque, fumigação, documentos aduaneiros (DUE, MIC/DTA, CRT), DRE e um portal para o motorista.</p>
            <p className="text-zinc-400 text-xs">Você pode pular os passos opcionais e preencher depois. Vamos lá?</p>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            <Field label="Razão social"><input value={razao} onChange={(e) => setRazao(e.target.value)} className="in" placeholder="Ex.: TransLog Cargas Internacionais Ltda" /></Field>
            <Field label="CNPJ"><input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="in" placeholder="00.000.000/0001-00" /></Field>
            <p className="text-[11px] text-zinc-500">Usado no cabeçalho dos documentos que você emitir.</p>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <Field label="Pasta no servidor local (SRV-MATRIZ)"><input value={server} onChange={(e) => setServer(e.target.value)} className="in font-mono text-xs" placeholder="/Volumes/Data/Cargas_2026/" /></Field>
            <p className="text-[11px] text-zinc-500">Caminho sugerido para salvar os PDFs e documentos gerados. Você define as permissões por pasta depois.</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Field label="Tipo"><select value={vehTipo} onChange={(e) => setVehTipo(e.target.value)} className="in"><option value="cavalo">Cavalo</option><option value="reboque">Reboque</option></select></Field>
              <Field label="Placa"><input value={vehPlaca} onChange={(e) => setVehPlaca(e.target.value)} className="in" placeholder="ABC1D23" /></Field>
            </div>
            <p className="text-[11px] text-zinc-500">Opcional — cadastre o primeiro veículo da frota (dá para adicionar mais depois).</p>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <Field label="Nome do motorista"><input value={drvNome} onChange={(e) => setDrvNome(e.target.value)} className="in" placeholder="Ex.: Marcos Silva" /></Field>
            <Field label="Telefone"><input value={drvTel} onChange={(e) => setDrvTel(e.target.value)} className="in" placeholder="+55 45 90000-0000" /></Field>
            <p className="text-[11px] text-zinc-500">Opcional — depois você gera o link do portal seguro dele.</p>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3 text-sm text-zinc-300">
            <div className="flex items-center gap-2 text-emerald-400"><Check size={18} /> Tudo pronto!</div>
            <p>Você pode vincular um agente de IA no <b>Labs</b> a um número de WhatsApp para tirar dúvidas, informar a localização dos motoristas e entregar arquivos da pasta da ferramenta automaticamente.</p>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button onClick={() => (step === 0 ? onDone() : setStep(step - 1))} className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10">{step === 0 ? "Pular" : "Voltar"}</button>
          {step < steps.length - 1
            ? <button onClick={() => setStep(step + 1)} className="text-sm px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold">Continuar</button>
            : <button onClick={finish} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">{busy ? "Salvando…" : "Concluir"}</button>}
        </div>
      </div>
      <style jsx>{`.in{width:100%;background:#09090b;border:1px solid #27272a;border-radius:8px;padding:8px 10px;font-size:13px;color:#fff}.in:focus{outline:none;border-color:#52525b}`}</style>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block flex-1"><span className="text-[11px] text-zinc-400 mb-1 block">{label}</span>{children}</label>;
}

// =============================== KANBAN MODULE ===============================
function KanbanModule({ cid, cargas, vehicles, drivers, finance, reload, flash }: {
  cid: string | null; cargas: Carga[]; vehicles: Vehicle[]; drivers: Driver[]; finance: Finance[];
  reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [sel, setSel] = useState<Carga | null>(null);
  const selLive = sel ? cargas.find((c) => c.id === sel.id) || sel : null;

  async function advance(c: Carga, dir: 1 | -1) {
    if (!supabase) return;
    const i = Math.min(STAGES.length - 1, Math.max(0, stageIndex(c.stage) + dir));
    await supabase.from("logistics_cargas").update({ stage: STAGES[i].id, updated_at: new Date().toISOString() }).eq("id", c.id);
    // Transbordo não gera nova fatura (regra do negócio) — só registra o movimento.
    if (STAGES[i].id === "transbordo") flash("Transbordo na fronteira", "Troca de cavalo/reboque registrada — sem nova fatura comercial.", "info");
    reload();
  }

  return (
    <div className="space-y-4">
      <Header title="Quadro Kanban de Rastreio & Exportação" sub="Acompanhamento em tempo real de cada carreta e expedição internacional." icon={Route}
        action={<button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={14} /> Nova Carga / Proforma</button>} />

      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map((st) => {
          const items = cargas.filter((c) => c.stage === st.id);
          return (
            <div key={st.id} className="min-w-[260px] max-w-[280px] shrink-0">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 rounded">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((c) => {
                  const drv = drivers.find((d) => d.id === c.driver_id);
                  const veh = vehicles.find((v) => v.id === c.vehicle_id);
                  return (
                    <button key={c.id} onClick={() => setSel(c)} className="w-full text-left bg-zinc-900/70 border border-white/10 hover:border-white/25 rounded-xl p-3 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-amber-400">{c.codigo || "#—"}</span>
                        <span className="text-[9px] font-mono text-zinc-500">{c.cfop}</span>
                      </div>
                      <div className="text-sm font-semibold mt-1 truncate">{c.cliente_nome || "Sem cliente"}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{c.produto || "—"}</div>
                      <div className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1 truncate"><MapPin size={11} /> {c.origem || "?"} → {c.destino || "?"}{c.pais_destino ? ` (${c.pais_destino})` : ""}</div>
                      {(drv || veh) && <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1 truncate"><Truck size={11} /> {veh?.placa || ""} {drv ? `· ${drv.nome}` : ""}</div>}
                    </button>
                  );
                })}
                {items.length === 0 && <div className="text-[11px] text-zinc-600 px-1 py-3 text-center border border-dashed border-zinc-800 rounded-xl">Vazio</div>}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewCargaModal cid={cid} count={cargas.length} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); flash("Carga criada", "Nova proforma aberta no fluxo."); }} />}
      {selLive && <CargaDrawer cid={cid} c={selLive} vehicles={vehicles} drivers={drivers} finance={finance} onClose={() => setSel(null)} onAdvance={advance} reload={reload} flash={flash} />}
    </div>
  );
}

function NewCargaModal({ cid, count, onClose, onSaved }: { cid: string | null; count: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ cliente_nome: "", produto: "", origem: "", destino: "", pais_destino: "Paraguai", incoterm: "FOB", moeda: "USD", valor_declarado: "", cfop: "6501", peso: "", volumes: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase || !cid) return;
    setBusy(true);
    const codigo = `#${String(count + 1).padStart(4, "0")}`;
    await supabase.from("logistics_cargas").insert({
      company_id: cid, codigo, cliente_nome: f.cliente_nome || null, produto: f.produto || null, origem: f.origem || null,
      destino: f.destino || null, pais_destino: f.pais_destino || null, incoterm: f.incoterm || null, moeda: f.moeda || null,
      valor_declarado: Number(f.valor_declarado) || 0, cfop: f.cfop, peso: Number(f.peso) || null, volumes: Number(f.volumes) || null, stage: "proforma",
    });
    setBusy(false); onSaved();
  }
  return (
    <Modal title="Nova Carga / Fatura Proforma" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cliente / Importador"><input className="in" value={f.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} /></Field>
        <Field label="Produto"><input className="in" value={f.produto} onChange={(e) => set("produto", e.target.value)} /></Field>
        <Field label="Origem"><input className="in" value={f.origem} onChange={(e) => set("origem", e.target.value)} placeholder="Foz do Iguaçu/BR" /></Field>
        <Field label="Destino"><input className="in" value={f.destino} onChange={(e) => set("destino", e.target.value)} placeholder="Assunção" /></Field>
        <Field label="País de destino"><select className="in" value={f.pais_destino} onChange={(e) => set("pais_destino", e.target.value)}>{["Paraguai", "Argentina", "Uruguai", "Bolívia", "Peru", "Chile", "Brasil"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Incoterm"><select className="in" value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>{["FOB", "CIF", "CFR", "EXW", "DAP"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="CFOP"><select className="in" value={f.cfop} onChange={(e) => set("cfop", e.target.value)}><option value="6501">6501 — Remessa fim específico de exportação</option><option value="6502">6502 — Venda p/ exportação</option></select></Field>
        <Field label="Moeda"><select className="in" value={f.moeda} onChange={(e) => set("moeda", e.target.value)}>{["USD", "BRL", "EUR", "PYG", "ARS"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Valor declarado"><input className="in" type="number" value={f.valor_declarado} onChange={(e) => set("valor_declarado", e.target.value)} /></Field>
        <Field label="Peso (kg)"><input className="in" type="number" value={f.peso} onChange={(e) => set("peso", e.target.value)} /></Field>
        <Field label="Volumes"><input className="in" type="number" value={f.volumes} onChange={(e) => set("volumes", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Criar carga"}</button></div>
    </Modal>
  );
}

function CargaDrawer({ cid, c, vehicles, drivers, finance, onClose, onAdvance, reload, flash }: {
  cid: string | null; c: Carga; vehicles: Vehicle[]; drivers: Driver[]; finance: Finance[];
  onClose: () => void; onAdvance: (c: Carga, d: 1 | -1) => void; reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const drv = drivers.find((d) => d.id === c.driver_id);
  const veh = vehicles.find((v) => v.id === c.vehicle_id);
  const cargoFinance = finance.filter((f) => f.carga_id === c.id);

  async function assign(field: "vehicle_id" | "driver_id", value: string) {
    if (!supabase) return;
    await supabase.from("logistics_cargas").update({ [field]: value || null }).eq("id", c.id);
    reload();
  }
  async function genPurchaseOrder() {
    if (!supabase) return;
    // Automação: Pedido de Compra → lançamento em Contas a Pagar (DRE Operação).
    await supabase.from("logistics_finance").insert({
      company_id: cid, escopo: "operacao", tipo: "despesa",
      categoria: "Pedido de Compra", descricao: `PC da carga ${c.codigo} — ${c.produto || ""}`, valor: c.valor_declarado || 0, carga_id: c.id, status: "aberto",
    });
    if (stageIndex(c.stage) < 1) await supabase.from("logistics_cargas").update({ stage: "pedido" }).eq("id", c.id);
    reload(); flash("Pedido de Compra emitido", "Lançado no Contas a Pagar (DRE Operação).");
  }
  async function del() {
    if (!supabase || !confirm("Excluir esta carga?")) return;
    await supabase.from("logistics_cargas").delete().eq("id", c.id);
    onClose(); reload();
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-white/10 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><span className="text-xs font-mono text-amber-400">{c.codigo}</span><h3 className="text-base font-bold">{c.cliente_nome || "Sem cliente"}</h3></div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        {/* Timeline de progresso (estilo app de entrega) */}
        <div className="mt-4 space-y-1.5">
          {STAGES.map((s, i) => {
            const done = i < stageIndex(c.stage); const cur = i === stageIndex(c.stage);
            return (
              <div key={s.id} className="flex items-center gap-2.5">
                <div className={`w-3.5 h-3.5 rounded-full border-2 ${done ? "bg-emerald-500 border-emerald-500" : cur ? "border-amber-400 bg-amber-400/30" : "border-zinc-700"}`} />
                <span className={`text-xs ${cur ? "text-white font-semibold" : done ? "text-zinc-400" : "text-zinc-600"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => onAdvance(c, -1)} className="btn-ghost flex-1">← Voltar etapa</button>
          <button onClick={() => onAdvance(c, 1)} className="btn-primary flex-1">Avançar etapa →</button>
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <InfoRow label="Produto" value={c.produto} />
          <InfoRow label="Rota" value={`${c.origem || "?"} → ${c.destino || "?"} ${c.pais_destino ? `(${c.pais_destino})` : ""}`} />
          <InfoRow label="Incoterm / CFOP" value={`${c.incoterm || "—"} · ${c.cfop}`} />
          <InfoRow label="Valor declarado" value={money(c.valor_declarado || 0, c.moeda || "USD")} />
          <InfoRow label="Peso / Volumes" value={`${c.peso || "—"} kg · ${c.volumes || "—"} vol.`} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Field label="Veículo"><select className="in" value={c.vehicle_id || ""} onChange={(e) => assign("vehicle_id", e.target.value)}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.placa} ({v.tipo})</option>)}</select></Field>
          <Field label="Motorista"><select className="in" value={c.driver_id || ""} onChange={(e) => assign("driver_id", e.target.value)}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Field>
        </div>

        {drv && (drv.last_lat != null) && (
          <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="text-xs font-semibold flex items-center gap-1.5"><Navigation size={13} className="text-amber-400" /> Última localização — {drv.nome}</div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">{drv.last_lat?.toFixed(5)}, {drv.last_lng?.toFixed(5)}</div>
            <a href={`https://www.google.com/maps?q=${drv.last_lat},${drv.last_lng}`} target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 hover:underline">Ver no mapa →</a>
          </div>
        )}

        <button onClick={genPurchaseOrder} className="w-full mt-4 btn-secondary"><FileText size={14} /> Emitir Pedido de Compra → Contas a Pagar</button>
        {cargoFinance.length > 0 && (
          <div className="mt-3 text-[11px] text-zinc-400 space-y-1">
            {cargoFinance.map((f) => <div key={f.id} className="flex justify-between"><span>{f.descricao}</span><span className={f.tipo === "receita" ? "text-emerald-400" : "text-red-400"}>{money(f.valor)}</span></div>)}
          </div>
        )}

        <button onClick={del} className="w-full mt-5 text-xs text-red-400 hover:text-red-300 flex items-center justify-center gap-1"><Trash2 size={13} /> Excluir carga</button>
      </div>
    </div>
  );
}

// =============================== FLEET MODULE ===============================
function FleetModule({ cid, vehicles, expenses, drivers, reload, flash }: {
  cid: string | null; vehicles: Vehicle[]; expenses: VExpense[]; drivers: Driver[]; reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [showVeh, setShowVeh] = useState(false);
  const [expFor, setExpFor] = useState<Vehicle | null>(null);
  const totalByVeh = (id: string) => expenses.filter((e) => e.vehicle_id === id).reduce((a, b) => a + (b.valor || 0), 0);

  return (
    <div className="space-y-4">
      <Header title="Frota & Manutenção" sub="Cavalos e reboques com despesas técnicas por placa — alimentam o DRE operacional." icon={Wrench}
        action={<button onClick={() => setShowVeh(true)} className="btn-primary"><Plus size={14} /> Novo veículo</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {vehicles.map((v) => {
          const drv = drivers.find((d) => d.id === v.driver_id);
          return (
            <div key={v.id} className="bg-zinc-900/70 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center"><Truck size={16} /></div>
                  <div><div className="font-mono font-bold text-sm">{v.placa}</div><div className="text-[10px] text-zinc-500 uppercase">{v.tipo}</div></div></div>
                <span className="text-[11px] text-zinc-400">{v.modelo || ""} {v.ano || ""}</span>
              </div>
              {drv && <div className="text-[11px] text-zinc-400 mt-2">Motorista: {drv.nome}</div>}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Despesas: <b className="text-red-400">{money(totalByVeh(v.id))}</b></span>
                <button onClick={() => setExpFor(v)} className="text-xs text-amber-400 hover:text-amber-300">+ despesa</button>
              </div>
            </div>
          );
        })}
        {vehicles.length === 0 && <Empty text="Nenhum veículo cadastrado." />}
      </div>

      {expenses.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
          <div className="text-sm font-semibold mb-2">Últimas despesas</div>
          <div className="space-y-1">
            {expenses.slice(0, 12).map((e) => {
              const v = vehicles.find((x) => x.id === e.vehicle_id);
              return <div key={e.id} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5"><span className="text-zinc-400"><span className="font-mono text-zinc-300">{v?.placa || "—"}</span> · {e.descricao} <span className="text-zinc-600">{e.categoria}</span></span><span className="text-red-400">{money(e.valor)}</span></div>;
            })}
          </div>
        </div>
      )}

      {showVeh && <VehicleModal cid={cid} drivers={drivers} onClose={() => setShowVeh(false)} onSaved={() => { setShowVeh(false); reload(); flash("Veículo cadastrado"); }} />}
      {expFor && <ExpenseModal cid={cid} vehicle={expFor} onClose={() => setExpFor(null)} onSaved={() => { setExpFor(null); reload(); flash("Despesa lançada", "Refletida no Contas a Pagar do veículo e no DRE operacional."); }} />}
    </div>
  );
}
function VehicleModal({ cid, drivers, onClose, onSaved }: { cid: string | null; drivers: Driver[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tipo: "cavalo", placa: "", modelo: "", ano: "", driver_id: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() { if (!supabase || !cid || !f.placa.trim()) return; await supabase.from("logistics_vehicles").insert({ company_id: cid, tipo: f.tipo, placa: f.placa.trim().toUpperCase(), modelo: f.modelo || null, ano: f.ano || null, driver_id: f.driver_id || null }); onSaved(); }
  return (
    <Modal title="Novo veículo" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo"><select className="in" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="cavalo">Cavalo trator</option><option value="reboque">Reboque / Carreta</option></select></Field>
        <Field label="Placa"><input className="in" value={f.placa} onChange={(e) => set("placa", e.target.value)} placeholder="ABC1D23" /></Field>
        <Field label="Modelo"><input className="in" value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></Field>
        <Field label="Ano"><input className="in" value={f.ano} onChange={(e) => set("ano", e.target.value)} /></Field>
        <Field label="Motorista responsável"><select className="in" value={f.driver_id} onChange={(e) => set("driver_id", e.target.value)}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary">Salvar</button></div>
    </Modal>
  );
}
function ExpenseModal({ cid, vehicle, onClose, onSaved }: { cid: string | null; vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ descricao: "", categoria: "manutencao", valor: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!supabase || !cid || !f.descricao.trim()) return;
    await supabase.from("logistics_vehicle_expenses").insert({ company_id: cid, vehicle_id: vehicle.id, descricao: f.descricao, categoria: f.categoria, valor: Number(f.valor) || 0 });
    // Alimenta o DRE Operacional (Contas a Pagar do caminhão).
    await supabase.from("logistics_finance").insert({ company_id: cid, escopo: "operacao", tipo: "despesa", categoria: `Frota · ${f.categoria}`, descricao: `${vehicle.placa} — ${f.descricao}`, valor: Number(f.valor) || 0, vehicle_id: vehicle.id, status: "aberto" });
    onSaved();
  }
  return (
    <Modal title={`Despesa — ${vehicle.placa}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Descrição"><input className="in" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Troca de pneus dianteiros" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria"><select className="in" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{["manutencao", "pneu", "combustivel", "freio", "outros"].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
          <Field label="Valor (R$)"><input className="in" type="number" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary">Lançar despesa</button></div>
    </Modal>
  );
}

// =============================== STOCK & FUMIGATION ===============================
function StockModule({ cid, stock, fumi, reload, flash }: { cid: string | null; stock: Stock[]; fumi: Fumigation[]; reload: () => void; flash: (t: string, d?: string, k?: string) => void }) {
  const [showStock, setShowStock] = useState(false);
  const [fumFor, setFumFor] = useState<Stock | null>(null);
  return (
    <div className="space-y-4">
      <Header title="Estoque & Fumigação" sub="Saldos por lote. A emissão do Certificado de Fumigação dá baixa automática no estoque." icon={Boxes}
        action={<button onClick={() => setShowStock(true)} className="btn-primary"><Plus size={14} /> Entrada de lote</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stock.map((s) => (
          <div key={s.id} className="bg-zinc-900/70 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">{s.produto}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${s.status === "baixado" ? "bg-zinc-800 text-zinc-500" : "bg-emerald-500/10 text-emerald-400"}`}>{s.status}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Lote {s.lote || "—"} · {s.local_armazenamento || "—"}</div>
            <div className="text-2xl font-bold mt-2">{s.quantidade} <span className="text-xs text-zinc-500 font-normal">{s.unidade}</span></div>
            <button onClick={() => setFumFor(s)} disabled={s.quantidade <= 0} className="mt-3 w-full btn-secondary text-xs disabled:opacity-40"><Sprout size={13} /> Emitir Certificado de Fumigação</button>
          </div>
        ))}
        {stock.length === 0 && <Empty text="Nenhum lote em estoque." />}
      </div>

      {fumi.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
          <div className="text-sm font-semibold mb-2">Certificados de fumigação</div>
          <div className="space-y-1">
            {fumi.map((f) => <div key={f.id} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
              <span className="text-zinc-400">Cert. <span className="font-mono text-zinc-300">{f.certificado_num}</span> · Lote {f.lote} · baixa {f.quantidade_baixa}</span>
              <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> {f.status}</span>
            </div>)}
          </div>
        </div>
      )}

      {showStock && <StockModal cid={cid} onClose={() => setShowStock(false)} onSaved={() => { setShowStock(false); reload(); flash("Lote registrado no estoque"); }} />}
      {fumFor && <FumigationModal cid={cid} stock={fumFor} onClose={() => setFumFor(null)} onSaved={() => { setFumFor(null); reload(); flash("Certificado emitido", "Baixa automática aplicada no estoque físico."); }} />}
    </div>
  );
}
function StockModal({ cid, onClose, onSaved }: { cid: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ produto: "", lote: "", quantidade: "", unidade: "ton", local_armazenamento: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() { if (!supabase || !cid || !f.produto.trim()) return; await supabase.from("logistics_stock").insert({ company_id: cid, produto: f.produto, lote: f.lote || null, quantidade: Number(f.quantidade) || 0, unidade: f.unidade, local_armazenamento: f.local_armazenamento || null }); onSaved(); }
  return (
    <Modal title="Entrada de lote no estoque" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Produto"><input className="in" value={f.produto} onChange={(e) => set("produto", e.target.value)} /></Field>
        <Field label="Lote"><input className="in" value={f.lote} onChange={(e) => set("lote", e.target.value)} /></Field>
        <Field label="Quantidade"><input className="in" type="number" value={f.quantidade} onChange={(e) => set("quantidade", e.target.value)} /></Field>
        <Field label="Unidade"><select className="in" value={f.unidade} onChange={(e) => set("unidade", e.target.value)}>{["ton", "kg", "sacas", "un", "m³"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Local de armazenamento"><input className="in" value={f.local_armazenamento} onChange={(e) => set("local_armazenamento", e.target.value)} placeholder="Galpão A / Pátio 2" /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary">Registrar</button></div>
    </Modal>
  );
}
function FumigationModal({ cid, stock, onClose, onSaved }: { cid: string | null; stock: Stock; onClose: () => void; onSaved: () => void }) {
  const [qtd, setQtd] = useState(String(stock.quantidade));
  const [cert, setCert] = useState(`FUM-${Date.now().toString().slice(-6)}`);
  async function save() {
    if (!supabase || !cid) return;
    const baixa = Math.min(Number(qtd) || 0, stock.quantidade);
    await supabase.from("logistics_fumigations").insert({ company_id: cid, stock_id: stock.id, lote: stock.lote, certificado_num: cert, quantidade_baixa: baixa, status: "concluido" });
    const restante = Math.max(0, stock.quantidade - baixa);
    await supabase.from("logistics_stock").update({ quantidade: restante, status: restante <= 0 ? "baixado" : "disponivel" }).eq("id", stock.id);
    onSaved();
  }
  return (
    <Modal title="Certificado de Fumigação" onClose={onClose}>
      <p className="text-xs text-zinc-400 mb-3">Produto <b>{stock.produto}</b> · Lote {stock.lote || "—"} · Saldo {stock.quantidade} {stock.unidade}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nº do certificado"><input className="in" value={cert} onChange={(e) => setCert(e.target.value)} /></Field>
        <Field label="Quantidade a baixar"><input className="in" type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary"><ShieldCheck size={14} /> Emitir e dar baixa</button></div>
    </Modal>
  );
}

// =============================== DRIVERS MODULE ===============================
function DriversModule({ cid, drivers, reload, flash }: { cid: string | null; drivers: Driver[]; reload: () => void; flash: (t: string, d?: string, k?: string) => void }) {
  const [showNew, setShowNew] = useState(false);
  const [chatFor, setChatFor] = useState<Driver | null>(null);
  const portalBase = typeof window !== "undefined" ? `${window.location.origin}/motorista/` : "/motorista/";
  function copyLink(d: Driver) { if (d.access_token) { navigator.clipboard?.writeText(portalBase + d.access_token); flash("Link copiado", "Envie ao motorista — acesso seguro, sem ver o financeiro."); } }
  async function del(d: Driver) { if (!supabase || !confirm(`Remover ${d.nome}?`)) return; await supabase.from("logistics_drivers").delete().eq("id", d.id); reload(); }

  return (
    <div className="space-y-4">
      <Header title="Motoristas & Portal" sub="Cada motorista recebe um link individual e seguro (GPS ao vivo, fotos do POD e chat) — sem acesso ao banco/financeiro." icon={Users}
        action={<button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={14} /> Novo motorista</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {drivers.map((d) => (
          <div key={d.id} className="bg-zinc-900/70 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">{d.nome.slice(0, 1)}</div>
                <div><div className="font-semibold text-sm">{d.nome}</div><div className="text-[11px] text-zinc-500">{d.telefone || "sem telefone"}</div></div></div>
              {d.gps_ativo && <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> GPS</span>}
            </div>
            {d.last_lat != null && (
              <a href={`https://www.google.com/maps?q=${d.last_lat},${d.last_lng}`} target="_blank" rel="noreferrer" className="mt-2 block text-[11px] text-sky-400 hover:underline flex items-center gap-1"><MapPin size={11} /> {d.last_lat?.toFixed(4)}, {d.last_lng?.toFixed(4)} — ver no mapa</a>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={() => copyLink(d)} className="btn-secondary text-xs flex-1"><Link2 size={13} /> Copiar link</button>
              <button onClick={() => setChatFor(d)} className="btn-secondary text-xs"><MessageSquare size={13} /> Chat</button>
              <button onClick={() => del(d)} className="text-zinc-500 hover:text-red-400 px-2"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {drivers.length === 0 && <Empty text="Nenhum motorista cadastrado." />}
      </div>
      {showNew && <DriverModal cid={cid} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); flash("Motorista cadastrado", "Já pode copiar o link do portal dele."); }} />}
      {chatFor && <DriverChatModal cid={cid} driver={chatFor} onClose={() => setChatFor(null)} />}
    </div>
  );
}

// Chat da Central x Motorista + galeria de comprovantes (POD) enviados por ele.
function DriverChatModal({ cid, driver, onClose }: { cid: string | null; driver: Driver; onClose: () => void }) {
  type DMsg = { id: string; sender: string; text: string | null; created_at: string };
  type Pod = { id: string; photo_url: string | null; kind: string | null; created_at: string };
  const [msgs, setMsgs] = useState<DMsg[]>([]);
  const [pod, setPod] = useState<Pod[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    const [m, p] = await Promise.all([
      supabase.from("logistics_driver_messages").select("id,sender,text,created_at").eq("driver_id", driver.id).order("created_at"),
      supabase.from("logistics_pod").select("id,photo_url,kind,created_at").eq("driver_id", driver.id).order("created_at", { ascending: false }),
    ]);
    setMsgs((m.data as DMsg[]) ?? []); setPod((p.data as Pod[]) ?? []);
  }, [driver.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`drvchat-${driver.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logistics_driver_messages", filter: `driver_id=eq.${driver.id}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logistics_pod", filter: `driver_id=eq.${driver.id}` }, () => load())
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [driver.id, load]);
  async function send() {
    if (!supabase || !cid || !text.trim()) return;
    await supabase.from("logistics_driver_messages").insert({ company_id: cid, driver_id: driver.id, sender: "gestor", text: text.trim() });
    setText(""); load();
  }
  return (
    <Modal title={`Conversa — ${driver.nome}`} onClose={onClose}>
      {pod.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-zinc-400 mb-1">Comprovantes (POD) enviados</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pod.map((p) => p.photo_url && <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="shrink-0"><img src={p.photo_url} alt={p.kind || "pod"} className="w-16 h-16 object-cover rounded-lg border border-white/10" /><span className="block text-[9px] text-zinc-500 text-center mt-0.5">{p.kind}</span></a>)}
          </div>
        </div>
      )}
      <div className="h-64 overflow-y-auto space-y-2 bg-black/20 rounded-xl p-3">
        {msgs.length === 0 && <p className="text-xs text-zinc-500 text-center py-6">Sem mensagens ainda.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`max-w-[85%] p-2 rounded-xl text-sm ${m.sender === "gestor" ? "ml-auto bg-sky-500/15 text-sky-100" : "bg-amber-500/15 text-amber-100"}`}>
            <div className="text-[9px] opacity-60">{m.sender === "gestor" ? "Central" : driver.nome} · {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} className="in" placeholder="Mensagem para o motorista…" />
        <button onClick={send} className="btn-primary">Enviar</button>
      </div>
    </Modal>
  );
}
function DriverModal({ cid, onClose, onSaved }: { cid: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ nome: "", telefone: "", veiculo: "", cnh: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  async function save() { if (!supabase || !cid || !f.nome.trim()) return; await supabase.from("logistics_drivers").insert({ company_id: cid, nome: f.nome, telefone: f.telefone || null, veiculo: f.veiculo || null, cnh: f.cnh || null }); onSaved(); }
  return (
    <Modal title="Novo motorista" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome"><input className="in" value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Field>
        <Field label="Telefone"><input className="in" value={f.telefone} onChange={(e) => set("telefone", e.target.value)} /></Field>
        <Field label="Veículo"><input className="in" value={f.veiculo} onChange={(e) => set("veiculo", e.target.value)} placeholder="Cavalo ABC1D23" /></Field>
        <Field label="CNH"><input className="in" value={f.cnh} onChange={(e) => set("cnh", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary">Salvar</button></div>
    </Modal>
  );
}

// =============================== DOC GENERATOR ===============================
function DocGenModule({ cid, cargas, docs, company, reload, flash }: {
  cid: string | null; cargas: Carga[]; docs: LogiDoc[]; company: { razao: string; cnpj: string; nome: string; logo: string | null; server: string };
  reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [type, setType] = useState<LogiDocType>("proforma");
  const [cargaId, setCargaId] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const def = docDef(type);

  // Preenche automaticamente a partir da carga selecionada.
  function prefill(id: string) {
    setCargaId(id);
    const c = cargas.find((x) => x.id === id);
    if (!c) return;
    setVals((v) => ({
      ...v, numero: v.numero || `${def.label.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}`,
      importador: c.cliente_nome || v.importador || "", produto: c.produto || v.produto || "",
      pais_destino: c.pais_destino || v.pais_destino || "", moeda: c.moeda || v.moeda || "USD",
      incoterm: c.incoterm || v.incoterm || "", cfop: c.cfop || v.cfop || "", valor: String(c.valor_declarado || v.valor || ""),
      peso: String(c.peso || v.peso || ""), volumes: String(c.volumes || v.volumes || ""), remetente: company.razao || company.nome,
    }));
  }

  function generate() {
    const html = renderLogisticsDoc(type, vals, { razao_social: company.razao, cnpj: company.cnpj, nome: company.nome, logo_url: company.logo });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    else flash("Pop-up bloqueado", "Permita pop-ups para abrir/imprimir o documento.", "error");
    // Registra a emissão.
    if (supabase && cid) supabase.from("logistics_documents").insert({ company_id: cid, carga_id: cargaId || null, tipo: type, numero: vals.numero || null, dados: vals, server_path: company.server ? `${company.server}${def.label}-${vals.numero || ""}.pdf` : null }).then(() => reload());
    flash("Documento gerado", "Confira os dados e salve como PDF (Ctrl/Cmd+P).");
  }

  return (
    <div className="space-y-4">
      <Header title="Gerador de Documentos" sub="DUE, MIC/DTA, CRT, Proforma e Invoice — pré-visualize, salve em PDF e registre no servidor local." icon={FileText} />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {LOGI_DOCS.map((d) => (
              <button key={d.type} onClick={() => { setType(d.type); setVals({}); }} className={`text-left rounded-xl border p-3 transition ${type === d.type ? "border-amber-500 bg-amber-950/20" : "border-white/10 hover:border-white/25"}`}>
                <div className="text-sm font-semibold">{d.label}</div>
                <div className="text-[10px] text-zinc-500 leading-tight mt-0.5">{d.full}</div>
              </button>
            ))}
          </div>
          <Field label="Vincular a uma carga (preenche automático)">
            <select className="in" value={cargaId} onChange={(e) => prefill(e.target.value)}><option value="">— nenhuma —</option>{cargas.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.cliente_nome}</option>)}</select>
          </Field>
        </div>

        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
          <div className="text-sm font-semibold mb-1">{def.label} — {def.full}</div>
          <p className="text-[11px] text-zinc-500 mb-3">{def.desc}</p>
          <div className="grid grid-cols-2 gap-2 max-h-[46vh] overflow-y-auto pr-1">
            {def.fields.map((fl) => (
              <label key={fl.key} className={fl.type === "textarea" ? "col-span-2 block" : "block"}>
                <span className="text-[11px] text-zinc-400 mb-1 block">{fl.label}</span>
                {fl.type === "textarea"
                  ? <textarea className="in" rows={2} value={vals[fl.key] || ""} onChange={(e) => setVals((v) => ({ ...v, [fl.key]: e.target.value }))} />
                  : <input className="in" type={fl.type === "number" ? "number" : fl.type === "date" ? "date" : "text"} value={vals[fl.key] || ""} onChange={(e) => setVals((v) => ({ ...v, [fl.key]: e.target.value }))} />}
              </label>
            ))}
          </div>
          <button onClick={generate} className="w-full mt-4 btn-primary"><FileText size={14} /> Gerar & salvar PDF</button>
          {company.server && <p className="text-[10px] text-zinc-600 mt-2 font-mono">Destino: {company.server}</p>}
        </div>
      </div>

      {docs.length > 0 && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
          <div className="text-sm font-semibold mb-2">Documentos emitidos</div>
          <div className="space-y-1">
            {docs.slice(0, 15).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                <span className="text-zinc-400"><span className="text-zinc-200 font-medium">{docDef(d.tipo as LogiDocType).label}</span> · <span className="font-mono">{d.numero || "—"}</span></span>
                <span className="text-zinc-600">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================== DRE MODULE ===============================
function DreModule({ finance, expenses }: { finance: Finance[]; expenses: VExpense[] }) {
  const calc = (escopo: string) => {
    const rows = finance.filter((f) => f.escopo === escopo);
    const rec = rows.filter((r) => r.tipo === "receita").reduce((a, b) => a + (b.valor || 0), 0);
    const desp = rows.filter((r) => r.tipo === "despesa").reduce((a, b) => a + (b.valor || 0), 0);
    return { rec, desp, saldo: rec - desp, rows };
  };
  const op = calc("operacao"); const emp = calc("empresa");
  const total = { rec: op.rec + emp.rec, desp: op.desp + emp.desp, saldo: op.saldo + emp.saldo };

  return (
    <div className="space-y-4">
      <Header title="DRE — Operação × Empresa" sub="Resultado analítico: custos diretos por carreta/viagem (Operação) separados dos custos fixos corporativos (Empresa)." icon={LineChart} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Kpi label="Receitas" value={money(total.rec)} tone="emerald" />
        <Kpi label="Despesas" value={money(total.desp)} tone="red" />
        <Kpi label="Resultado" value={money(total.saldo)} tone={total.saldo >= 0 ? "emerald" : "red"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {[{ t: "Financeiro da Operação (Direto)", d: op, hint: "Frete subcontratado, aduana, fumigação, manutenção de frota — por viagem/carreta." },
          { t: "Financeiro da Empresa (Fixo)", d: emp, hint: "Folha, TI, servidor e demais custos corporativos." }].map((b) => (
          <div key={b.t} className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
            <div className="text-sm font-semibold">{b.t}</div>
            <p className="text-[11px] text-zinc-500 mb-3">{b.hint}</p>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Receitas</span><span className="text-emerald-400">{money(b.d.rec)}</span></div>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Despesas</span><span className="text-red-400">{money(b.d.desp)}</span></div>
            <div className="flex justify-between text-sm font-semibold border-t border-white/10 pt-2 mt-1"><span>Resultado</span><span className={b.d.saldo >= 0 ? "text-emerald-400" : "text-red-400"}>{money(b.d.saldo)}</span></div>
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {b.d.rows.slice(0, 20).map((r) => <div key={r.id} className="flex justify-between text-[11px] text-zinc-500 border-b border-white/5 py-1"><span className="truncate">{r.descricao || r.categoria}</span><span className={r.tipo === "receita" ? "text-emerald-400" : "text-red-400"}>{money(r.valor)}</span></div>)}
              {b.d.rows.length === 0 && <div className="text-[11px] text-zinc-600 py-2">Sem lançamentos.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================== SETTINGS MODULE ===============================
function SettingsModule({ cid, cfg, setCfg, isGestor, flash }: {
  cid: string | null; cfg: { server: string; razao: string; cnpj: string; nome: string; logo: string | null; onboarded: boolean };
  setCfg: React.Dispatch<React.SetStateAction<{ onboarded: boolean; server: string; razao: string; cnpj: string; nome: string; logo: string | null }>>;
  isGestor: boolean; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [razao, setRazao] = useState(cfg.razao); const [cnpj, setCnpj] = useState(cfg.cnpj); const [server, setServer] = useState(cfg.server);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase || !cid) return; setBusy(true);
    await supabase.from("company_settings").update({ logistics_razao_social: razao || null, logistics_cnpj: cnpj || null, logistics_server_path: server || null }).eq("company_id", cid);
    setCfg((c) => ({ ...c, razao, cnpj, server })); setBusy(false); flash("Dados salvos");
  }
  return (
    <div className="space-y-4 max-w-lg">
      <Header title="Dados da Empresa & Servidor" sub="Usados no cabeçalho dos documentos e como destino dos PDFs no servidor local." icon={Settings} />
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
        <Field label="Razão social"><input className="in" value={razao} onChange={(e) => setRazao(e.target.value)} disabled={!isGestor} /></Field>
        <Field label="CNPJ"><input className="in" value={cnpj} onChange={(e) => setCnpj(e.target.value)} disabled={!isGestor} /></Field>
        <Field label="Pasta no servidor local (SRV-MATRIZ)"><input className="in font-mono text-xs" value={server} onChange={(e) => setServer(e.target.value)} disabled={!isGestor} placeholder="/Volumes/Data/Cargas_2026/" /></Field>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500"><ShieldCheck size={13} className="text-amber-400" /> As permissões por pasta são definidas no app de Arquivos/Servidor (perfil Master).</div>
        {isGestor && <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Salvar"}</button>}
      </div>
      <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-300"><Anchor size={15} /> Agente de IA</div>
        <p className="text-[12px] text-zinc-400 mt-1">No <b>Labs</b>, ligue a capacidade <b>Logística</b> em um agente e vincule-o a um número de WhatsApp. Ele informa a localização dos motoristas, entrega arquivos da pasta da ferramenta e tira dúvidas — rápido e sem esquecer o histórico.</p>
      </div>
    </div>
  );
}

// =============================== UI helpers ===============================
function Header({ title, sub, icon: Icon, action }: { title: string; sub: string; icon: typeof Ship; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><Icon size={16} className="text-amber-400" /> {title}</h2>
        <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
      </div>
      {action}
    </div>
  );
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold">{title}</h3><button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-zinc-500 text-xs">{label}</span><span className="text-right text-zinc-200">{value || "—"}</span></div>;
}
function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4"><div className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</div><div className={`text-xl font-bold mt-1 ${tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : ""}`}>{value}</div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="col-span-full text-center text-xs text-zinc-600 py-10 border border-dashed border-zinc-800 rounded-xl">{text}</div>;
}
