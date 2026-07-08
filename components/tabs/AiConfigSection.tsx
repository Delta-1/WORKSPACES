"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { AiProvider } from "@/lib/types";

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
];

export default function AiConfigSection() {
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !supabase) return;
      const { data } = await supabase
        .from("ai_config")
        .select("provider, api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProvider(data.provider);
        setHasSavedKey(Boolean(data.api_key));
      }
    });
  }, []);

  async function save() {
    if (!supabase || !apiKey.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("ai_config")
        .upsert({ user_id: user.id, provider, api_key: apiKey.trim() }, { onConflict: "user_id" });
      setHasSavedKey(true);
      setApiKey("");
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    }
    setSaving(false);
  }

  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-md">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
        <Bot size={16} className="text-indigo-400" /> Integração de IA
      </h3>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Provedor</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProvider)}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Chave de API {hasSavedKey && <span className="text-emerald-400 normal-case">(já configurada)</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasSavedKey ? "•••••••••••••••• (deixe em branco para manter)" : "Cole sua chave de API"}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
        />
      </div>
      <button
        onClick={save}
        disabled={!apiKey.trim() || saving}
        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar chave"}
      </button>
      {savedMsg && <p className="text-xs text-emerald-400">Chave salva com sucesso.</p>}
      <p className="text-[11px] text-gray-500">
        Sua chave fica salva apenas para o seu usuário e é usada no Copiloto de IA. O WhatsApp automático continua
        usando a chave configurada pelo administrador do servidor.
      </p>
    </div>
  );
}
