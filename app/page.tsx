"use client";

import { useEffect, useState } from "react";
import { Bot, Building2, CalendarDays, ClipboardList, FlaskConical, LayoutGrid, Megaphone, MessagesSquare, MonitorSmartphone, Network, ScrollText, Sliders, SquareKanban, Users, Wallet } from "lucide-react";
import LoginScreen from "@/components/LoginScreen";
import OnboardingScreen from "@/components/OnboardingScreen";
import PlansScreen from "@/components/PlansScreen";
import SplashScreen from "@/components/SplashScreen";
import Dock from "@/components/Dock";
import AppDrawer from "@/components/AppDrawer";
import ProfileMenu from "@/components/ProfileMenu";
import TVModeOverlay from "@/components/TVModeOverlay";
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
import ClientsIaTab from "@/components/tabs/ClientsIaTab";
import FinanceTab from "@/components/tabs/FinanceTab";
import AutomationTab from "@/components/tabs/AutomationTab";
import LabsTab from "@/components/tabs/LabsTab";
import Orb from "@/components/Orb";
import LogTab from "@/components/tabs/LogTab";
import MessagesTab from "@/components/tabs/MessagesTab";
import NewConversationNotifier from "@/components/NewConversationNotifier";
import AutoDriveSync from "@/components/AutoDriveSync";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";
import { fetchCompany, updateCompany as persistCompany, type CompanyInfo } from "@/lib/company";
import type { Company, Profile, Role } from "@/lib/types";

type AppDef = { id: string; label: string; icon: typeof Bot; accent: string; roles: Role[] };

const APPS: AppDef[] = [
  { id: "inicio", label: "Início", icon: LayoutGrid, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "organograma", label: "Organograma", icon: Network, accent: "bg-purple-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "kanban", label: "Kanban", icon: SquareKanban, accent: "bg-sky-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "calendario", label: "Calendário", icon: CalendarDays, accent: "bg-rose-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "mensagens", label: "Mensagens", icon: MessagesSquare, accent: "bg-green-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "atendimentos", label: "Atendimentos", icon: ClipboardList, accent: "bg-cyan-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "chat", label: "Copiloto IA", icon: Bot, accent: "bg-indigo-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "arquivos", label: "Arquivos", icon: Network, accent: "bg-blue-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "mural", label: "Mural", icon: Megaphone, accent: "bg-orange-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "funcionarios", label: "Funcionários", icon: Users, accent: "bg-teal-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "financeiro", label: "Financeiro", icon: Wallet, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "clientes", label: "Clientes", icon: Building2, accent: "bg-lime-800/60", roles: ["gestor", "gerente"] },
  { id: "clientes_ia", label: "Clientes.IA", icon: Bot, accent: "bg-indigo-800/60", roles: ["gestor", "gerente"] },
  { id: "remoto", label: "Acesso Remoto", icon: MonitorSmartphone, accent: "bg-fuchsia-800/60", roles: ["gestor", "gerente"] },
  { id: "automacao", label: "Automação", icon: Bot, accent: "bg-cyan-900/60", roles: ["gestor", "gerente"] },
  { id: "labs", label: "Labs", icon: FlaskConical, accent: "bg-indigo-900/60", roles: ["gestor", "gerente"] },
  { id: "log", label: "Log", icon: ScrollText, accent: "bg-slate-700/60", roles: ["gestor", "gerente"] },
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
  const [tab, setTab] = useState("inicio");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false); // copiloto de voz global (tecla "v")
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

  // Atalho "v" chama o copiloto de voz (menos quando está digitando num campo).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "v" && e.key !== "V") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      setCopilotOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const visibleApps = APPS.filter((a) => a.roles.includes(role));

  // Barra de acesso rápido personalizável (salva por navegador).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dock:quickApps") || "[]");
      if (Array.isArray(saved) && saved.length) setQuickIds(saved);
    } catch {
      /* ignore */
    }
  }, []);
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

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between shrink-0 border-b border-white/5">
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
      </header>

      <main className="flex-1 overflow-hidden p-3 sm:p-6 pb-24 sm:pb-28">
        {tab === "inicio" && <HomeTab companyName={company.name} profile={profile} onOpenTV={() => setShowTV(true)} />}
        {tab === "organograma" && <OrgChartTab canEdit={role === "gestor"} />}
        {tab === "kanban" && <KanbanTab profile={profile} />}
        {tab === "calendario" && <CalendarTab profile={profile} />}
        {tab === "mensagens" && <MessagesTab profile={profile} />}
        {tab === "atendimentos" && <AtendimentosTab profile={profile} />}
        {tab === "chat" && <ChatTab />}
        {tab === "arquivos" && <FilesGraphTab profile={profile} />}
        {tab === "mural" && <AnnouncementsTab profile={profile} />}
        {tab === "funcionarios" && <EmployeesTab profile={profile} />}
        {tab === "financeiro" && <FinanceTab profile={profile} />}
        {tab === "clientes" && <ClientsTab profile={profile} />}
        {tab === "clientes_ia" && <ClientsIaTab profile={profile} />}
        {tab === "remoto" && <RemoteAccessTab profile={profile} />}
        {tab === "automacao" && <AutomationTab profile={profile} />}
        {tab === "labs" && <LabsTab profile={profile} />}
        {tab === "log" && <LogTab profile={profile} />}
        {tab === "config" && (
          <ConfigTab
            companyName={company.name}
            companyCode={myCompany?.company_code}
            tvLogoCorner={company.tvLogoCorner}
            googleDriveEnabled={company.googleDriveEnabled}
            themeColor={company.themeColor}
            iconColor={company.iconColor}
            logoSize={company.logoSize}
            themeStyle={company.themeStyle}
            address={company.address}
            addressLink={company.addressLink}
            phone={company.phone}
            email={company.email}
            website={company.website}
            reviewLink={company.reviewLink}
            photoUrl={company.photoUrl}
            autoCloseMinutes={company.autoCloseMinutes}
            description={company.description}
            remoteAgentUrl={company.remoteAgentUrl}
            onUpdateCompany={handleUpdateCompany}
          />
        )}
      </main>

      {copilotOpen && <Orb slot="internal" title="Copilot" autoVoice onClose={() => setCopilotOpen(false)} />}

      {profile && <NewConversationNotifier onOpen={() => setTab("mensagens")} />}
      {profile && <AutoDriveSync />}

      <Dock
        apps={dockApps}
        active={tab}
        onSelect={setTab}
        onOpenDrawer={() => setDrawerOpen((v) => { const next = !v; if (!next) setEditApps(false); return next; })}
        drawerOpen={drawerOpen}
        pinMode={drawerOpen && editApps}
        onPin={pinApp}
        onUnpin={unpinApp}
        onReorder={reorderQuick}
      />
      <AppDrawer
        apps={visibleApps}
        open={drawerOpen}
        editMode={editApps}
        onToggleEdit={() => setEditApps((v) => !v)}
        onClose={() => { setDrawerOpen(false); setEditApps(false); }}
        onSelect={setTab}
        quickIds={dockApps.map((a) => a.id)}
      />
    </div>
  );
}
