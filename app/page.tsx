"use client";

import { useEffect, useState } from "react";
import { Bot, LayoutGrid, MessageCircle, Network, Sliders } from "lucide-react";
import LoginScreen from "@/components/LoginScreen";
import SplashScreen from "@/components/SplashScreen";
import Dock from "@/components/Dock";
import AppDrawer from "@/components/AppDrawer";
import ProfileMenu from "@/components/ProfileMenu";
import HomeTab from "@/components/tabs/HomeTab";
import ChatTab from "@/components/tabs/ChatTab";
import WhatsappTab from "@/components/tabs/WhatsappTab";
import FilesGraphTab from "@/components/tabs/FilesGraphTab";
import ConfigTab from "@/components/tabs/ConfigTab";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

const APPS = [
  { id: "inicio", label: "Início", icon: LayoutGrid, accent: "bg-emerald-800/60" },
  { id: "chat", label: "Copiloto IA", icon: Bot, accent: "bg-indigo-800/60" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, accent: "bg-green-800/60" },
  { id: "arquivos", label: "Arquivos", icon: Network, accent: "bg-blue-800/60" },
  { id: "config", label: "Configurações", icon: Sliders, accent: "bg-amber-800/60" },
];

type SessionUser = { name: string; email: string; role: "Administrador" | "Funcionário" };

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(supabaseConfigured);
  const [showSplash, setShowSplash] = useState(false);
  const [tab, setTab] = useState("inicio");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [company, setCompany] = useState<{ name: string; logoDataUrl: string | null }>({
    name: "Configuração Pendente",
    logoDataUrl: null,
  });

  useEffect(() => {
    fetch("/api/company")
      .then((r) => r.json())
      .then(setCompany)
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  async function buildSessionUser(authUser: {
    email?: string | null;
    user_metadata?: { full_name?: string; name?: string };
  }): Promise<SessionUser> {
    const email = authUser.email ?? "";
    const name =
      authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? email.split("@")[0] ?? "Usuário";

    let role: SessionUser["role"] = "Funcionário";
    if (supabase && email) {
      const { data } = await supabase.from("admins").select("email").eq("email", email).maybeSingle();
      if (data) role = "Administrador";
    }
    return { name, email, role };
  }

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let mounted = true;
    let sawInitialLogin = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const sessionUser = await buildSessionUser(data.session.user);
        if (mounted) setUser(sessionUser);
      }
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" && session?.user) {
        const sessionUser = await buildSessionUser(session.user);
        if (!mounted) return;
        setUser(sessionUser);
        if (!sawInitialLogin) {
          sawInitialLogin = true;
          setShowSplash(true);
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        setTab("inicio");
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  function handleDemoLogin(name: string) {
    setUser({ name, email: "", role: "Administrador" });
    setShowSplash(true);
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      setUser(null);
      setTab("inicio");
    }
  }

  async function updateCompany(name: string, logoDataUrl?: string) {
    const res = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...(logoDataUrl ? { logoDataUrl } : {}) }),
    });
    setCompany(await res.json());
  }

  if (checkingSession) {
    return <div className="fixed inset-0 bg-[#060a12]" />;
  }

  if (!user) {
    return <LoginScreen onLogin={handleDemoLogin} />;
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
          name={user.name}
          role={user.role}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onLogout={handleLogout}
        />
      </header>

      <main className="flex-1 overflow-hidden p-6 pb-28">
        {tab === "inicio" && <HomeTab companyName={company.name} />}
        {tab === "chat" && <ChatTab />}
        {tab === "whatsapp" && <WhatsappTab />}
        {tab === "arquivos" && <FilesGraphTab />}
        {tab === "config" && <ConfigTab companyName={company.name} onUpdateCompany={updateCompany} />}
      </main>

      <Dock apps={APPS} active={tab} onSelect={setTab} onOpenDrawer={() => setDrawerOpen(true)} />
      <AppDrawer apps={APPS} open={drawerOpen} onClose={() => setDrawerOpen(false)} onSelect={setTab} />
    </div>
  );
}
