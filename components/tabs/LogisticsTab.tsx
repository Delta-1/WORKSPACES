"use client";
/* eslint-disable react-hooks/set-state-in-effect */

// ============================ Logística Internacional ============================
// Ferramenta para empresas de exportação/importação (transporte rodoviário
// MERCOSUL). Módulos: Kanban de cargas, Frota & Manutenção, Estoque & Fumigação,
// Motoristas (+ portal), Gerador de Documentos aduaneiros (DUE/MIC-DTA/CRT/
// Proforma/Invoice), DRE (Operação vs Empresa) e Configurações. Um passo a passo
// prepara o app na primeira vez. A IA (Labs) cuida do WhatsApp e entrega
// localização de motoristas e arquivos da pasta da ferramenta.

import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Anchor, Boxes, Check, CircleDollarSign, Clock3, FileText,
  Gauge, LayoutDashboard, LineChart, Link2, MapPin, MessageSquare, Navigation,
  Plus, ReceiptText, Route, Server, Settings, Ship, ShieldCheck, Sprout,
  Trash2, Truck, Users, WalletCards, Wrench, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { LOGI_DOCS, docLabel, renderLogisticsDoc, type LogiDocType, type OperacaoData, type Mercadoria, type Veiculo } from "@/lib/logistics-docs";
import {
  formatLogisticsDeadline, isLogisticsLate, LOGISTICS_STAGES as STAGES,
  logisticsProgress, logisticsStage, logisticsStageDue, logisticsStageIndex as stageIndex,
} from "@/lib/logistics-workflow";

type CfgState = {
  onboarded: boolean; server: string; serverAgentId: string; razao: string; cnpj: string;
  nome: string; logo: string | null; endereco: string; phone: string; email: string;
  ie: string; bank: string; signatory: string; signatoryDoc: string;
};

// ---- Tipos locais (refletem as tabelas logistics_*) ----
type Carga = {
  id: string; codigo: string | null; cliente_nome: string | null; produto: string | null;
  origem: string | null; destino: string | null; pais_destino: string | null; incoterm: string | null;
  moeda: string | null; valor_declarado: number | null; cfop: string | null; peso: number | null;
  volumes: number | null; stage: string; vehicle_id: string | null; driver_id: string | null;
  transbordo_local: string | null; obs: string | null; created_at: string;
  purchase_amount?: number | null; warehouse_location?: string | null; nota_entrada?: string | null;
  priority?: string | null; operation_status?: string | null; stage_started_at?: string | null;
  stage_due_at?: string | null; updated_at?: string | null;
  dados?: OperacaoData | null; folder_id?: string | null;
};
type Vehicle = { id: string; tipo: string; placa: string; modelo: string | null; ano: string | null; driver_id: string | null; obs: string | null };
type VExpense = { id: string; vehicle_id: string | null; descricao: string; categoria: string | null; valor: number; data: string | null };
type Stock = { id: string; produto: string; lote: string | null; quantidade: number; unidade: string | null; local_armazenamento: string | null; status: string | null; carga_id?: string | null };
type Fumigation = { id: string; stock_id: string | null; lote: string | null; certificado_num: string | null; quantidade_baixa: number | null; data: string | null; status: string | null };
type Driver = { id: string; nome: string; telefone: string | null; veiculo: string | null; cnh: string | null; access_token: string | null; gps_ativo: boolean | null; last_lat: number | null; last_lng: number | null; last_ping_at: string | null };
type Finance = { id: string; escopo: string; tipo: string; categoria: string | null; descricao: string | null; valor: number; carga_id: string | null; vehicle_id: string | null; status: string | null; data: string | null; due_date?: string | null; paid_at?: string | null; automation_key?: string | null };
type LogiDoc = { id: string; carga_id: string | null; tipo: string; numero: string | null; created_at: string; dados: Record<string, string>; pdf_url?: string | null };
type LogisticsEvent = { id: string; carga_id: string; event_type: string; title: string; description: string | null; stage: string | null; created_at: string };
type WorkOrder = { id: string; carga_id: string; numero: string; kind: string; status: string; created_at: string };
type RemoteServer = { id: string; name: string; status: string | null; last_seen: string | null; is_server: boolean | null; server_root: string | null; graph_folder_id: string | null };
type TeamMember = { id: string; full_name: string | null; email: string; role: string };
type FolderAccess = { id: string; folder_id: string; profile_id: string; can_view: boolean; can_write: boolean };

type Mod = "overview" | "kanban" | "fleet" | "stock" | "drivers" | "docgen" | "dre" | "settings";
const MODULES: { id: Mod; label: string; icon: typeof Ship; group: string }[] = [
  { id: "overview", label: "Painel Operacional", icon: LayoutDashboard, group: "Operações & Rastreio" },
  { id: "kanban", label: "Visão Kanban", icon: Route, group: "Operações & Rastreio" },
  { id: "fleet", label: "Frota & Manutenção", icon: Wrench, group: "Operações & Rastreio" },
  { id: "stock", label: "Estoque & Fumigação", icon: Boxes, group: "Operações & Rastreio" },
  { id: "drivers", label: "Motoristas & Portal", icon: Users, group: "Operações & Rastreio" },
  { id: "docgen", label: "Gerador de Documentos", icon: FileText, group: "Docs & Financeiro" },
  { id: "dre", label: "DRE Operação × Empresa", icon: LineChart, group: "Docs & Financeiro" },
  { id: "settings", label: "Dados da Empresa & Servidor", icon: Settings, group: "Configurações" },
];

const MOBILE_MODULES: Mod[] = ["overview", "kanban", "stock", "docgen", "dre"];

