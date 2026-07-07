"use client";

import { useState } from "react";
import { LogOut, Moon, Sun, User } from "lucide-react";

export default function ProfileMenu({
  name,
  role,
  theme,
  onToggleTheme,
  onLogout,
}: {
  name: string;
  role: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full liquid-glass cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white text-sm border border-emerald-500">
          {name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium hidden sm:block">{name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="drawer-anim absolute right-0 mt-2 w-64 liquid-glass rounded-xl p-3 z-40 shadow-2xl">
            <div className="px-2 py-2 border-b border-white/10 mb-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <User size={14} /> {name}
              </p>
              <p className="text-xs text-gray-400">{role}</p>
            </div>
            <button
              onClick={onToggleTheme}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-white/10 cursor-pointer"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </>
      )}
    </div>
  );
}
