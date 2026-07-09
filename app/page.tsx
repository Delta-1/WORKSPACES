"use client";

import { useEffect, useState } from "react";
import { Bot, ClipboardList, LayoutGrid, Megaphone, MessagesSquare, Network, Sliders, SquareKanban } from "lucide-react";
import LoginScreen from "@/components/LoginScreen";
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
import WhatsappHubTab from "@/components/tabs/WhatsappHubTab";
import AtendimentosTab from "@/components/tabs/AtendimentosTab";
import AnnouncementsTab from "@/components/tabs/AnnouncementsTab";
import NewConversationNotifier from "@/components/NewConversationNotifier";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";
import { fetchCompany, updateCompany as persistCompany, type CompanyInfo } from "@/lib/company";
import type { Profile, Role } from "@/lib/types";

type AppDef = { id: string; label: string; icon: typeof Bot; accent: string; roles: Role[] };

const APPS: AppDef[] = [
  { id: "inicio", label: "Início", icon: LayoutGrid, accent: "bg-emerald-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "organograma", label: "Organograma", icon: Network, accent: "bg-purple-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "kanban", label: "Kanban", icon: SquareKanban, accent: "bg-sky-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "whatsapp", label: "WhatsApp", icon: MessagesSquare, accent: "bg-green-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "atendimentos", label: "Atendimentos", icon: ClipboardList, accent: "bg-cyan-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "chat", label: "Copiloto IA", icon: Bot, accent: "bg-indigo-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "arquivos", label: "Arquivos", icon: Network, accent: "bg-blue-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "mural", label: "Mural", icon: Megaphone, accent: "bg-orange-800/60", roles: ["gestor", "gerente", "funcionario"] },
  { id: "config", label: "Configurações", icon: Sliders, accent: "bg-amber-800/60", roles: ["gestor"] },
];

const ROLE_LABEL: Record<Role, string> = {
  gestor: "Gestor Geral",
  gerente: "Administrador de Setor",
  funcionario: "Funcionário",
};

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [demoUser, setDemoUser] = useState<{ name: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(supabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [showTV, setShowTV] = useState(false);
  const [tab, setTab] = useState("inicio");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [company, setCompany] = useState<CompanyInfo>({
    name: "Configuração Pendente",
    logoDataUrl: null,
    tvLogoCorner: "top-left",
    googleDriveEnabled: false,
  });

  const role: Role = profile?.role ?? "gestor";
  const isAuthenticated = Boolean(profile) || Boolean(demoUser);
  const displayName = profile?.full_name ?? profile?.email ?? demoUser?.name ?? "Usuário";

  useEffect(() => {
    fetchCompany()
      .then(setCompany)
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

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
        if (mounted && p) setProfile(p);
      }
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" && session?.user) {
        const p = await loadProfile(session.user);
        if (!mounted) return;
        if (p) setProfile(p);
        if (!sawInitialLogin) {
          sawInitialLogin = true;
          setShowSplash(true);
        }
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
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
    const next = await persistCompany(update);
    setCompany(next);
  }

  const visibleApps = APPS.filter((a) => a.roles.includes(role));

  if (checkingSession) {
    return <div className="fixed inset-0 bg-[#060a12]" />;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleDemoLogin} externalError={authError} />;
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
      <header className="h-16 px-6 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          {company.logoDataUrl ? (
            <img src={company.logoDataUrl} className="w-9 h-9 rounded-lg object-cover" alt="Logo" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400 text-xs font-bold">
              {company.name.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="font-bold leading-tight">{company.name}</h2>
            <p className="text-xs text-gray-500">Workspace Multi-Empresa</p>
          </div>
        </div>
        <ProfileMenu
          name={displayName}
          role={ROLE_LABEL[role]}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onLogout={handleLogout}
        />
      </header>

      <main className="flex-1 overflow-hidden p-6 pb-28">
        {tab === "inicio" && <HomeTab companyName={company.name} profile={profile} onOpenTV={() => setShowTV(true)} />}
        {tab === "organograma" && <OrgChartTab canEdit={role === "gestor"} />}
        {tab === "kanban" && <KanbanTab profile={profile} />}
        {tab === "whatsapp" && <WhatsappHubTab profile={profile} />}
        {tab === "atendimentos" && <AtendimentosTab profile={profile} />}
        {tab === "chat" && <ChatTab />}
        {tab === "arquivos" && <FilesGraphTab profile={profile} />}
        {tab === "mural" && <AnnouncementsTab profile={profile} />}
        {tab === "config" && (
          <ConfigTab
            companyName={company.name}
            tvLogoCorner={company.tvLogoCorner}
            googleDriveEnabled={company.googleDriveEnabled}
            onUpdateCompany={handleUpdateCompany}
          />
        )}
      </main>

      {profile && <NewConversationNotifier onOpen={() => setTab("whatsapp")} />}

      <Dock apps={visibleApps} active={tab} onSelect={setTab} onOpenDrawer={() => setDrawerOpen(true)} />
      <AppDrawer apps={visibleApps} open={drawerOpen} onClose={() => setDrawerOpen(false)} onSelect={setTab} />
    </div>
  );
}