const money = (n: number, c = "R$") => `${c} ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function LogisticsTab({ profile }: { profile: Profile | null }) {
  const cid = profile?.company_id ?? null;
  const isGestor = profile?.role === "gestor";
  const [isOwner, setIsOwner] = useState(false);
  const [mod, setMod] = useState<Mod>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ t: string; d?: string; kind?: string } | null>(null);
  const flash = useCallback((t: string, d?: string, kind = "success") => { setToast({ t, d, kind }); setTimeout(() => setToast(null), 4000); }, []);

  // Config da empresa (dados fiscais + servidor + onboarding).
  const [cfg, setCfg] = useState<CfgState>({ onboarded: true, server: "", serverAgentId: "", razao: "", cnpj: "", nome: "", logo: null, endereco: "", phone: "", email: "", ie: "", bank: "", signatory: "", signatoryDoc: "" });
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
  const [events, setEvents] = useState<LogisticsEvent[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [folderAccess, setFolderAccess] = useState<FolderAccess[]>([]);

  const loadAll = useCallback(async () => {
    if (!supabase || !cid) return;
    const [c, v, e, s, f, d, fi, dc, ev, wo, srv, mem, fa, company] = await Promise.all([
      supabase.from("logistics_cargas").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_vehicles").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_vehicle_expenses").select("*").eq("company_id", cid).order("data", { ascending: false }),
      supabase.from("logistics_stock").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_fumigations").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_drivers").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_finance").select("*").eq("company_id", cid).order("data", { ascending: false }),
      supabase.from("logistics_documents").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("logistics_events").select("*").eq("company_id", cid).order("created_at", { ascending: false }).limit(200),
      supabase.from("logistics_work_orders").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.rpc("my_remote_agents"),
      supabase.from("profiles").select("id,full_name,email,role").eq("company_id", cid).order("full_name"),
      supabase.from("logistics_folder_access").select("*").eq("company_id", cid),
      supabase.from("companies").select("owner_id").eq("id", cid).maybeSingle(),
    ]);
    setCargas((c.data as Carga[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
    setExpenses((e.data as VExpense[]) ?? []);
    setStock((s.data as Stock[]) ?? []);
    setFumi((f.data as Fumigation[]) ?? []);
    setDrivers((d.data as Driver[]) ?? []);
    setFinance((fi.data as Finance[]) ?? []);
    setDocs((dc.data as LogiDoc[]) ?? []);
    setEvents((ev.data as LogisticsEvent[]) ?? []);
    setWorkOrders((wo.data as WorkOrder[]) ?? []);
    setServers(((srv.data as RemoteServer[]) ?? []).filter((server) => server.is_server));
    setMembers((mem.data as TeamMember[]) ?? []);
    setFolderAccess((fa.data as FolderAccess[]) ?? []);
    setIsOwner(company.data?.owner_id === profile?.id);
  }, [cid, profile?.id]);

  useEffect(() => {
    if (!supabase || !cid) return;
    const client = supabase;
    const loadConfig = async () => {
      const fields = "logistics_onboarded,logistics_server_path,logistics_server_agent_id,logistics_razao_social,logistics_cnpj,name,logo_url,address,phone,email,logistics_ie,logistics_bank_info,logistics_signatory,logistics_signatory_doc";
      let result = await client.from("company_settings").select(fields).eq("company_id", cid).maybeSingle();
      if (result.error) {
        result = await client.from("company_settings")
          .select("logistics_onboarded,logistics_server_path,logistics_razao_social,logistics_cnpj,name,logo_url,address,phone,email,logistics_ie,logistics_bank_info,logistics_signatory,logistics_signatory_doc")
          .eq("company_id", cid).maybeSingle() as typeof result;
      }
      const data = result.data;
        setCfg({
          onboarded: !!data?.logistics_onboarded,
          server: data?.logistics_server_path || "",
          serverAgentId: (data as { logistics_server_agent_id?: string } | null)?.logistics_server_agent_id || "",
          razao: data?.logistics_razao_social || "",
          cnpj: data?.logistics_cnpj || "",
          nome: data?.name || "",
          logo: data?.logo_url || null,
          endereco: (data as { address?: string } | null)?.address || "",
          phone: (data as { phone?: string } | null)?.phone || "",
          email: (data as { email?: string } | null)?.email || "",
          ie: (data as { logistics_ie?: string } | null)?.logistics_ie || "",
          bank: (data as { logistics_bank_info?: string } | null)?.logistics_bank_info || "",
          signatory: (data as { logistics_signatory?: string } | null)?.logistics_signatory || "",
          signatoryDoc: (data as { logistics_signatory_doc?: string } | null)?.logistics_signatory_doc || "",
        });
        setCfgLoaded(true);
    };
    void loadConfig();
    loadAll();
  }, [cid, loadAll]);

  // Realtime: cargas e motoristas (kanban e localização ao vivo).
  useEffect(() => {
    if (!supabase || !cid) return;
    const ch = supabase.channel(`logistics-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_cargas", filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_drivers", filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_events", filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_finance", filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_stock", filter: `company_id=eq.${cid}` }, () => loadAll())
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
          <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 flex items-center justify-center"><Truck size={16} /></div>
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

      {/* Cabeçalho compacto no celular, inspirado em apps de operação/entrega. */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-20 h-14 px-4 bg-zinc-950/95 backdrop-blur border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-amber-400 text-zinc-950 flex items-center justify-center"><Truck size={16} /></div><div><div className="text-sm font-bold">TransLog</div><div className="text-[9px] text-zinc-500">CENTRAL OPERACIONAL</div></div></div>
        <button onClick={() => setMobileMenu((open) => !open)} className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400"><Settings size={16} /></button>
      </div>
      {mobileMenu && <div className="md:hidden absolute top-14 left-2 right-2 z-30 rounded-2xl border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-xl"><div className="grid grid-cols-2 gap-1">{MODULES.map((item) => <button key={item.id} onClick={() => { setMod(item.id); setMobileMenu(false); }} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs ${mod === item.id ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-white/5"}`}><item.icon size={15} /> {item.label}</button>)}</div></div>}

      <main className="flex-1 overflow-y-auto p-4 md:p-5 pt-[72px] md:pt-5 pb-24 md:pb-5">
        {mod === "overview" && <OverviewModule cargas={cargas} finance={finance} stock={stock} docs={docs} events={events} workOrders={workOrders} onNavigate={setMod} />}
        {mod === "kanban" && <KanbanModule cid={cid} cargas={cargas} vehicles={vehicles} drivers={drivers} finance={finance} events={events} reload={loadAll} flash={flash} />}
        {mod === "fleet" && <FleetModule cid={cid} vehicles={vehicles} expenses={expenses} drivers={drivers} reload={loadAll} flash={flash} />}
        {mod === "stock" && <StockModule cid={cid} stock={stock} fumi={fumi} reload={loadAll} flash={flash} />}
        {mod === "drivers" && <DriversModule cid={cid} drivers={drivers} reload={loadAll} flash={flash} />}
        {mod === "docgen" && <DocGenModule cid={cid} cargas={cargas} docs={docs} company={cfg} servers={servers} profileId={profile?.id || null} isOwner={isOwner} folderAccess={folderAccess} reload={loadAll} flash={flash} />}
        {mod === "dre" && <DreModule cid={cid} finance={finance} expenses={expenses} cargas={cargas} reload={loadAll} flash={flash} />}
        {mod === "settings" && <SettingsModule cid={cid} cfg={cfg} setCfg={setCfg} isGestor={isGestor} isOwner={isOwner} servers={servers} members={members} cargas={cargas} folderAccess={folderAccess} reload={loadAll} flash={flash} />}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-white/10 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-5 gap-1">
          {MOBILE_MODULES.map((id) => {
            const item = MODULES.find((module) => module.id === id)!;
            return <button key={id} onClick={() => { setMod(id); setMobileMenu(false); }} className={`min-w-0 py-1.5 rounded-xl flex flex-col items-center gap-1 ${mod === id ? "text-amber-300 bg-amber-400/10" : "text-zinc-500"}`}><item.icon size={18} /><span className="text-[9px] truncate w-full text-center">{item.label.split(" ")[0]}</span></button>;
          })}
        </div>
      </nav>

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

// =============================== OPERATIONAL OVERVIEW ===============================
function OverviewModule({ cargas, finance, stock, docs, events, workOrders, onNavigate }: {
  cargas: Carga[]; finance: Finance[]; stock: Stock[]; docs: LogiDoc[]; events: LogisticsEvent[];
  workOrders: WorkOrder[]; onNavigate: (mod: Mod) => void;
}) {
  const active = cargas.filter((c) => c.stage !== "concluido" && c.operation_status !== "completed");
  const late = active.filter((c) => isLogisticsLate(c.stage, c.stage_due_at));
  const openPayables = finance.filter((f) => f.tipo === "despesa" && f.status !== "pago");
  const openReceivables = finance.filter((f) => f.tipo === "receita" && f.status !== "pago");
  const pendingDocs = active.filter((c) => {
    if (stageIndex(c.stage) < stageIndex("documentacao")) return false;
    const types = new Set(docs.filter((doc) => doc.carga_id === c.id).map((doc) => doc.tipo));
    return !["due", "micdta", "crt"].every((type) => types.has(type));
  });
  const activeStock = stock.filter((item) => item.status !== "baixado");
  const stockByUnit = activeStock.reduce<Record<string, number>>((totals, item) => {
    const unit = item.unidade || "un";
    totals[unit] = (totals[unit] || 0) + (Number(item.quantidade) || 0);
    return totals;
  }, {});
  const stockSummary = Object.entries(stockByUnit).slice(0, 3).map(([unit, amount]) => `${amount.toLocaleString("pt-BR")} ${unit}`).join(" · ");
  const payables = openPayables.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
  const receivables = openReceivables.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
  const urgent = [...late, ...pendingDocs.filter((c) => !late.some((item) => item.id === c.id))].slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 p-5 md:p-6">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-amber-300"><Activity size={13} /> Torre de controle</div>
            <h2 className="max-w-2xl text-xl font-bold leading-tight md:text-2xl">Tudo que precisa de atenção, antes de virar atraso.</h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-400">Operações, documentos, estoque e financeiro reunidos em uma visão de decisão rápida.</p>
          </div>
          <button onClick={() => onNavigate("kanban")} className="btn-primary w-full md:w-auto"><Route size={15} /> Abrir fluxo das carretas</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <OverviewKpi icon={Truck} label="Em operação" value={String(active.length)} detail={`${late.length} fora do prazo`} tone={late.length ? "amber" : "emerald"} />
        <OverviewKpi icon={FileText} label="Docs pendentes" value={String(pendingDocs.length)} detail="DUE · MIC/DTA · CRT" tone={pendingDocs.length ? "amber" : "emerald"} />
        <OverviewKpi icon={WalletCards} label="A pagar" value={money(payables)} detail={`${openPayables.length} lançamentos`} tone="red" />
        <OverviewKpi icon={CircleDollarSign} label="A receber" value={money(receivables)} detail={`${openReceivables.length} lançamentos`} tone="emerald" />
      </div>

      {/* Mosaico de cartões: escaneável como Pinterest no desktop e feed no celular. */}
      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
        <OverviewCard title="Atenção agora" icon={AlertTriangle} tone={urgent.length ? "amber" : "emerald"}>
          {urgent.length === 0 ? <OverviewEmpty text="Nenhuma operação crítica agora." /> : (
            <div className="space-y-2">
              {urgent.map((c) => (
                <button key={c.id} onClick={() => onNavigate("kanban")} className="w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-left hover:border-amber-400/30">
                  <div className="flex items-start justify-between gap-2"><div><span className="font-mono text-[10px] text-amber-300">{c.codigo}</span><div className="text-sm font-semibold">{c.cliente_nome || "Sem cliente"}</div></div><span className={`rounded-full px-2 py-1 text-[9px] ${isLogisticsLate(c.stage, c.stage_due_at) ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{isLogisticsLate(c.stage, c.stage_due_at) ? formatLogisticsDeadline(c.stage_due_at) : "documentos"}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${logisticsProgress(c.stage)}%` }} /></div>
                  <div className="mt-1 text-[10px] text-zinc-500">{logisticsStage(c.stage).label} · {c.origem || "?"} → {c.destino || "?"}</div>
                </button>
              ))}
            </div>
          )}
        </OverviewCard>

        <OverviewCard title="Fluxo atual" icon={Gauge}>
          <div className="space-y-2.5">
            {STAGES.map((stage) => {
              const amount = cargas.filter((c) => c.stage === stage.id).length;
              const pct = active.length ? Math.max(4, (amount / Math.max(1, active.length)) * 100) : 0;
              return <button key={stage.id} onClick={() => onNavigate("kanban")} className="block w-full text-left"><div className="mb-1 flex justify-between text-[11px]"><span className={stage.color}>{stage.shortLabel}</span><span className="font-mono text-zinc-500">{amount}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-zinc-400/70" style={{ width: `${pct}%` }} /></div></button>;
            })}
          </div>
        </OverviewCard>

        <OverviewCard title="Próximos prazos" icon={Clock3}>
          <div className="space-y-1">
            {active.slice().sort((a, b) => new Date(a.stage_due_at || "9999").getTime() - new Date(b.stage_due_at || "9999").getTime()).slice(0, 7).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-2">
                <div className="min-w-0"><div className="truncate text-xs font-medium">{c.codigo} · {c.cliente_nome || c.produto}</div><div className="truncate text-[10px] text-zinc-500">{logisticsStage(c.stage).shortLabel}</div></div>
                <span className={`shrink-0 text-[10px] ${isLogisticsLate(c.stage, c.stage_due_at) ? "text-red-300" : "text-zinc-400"}`}>{formatLogisticsDeadline(c.stage_due_at)}</span>
              </div>
            ))}
            {active.length === 0 && <OverviewEmpty text="Nenhuma operação em andamento." />}
          </div>
        </OverviewCard>

        <OverviewCard title="Estoque físico" icon={Boxes}>
          <div className="mb-3 flex items-end justify-between"><div><div className="text-2xl font-bold">{activeStock.length} lotes</div><div className="text-[10px] text-zinc-500">{stockSummary || "sem saldo disponível"}</div></div><button onClick={() => onNavigate("stock")} className="text-xs text-amber-300">ver lotes →</button></div>
          <div className="space-y-2">
            {stock.filter((item) => item.status !== "baixado").slice(0, 5).map((item) => <div key={item.id} className="flex justify-between text-xs"><span className="truncate text-zinc-400">{item.produto} · {item.lote || "s/lote"}</span><span className="ml-2 shrink-0 font-medium">{item.quantidade} {item.unidade}</span></div>)}
            {stock.length === 0 && <OverviewEmpty text="Sem lotes registrados." />}
          </div>
        </OverviewCard>

        <OverviewCard title="Ordens de serviço" icon={ReceiptText}>
          <div className="space-y-2">
            {workOrders.slice(0, 6).map((order) => {
              const carga = cargas.find((c) => c.id === order.carga_id);
              return <div key={order.id} className="flex items-center justify-between rounded-xl bg-white/[.03] px-3 py-2"><div><div className="font-mono text-[11px] text-zinc-200">{order.numero}</div><div className="text-[10px] text-zinc-500">{carga?.cliente_nome || carga?.codigo || "Operação"}</div></div><span className="rounded-full bg-sky-500/10 px-2 py-1 text-[9px] text-sky-300">{order.status}</span></div>;
            })}
            {workOrders.length === 0 && <OverviewEmpty text="A OS nasce automaticamente na entrada da nota." />}
          </div>
        </OverviewCard>

        <OverviewCard title="Atividade recente" icon={Activity}>
          <div className="space-y-3">
            {events.slice(0, 7).map((event) => {
              const carga = cargas.find((c) => c.id === event.carga_id);
              return <div key={event.id} className="flex gap-2.5"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><div className="min-w-0"><div className="text-xs text-zinc-300">{event.title}</div><div className="text-[10px] text-zinc-600">{carga?.codigo || "Operação"} · {new Date(event.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div></div>;
            })}
            {events.length === 0 && <OverviewEmpty text="O histórico começará na próxima movimentação." />}
          </div>
        </OverviewCard>
      </div>
    </div>
  );
}

function OverviewCard({ title, icon: Icon, children, tone = "neutral" }: { title: string; icon: typeof Ship; children: React.ReactNode; tone?: "neutral" | "amber" | "emerald" }) {
  return <section className="mb-4 break-inside-avoid rounded-3xl border border-white/10 bg-zinc-900/60 p-4 shadow-[0_18px_50px_rgba(0,0,0,.16)]"><div className="mb-3 flex items-center gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone === "amber" ? "bg-amber-400/15 text-amber-300" : tone === "emerald" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-zinc-300"}`}><Icon size={15} /></div><h3 className="text-sm font-semibold">{title}</h3></div>{children}</section>;
}

function OverviewKpi({ icon: Icon, label, value, detail, tone }: { icon: typeof Ship; label: string; value: string; detail: string; tone: "amber" | "emerald" | "red" }) {
  const toneClass = tone === "amber" ? "text-amber-300 bg-amber-400/10" : tone === "red" ? "text-red-300 bg-red-400/10" : "text-emerald-300 bg-emerald-400/10";
  return <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3 md:p-4"><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}><Icon size={15} /></div><div className="truncate text-lg font-bold md:text-xl">{value}</div><div className="text-[10px] font-medium text-zinc-300 md:text-xs">{label}</div><div className="mt-0.5 truncate text-[9px] text-zinc-600 md:text-[10px]">{detail}</div></div>;
}

function OverviewEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-800 px-3 py-5 text-center text-[11px] text-zinc-600">{text}</div>;
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
        <div className="flex items-center gap-2 mb-1"><Truck size={20} className="text-amber-400" /><h2 className="text-lg font-bold">Configurar a Logística Internacional</h2></div>
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
function KanbanModule({ cid, cargas, vehicles, drivers, finance, events, reload, flash }: {
  cid: string | null; cargas: Carga[]; vehicles: Vehicle[]; drivers: Driver[]; finance: Finance[]; events: LogisticsEvent[];
  reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [sel, setSel] = useState<Carga | null>(null);
  const selLive = sel ? cargas.find((c) => c.id === sel.id) || sel : null;

  async function advance(c: Carga, dir: 1 | -1) {
    if (!supabase) return;
    const i = Math.min(STAGES.length - 1, Math.max(0, stageIndex(c.stage) + dir));
    const next = STAGES[i];
    const { error } = await supabase.rpc("logistics_move_carga", {
      p_carga_id: c.id,
      p_next_stage: next.id,
      p_notes: next.id === "transbordo" ? c.transbordo_local || "Transbordo operacional" : null,
    });
    // Compatibilidade enquanto a migração ainda não foi aplicada no ambiente de
    // preview: movimenta a carga, mas as automações completas aguardam o SQL.
    if (error) {
      await supabase.from("logistics_cargas").update({
        stage: next.id,
        stage_started_at: new Date().toISOString(),
        stage_due_at: logisticsStageDue(next.id),
        updated_at: new Date().toISOString(),
      }).eq("id", c.id);
      flash("Etapa atualizada", "A automação do banco será concluída após aplicar a migração.", "info");
    } else {
      const automated = next.id === "pedido" ? "Contas a Pagar criado automaticamente."
        : next.id === "entrada" ? "Estoque, saldo físico e Ordem de Serviço criados."
        : next.id === "exportacao" ? "Contas a Receber da Invoice criado."
        : "Histórico e novo prazo registrados.";
      flash(next.label, automated);
    }
    // Transbordo não gera nova fatura (regra do negócio) — só registra o movimento.
    if (next.id === "transbordo") flash("Transbordo na fronteira", "Troca registrada no histórico — nenhuma nova fatura foi criada.", "info");
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
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${isLogisticsLate(c.stage, c.stage_due_at) ? "bg-red-400" : "bg-amber-400"}`} style={{ width: `${logisticsProgress(c.stage)}%` }} /></div>
                        <div className={`mt-1 flex items-center justify-between text-[9px] ${isLogisticsLate(c.stage, c.stage_due_at) ? "text-red-300" : "text-zinc-600"}`}><span>{c.priority === "urgent" ? "Prioridade alta" : "Fluxo ativo"}</span><span>{formatLogisticsDeadline(c.stage_due_at)}</span></div>
                      </div>
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
      {selLive && <CargaDrawer cid={cid} c={selLive} vehicles={vehicles} drivers={drivers} finance={finance} events={events.filter((event) => event.carga_id === selLive.id)} onClose={() => setSel(null)} onAdvance={advance} reload={reload} flash={flash} />}
    </div>
  );
}

