"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Building2, CalendarDays, ClipboardList, Crown, Eye, ExternalLink, FileSpreadsheet, FlaskConical, Gamepad2, LayoutGrid, Megaphone, MessagesSquare, MonitorSmartphone, Network, ScrollText, Sliders, SquareKanban, Store, Users, Users2, Wallet, FileText, Brain, Truck } from "lucide-react";
import LoginScreen from "@/components/LoginScreen";
import OnboardingScreen from "@/components/OnboardingScreen";
import PlansScreen from "@/components/PlansScreen";
import TutorialOverlay from "@/components/TutorialOverlay";
import WindowManager from "@/components/WindowManager";
import AppContextMenu from "@/components/AppContextMenu";
import { hasTutorial, WELCOME } from "@/lib/tutorials";
import BlockedScreen from "@/components/BlockedScreen";
import SplashScreen from "@/components/SplashScreen";
import Dock from "@/components/Dock";
import AppDrawer from "@/components/AppDrawer";
import ProfileMenu from "@/components/ProfileMenu";
import TVModeOverlay from "@/components/TVModeOverlay";
import AgentModeOverlay from "@/components/AgentModeOverlay";
import HomeTab from "@/components/tabs/HomeTab";
import ChatTab from "@/components/tabs/ChatTab";
import FilesGraphTab from "@/components/tabs/FilesGraphTab";
import ConfigTab from "@/components/tabs/ConfigTab";
import OrgChartTab from "@/components/tabs/OrgChartTab";
import KanbanTab from "@/components/tabs/KanbanTab";
import CalendarTab from "@/components/tabs/CalendarTab";
import RemoteAccessTab from "@/components/tabs/RemoteAccessTab";
import AtendimentosTab from "@/components/tabs/AtendimentosTab";
import AnnouncementsTab from "@/components/tabs/AnnouncementsTab";
import EmployeesTab from "@/components/tabs/EmployeesTab";
import ClientsTab from "@/components/tabs/ClientsTab";
import FormsTab from "@/components/tabs/FormsTab";
import LogisticsTab from "@/components/tabs/LogisticsTab";
import CarteiraTab from "@/components/tabs/CarteiraTab";
import AppHubTab from "@/components/tabs/AppHubTab";
import ClientsIaTab from "@/components/tabs/ClientsIaTab";
import EnvironmentSwitcher from "@/components/EnvironmentSwitcher";
import VisaoAdmTab from "@/components/tabs/VisaoAdmTab";
import GameTab from "@/components/tabs/GameTab";
import GodsEyeTab from "@/components/tabs/GodsEyeTab";
import PlansTab from "@/components/tabs/PlansTab";
import { appEnabled, type FeatureId } from "@/lib/plan";
import FinanceTab from "@/components/tabs/FinanceTab";
import AutomationTab from "@/components/tabs/AutomationTab";
import LabsTab from "@/components/tabs/LabsTab";
import LogTab from "@/components/tabs/LogTab";
import MessagesTab from "@/components/tabs/MessagesTab";
import GroupTab from "@/components/tabs/GroupTab";
import StudioTab from "@/components/tabs/StudioTab";
import ContactsTab from "@/components/tabs/ContactsTab";
import MemoriesTab from "@/components/tabs/MemoriesTab";
import NewConversationNotifier from "@/components/NewConversationNotifier";
import AutoDriveSync from "@/components/AutoDriveSync";
import ShortcutCreator from "@/components/ShortcutCreator";
import LinksTab from "@/components/tabs/LinksTab";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";
import { openWorkspaceShortcut, type WorkspaceShortcut } from "@/lib/workspace-shortcuts";
import { fetchCompany, updateCompany as persistCompany, type CompanyInfo } from "@/lib/company";
import type { Company, Profile, Role } from "@/lib/types";

type AppDef = { id: string; label: string; icon: typeof Bot; accent: string; roles: Role[] };
export type DockPosition = "bottom" | "top" | "left" | "right";
export type OsTheme = "workspace" | "mac" | "windows" | "linux";
export type AnimStyle = "workspace" | "mac" | "windows" | "linux" | "fun" | "none";

