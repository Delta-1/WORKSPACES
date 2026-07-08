"use client";

import { useRef, useState } from "react";
import { Bot, Image as ImageIcon, Mic, MicOff, Send, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

type Turn = {
  role: "user" | "assistant";
  text: string;
  imagePreview?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export default function ChatTab() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      text: "Olá! Sou o copiloto de IA interno. Posso ajudar com respostas para clientes, dúvidas de rotina, ou analisar uma imagem que você enviar. Você também pode gravar um áudio.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{ preview: string; base64: string; mediaType: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useState(() => {
    authHeaders().then((headers) =>
      fetch("/api/ai/chat", { headers })
        .then((r) => r.json())
        .then((d) => setLive(d.live))
        .catch(() => setLive(false))
    );
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function handleImagePick(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, base64] = result.split(",");
      const mediaType = meta.match(/data:(.*);base64/)?.[1] ?? "image/png";
      setPendingImage({ preview: result, base64, mediaType });
    };
    reader.readAsDataURL(file);
  }

  function toggleRecording() {
    type WindowWithSpeech = typeof window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const w = window as WindowWithSpeech;
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert("Gravação de áudio não é suportada neste navegador. Tente o Chrome.");
      return;
    }

    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  async function send() {
    if (!input.trim() && !pendingImage) return;
    const newTurn: Turn = {
      role: "user",
      text: input.trim(),
      imagePreview: pendingImage?.preview,
    };
    const historyForApi = [...turns, newTurn].map((t) => ({
      role: t.role,
      text: t.text,
      image:
        t === newTurn && pendingImage
          ? { mediaType: pendingImage.mediaType, base64: pendingImage.base64 }
          : undefined,
    }));

    setTurns((prev) => [...prev, newTurn]);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    scrollToBottom();

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ history: historyForApi }),
      });
      const data = await res.json();
      if (data.live !== undefined) setLive(data.live);
      setTurns((prev) => [...prev, { role: "assistant", text: data.reply || data.error || "(sem resposta)" }]);
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", text: "Erro ao falar com a IA." }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Bot className="text-emerald-400" size={20} /> Copiloto de IA
        </h3>
        {live !== null && (
          <span
            className={`text-[11px] px-2 py-1 rounded-full border ${
              live
                ? "border-emerald-700 text-emerald-400 bg-emerald-950/40"
                : "border-amber-700 text-amber-400 bg-amber-950/40"
            }`}
          >
            {live ? "IA conectada" : "Modo demo — configure uma chave de IA em Configurações"}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-2">
        {turns.map((t, i) => (
          <div key={i} className={`flex gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            {t.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-emerald-400" />
              </div>
            )}
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                t.role === "user" ? "bg-emerald-600 text-white" : "liquid-glass"
              }`}
            >
              {t.imagePreview && (
                <img src={t.imagePreview} alt="anexo" className="rounded-lg mb-2 max-h-40 object-cover" />
              )}
              {t.text}
            </div>
            {t.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                <User size={14} />
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-xs text-gray-500 italic">Digitando...</p>}
      </div>

      {pendingImage && (
        <div className="flex items-center gap-2">
          <img src={pendingImage.preview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
          <button onClick={() => setPendingImage(null)} className="text-xs text-red-400 cursor-pointer">
            remover imagem
          </button>
        </div>
      )}

      <div className="liquid-glass rounded-2xl p-2 flex items-center gap-2">
        <label className="p-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-400">
          <ImageIcon size={18} />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImagePick(e.target.files[0])}
          />
        </label>
        <button
          onClick={toggleRecording}
          className={`p-2 rounded-lg cursor-pointer ${recording ? "text-red-400 animate-pulse" : "text-gray-400 hover:bg-white/10"}`}
        >
          {recording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Digite, grave um áudio ou envie uma foto..."
          className="flex-1 bg-transparent outline-none text-sm px-2"
        />
        <button
          onClick={send}
          disabled={loading}
          className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
