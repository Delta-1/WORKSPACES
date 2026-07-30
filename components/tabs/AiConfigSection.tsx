"use client";

import { useEffect, useState } from "react";
import { Bot, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { AiProvider } from "@/lib/types";

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
];

export default function AiConfigSection() {
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [elevenKey, setElevenKey] = useState("");
  const [hasElevenKey, setHasElevenKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !supabase) return;
      const { data } = await supabase
        .from("ai_config")
        .select("provider, api_key, elevenlabs_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProvider(data.provider);
        setHasSavedKey(Boolean(data.api_key));
        setHasElevenKey(Boolean(data.elevenlabs_key));
      }
    });
  }, []);

  async function save() {
    if (!supabase || (!apiKey.trim() && !elevenKey.trim())) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const patch: Record<string, string> = { user_id: user.id, provider };
      if (apiKey.trim()) patch.api_key = apiKey.trim();
      if (elevenKey.trim()) patch.elevenlabs_key = elevenKey.trim();
      if (hasSavedKey || hasElevenKey) await supabase.from("ai_config").update(patch).eq("user_id", user.id);
      else await supabase.from("ai_config").insert({ ...patch, api_key: apiKey.trim() });
      if (apiKey.trim()) setHasSavedKey(true);
      if (elevenKey.trim()) setHasElevenKey(true);
      setApiKey("");
      setElevenKey("");
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
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          ElevenLabs {hasElevenKey && <span className="text-emerald-400 normal-case">(já configurada)</span>}
        </label>
        <input
          type="password"
          value={elevenKey}
          onChange={(e) => setElevenKey(e.target.value)}
          placeholder={hasElevenKey ? "•••••••••••••••• (deixe em branco para manter)" : "Chave da ElevenLabs para voz"}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
        />
      </div>
      <button
        onClick={save}
        disabled={(!apiKey.trim() && !elevenKey.trim()) || saving}
        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar chave"}
      </button>
      {savedMsg && <p className="text-xs text-emerald-400">Chave salva com sucesso.</p>}
      <a
        href={`https://wa.me/5519989478465?text=${encodeURIComponent("Olá! Estou configurando meu Workspace e gostaria de solicitar uma chave de API para IA e uma chave da ElevenLabs.")}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-xs text-emerald-300 hover:text-emerald-200"
      >
        <MessageCircle size={14} /> Solicitar chaves pelo WhatsApp
      </a>
      <p className="text-[11px] text-gray-500">
        Sua chave fica salva apenas para o seu usuário e é usada no Copiloto de IA. O WhatsApp automático continua
        usando a chave configurada pelo administrador do servidor.
      </p>
    </div>
  );
}
