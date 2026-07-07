"use client";

import { useState } from "react";
import { LogIn, Layers } from "lucide-react";

export default function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = email.split("@")[0] || "Usuário";
    onLogin(name.charAt(0).toUpperCase() + name.slice(1));
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12]">
      <form
        onSubmit={handleSubmit}
        className="liquid-glass rounded-2xl p-8 w-full max-w-md shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-950 border border-emerald-500 rounded-2xl text-emerald-400 mb-3">
            <Layers size={26} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
          <p className="text-gray-400 text-sm mt-1">Insira suas credenciais corporativas</p>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            E-mail de acesso
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 outline-none focus:border-emerald-500 transition-colors"
            placeholder="seu.nome@empresa.com"
          />
        </div>
        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Senha de acesso
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 outline-none focus:border-emerald-500 transition-colors"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogIn size={16} /> Entrar no Painel
        </button>
      </form>
    </div>
  );
}
