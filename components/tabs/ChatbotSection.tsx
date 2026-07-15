"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, FileText, FolderPlus, Trash2, Upload, Volume2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import MiniFileGraph from "@/components/MiniFileGraph";
import type { AiProvider, Chatbot, FileNodeRow } from "@/lib/types";

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI (GPT)" },
];

export default function ChatbotSection() {
  const [bot, setBot] = useState<Chatbot | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [elevKey, setElevKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [files, setFiles] = useState<FileNodeRow[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    if (!supabase) return;
    const { data } = await supabase.from("chatbots").select("*").order("created_at").limit(1).maybeSingle();
    if (data) {
      setBot(data as Chatbot);
      loadFiles(data.id as string);
    }
  }

  async function loadFiles(botId: string) {
    if (!supabase) return;
    const { data } = await supabase.from("files").select("*").eq("chatbot_id", botId).order("created_at");
    if (data) setFiles(data as FileNodeRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(update: Partial<Chatbot>) {
    setBot((b) => (b ? { ...b, ...update } : b));
  }

  async function ensureFolder(botId: string): Promise<string | null> {
    if (!supabase) return null;
    if (bot?.folder_id) return bot.folder_id;
    const { data } = await supabase
      .from("files")
      .insert({ name: `🤖 ${bot?.name ?? "Chatbot"}`, type: "folder", chatbot_id: botId })
      .select("id")
      .single();
    if (data) {
      await supabase.from("chatbots").update({ folder_id: data.id }).eq("id", botId);
      patch({ folder_id: data.id });
      return data.id as string;
    }
    return null;
  }

  async function save() {
    if (!supabase || !bot) return;
    setSaving(true);
    const update: Record<string, unknown> = {
      name: bot.name,
      persona: bot.persona,
      instructions: bot.instructions,
      greeting: bot.greeting,
      knowledge: bot.knowledge,
      provider: bot.provider,
      enabled: bot.enabled,
      voice_reply: bot.voice_reply !== false,
      elevenlabs_voice_id: bot.elevenlabs_voice_id,
      updated_at: new Date().toISOString(),
    };
    if (apiKey.trim()) update.api_key = apiKey.trim();
    if (elevKey.trim()) update.elevenlabs_key = elevKey.trim();
    await supabase.from("chatbots").update(update).eq("id", bot.id);
    await ensureFolder(bot.id);
    setApiKey("");
    setElevKey("");
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
    setSaving(false);
  }

  async function addFolder() {
    if (!supabase || !bot) return;
    const parent = await ensureFolder(bot.id);
    const name = prompt("Nome da subpasta:");
    if (!name) return;
    await supabase.from("files").insert({ name, type: "folder", parent_id: parent, chatbot_id: bot.id });
    loadFiles(bot.id);
  }

  async function handleUpload(file: File) {
    if (!supabase || !bot) return;
    const parent = await ensureFolder(bot.id);
    // Arquivos de texto: guarda o conteúdo p/ o robô LER (cérebro).
    const textLike =
      /\.(txt|md|csv|json|log|html?|xml|yml|yaml)$/i.test(file.name) || file.type.startsWith("text/");
    let textContent: string | null = null;
    if (textLike && file.size <= 200_000) {
      try {
        textContent = await file.text();
      } catch {
        /* ignore */
      }
    }
    const reader = new FileReader();
    reader.onload = async () => {
      await supabase!.from("files").insert({
        name: file.name,
        type: "file",
        parent_id: parent,
        chatbot_id: bot.id,
        data_url: reader.result as string,
        text_content: textContent,
      });
      loadFiles(bot.id);
    };
    reader.readAsDataURL(file);
  }

  async function removeFile(id: string) {
    if (!supabase || !bot) return;
    await supabase.from("files").delete().eq("id", id);
    loadFiles(bot.id);
  }

  if (!bot) {
    return (
      <div className="liquid-glass rounded-2xl p-5 max-w-md text-sm text-gray-400">Carregando chatbot...</div>
    );
  }

  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4 lg:col-span-2">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Bot size={16} className="text-indigo-400" /> Chatbot de Atendimento
        </h3>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={bot.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="accent-emerald-600"
          />
          {bot.enabled ? "Ativo" : "Desativado"}
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nome do assistente</label>
          <input
            value={bot.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Ex: Pedro"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Persona</label>
          <input
            value={bot.persona ?? ""}
            onChange={(e) => patch({ persona: e.target.value })}
            placeholder="Ex: assistente virtual da empresa"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Mensagem de saudação (primeiro contato)
        </label>
        <input
          value={bot.greeting ?? ""}
          onChange={(e) => patch({ greeting: e.target.value })}
          placeholder="Olá! Sou o assistente virtual. Como posso ajudar?"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Instruções de comportamento
        </label>
        <textarea
          value={bot.instructions ?? ""}
          onChange={(e) => patch({ instructions: e.target.value })}
          rows={3}
          placeholder="Como o assistente deve agir, tom de voz, o que fazer quando não souber responder..."
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Base de conhecimento (texto que o bot deve aprender)
        </label>
        <textarea
          value={bot.knowledge ?? ""}
          onChange={(e) => patch({ knowledge: e.target.value })}
          rows={4}
          placeholder="Informações da empresa, produtos, preços, horários, perguntas frequentes..."
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Provedor de IA</label>
          <select
            value={bot.provider}
            onChange={(e) => patch({ provider: e.target.value as AiProvider })}
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
            Chave de API do bot {bot.api_key && <span className="text-emerald-400 normal-case">(configurada)</span>}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={bot.api_key ? "•••••••• (deixe em branco para manter)" : "Chave de API do provedor"}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
          />
        </div>
      </div>

      {/* Voz do robô (ElevenLabs) */}
      <div className="border-t border-white/10 pt-4 space-y-3">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Volume2 size={14} /> Responder por áudio quando o cliente mandar áudio
          </span>
          <input
            type="checkbox"
            checked={bot.voice_reply !== false}
            onChange={(e) => patch({ voice_reply: e.target.checked })}
            className="accent-emerald-600 w-4 h-4"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Chave ElevenLabs {bot.elevenlabs_key && <span className="text-emerald-400 normal-case">(configurada)</span>}
            </label>
            <input
              type="password"
              value={elevKey}
              onChange={(e) => setElevKey(e.target.value)}
              placeholder={bot.elevenlabs_key ? "•••••••• (deixe em branco p/ manter)" : "sk_..."}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Voice ID (opcional)
            </label>
            <input
              value={bot.elevenlabs_voice_id ?? ""}
              onChange={(e) => patch({ elevenlabs_voice_id: e.target.value || null })}
              placeholder="21m00Tcm4TlvDq8ikWAM"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          Pegue a chave em elevenlabs.io → API Keys. O plano grátis pode bloquear voz a partir de servidores; se a voz
          não sair, use um plano pago (o mais barato já resolve).
        </p>
      </div>

      {/* Pasta / grafo próprio do chatbot */}
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <FileText size={14} /> Pasta do chatbot (aparece também no grafo principal)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={addFolder}
              className="flex items-center gap-1 text-[11px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md cursor-pointer"
            >
              <FolderPlus size={12} /> Subpasta
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1 text-[11px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md cursor-pointer"
            >
              <Upload size={12} /> Arquivo
            </button>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </div>
        </div>
        <div className="mb-3">
          <MiniFileGraph files={files} height={220} />
          <p className="text-[10px] text-gray-500 mt-1 text-center">
            Grafo das pastas e arquivos que a IA acessa (bolinhas maiores = pastas).
          </p>
        </div>

        {files.length === 0 ? (
          <p className="text-[11px] text-gray-500 italic">Nenhum arquivo. Adicione materiais para o bot consultar.</p>
        ) : (
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs bg-black/20 rounded-md px-2 py-1.5">
                <span className="truncate">{f.type === "folder" ? "📁" : "📄"} {f.name}</span>
                <button onClick={() => removeFile(f.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar chatbot"}
        </button>
        {savedMsg && <p className="text-xs text-emerald-400">Configuração salva.</p>}
      </div>
      <p className="text-[11px] text-gray-500">
        Ative o chatbot aqui e depois ligue a auto-resposta no número desejado na aba WhatsApp. O bot usa a chave de API
        definida acima; se ficar em branco e o provedor for Anthropic, usa a chave do servidor.
      </p>
    </div>
  );
}