const APPS: AppDef[] = [
  { id: "inicio", label: "Início", icon: LayoutGrid, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "organograma", label: "Organograma", icon: Network, accent: "bg-purple-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "kanban", label: "Kanban", icon: SquareKanban, accent: "bg-sky-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "calendario", label: "Calendário", icon: CalendarDays, accent: "bg-rose-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "group", label: "Group", icon: Users2, accent: "bg-indigo-800/60", roles: ["gestor", "gerente", "funcionario"] },
  // Estúdio unificado: Documentos (currículo, monografia, contrato…) e
  // Apresentações moram dentro dele. Os apps "Estúdio Acadêmico" e
  // "Apresentações" deixaram de existir como ícones próprios.
  { id: "estudio", label: "Estúdio", icon: FileText, accent: "bg-blue-900/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "mensagens", label: "Mensagens", icon: MessagesSquare, accent: "bg-green-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "contatos", label: "Contatos", icon: Users, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "atendimentos", label: "Atendimentos", icon: ClipboardList, accent: "bg-cyan-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "chat", label: "Copiloto IA", icon: Bot, accent: "bg-indigo-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "arquivos", label: "Arquivos", icon: Network, accent: "bg-blue-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "links", label: "Links", icon: ExternalLink, accent: "bg-cyan-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "mural", label: "Mural", icon: Megaphone, accent: "bg-orange-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "funcionarios", label: "Funcionários", icon: Users, accent: "bg-teal-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "financeiro", label: "Financeiro", icon: Wallet, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "clientes", label: "Clientes", icon: Building2, accent: "bg-lime-800/60", roles: ["gestor", "gerente"] },
  { id: "formularios", label: "Formulários", icon: FileSpreadsheet, accent: "bg-teal-800/60", roles: ["gestor", "gerente"] },
  { id: "logistica", label: "Logística Internacional", icon: Truck, accent: "bg-amber-900/60", roles: ["gestor", "gerente", "funcionario"] },
  // Carteira: cobranças (o antigo app "Cobrador") + o que entrou na conta
  // Mercado Pago. Eram dois ícones para a mesma história — quem cobra quer ver
  // se virou dinheiro —, então viraram um só.
  { id: "carteira", label: "Carteira", icon: Wallet, accent: "bg-emerald-900/60", roles: ["gestor", "gerente"] },
  { id: "apphub", label: "App Hub", icon: Store, accent: "bg-violet-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "clientes_ia", label: "Work.IA", icon: Bot, accent: "bg-indigo-800/60", roles: ["gestor", "gerente"] },
  { id: "remoto", label: "Acesso Remoto", icon: MonitorSmartphone, accent: "bg-fuchsia-800/60", roles: ["gestor", "gerente"] },
  { id: "automacao", label: "Automação", icon: Bot, accent: "bg-cyan-900/60", roles: ["gestor", "gerente"] },
  { id: "labs", label: "Labs", icon: FlaskConical, accent: "bg-indigo-900/60", roles: ["gestor", "gerente"] },
  { id: "memorias", label: "Memórias", icon: Brain, accent: "bg-indigo-800/60", roles: ["gestor", "gerente"] },
  { id: "log", label: "Log", icon: ScrollText, accent: "bg-slate-700/60", roles: ["gestor", "gerente"] },
  { id: "planos", label: "Planos", icon: Wallet, accent: "bg-emerald-900/60", roles: ["gestor"] },
  { id: "config", label: "Configurações", icon: Sliders, accent: "bg-amber-800/60", roles: ["gestor"] },
];

function lightenHex(hex: string, percent: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const ROLE_LABEL: Record<Role, string> = {
  gestor: "Gestor Geral",
  gerente: "Administrador de Setor",
  funcionario: "Funcionário",
};

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myCompany, setMyCompany] = useState<Company | null>(null);
  const [demoUser, setDemoUser] = useState<{ name: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(supabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [showTV, setShowTV] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const agentModeActiveRef = useRef(false);
  const [tab, setTab] = useState("inicio");
  // Qual tutorial mostrar agora (null = nenhum). O WELCOME abre uma vez logo
  // após entrar; os de app abrem na primeira vez que a pessoa abre aquele app.
  const [tutorial, setTutorial] = useState<string | null>(null);
  // A barra de apps pode ir para qualquer lado — preferência de cada pessoa.
  const [dockPosition, setDockPosition] = useState<DockPosition>("bottom");
  const [osTheme, setOsTheme] = useState<OsTheme>("workspace");
  const [animStyle, setAnimStyle] = useState<AnimStyle>("workspace");
  const [remoteDesktopAvailable, setRemoteDesktopAvailable] = useState(true);
  // Janelas flutuantes abertas (abrir Kanban e Calendário ao mesmo tempo).
  const [janelas, setJanelas] = useState<{ id: string; z: number; min: boolean }[]>([]);
  const zTopo = useRef(20);
  // Menu do botão direito num ícone de app (abrir em janela, fixar/desafixar).
  const [appMenu, setAppMenu] = useState<{ id: string; label: string; x: number; y: number; fixado: boolean } | null>(null);
  const [msgTarget, setMsgTarget] = useState<{ phone: string; name: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutCreatorOpen, setShortcutCreatorOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<WorkspaceShortcut[]>([]);
  const [copilotPushToTalk, setCopilotPushToTalk] = useState(false);
  const copilotVoiceHeldRef = useRef(false);
  const [editApps, setEditApps] = useState(false); // modo edição (lápis) do menu de apps
  const [quickIds, setQuickIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [company, setCompany] = useState<CompanyInfo>({
    name: "Workspace",
    logoDataUrl: null,
    tvLogoCorner: "top-left",
    googleDriveEnabled: false,
    themeColor: "#10b981",
    iconColor: "#10b981",
    logoSize: 36,
    themeStyle: "aurora",
    address: null,
    addressLink: null,
    phone: null,
    email: null,
    website: null,
    reviewLink: null,
    photoUrl: null,
    autoCloseMinutes: 0,
    description: null,
    remoteAgentUrl: null,
  });

  useEffect(() => {
    const openApp = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) { setTab(id); setDrawerOpen(false); }
    };
    window.addEventListener("workspace-open-app", openApp);
    return () => window.removeEventListener("workspace-open-app", openApp);
  }, []);

  const role: Role = profile?.role ?? "gestor";
  const isAuthenticated = Boolean(profile) || Boolean(demoUser);
  const displayName = profile?.full_name ?? profile?.email ?? demoUser?.name ?? "Usuário";

  // Recarrega as configurações da EMPRESA do usuário (nome/logo/tema/contato).
  // Refaz quando a empresa muda (login), pois a RLS precisa da sessão pronta.
  useEffect(() => {
    fetchCompany()
      .then(setCompany)
      .catch(() => {});
  }, [profile?.company_id]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  function beginCopilotPushToTalk() {
    if (!agentModeActiveRef.current) return;
    if (copilotVoiceHeldRef.current) return;
    copilotVoiceHeldRef.current = true;
    setCopilotPushToTalk(true);
  }
  function endCopilotPushToTalk() {
    if (!copilotVoiceHeldRef.current) return;
    copilotVoiceHeldRef.current = false;
    setCopilotPushToTalk(false);
  }
  function openAgentMode() {
    agentModeActiveRef.current = true;
    setShowAgent(true);
  }
  function closeAgentMode() {
    endCopilotPushToTalk();
    agentModeActiveRef.current = false;
    setShowAgent(false);
  }

  // V só funciona no computador e dentro do Modo Agente. Fora dele, a tecla
  // continua livre para digitação e não abre um assistente global.
  useEffect(() => {
    const isVoiceKey = (event: KeyboardEvent) => event.code === "KeyV" || event.key.toLocaleLowerCase("pt-BR") === "v";
    function onKeyDown(e: KeyboardEvent) {
      if (!agentModeActiveRef.current) return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (!isVoiceKey(e)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.documentElement.dataset.remoteViewerActive === "true") return;
      e.preventDefault();
      beginCopilotPushToTalk();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!isVoiceKey(e) || !copilotVoiceHeldRef.current) return;
      e.preventDefault();
      endCopilotPushToTalk();
    }
    function onBlur() {
      endCopilotPushToTalk();
    }
    function onVisibilityChange() {
      if (document.hidden) endCopilotPushToTalk();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const color = company.themeColor || "#10b981";
    const root = document.documentElement;
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-hover", lightenHex(color, 18));
    // Barra do navegador / topo do app instalado (PWA) segue a cor tema da empresa.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }, [company.themeColor]);

  // Cor dos ícones/realces (independente da cor tema). Só sobrescreve o verde
  // padrão quando o gestor escolhe outra cor — assim o visual padrão não muda.
  useEffect(() => {
    const root = document.documentElement;
    const icon = company.iconColor || company.themeColor || "#10b981";
    root.style.setProperty("--icon", icon);
    root.classList.toggle("custom-icons", icon.toLowerCase() !== "#10b981");
  }, [company.iconColor, company.themeColor]);

  // Estilo do site (tema visual completo): muda fundo, vidro, cantos e vibe.
  useEffect(() => {
    document.documentElement.setAttribute("data-style", company.themeStyle || "aurora");
  }, [company.themeStyle]);

  async function loadCompany(companyId: string | null) {
    if (!supabase || !companyId) {
      setMyCompany(null);
      return;
    }
    const { data } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
    setMyCompany((data as Company | null) ?? null);
  }

  // Marca um tutorial como visto — no estado local (para sumir na hora) e no
  // banco (para não voltar no próximo acesso, nem em outro aparelho).
  async function marcarTutorial(id: string) {
    setTutorial(null);
    setProfile((p) => (p ? { ...p, tutorials_done: { ...(p.tutorials_done ?? {}), [id]: true } } : p));
    if (supabase && profile?.id) {
      const novo = { ...(profile.tutorials_done ?? {}), [id]: true };
      await supabase.from("profiles").update({ tutorials_done: novo }).eq("id", profile.id);
    }
  }

  // Reabre todos os tutoriais (Configurações → Rever tutoriais). Zera o mapa e
  // mostra o de boas-vindas de novo.
  async function reverTutoriais() {
    setProfile((p) => (p ? { ...p, tutorials_done: {} } : p));
    if (supabase && profile?.id) await supabase.from("profiles").update({ tutorials_done: {} }).eq("id", profile.id);
    setTab("inicio");
    setTutorial(WELCOME);
  }

  // Decide o tutorial a mostrar: boas-vindas uma vez, depois o guia da aba
  // aberta na primeira visita. Só roda com perfil já carregado e nenhum
  // overlay aberto — não empilha guias nem interrompe quem já está lendo um.
  useEffect(() => {
    if (!profile || tutorial) return;
    const vistos = profile.tutorials_done ?? {};
    const alvo = !vistos[WELCOME] ? WELCOME : hasTutorial(tab) && !vistos[tab] ? tab : null;
    // Fora do corpo do efeito (microtask) para não disparar setState síncrono
    // no meio do render — o que o compilador do React reclama com razão.
    if (alvo) queueMicrotask(() => setTutorial(alvo));
  }, [profile, tab, tutorial]);

  // Recarrega perfil + empresa após onboarding / escolha de plano.
  async function refreshIdentity() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("ensure_profile", { p_full_name: null, p_avatar_url: null });
    if (!error && data) {
      const p = data as Profile;
      setProfile(p);
      await loadCompany(p.company_id);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let mounted = true;
    let sawInitialLogin = false;

    async function loadProfile(
      authUser: { user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string } },
      attempt = 1
    ): Promise<Profile | null> {
      if (!supabase) return null;
      const fullName = authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null;
      const avatarUrl = authUser.user_metadata?.avatar_url ?? authUser.user_metadata?.picture ?? null;
      const { data, error } = await supabase.rpc("ensure_profile", {
        p_full_name: fullName,
        p_avatar_url: avatarUrl,
      });
      if (error) {
        // Right after a schema change the API cache can lag briefly; retry once.
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 800));
          return loadProfile(authUser, attempt + 1);
        }
        setAuthError(`Não consegui carregar seu perfil (${error.message}). Tente entrar novamente.`);
        return null;
      }
      setAuthError(null);
      return data as Profile | null;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const p = await loadProfile(data.session.user);
        if (mounted && p) {
          setProfile(p);
          await loadCompany(p.company_id);
          // Garante a CASA pessoal (grátis, inclusa) — calendário/arquivos próprios.
          if (p.company_id && supabase) { try { await supabase.rpc("ensure_personal_home"); } catch { /* ok */ } }
        }
      }
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" && session?.user) {
        const p = await loadProfile(session.user);
        if (!mounted) return;
        if (p) {
          setProfile(p);
          await loadCompany(p.company_id);
        }
        if (!sawInitialLogin) {
          sawInitialLogin = true;
          setShowSplash(true);
        }
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setMyCompany(null);
        setTab("inicio");
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  function handleDemoLogin(name: string) {
    setDemoUser({ name });
    setShowSplash(true);
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setDemoUser(null);
    setTab("inicio");
  }

  async function handleUpdateCompany(update: Partial<CompanyInfo>) {
    setCompany((prev) => ({ ...prev, ...update })); // feedback imediato
    const next = await persistCompany(update, profile?.company_id ?? myCompany?.id ?? null);
    setCompany((prev) => ({ ...next, themeColor: update.themeColor ?? next.themeColor, iconColor: update.iconColor ?? next.iconColor, logoSize: update.logoSize ?? next.logoSize, themeStyle: update.themeStyle ?? next.themeStyle }));
  }

  // Administrador Geral (super admin) — só o dono do software. Ganha a aba "Empresas".
  const [superAdmin, setSuperAdmin] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("is_super_admin").then(({ data }) => {
      setSuperAdmin(!!data);
      if (data) supabase!.rpc("ensure_hub"); // garante a casa HUB do admin geral
    });
  }, []);

  // Plano da empresa: quais ferramentas estão ligadas (null = todas).
  const [enabledFeatures, setEnabledFeatures] = useState<FeatureId[] | null>(null);
  const [gameEnabled, setGameEnabled] = useState(false); // Modo Game ligado nas Configurações
  useEffect(() => {
    if (!supabase || !profile?.company_id) return;
    supabase.from("company_settings").select("enabled_features, game_enabled").eq("company_id", profile.company_id).maybeSingle()
      .then(({ data }) => {
        setEnabledFeatures((data?.enabled_features as FeatureId[]) ?? null);
        setGameEnabled(!!data?.game_enabled);
      });
  }, [profile?.company_id]);

  // App "Game" (ícone de controle): só em conta Casa e com o Modo Game ligado.
  const showGame = myCompany?.company_type === "Casa" && gameEnabled;

  // Mesma checagem (cargo + override por funcionário + ferramenta do plano) usada
  // para montar o menu de apps — reaproveitada para liberar/esconder a sub-aba
  // de Automação dentro do Labs, sem duplicar a regra de permissão.
  const canAccessApp = (appId: string): boolean => {
    if (appId === "remoto" && !remoteDesktopAvailable) return false;
    if (appId === "clientes_ia" && !superAdmin) return false; // exclusivo do Admin Geral
    const ta = profile?.tool_access as Record<string, boolean> | null | undefined;
    const hasOverride = !!(ta && Object.prototype.hasOwnProperty.call(ta, appId));
    if (hasOverride && ta![appId] === false) return false; // bloqueado p/ esta pessoa
    const def = APPS.find((a) => a.id === appId);
    const roleOk = !!def && (def.roles.includes(role) || (hasOverride && ta![appId] === true)); // liberado supera o cargo
    const featOk = superAdmin || appId === "planos" || appId === "links" || appEnabled(appId, enabledFeatures); // super admin vê TUDO; empresa precisa ter a ferramenta
    return roleOk && featOk;
  };

  // VisãoADM é a central do Administrador Geral: aparece para o super admin em
  // QUALQUER ambiente (não depende mais de estar numa casa chamada "HUB").
  const visibleApps: AppDef[] = [
    ...(superAdmin ? [
      { id: "visaoadm", label: "VisãoADM", icon: Crown, accent: "bg-amber-900/60", roles: [] as Role[] },
      { id: "godseye", label: "God's Eye", icon: Eye, accent: "bg-red-900/60", roles: [] as Role[] },
    ] : []),
    ...APPS.filter((a) => canAccessApp(a.id)),
    ...(showGame ? [{ id: "game", label: "Game", icon: Gamepad2, accent: "bg-fuchsia-900/60", roles: [] as Role[] }] : []),
  ];

  // Barra de acesso rápido personalizável (salva por navegador).
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const sync = () => setRemoteDesktopAvailable(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dock:quickApps") || "[]");
      // O Cobrador virou uma aba da Carteira; quem o tinha fixado passa a ver a
      // Carteira no mesmo lugar, em vez de perder o atalho em silêncio.
      const migrado = Array.isArray(saved)
        ? [...new Set(saved.map((id: string) => (id === "cobrador" ? "carteira" : id)))]
        : [];
      if (migrado.length) setQuickIds(migrado);
    } catch {
      /* ignore */
    }
    try {
      const p = localStorage.getItem("dock:pos") as DockPosition | null;
      if (p === "bottom" || p === "top" || p === "left" || p === "right") setDockPosition(p);
      const os = localStorage.getItem("os:theme") as OsTheme | null;
      if (os === "workspace" || os === "mac" || os === "windows" || os === "linux") setOsTheme(os);
      const a = localStorage.getItem("anim:style") as AnimStyle | null;
      if (a === "workspace" || a === "mac" || a === "windows" || a === "linux" || a === "fun" || a === "none") setAnimStyle(a);
    } catch { /* ignore */ }
  }, []);

  // Atalhos são metadados leves. Links compartilhados são materializados pelo
  // agente no servidor; aqui carregamos só o índice necessário para abrir rápido.
  useEffect(() => {
    if (!supabase || !profile?.id) { setShortcuts([]); return; }
    const client = supabase;
    const loadShortcuts = async () => {
      const { data } = await client.from("workspace_shortcuts").select("*, groups(name)").order("updated_at", { ascending: false });
      setShortcuts((data as WorkspaceShortcut[]) ?? []);
    };
    void loadShortcuts();
    const changed = () => void loadShortcuts();
    window.addEventListener("workspace-shortcuts-changed", changed);
    return () => window.removeEventListener("workspace-shortcuts-changed", changed);
  }, [profile?.id, profile?.company_id]);

  // Aplica o estilo de animação na raiz — o CSS em globals.css faz o resto.
  useEffect(() => { document.documentElement.setAttribute("data-anim", animStyle); }, [animStyle]);
  useEffect(() => { document.documentElement.setAttribute("data-os-theme", osTheme); }, [osTheme]);
  const mudarAnim = (a: AnimStyle) => { setAnimStyle(a); try { localStorage.setItem("anim:style", a); } catch {} };
  function saveQuick(ids: string[]) {
    setQuickIds(ids);
    try {
      localStorage.setItem("dock:quickApps", JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }
  const validQuick = quickIds.filter((id) => visibleApps.some((a) => a.id === id));
  const dockApps = validQuick.length ? (validQuick.map((id) => visibleApps.find((a) => a.id === id)!) ) : visibleApps.slice(0, 5);
  const pinnedShortcuts = shortcuts.filter((shortcut) => shortcut.pin_to_dock && shortcut.scope !== "group").slice(0, 6);
  const openShortcut = (shortcut: WorkspaceShortcut) => openWorkspaceShortcut(shortcut, (id) => { setTab(id); setDrawerOpen(false); });

  // Fixar/desafixar apps na barra (arrastando do menu pra barra, estilo inventário).
  function pinApp(id: string) {
    const base = validQuick.length ? validQuick : dockApps.map((a) => a.id);
    if (base.includes(id)) return;
    saveQuick([...base, id]);
  }
  function unpinApp(id: string) {
    const base = validQuick.length ? validQuick : dockApps.map((a) => a.id);
    saveQuick(base.filter((x) => x !== id));
  }
  // Reordena a barra de atalho: move `id` para a posição de `beforeId`.
  function reorderQuick(id: string, beforeId: string) {
    const base = (validQuick.length ? validQuick : dockApps.map((a) => a.id)).slice();
    const from = base.indexOf(id);
    if (from === -1) return;
    base.splice(from, 1);
    const to = base.indexOf(beforeId);
    base.splice(to === -1 ? base.length : to, 0, id);
    saveQuick(base);
  }

  // ── barra + janelas ────────────────────────────────────────────────────────
  const abrirNaTela = (id: string) => { setTab(id); setDrawerOpen(false); };
  // Abre o menu do botão direito para um app, na posição do clique.
  const abrirAppMenu = (id: string, x: number, y: number) => {
    const label = APPS.find((a) => a.id === id)?.label ?? id;
    setAppMenu({ id, label, x, y, fixado: (validQuick.length ? validQuick : dockApps.map((a) => a.id)).includes(id) });
  };
  const mudarDock = (p: DockPosition) => { setDockPosition(p); try { localStorage.setItem("dock:pos", p); } catch {} };
  const mudarOsTheme = (next: OsTheme) => {
    setOsTheme(next);
    try { localStorage.setItem("os:theme", next); } catch {}
    // Cada tema já nasce com a disposição que lembra o sistema escolhido.
    mudarDock(next === "linux" ? "left" : "bottom");
    mudarAnim(next);
  };
  const abrirJanela = (id: string) => {
    setJanelas((js) => js.some((j) => j.id === id)
      ? js.map((j) => j.id === id ? { ...j, min: false, z: ++zTopo.current } : j)  // já aberta → traz à frente
      : [...js, { id, z: ++zTopo.current, min: false }]);
  };
  const fecharJanela = (id: string) => setJanelas((js) => js.filter((j) => j.id !== id));
  const focarJanela = (id: string) => setJanelas((js) => js.map((j) => j.id === id ? { ...j, z: ++zTopo.current } : j));
  const minimizarJanela = (id: string) => setJanelas((js) => js.map((j) => j.id === id ? { ...j, min: !j.min } : j));

  // Onde a barra flutua decide de que lado o conteúdo ganha respiro.
  const mainPad =
    dockPosition === "top" ? "pt-24 sm:pt-28" :
    dockPosition === "left" ? "pl-20 sm:pl-24" :
    dockPosition === "right" ? "pr-20 sm:pr-24" :
    "pb-24 sm:pb-28";

  // O "roteador de apps": dado um id, devolve o app montado. Existe como função
  // (não como JSX solto dentro do <main>) porque agora o mesmo app é desenhado
  // em DOIS lugares — na tela principal e dentro de uma janela flutuante. Uma
  // fonte só evita as duas versões divergirem.
  const renderApp = (appId: string): React.ReactNode => {
    switch (appId) {
      case "inicio": return <HomeTab companyName={company.name} profile={profile} onOpenTV={() => setShowTV(true)} onOpenAgent={openAgentMode} />;
      case "organograma": return <OrgChartTab canEdit={role === "gestor"} profile={profile} />;
      case "kanban": return <KanbanTab profile={profile} />;
      case "calendario": return <CalendarTab profile={profile} />;
      case "group": return <GroupTab profile={profile} onOpenApp={(id) => setTab(id)} />;
      // ids antigos ("academico"/"apresentacoes") ainda caem no Estúdio.
      case "estudio": case "academico": case "apresentacoes": return <StudioTab profile={profile} />;
      case "mensagens": return <MessagesTab profile={profile} openTarget={msgTarget} onTargetHandled={() => setMsgTarget(null)} />;
      case "contatos": return <ContactsTab profile={profile} onOpenMessages={(phone, name) => { setMsgTarget({ phone, name }); setTab("mensagens"); }} />;
      case "atendimentos": return <AtendimentosTab profile={profile} />;
      case "chat": return <ChatTab />;
      case "arquivos": return <FilesGraphTab profile={profile} />;
      case "links": return <LinksTab profile={profile} onOpenApp={(id) => setTab(id)} onCreate={() => setShortcutCreatorOpen(true)} />;
      case "mural": return <AnnouncementsTab profile={profile} />;
      case "funcionarios": return <EmployeesTab profile={profile} />;
      case "financeiro": return <FinanceTab profile={profile} />;
      case "clientes": return <ClientsTab profile={profile} onOpenMessages={(phone, name) => { setMsgTarget({ phone, name }); setTab("mensagens"); }} />;
      case "formularios": return <FormsTab profile={profile} />;
      case "logistica": return <LogisticsTab profile={profile} />;
      case "carteira": return <CarteiraTab profile={profile} onOpenMessages={(phone, name) => { setMsgTarget({ phone, name }); setTab("mensagens"); }} />;
      case "apphub": return <AppHubTab profile={profile} superAdmin={superAdmin} />;
      case "clientes_ia": return superAdmin ? <ClientsIaTab profile={profile} /> : null;
      case "visaoadm": return superAdmin ? <VisaoAdmTab /> : null;
      case "godseye": return superAdmin ? <GodsEyeTab /> : null;
      case "game": return showGame ? <GameTab profile={profile} /> : null;
      case "planos": return <PlansTab />;
      case "remoto": return <RemoteAccessTab profile={profile} />;
      case "automacao": return <AutomationTab profile={profile} />;
      case "labs": return <LabsTab profile={profile} canUseAutomation={canAccessApp("automacao")} />;
      case "memorias": return <MemoriesTab profile={profile} />;
      case "log": return <LogTab profile={profile} />;
      case "config": return (
        <ConfigTab
          companyName={company.name} companyCode={myCompany?.company_code} tvLogoCorner={company.tvLogoCorner}
          googleDriveEnabled={company.googleDriveEnabled} themeColor={company.themeColor} iconColor={company.iconColor}
          logoSize={company.logoSize} themeStyle={company.themeStyle} address={company.address} addressLink={company.addressLink}
          phone={company.phone} email={company.email} website={company.website} reviewLink={company.reviewLink}
          photoUrl={company.photoUrl} autoCloseMinutes={company.autoCloseMinutes} description={company.description}
          remoteAgentUrl={company.remoteAgentUrl} onUpdateCompany={handleUpdateCompany} onReplayTutorials={reverTutoriais}
          dockPosition={dockPosition} onDockPosition={mudarDock}
          osTheme={osTheme} onOsTheme={mudarOsTheme}
          animStyle={animStyle} onAnimStyle={mudarAnim}
        />
      );
      default: return null;
    }
  };

  if (checkingSession) {
    return <div className="fixed inset-0 bg-[#060a12]" />;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleDemoLogin} externalError={authError} />;
  }

  // Usuário logado mas sem empresa → onboarding (criar empresa ou entrar com código)
  if (profile && !profile.company_id) {
    return <OnboardingScreen onDone={refreshIdentity} onLogout={handleLogout} />;
  }

  // Dono de empresa recém-criada ainda sem plano escolhido → tela de planos
  if (profile && myCompany && myCompany.owner_id === profile.id && myCompany.subscription_status === "trial") {
    return <PlansScreen company={myCompany} onDone={refreshIdentity} onLogout={handleLogout} />;
  }

  // Bloqueio automático por falta de pagamento: a empresa foi marcada como
  // "blocked"/"past_due" (aviso do Mercado Pago) ou a licença venceu. O
  // Administrador Geral, as contas Casa e o HUB nunca são bloqueados. O dono
  // vê a tela com opção de reativar; o funcionário vê só o aviso.
  if (profile && myCompany && !superAdmin) {
    const isHome = myCompany.company_type === "Casa" || myCompany.name === "HUB";
    const st = myCompany.subscription_status;
    const licMs = myCompany.license_until ? new Date(myCompany.license_until).getTime() : null;
    const expired = licMs !== null && licMs < Date.now();
    // "pending" = escolheu o plano mas ainda NÃO pagou (ou voltou do Mercado Pago
    // sem concluir). Nesse caso NÃO pode ver o site — vai para a tela de pagamento.
    const blocked = !isHome && st !== "trial" && (st === "blocked" || st === "past_due" || st === "pending" || expired);
    if (blocked) {
      return <BlockedScreen company={myCompany} isOwner={myCompany.owner_id === profile.id} onLogout={handleLogout} />;
    }
  }

  if (showSplash) {
    return (
      <SplashScreen
        companyName={company.name}
        logoDataUrl={company.logoDataUrl}
        onDone={() => setShowSplash(false)}
      />
    );
  }

  if (showTV) {
    return (
      <TVModeOverlay
        companyName={company.name}
        logoDataUrl={company.logoDataUrl}
        corner={company.tvLogoCorner}
        onClose={() => setShowTV(false)}
      />
    );
  }

  if (showAgent) {
    return (
      <AgentModeOverlay
        companyName={company.name}
        logoDataUrl={company.logoDataUrl}
        pushToTalkActive={copilotPushToTalk}
        onClose={closeAgentMode}
      />
    );
  }

  return (
    <div className="workspace-shell h-screen [height:100dvh] w-screen flex flex-col overflow-hidden">
      <header className="workspace-header h-16 px-4 sm:px-6 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          {company.logoDataUrl ? (
            <img
              src={company.logoDataUrl}
              style={{ width: company.logoSize, height: company.logoSize }}
              className="rounded-lg object-cover shrink-0"
              alt="Logo"
            />
          ) : (
            // Sem logo personalizada → mostra a logo padrão do site (Workspace).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/icon.png"
              style={{ width: company.logoSize, height: company.logoSize }}
              className="rounded-lg object-cover shrink-0"
              alt="Workspace"
            />
          )}
          <div>
            <h2 className="font-bold leading-tight">{company.name}</h2>
            <p className="text-xs text-gray-500">{company.description || "Workspace Multi-Empresa"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <EnvironmentSwitcher />
        <ProfileMenu
          name={displayName}
          role={ROLE_LABEL[role]}
          theme={theme}
          profileId={profile?.id}
          avatarUrl={profile?.avatar_url}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onLogout={handleLogout}
          onProfileUpdated={(patch) =>
            setProfile((p) => (p ? { ...p, full_name: patch.full_name ?? p.full_name, avatar_url: patch.avatar_url ?? p.avatar_url } : p))
          }
        />
        </div>
      </header>

      <main className={`workspace-main flex-1 overflow-hidden p-3 sm:p-6 ${mainPad}`}>
        {/* key={tab} faz a tela re-animar a cada troca de app, no estilo escolhido. */}
        <div key={tab} className="app-anim h-full">{renderApp(tab)}</div>
      </main>

      {/* Janelas flutuantes: abrir vários apps ao mesmo tempo, como no desktop. */}
      <WindowManager
        windows={janelas}
        titleOf={(id) => APPS.find((a) => a.id === id)?.label ?? id}
        render={renderApp}
        onClose={fecharJanela}
        onFocus={focarJanela}
        onMinimize={minimizarJanela}
      />
      <AppContextMenu
        alvo={appMenu}
        onAbrirJanela={abrirJanela}
        onAbrirTela={abrirNaTela}
        onFixar={pinApp}
        onDesafixar={unpinApp}
        onClose={() => setAppMenu(null)}
      />

      {profile && <NewConversationNotifier onOpen={() => setTab("mensagens")} />}
      {profile && <AutoDriveSync />}
      {tutorial && <TutorialOverlay appId={tutorial} onClose={() => marcarTutorial(tutorial)} />}

      <Dock
        apps={dockApps}
        wheelApps={visibleApps}
        active={tab}
        onSelect={setTab}
        onOpenDrawer={() => setDrawerOpen((v) => { const next = !v; if (!next) setEditApps(false); return next; })}
        drawerOpen={drawerOpen}
        pinMode={drawerOpen && editApps}
        onPin={pinApp}
        onUnpin={unpinApp}
        onReorder={reorderQuick}
        position={dockPosition}
        onContext={abrirAppMenu}
        shortcuts={pinnedShortcuts}
        onShortcut={openShortcut}
        onAddShortcut={() => setShortcutCreatorOpen(true)}
      />
      <AppDrawer
        apps={visibleApps}
        open={drawerOpen}
        editMode={editApps}
        onToggleEdit={() => setEditApps((v) => !v)}
        onClose={() => { setDrawerOpen(false); setEditApps(false); }}
        onSelect={setTab}
        quickIds={dockApps.map((a) => a.id)}
        onContext={abrirAppMenu}
        shortcuts={shortcuts}
        onShortcut={openShortcut}
        onAddShortcut={() => { setDrawerOpen(false); setShortcutCreatorOpen(true); }}
      />
      <ShortcutCreator open={shortcutCreatorOpen} onClose={() => setShortcutCreatorOpen(false)} profile={profile} />
    </div>
  );
}