function NewCargaModal({ cid, count, onClose, onSaved }: { cid: string | null; count: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ cliente_nome: "", produto: "", origem: "", destino: "", pais_destino: "Paraguai", incoterm: "FOB", moeda: "USD", valor_declarado: "", purchase_amount: "", cfop: "6501", peso: "", volumes: "", warehouse_location: "", nota_entrada: "", priority: "normal" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase || !cid) return;
    setBusy(true);
    const codigo = `#${String(count + 1).padStart(4, "0")}`;
    const payload = {
      company_id: cid, codigo, cliente_nome: f.cliente_nome || null, produto: f.produto || null, origem: f.origem || null,
      destino: f.destino || null, pais_destino: f.pais_destino || null, incoterm: f.incoterm || null, moeda: f.moeda || null,
      valor_declarado: Number(f.valor_declarado) || 0, cfop: f.cfop, peso: Number(f.peso) || null, volumes: Number(f.volumes) || null, stage: "proforma",
      purchase_amount: Number(f.purchase_amount) || 0, warehouse_location: f.warehouse_location || null,
      nota_entrada: f.nota_entrada || null, priority: f.priority, stage_started_at: new Date().toISOString(),
      stage_due_at: logisticsStageDue("proforma"),
    };
    const { error } = await supabase.from("logistics_cargas").insert(payload);
    if (error) {
      const basePayload = {
        company_id: payload.company_id, codigo: payload.codigo, cliente_nome: payload.cliente_nome,
        produto: payload.produto, origem: payload.origem, destino: payload.destino,
        pais_destino: payload.pais_destino, incoterm: payload.incoterm, moeda: payload.moeda,
        valor_declarado: payload.valor_declarado, cfop: payload.cfop, peso: payload.peso,
        volumes: payload.volumes, stage: payload.stage,
      };
      await supabase.from("logistics_cargas").insert(basePayload);
    }
    setBusy(false); onSaved();
  }
  return (
    <Modal title="Nova Carga / Fatura Proforma" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Cliente / Importador"><input className="in" value={f.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} /></Field>
        <Field label="Produto"><input className="in" value={f.produto} onChange={(e) => set("produto", e.target.value)} /></Field>
        <Field label="Origem"><input className="in" value={f.origem} onChange={(e) => set("origem", e.target.value)} placeholder="Foz do Iguaçu/BR" /></Field>
        <Field label="Destino"><input className="in" value={f.destino} onChange={(e) => set("destino", e.target.value)} placeholder="Assunção" /></Field>
        <Field label="País de destino"><select className="in" value={f.pais_destino} onChange={(e) => set("pais_destino", e.target.value)}>{["Paraguai", "Argentina", "Uruguai", "Bolívia", "Peru", "Chile", "Brasil"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Incoterm"><select className="in" value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>{["FOB", "CIF", "CFR", "EXW", "DAP"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="CFOP"><select className="in" value={f.cfop} onChange={(e) => set("cfop", e.target.value)}><option value="6501">6501 — Remessa fim específico de exportação</option><option value="6502">6502 — Venda p/ exportação</option></select></Field>
        <Field label="Moeda"><select className="in" value={f.moeda} onChange={(e) => set("moeda", e.target.value)}>{["USD", "BRL", "EUR", "PYG", "ARS"].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Valor de venda / Invoice"><input className="in" type="number" value={f.valor_declarado} onChange={(e) => set("valor_declarado", e.target.value)} /></Field>
        <Field label="Custo do pedido de compra"><input className="in" type="number" value={f.purchase_amount} onChange={(e) => set("purchase_amount", e.target.value)} /></Field>
        <Field label="Peso (kg)"><input className="in" type="number" value={f.peso} onChange={(e) => set("peso", e.target.value)} /></Field>
        <Field label="Volumes"><input className="in" type="number" value={f.volumes} onChange={(e) => set("volumes", e.target.value)} /></Field>
        <Field label="Local previsto do estoque"><input className="in" value={f.warehouse_location} onChange={(e) => set("warehouse_location", e.target.value)} placeholder="Galpão A / Pátio 2" /></Field>
        <Field label="NF de entrada (se já emitida)"><input className="in" value={f.nota_entrada} onChange={(e) => set("nota_entrada", e.target.value)} /></Field>
        <Field label="Prioridade"><select className="in" value={f.priority} onChange={(e) => set("priority", e.target.value)}><option value="normal">Normal</option><option value="urgent">Alta / Urgente</option><option value="low">Baixa</option></select></Field>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Criar carga"}</button></div>
    </Modal>
  );
}

function CargaDrawer({ cid, c, vehicles, drivers, finance, events, onClose, onAdvance, reload, flash }: {
  cid: string | null; c: Carga; vehicles: Vehicle[]; drivers: Driver[]; finance: Finance[]; events: LogisticsEvent[];
  onClose: () => void; onAdvance: (c: Carga, d: 1 | -1) => void; reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const drv = drivers.find((d) => d.id === c.driver_id);
  const cargoFinance = finance.filter((f) => f.carga_id === c.id);

  async function assign(field: "vehicle_id" | "driver_id", value: string) {
    if (!supabase) return;
    await supabase.from("logistics_cargas").update({ [field]: value || null }).eq("id", c.id);
    reload();
  }
  async function updateMeta(field: "transbordo_local" | "obs" | "warehouse_location" | "nota_entrada" | "priority", value: string) {
    if (!supabase) return;
    await supabase.from("logistics_cargas").update({ [field]: value || null, updated_at: new Date().toISOString() }).eq("id", c.id);
    reload();
  }
  async function genPurchaseOrder() {
    if (!supabase) return;
    if (cargoFinance.some((row) => row.automation_key === `purchase-order:${c.id}` || row.categoria === "Pedido de Compra")) {
      flash("Pedido já lançado", "O Contas a Pagar desta operação já existe.", "info");
      return;
    }
    // Automação: Pedido de Compra → lançamento em Contas a Pagar (DRE Operação).
    await supabase.from("logistics_finance").insert({
      company_id: cid, escopo: "operacao", tipo: "despesa",
      categoria: "Pedido de Compra", descricao: `PC da carga ${c.codigo} — ${c.produto || ""}`, valor: c.purchase_amount || 0, carga_id: c.id, status: "aberto",
      due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), automation_key: `purchase-order:${c.id}`,
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
          <button onClick={() => onAdvance(c, -1)} disabled={stageIndex(c.stage) === 0} className="btn-ghost flex-1 disabled:opacity-40">← Voltar etapa</button>
          <button onClick={() => onAdvance(c, 1)} disabled={stageIndex(c.stage) === STAGES.length - 1} className="btn-primary flex-1 disabled:opacity-40">Avançar e automatizar →</button>
        </div>
        <div className={`mt-2 flex items-center justify-between rounded-xl border px-3 py-2 text-[11px] ${isLogisticsLate(c.stage, c.stage_due_at) ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[.03] text-zinc-400"}`}><span className="flex items-center gap-1.5"><Clock3 size={12} /> Prazo da etapa</span><b>{formatLogisticsDeadline(c.stage_due_at)}</b></div>

        <div className="mt-5 space-y-2 text-sm">
          <InfoRow label="Produto" value={c.produto} />
          <InfoRow label="Rota" value={`${c.origem || "?"} → ${c.destino || "?"} ${c.pais_destino ? `(${c.pais_destino})` : ""}`} />
          <InfoRow label="Incoterm / CFOP" value={`${c.incoterm || "—"} · ${c.cfop}`} />
          <InfoRow label="Valor declarado" value={money(c.valor_declarado || 0, c.moeda || "USD")} />
          <InfoRow label="Custo do pedido" value={money(c.purchase_amount || 0)} />
          <InfoRow label="Peso / Volumes" value={`${c.peso || "—"} kg · ${c.volumes || "—"} vol.`} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Veículo"><select className="in" value={c.vehicle_id || ""} onChange={(e) => assign("vehicle_id", e.target.value)}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.placa} ({v.tipo})</option>)}</select></Field>
          <Field label="Motorista"><select className="in" value={c.driver_id || ""} onChange={(e) => assign("driver_id", e.target.value)}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Field>
          <Field label="NF de entrada"><input className="in" defaultValue={c.nota_entrada || ""} onBlur={(e) => updateMeta("nota_entrada", e.target.value)} placeholder="Número da nota" /></Field>
          <Field label="Local do estoque"><input className="in" defaultValue={c.warehouse_location || ""} onBlur={(e) => updateMeta("warehouse_location", e.target.value)} placeholder="Galpão / pátio" /></Field>
          <Field label="Local do transbordo"><input className="in" defaultValue={c.transbordo_local || ""} onBlur={(e) => updateMeta("transbordo_local", e.target.value)} placeholder="Fronteira / recinto" /></Field>
          <Field label="Prioridade"><select className="in" value={c.priority || "normal"} onChange={(e) => updateMeta("priority", e.target.value)}><option value="normal">Normal</option><option value="urgent">Alta / Urgente</option><option value="low">Baixa</option></select></Field>
        </div>
        <Field label="Observações da operação"><textarea className="in mt-2" rows={3} defaultValue={c.obs || ""} onBlur={(e) => updateMeta("obs", e.target.value)} placeholder="Orientações para a equipe, motorista ou documentação…" /></Field>

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

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Activity size={13} className="text-amber-400" /> Histórico automático</div>
          <div className="space-y-3 border-l border-zinc-800 pl-3">
            {events.slice(0, 12).map((event) => <div key={event.id} className="relative"><span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-amber-400" /><div className="text-[11px] text-zinc-300">{event.title}</div>{event.description && <div className="text-[10px] text-zinc-500">{event.description}</div>}<div className="text-[9px] text-zinc-700">{new Date(event.created_at).toLocaleString("pt-BR")}</div></div>)}
            {events.length === 0 && <div className="text-[11px] text-zinc-600">A próxima movimentação começa o histórico auditável.</div>}
          </div>
        </div>

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
  const [cert, setCert] = useState(() => `FUM-${Date.now().toString().slice(-6)}`);
  const [cost, setCost] = useState("");
  async function save() {
    if (!supabase || !cid) return;
    const baixa = Math.min(Number(qtd) || 0, stock.quantidade);
    await supabase.from("logistics_fumigations").insert({ company_id: cid, stock_id: stock.id, lote: stock.lote, certificado_num: cert, quantidade_baixa: baixa, status: "concluido" });
    const restante = Math.max(0, stock.quantidade - baixa);
    await supabase.from("logistics_stock").update({ quantidade: restante, status: restante <= 0 ? "baixado" : "disponivel" }).eq("id", stock.id);
    if (Number(cost) > 0) {
      await supabase.from("logistics_finance").insert({
        company_id: cid, escopo: "operacao", tipo: "despesa", categoria: "Fumigação",
        descricao: `Certificado ${cert} · lote ${stock.lote || "—"}`, valor: Number(cost),
        carga_id: stock.carga_id || null, status: "aberto",
        automation_key: `fumigation:${cert}`,
      });
    }
    onSaved();
  }
  return (
    <Modal title="Certificado de Fumigação" onClose={onClose}>
      <p className="text-xs text-zinc-400 mb-3">Produto <b>{stock.produto}</b> · Lote {stock.lote || "—"} · Saldo {stock.quantidade} {stock.unidade}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nº do certificado"><input className="in" value={cert} onChange={(e) => setCert(e.target.value)} /></Field>
        <Field label="Quantidade a baixar"><input className="in" type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} /></Field>
        <Field label="Custo da fumigação (R$)"><input className="in" type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></Field>
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

// =============================== OPERAÇÃO & DOCUMENTOS ===============================
// Fluxo: escolhe a OPERAÇÃO (carga), preenche UMA vez os dados compartilhados
// (importador, mercadorias em tabela, veículos/placas em tabela, datas do
// romaneio) e GERA todos os documentos já preenchidos, salvando automático numa
// pasta da operação. O cabeçalho usa a logo e os dados da empresa.
function DocGenModule({ cid, cargas, docs, company, servers, profileId, isOwner, folderAccess, reload, flash }: {
  cid: string | null; cargas: Carga[]; docs: LogiDoc[]; company: CfgState; servers: RemoteServer[];
  profileId: string | null; isOwner: boolean; folderAccess: FolderAccess[];
  reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const allowedFolders = new Set(folderAccess.filter((access) => access.profile_id === profileId && access.can_view).map((access) => access.folder_id));
  const availableCargas = isOwner ? cargas : cargas.filter((item) => Boolean(item.folder_id && allowedFolders.has(item.folder_id)));
  const [cargaId, setCargaId] = useState(availableCargas[0]?.id || "");
  const effectiveCargaId = availableCargas.some((item) => item.id === cargaId) ? cargaId : availableCargas[0]?.id || "";
  const carga = availableCargas.find((c) => c.id === effectiveCargaId) || null;
  const selectedServer = servers.find((server) => server.id === company.serverAgentId) || null;
  const [d, setD] = useState<OperacaoData>({});
  const [dirty, setDirty] = useState(false);
  const [savingOp, setSavingOp] = useState(false);
  const [busyType, setBusyType] = useState<LogiDocType | null>(null);

  // Ao trocar de operação: se ela já tem dados salvos, carrega. Se estiver VAZIA,
  // JÁ PREENCHE a partir da carga (cliente→importador, produto→1ª mercadoria, etc.)
  // — automatiza o começo para você só ajustar e gerar.
  useEffect(() => {
    const existing = (carga?.dados as OperacaoData) || {};
    if (carga && Object.keys(existing).length === 0) {
      setD({
        importador: carga.cliente_nome || "", cliente: carga.cliente_nome || "",
        pais_destino: carga.pais_destino || "", cidade_destino: carga.destino || "",
        moeda: carga.moeda || "USD", condicoes: carga.incoterm || "", local_entrega: carga.destino || "",
        cobrar_de: carga.cliente_nome || "",
        mercadorias: carga.produto ? [{ descricao: carga.produto, quant: String(carga.volumes || ""), preco_unit: "", total: String(carga.valor_declarado || ""), peso_bruto: String(carga.peso || "") }] : [],
      });
      setDirty(true);
    } else { setD(existing); setDirty(false); }
  }, [cargaId, carga?.dados, carga]);

  const set = (k: keyof OperacaoData, v: string) => { setD((s) => ({ ...s, [k]: v }) as OperacaoData); setDirty(true); };
  const setMerc = (arr: Mercadoria[]) => { setD((s) => ({ ...s, mercadorias: arr })); setDirty(true); };
  const setVeic = (arr: Veiculo[]) => { setD((s) => ({ ...s, veiculos: arr })); setDirty(true); };
  const merc = d.mercadorias || []; const veic = d.veiculos || [];

  async function saveOp() {
    if (!supabase || !cid || !carga) return;
    setSavingOp(true);
    await supabase.from("logistics_cargas").update({ dados: d }).eq("id", carga.id);
    setSavingOp(false); setDirty(false); reload(); flash("Operação salva");
  }

  // Cria/acha a pasta da operação no grafo (Logística › <operação>).
  async function ensureFolder(): Promise<string | null> {
    if (!supabase || !cid || !carga) return null;
    if (carga.folder_id) return carga.folder_id;
    const serverParent = selectedServer?.graph_folder_id || null;
    let rootQuery = supabase.from("files").select("id").eq("company_id", cid).eq("type", "folder").in("name", ["TransLog", "Logística"]);
    rootQuery = serverParent ? rootQuery.eq("parent_id", serverParent) : rootQuery.is("parent_id", null);
    const { data: root } = await rootQuery.maybeSingle();
    let rootId = root?.id as string | undefined;
    if (!rootId) {
      const { data } = await supabase.from("files").insert({
        name: "TransLog", type: "folder", parent_id: serverParent, company_id: cid,
        server_agent_id: selectedServer?.id || null,
      }).select("id").single();
      rootId = data?.id;
    }
    if (!rootId) return null;
    const opName = carga.codigo || `Operacao-${carga.id.slice(0, 6)}`;
    const { data: existing } = await supabase.from("files").select("id").eq("company_id", cid).eq("parent_id", rootId).eq("type", "folder").eq("name", opName).maybeSingle();
    let folderId = existing?.id as string | undefined;
    if (!folderId) {
      const { data } = await supabase.from("files").insert({
        name: opName, type: "folder", parent_id: rootId, company_id: cid,
        server_agent_id: selectedServer?.id || null,
      }).select("id").single();
      folderId = data?.id;
    }
    if (folderId) await supabase.from("logistics_cargas").update({ folder_id: folderId }).eq("id", carga.id);
    return folderId || null;
  }

  const compObj = () => ({ razao_social: company.razao, cnpj: company.cnpj, ie: company.ie, nome: company.nome, endereco: company.endereco, phone: company.phone, email: company.email, logo_url: company.logo, bank_info: company.bank, signatory: company.signatory, signatory_doc: company.signatoryDoc });
  const cargaObj = () => carga ? { codigo: carga.codigo, cliente_nome: carga.cliente_nome, produto: carga.produto, origem: carga.origem, destino: carga.destino, pais_destino: carga.pais_destino, incoterm: carga.incoterm, moeda: carga.moeda, valor_declarado: carga.valor_declarado, peso: carga.peso, volumes: carga.volumes, cfop: carga.cfop } : {};

  // Garante que TODOS os documentos tenham número (série ligada — mesmo sufixo),
  // para que um referencie o outro (CRT↔MIC, etc.).
  function withNumbers(dd: OperacaoData): OperacaoData {
    const base = Date.now().toString().slice(-5);
    for (const doc of LOGI_DOCS) if (!dd[doc.numKey]) (dd as Record<string, string>)[doc.numKey] = `${doc.label.slice(0, 3).toUpperCase()}-${base}`;
    return dd;
  }
  // Renderiza um documento, SALVA na pasta da operação e registra. Não abre janela.
  async function saveDoc(type: LogiDocType, dd: OperacaoData, folderId: string | null): Promise<{ html: string; url: string | null }> {
    const def = LOGI_DOCS.find((x) => x.type === type)!;
    const html = renderLogisticsDoc(type, cargaObj(), dd, compObj());
    let url: string | null = null;
    let storagePath: string | null = null;
    if (supabase && cid && carga) {
      const fileName = `${def.label}-${dd[def.numKey] || ""}.html`.replace(/\s+/g, "_");
      try {
        const path = `logistica/${carga.id}/${Date.now()}-${fileName}`;
        const { error } = await supabase.storage.from("company-files").upload(path, new Blob([html], { type: "text/html" }), { contentType: "text/html", upsert: true });
        if (!error) {
          storagePath = path;
          const { data } = supabase.storage.from("company-files").getPublicUrl(path);
          url = data?.publicUrl ?? null;
          if (folderId) await supabase.from("files").insert({
            name: fileName, type: "file", parent_id: folderId, company_id: cid,
            storage_path: path, mime: "text/html", server_agent_id: selectedServer?.id || null,
          });
        }
      } catch { /* segue */ }
      const docPayload = { company_id: cid, carga_id: carga.id, tipo: type, numero: (dd[def.numKey] as string) || null, dados: dd, pdf_url: url, storage_path: storagePath, server_path: company.server ? `${company.server}${fileName}` : null, status: "emitido" };
      const { error: docError } = await supabase.from("logistics_documents").insert(docPayload);
      if (docError) {
        await supabase.from("logistics_documents").insert({
          company_id: docPayload.company_id, carga_id: docPayload.carga_id, tipo: docPayload.tipo,
          numero: docPayload.numero, dados: docPayload.dados, pdf_url: docPayload.pdf_url,
          server_path: docPayload.server_path,
        });
      }
    }
    return { html, url };
  }

  async function generate(type: LogiDocType) {
    if (!carga) { flash("Escolha a operação primeiro."); return; }
    setBusyType(type);
    try {
      const def = LOGI_DOCS.find((x) => x.type === type)!;
      const dd: OperacaoData = { ...d };
      if (!dd[def.numKey]) (dd as Record<string, string>)[def.numKey] = `${def.label.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}`;
      const folderId = await ensureFolder();
      const { html } = await saveDoc(type, dd, folderId);
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); } else flash("Pop-up bloqueado", "Permita pop-ups para abrir/imprimir.", "error");
      setD(dd);
      if (supabase && cid) await supabase.from("logistics_cargas").update({ dados: dd }).eq("id", carga.id);
      setDirty(false); reload();
      flash("Documento gerado", "Salvo na pasta da operação. Salve em PDF (Ctrl/Cmd+P).");
    } finally { setBusyType(null); }
  }

  // AUTOMÁTICO: gera TODOS os documentos em ordem lógica (romaneio → invoice →
  // packing → fatura de serviço → MIC/DTA → CRT → DUE), com numeração ligada, e
  // salva o pacote na pasta da operação de uma vez. Avança a etapa para
  // "Documentação". Poupa tempo — preenche uma vez e sai tudo.
  const ORDER: LogiDocType[] = ["romaneio", "invoice", "packing", "fatura_servico", "micdta", "crt", "due"];
  async function generateAll() {
    if (!carga) { flash("Escolha a operação primeiro."); return; }
    setBusyType("romaneio");
    try {
      const dd = withNumbers({ ...d });
      const folderId = await ensureFolder();
      for (const type of ORDER) await saveDoc(type, dd, folderId);
      setD(dd);
      if (supabase && cid) {
        await supabase.from("logistics_cargas").update({ dados: dd }).eq("id", carga.id);
        if (stageIndex(carga.stage) < stageIndex("documentacao")) await supabase.from("logistics_cargas").update({ stage: "documentacao" }).eq("id", carga.id);
      }
      setDirty(false); reload();
      flash("Pacote gerado", "Todos os documentos foram criados e salvos na pasta da operação.");
    } finally { setBusyType(null); }
  }

  const opDocs = docs.filter((x) => x.carga_id === effectiveCargaId);

  return (
    <div className="space-y-4">
      <Header title="Operação & Documentos" sub="Preencha a operação uma vez (tabelas de mercadorias e placas) e gere todos os documentos — romaneio, invoice, packing list, fatura de serviço, MIC/DTA, CRT e DUE — salvos na pasta da operação." icon={FileText}
        action={<div className="flex items-center gap-2 flex-wrap">
          <select className="in" style={{ width: "auto" }} value={effectiveCargaId} onChange={(e) => setCargaId(e.target.value)}><option value="">— escolher operação —</option>{availableCargas.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.cliente_nome}</option>)}</select>
          <button onClick={saveOp} disabled={savingOp || !dirty || !carga} className="btn-ghost disabled:opacity-40">{savingOp ? "Salvando…" : dirty ? "Salvar operação" : "Salvo"}</button>
          <button onClick={generateAll} disabled={!!busyType || !carga} className="btn-primary disabled:opacity-40"><FileText size={14} /> {busyType ? "Gerando…" : "Gerar todos em ordem"}</button>
        </div>} />

      {!carga ? (
        <Empty text="Escolha uma operação acima (ou crie uma carga no Kanban) para preencher e gerar os documentos." />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Coluna 1: dados compartilhados da operação */}
          <div className="space-y-3 max-h-[68vh] overflow-y-auto pr-1">
            <Panel title="Importador / Destinatário">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Importador"><input className="in" value={d.importador || ""} onChange={(e) => set("importador", e.target.value)} /></Field>
                <Field label="Doc (RUC/CNPJ)"><input className="in" value={d.importador_doc || ""} onChange={(e) => set("importador_doc", e.target.value)} /></Field>
              </div>
              <Field label="Endereço"><input className="in" value={d.importador_end || ""} onChange={(e) => set("importador_end", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="País destino"><input className="in" value={d.pais_destino || ""} onChange={(e) => set("pais_destino", e.target.value)} placeholder={carga.pais_destino || ""} /></Field>
                <Field label="Incoterm / Condições"><input className="in" value={d.condicoes || ""} onChange={(e) => set("condicoes", e.target.value)} placeholder="Ex.: CPT · 30d" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Moeda"><input className="in" value={d.moeda || ""} onChange={(e) => set("moeda", e.target.value)} placeholder={carga.moeda || "USD"} /></Field>
                <Field label="Local de entrega"><input className="in" value={d.local_entrega || ""} onChange={(e) => set("local_entrega", e.target.value)} placeholder={carga.destino || ""} /></Field>
              </div>
            </Panel>

            <Panel title="Romaneio (chegada / saída)">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cliente"><input className="in" value={d.cliente || ""} onChange={(e) => set("cliente", e.target.value)} placeholder={carga.cliente_nome || ""} /></Field>
                <Field label="Cidade destino"><input className="in" value={d.cidade_destino || ""} onChange={(e) => set("cidade_destino", e.target.value)} placeholder={carga.destino || ""} /></Field>
                <Field label="Transportadora"><input className="in" value={d.transportadora || ""} onChange={(e) => set("transportadora", e.target.value)} /></Field>
                <Field label="Motorista"><input className="in" value={d.motorista || ""} onChange={(e) => set("motorista", e.target.value)} /></Field>
                <Field label="Doc motorista"><input className="in" value={d.motorista_doc || ""} onChange={(e) => set("motorista_doc", e.target.value)} /></Field>
                <Field label="Responsável"><input className="in" value={d.responsavel || ""} onChange={(e) => set("responsavel", e.target.value)} /></Field>
                <Field label="Nota Fiscal"><input className="in" value={d.nota_fiscal || ""} onChange={(e) => set("nota_fiscal", e.target.value)} /></Field>
                <Field label="CTE"><input className="in" value={d.cte || ""} onChange={(e) => set("cte", e.target.value)} /></Field>
                <Field label="Chegada (data)"><input className="in" value={d.chegada_data || ""} onChange={(e) => set("chegada_data", e.target.value)} placeholder="dd/mm/aaaa" /></Field>
                <Field label="Chegada (hora)"><input className="in" value={d.chegada_hora || ""} onChange={(e) => set("chegada_hora", e.target.value)} /></Field>
                <Field label="Saída (data)"><input className="in" value={d.saida_data || ""} onChange={(e) => set("saida_data", e.target.value)} placeholder="dd/mm/aaaa" /></Field>
                <Field label="Saída (hora)"><input className="in" value={d.saida_hora || ""} onChange={(e) => set("saida_hora", e.target.value)} /></Field>
                <Field label="Placas chegada"><input className="in" value={d.placas_chegada || ""} onChange={(e) => set("placas_chegada", e.target.value)} /></Field>
                <Field label="Placas saída"><input className="in" value={d.placas_saida || ""} onChange={(e) => set("placas_saida", e.target.value)} /></Field>
              </div>
            </Panel>

            <Panel title="Mercadorias (tabela — Invoice e Packing List)">
              <MercEditor rows={merc} setRows={setMerc} />
            </Panel>

            <Panel title="Veículos / Placas (tabela — Romaneio, MIC e Fatura de Serviço)">
              <VeicEditor rows={veic} setRows={setVeic} />
            </Panel>

            <Panel title="Fatura de Serviço (cobrança do frete)">
              <Field label="Cobrar de"><input className="in" value={d.cobrar_de || ""} onChange={(e) => set("cobrar_de", e.target.value)} placeholder={d.importador || carga.cliente_nome || ""} /></Field>
              <Field label="Endereço"><input className="in" value={d.cobrar_de_end || ""} onChange={(e) => set("cobrar_de_end", e.target.value)} /></Field>
            </Panel>
          </div>

          {/* Coluna 2: gerar cada documento */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Gerar documentos</div>
            {LOGI_DOCS.map((doc) => (
              <div key={doc.type} className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{doc.label} <span className="text-[10px] text-zinc-500 font-normal">· {doc.full}</span></div>
                  <div className="text-[11px] text-zinc-500 truncate">{doc.desc}</div>
                </div>
                <input className="in" style={{ width: 120 }} placeholder="Nº" value={(d[doc.numKey] as string) || ""} onChange={(e) => set(doc.numKey, e.target.value)} />
                <button onClick={() => generate(doc.type)} disabled={busyType === doc.type} className="btn-primary shrink-0">{busyType === doc.type ? "…" : "Gerar"}</button>
              </div>
            ))}
            {selectedServer && <p className="flex items-center gap-1 text-[10px] text-zinc-500"><Server size={11} className={selectedServer.status === "online" ? "text-emerald-400" : "text-zinc-600"} /> Servidor: {selectedServer.name} · {company.server || selectedServer.server_root || "pasta padrão"}</p>}

            {opDocs.length > 0 && (
              <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 mt-2">
                <div className="text-sm font-semibold mb-2">Emitidos nesta operação</div>
                {opDocs.slice(0, 20).map((x) => (
                  <div key={x.id} className="flex items-center justify-between text-xs border-b border-white/5 py-1.5">
                    <span className="text-zinc-400"><span className="text-zinc-200">{docLabel(x.tipo as LogiDocType)}</span> · <span className="font-mono">{x.numero || "—"}</span></span>
                    <div className="flex items-center gap-2">
                      {x.pdf_url && <a href={x.pdf_url} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300">abrir / imprimir</a>}
                      <span className="text-zinc-600">{new Date(x.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 space-y-2"><div className="text-xs font-semibold text-amber-300">{title}</div>{children}</div>;
}
function MercEditor({ rows, setRows }: { rows: Mercadoria[]; setRows: (r: Mercadoria[]) => void }) {
  const upd = (i: number, k: keyof Mercadoria, v: string) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-1">
          <input className="in col-span-4" placeholder="Descrição" value={r.descricao} onChange={(e) => upd(i, "descricao", e.target.value)} />
          <input className="in col-span-2" placeholder="NCM" value={r.ncm || ""} onChange={(e) => upd(i, "ncm", e.target.value)} />
          <input className="in col-span-2" placeholder="Qtd" value={r.quant || ""} onChange={(e) => upd(i, "quant", e.target.value)} />
          <input className="in col-span-2" placeholder="P.unit" value={r.preco_unit || ""} onChange={(e) => upd(i, "preco_unit", e.target.value)} />
          <input className="in col-span-1" placeholder="Bruto" value={r.peso_bruto || ""} onChange={(e) => upd(i, "peso_bruto", e.target.value)} />
          <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="col-span-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 flex items-center justify-center"><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { descricao: "" }])} className="btn-ghost text-xs"><Plus size={12} /> mercadoria</button>
    </div>
  );
}
function VeicEditor({ rows, setRows }: { rows: Veiculo[]; setRows: (r: Veiculo[]) => void }) {
  const upd = (i: number, k: keyof Veiculo, v: string) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-1">
          <input className="in col-span-2" placeholder="Placa" value={r.placa} onChange={(e) => upd(i, "placa", e.target.value)} />
          <input className="in col-span-2" placeholder="Peso(t)" value={r.peso || ""} onChange={(e) => upd(i, "peso", e.target.value)} />
          <input className="in col-span-3" placeholder="MIC" value={r.mic || ""} onChange={(e) => upd(i, "mic", e.target.value)} />
          <input className="in col-span-2" placeholder="CRT" value={r.crt || ""} onChange={(e) => upd(i, "crt", e.target.value)} />
          <input className="in col-span-2" placeholder="Frete R$" value={r.valor || ""} onChange={(e) => upd(i, "valor", e.target.value)} />
          <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="col-span-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 flex items-center justify-center"><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { placa: "" }])} className="btn-ghost text-xs"><Plus size={12} /> veículo</button>
    </div>
  );
}

// =============================== DRE MODULE ===============================
function DreModule({ cid, finance, expenses, cargas, reload, flash }: {
  cid: string | null; finance: Finance[]; expenses: VExpense[]; cargas: Carga[];
  reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const calc = (escopo: string) => {
    const rows = finance.filter((f) => f.escopo === escopo);
    const rec = rows.filter((r) => r.tipo === "receita").reduce((a, b) => a + (b.valor || 0), 0);
    const desp = rows.filter((r) => r.tipo === "despesa").reduce((a, b) => a + (b.valor || 0), 0);
    return { rec, desp, saldo: rec - desp, rows };
  };
  const op = calc("operacao"); const emp = calc("empresa");
  const total = { rec: op.rec + emp.rec, desp: op.desp + emp.desp, saldo: op.saldo + emp.saldo };
  const fleetExpenseTotal = expenses.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  const overdue = finance.filter((row) => row.status !== "pago" && row.due_date && new Date(`${row.due_date}T23:59:59`).getTime() < renderedAt);
  const margins = cargas.map((carga) => {
    const rows = finance.filter((row) => row.carga_id === carga.id);
    const revenue = rows.filter((row) => row.tipo === "receita").reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
    const cost = rows.filter((row) => row.tipo === "despesa").reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
    return { carga, revenue, cost, result: revenue - cost };
  }).filter((row) => row.revenue || row.cost).sort((a, b) => b.result - a.result);

  async function markPaid(row: Finance) {
    if (!supabase) return;
    await supabase.from("logistics_finance").update({ status: "pago", paid_at: new Date().toISOString() }).eq("id", row.id);
    reload();
    flash(row.tipo === "receita" ? "Recebimento confirmado" : "Pagamento confirmado");
  }

  return (
    <div className="space-y-4">
      <Header title="DRE — Operação × Empresa" sub="Resultado, Contas a Pagar e Contas a Receber separados por operação, carreta e empresa." icon={LineChart}
        action={<button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={14} /> Novo lançamento</button>} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Kpi label="Receitas" value={money(total.rec)} tone="emerald" />
        <Kpi label="Despesas" value={money(total.desp)} tone="red" />
        <Kpi label="Resultado" value={money(total.saldo)} tone={total.saldo >= 0 ? "emerald" : "red"} />
      </div>
      {(overdue.length > 0 || fleetExpenseTotal > 0) && <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-3 ${overdue.length ? "border-red-500/25 bg-red-500/10" : "border-white/10 bg-white/[.03]"}`}><div className="flex items-center gap-2 text-xs font-semibold"><AlertTriangle size={14} className={overdue.length ? "text-red-300" : "text-zinc-500"} /> {overdue.length} título(s) vencido(s)</div><div className="mt-1 text-[11px] text-zinc-500">{money(overdue.reduce((sum, row) => sum + row.valor, 0))} aguardando baixa.</div></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><Truck size={14} className="text-sky-300" /> Custo técnico da frota</div><div className="mt-1 text-[11px] text-zinc-500">{money(fleetExpenseTotal)} registrado em manutenção.</div></div>
      </div>}
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
              {b.d.rows.slice(0, 20).map((r) => <div key={r.id} className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 border-b border-white/5 py-1"><span className="truncate">{r.descricao || r.categoria}</span><div className="flex shrink-0 items-center gap-2"><span className={r.tipo === "receita" ? "text-emerald-400" : "text-red-400"}>{money(r.valor)}</span>{r.status !== "pago" ? <button onClick={() => markPaid(r)} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:text-white">dar baixa</button> : <span className="text-[9px] text-emerald-500">pago</span>}</div></div>)}
              {b.d.rows.length === 0 && <div className="text-[11px] text-zinc-600 py-2">Sem lançamentos.</div>}
            </div>
          </div>
        ))}
      </div>
      {margins.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="mb-3 text-sm font-semibold">Resultado por operação / carreta</div>
          <div className="grid gap-2 md:grid-cols-2">
            {margins.slice(0, 10).map(({ carga, revenue, cost, result }) => <div key={carga.id} className="rounded-xl border border-white/5 bg-black/20 p-3"><div className="flex justify-between gap-2"><div><div className="font-mono text-[10px] text-amber-300">{carga.codigo}</div><div className="truncate text-xs font-medium">{carga.cliente_nome || carga.produto}</div></div><div className={`text-sm font-bold ${result >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(result)}</div></div><div className="mt-2 flex justify-between text-[10px] text-zinc-600"><span>Receita {money(revenue)}</span><span>Custo {money(cost)}</span></div></div>)}
          </div>
        </div>
      )}
      {showNew && <FinanceModal cid={cid} cargas={cargas} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); flash("Lançamento registrado"); }} />}
    </div>
  );
}

function FinanceModal({ cid, cargas, onClose, onSaved }: { cid: string | null; cargas: Carga[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ escopo: "operacao", tipo: "despesa", categoria: "Frete", descricao: "", valor: "", carga_id: "", status: "aberto", due_date: "" });
  const set = (key: keyof typeof f, value: string) => setF((current) => ({ ...current, [key]: value }));
  async function save() {
    if (!supabase || !cid || !f.descricao.trim()) return;
    await supabase.from("logistics_finance").insert({
      company_id: cid, escopo: f.escopo, tipo: f.tipo, categoria: f.categoria,
      descricao: f.descricao.trim(), valor: Number(f.valor) || 0, carga_id: f.carga_id || null,
      status: f.status, due_date: f.due_date || null,
    });
    onSaved();
  }
  return <Modal title="Novo lançamento financeiro" onClose={onClose}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Field label="Financeiro"><select className="in" value={f.escopo} onChange={(e) => set("escopo", e.target.value)}><option value="operacao">Operação</option><option value="empresa">Empresa</option></select></Field>
    <Field label="Tipo"><select className="in" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="despesa">Conta a pagar</option><option value="receita">Conta a receber</option></select></Field>
    <Field label="Categoria"><select className="in" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{["Pedido de Compra", "Frete", "Fumigação", "Aduana", "Combustível", "Manutenção", "Invoice", "Impostos", "Outros"].map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="Operação / carreta"><select className="in" value={f.carga_id} onChange={(e) => set("carga_id", e.target.value)}><option value="">Empresa / sem operação</option>{cargas.map((carga) => <option key={carga.id} value={carga.id}>{carga.codigo} · {carga.cliente_nome}</option>)}</select></Field>
    <Field label="Descrição"><input className="in" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} /></Field>
    <Field label="Valor (R$)"><input className="in" type="number" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></Field>
    <Field label="Vencimento"><input className="in" type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
  </div><div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="btn-ghost">Cancelar</button><button onClick={save} className="btn-primary">Salvar lançamento</button></div></Modal>;
}

// =============================== SETTINGS MODULE ===============================
function SettingsModule({ cid, cfg, setCfg, isGestor, isOwner, servers, members, cargas, folderAccess, reload, flash }: {
  cid: string | null; cfg: CfgState; setCfg: React.Dispatch<React.SetStateAction<CfgState>>;
  isGestor: boolean; isOwner: boolean; servers: RemoteServer[]; members: TeamMember[]; cargas: Carga[];
  folderAccess: FolderAccess[]; reload: () => void; flash: (t: string, d?: string, k?: string) => void;
}) {
  const [s, setS] = useState({ razao: cfg.razao, cnpj: cfg.cnpj, ie: cfg.ie, endereco: cfg.endereco, phone: cfg.phone, email: cfg.email, server: cfg.server, serverAgentId: cfg.serverAgentId, bank: cfg.bank, signatory: cfg.signatory, signatoryDoc: cfg.signatoryDoc });
  const set = (k: keyof typeof s, v: string) => setS((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const operationsWithFolders = cargas.filter((carga) => carga.folder_id);
  const [permissionCargaId, setPermissionCargaId] = useState(operationsWithFolders[0]?.id || "");
  const permissionCarga = operationsWithFolders.find((carga) => carga.id === permissionCargaId) || null;
  const selectedServer = servers.find((server) => server.id === s.serverAgentId) || null;
  async function save() {
    if (!supabase || !cid) return; setBusy(true);
    const patch = {
      logistics_razao_social: s.razao || null, logistics_cnpj: s.cnpj || null, logistics_ie: s.ie || null,
      address: s.endereco || null, phone: s.phone || null, email: s.email || null, logistics_server_path: s.server || null,
      logistics_server_agent_id: s.serverAgentId || null,
      logistics_bank_info: s.bank || null, logistics_signatory: s.signatory || null, logistics_signatory_doc: s.signatoryDoc || null,
    };
    const { error } = await supabase.from("company_settings").update(patch).eq("company_id", cid);
    if (error) {
      await supabase.from("company_settings").update({
        logistics_razao_social: patch.logistics_razao_social, logistics_cnpj: patch.logistics_cnpj,
        logistics_ie: patch.logistics_ie, address: patch.address, phone: patch.phone, email: patch.email,
        logistics_server_path: patch.logistics_server_path, logistics_bank_info: patch.logistics_bank_info,
        logistics_signatory: patch.logistics_signatory, logistics_signatory_doc: patch.logistics_signatory_doc,
      }).eq("company_id", cid);
    }
    setCfg((c) => ({ ...c, ...s })); setBusy(false); flash("Dados salvos");
  }
  async function setFolderPermission(memberId: string, enabled: boolean, canWrite = false) {
    if (!supabase || !cid || !permissionCarga?.folder_id || !isOwner) return;
    const existing = folderAccess.find((row) => row.folder_id === permissionCarga.folder_id && row.profile_id === memberId);
    if (!enabled) {
      if (existing) await supabase.from("logistics_folder_access").delete().eq("id", existing.id);
    } else {
      await supabase.from("logistics_folder_access").upsert({
        company_id: cid, folder_id: permissionCarga.folder_id, profile_id: memberId,
        can_view: true, can_write: canWrite,
      }, { onConflict: "company_id,folder_id,profile_id" });
    }
    reload();
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <Header title="Dados da Empresa & Servidor" sub="Vão no cabeçalho e rodapé de TODOS os documentos (no lugar da logo/dados de exemplo). A logo é a mesma das Configurações da empresa." icon={Settings} />
      <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          {cfg.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cfg.logo} alt="logo" className="h-12 max-w-[120px] object-contain bg-white/5 rounded p-1" />
          ) : <div className="h-12 w-12 rounded bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px]">sem logo</div>}
          <p className="text-[11px] text-zinc-500">Esta é a logo que entra nos documentos. Troque em <b>Configurações → Marca</b>.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Razão social"><input className="in" value={s.razao} onChange={(e) => set("razao", e.target.value)} disabled={!isGestor} /></Field>
          <Field label="CNPJ"><input className="in" value={s.cnpj} onChange={(e) => set("cnpj", e.target.value)} disabled={!isGestor} /></Field>
          <Field label="Inscrição Estadual"><input className="in" value={s.ie} onChange={(e) => set("ie", e.target.value)} disabled={!isGestor} /></Field>
          <Field label="Telefone"><input className="in" value={s.phone} onChange={(e) => set("phone", e.target.value)} disabled={!isGestor} /></Field>
        </div>
        <Field label="Endereço"><input className="in" value={s.endereco} onChange={(e) => set("endereco", e.target.value)} disabled={!isGestor} placeholder="Rua, nº, bairro – cidade – UF" /></Field>
        <Field label="E-mail"><input className="in" value={s.email} onChange={(e) => set("email", e.target.value)} disabled={!isGestor} /></Field>
        <Field label="Dados bancários / beneficiário (rodapé das faturas)"><textarea className="in" rows={3} value={s.bank} onChange={(e) => set("bank", e.target.value)} disabled={!isGestor} placeholder={"Banco, agência, conta, IBAN/SWIFT, Pix…"} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Assinante (nome)"><input className="in" value={s.signatory} onChange={(e) => set("signatory", e.target.value)} disabled={!isGestor} /></Field>
          <Field label="Doc do assinante (CPF)"><input className="in" value={s.signatoryDoc} onChange={(e) => set("signatoryDoc", e.target.value)} disabled={!isGestor} /></Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Máquina usada como servidor">
            <select className="in" value={s.serverAgentId} onChange={(e) => { const id = e.target.value; const server = servers.find((item) => item.id === id); setS((current) => ({ ...current, serverAgentId: id, server: server?.server_root || current.server })); }} disabled={!isGestor}>
              <option value="">Somente nuvem do Workspace</option>
              {servers.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.status === "online" ? "online" : "offline"}</option>)}
            </select>
          </Field>
          <Field label="Pasta no servidor"><input className="in font-mono text-xs" value={s.server} onChange={(e) => set("server", e.target.value)} disabled={!isGestor} placeholder="C:\\TransLog\\Operacoes" /></Field>
        </div>
        {selectedServer && <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] ${selectedServer.status === "online" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}><Server size={13} /> {selectedServer.name} está {selectedServer.status === "online" ? "online e disponível para sincronização" : "offline; os arquivos ficam na nuvem até a máquina voltar"}.</div>}
        {servers.length === 0 && <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-3 text-[11px] text-zinc-500">Nenhuma máquina foi definida como servidor. Vá em <b>Acesso Remoto</b>, escolha uma máquina e ative “Servidor de arquivos”.</div>}
        <div className="flex items-center gap-2 text-[11px] text-zinc-500"><ShieldCheck size={13} className="text-amber-400" /> Os documentos ficam organizados em TransLog › operação e vinculados ao servidor selecionado.</div>
        {isGestor && <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Salvar"}</button>}
      </div>

      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15} className="text-emerald-300" /> Acesso às pastas das operações</div>
        <p className="mb-3 mt-1 text-[11px] text-zinc-500">Somente o fundador escolhe quem visualiza ou altera os documentos de cada carreta.</p>
        {!isOwner ? <div className="rounded-xl bg-black/20 px-3 py-3 text-xs text-zinc-500">As permissões são controladas pelo fundador deste ambiente.</div> : operationsWithFolders.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] text-zinc-600">Gere o primeiro documento de uma operação para criar sua pasta e liberar acessos.</div> : (
          <div className="space-y-3">
            <Field label="Pasta da operação"><select className="in" value={permissionCargaId} onChange={(e) => setPermissionCargaId(e.target.value)}>{operationsWithFolders.map((carga) => <option key={carga.id} value={carga.id}>{carga.codigo} · {carga.cliente_nome || carga.produto}</option>)}</select></Field>
            <div className="divide-y divide-white/5 rounded-xl border border-white/10">
              {members.filter((member) => member.role !== "gestor").map((member) => {
                const access = folderAccess.find((row) => row.folder_id === permissionCarga?.folder_id && row.profile_id === member.id);
                return <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"><div className="min-w-0"><div className="truncate text-xs font-medium">{member.full_name || member.email}</div><div className="text-[10px] text-zinc-600">{member.role}</div></div><div className="flex items-center gap-3 text-[10px]"><label className="flex items-center gap-1.5 text-zinc-400"><input type="checkbox" checked={Boolean(access?.can_view)} onChange={(e) => setFolderPermission(member.id, e.target.checked, Boolean(access?.can_write))} className="accent-emerald-500" /> visualizar</label><label className="flex items-center gap-1.5 text-zinc-400"><input type="checkbox" checked={Boolean(access?.can_write)} disabled={!access?.can_view} onChange={(e) => setFolderPermission(member.id, true, e.target.checked)} className="accent-amber-500" /> editar</label></div></div>;
              })}
            </div>
          </div>
        )}
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
