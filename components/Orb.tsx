"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Crosshair, Mic, Send, Volume2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Msg = { role: "user" | "assistant"; text: string };
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};

// Assistente estilo JARVIS que aparece durante o acesso remoto. Mini chat +
// modo voz (bolinha flutuante que escuta e responde falando).
export default function Orb({
  slot = "orb",
  title = "Orb",
  contextLabel,
  autoVoice = false,
  onPoint,
  onControl,
  onClose,
}: {
  slot?: string;
  title?: string;
  contextLabel?: string;
  autoVoice?: boolean;
  onPoint?: () => void;
  onControl?: (a: { kind: string; text?: string; name?: string }) => Promise<string>;
  onClose: () => void;
}) {
  const [name, setName] = useState(title);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: `Oi, eu sou o ${title}. Toque no microfone (ou fale) que eu te ajudo.` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const activeRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("chatbots").select("id,name").eq("slot", slot).maybeSingle().then(({ data }) => {
      setAgentId(data?.id ?? null);
      if (data?.name) setName(data.name);
    });
  }, [slot]);

  const system = onControl
    ? `Você é o ${name}, copiloto de voz estilo JARVIS que CONTROLA a máquina remota "${contextLabel || ""}" de forma autônoma. ` +
      `Seja BREVE e falado. ENTENDA a intenção e AJA na máquina emitindo comandos entre «» na sua resposta (o sistema executa e você narra o que fez):\n` +
      `• «digitar: TEXTO» — digita o texto no campo em foco.\n` +
      `• «tecla: NOME» — pressiona uma tecla/atalho (enter, tab, copy, paste, save, selectall, home).\n` +
      `• «clique» — clica com o botão esquerdo onde o cursor está.\n` +
      `• «abrir: APP» — abre um programa pelo nome (ex.: notepad, chrome).\n` +
      `Encadeie vários comandos numa resposta quando fizer sentido. Fale o que vai fazer numa frase curta e emita os comandos. ` +
      `Se precisar clicar num lugar específico da tela, oriente o técnico e use «tecla»/«digitar» quando possível. ` +
      `Ao ouvir que vão finalizar, despeça-se em uma frase.`
    : `Você é o ${name}, o copiloto de voz (estilo JARVIS) e ADMINISTRADOR do sistema desta empresa. Tem acesso a TUDO: ` +
      `arquivos, tarefas, clientes, mural, atendimentos e envio no WhatsApp. Seja BREVE e falado, ENTENDA a intenção, ` +
      `guarde o que já foi dito e responda com CONFIANÇA e clareza. Ao ouvir que a pessoa vai encerrar, despeça-se em uma frase.`;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  function browserSpeak(text: string, done: () => void) {
    try {
      window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis?.speak(u);
    } catch {
      done();
    }
  }
  // Fala com a voz do ElevenLabs; se não houver chave configurada, usa o navegador.
  // Pausa a escuta enquanto fala (para o Orb não ouvir a própria voz) e retoma depois.
  async function speak(text: string) {
    speakingRef.current = true;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    const resume = () => {
      speakingRef.current = false;
      if (activeRef.current) { try { recRef.current?.start(); } catch { /* ignore */ } }
    };
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ text }) });
      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        audioRef.current?.pause();
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = resume;
        a.onerror = resume;
        await a.play();
        return;
      }
    } catch {
      /* cai no navegador */
    }
    browserSpeak(text, resume);
  }

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
  }, [msgs]);

  // Extrai os comandos «…» da resposta, executa cada um na máquina remota
  // (via onControl) e devolve o texto limpo pra falar/exibir.
  async function runControlCommands(reply: string): Promise<string> {
    if (!onControl) return reply;
    const re = /«\s*([^»]+?)\s*»/g;
    const cmds: { kind: string; text?: string; name?: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(reply)) !== null) {
      const raw = m[1].trim();
      const low = raw.toLowerCase();
      if (low.startsWith("digitar:")) cmds.push({ kind: "type", text: raw.slice(raw.indexOf(":") + 1).trim() });
      else if (low.startsWith("tecla:")) cmds.push({ kind: "key", name: low.slice(low.indexOf(":") + 1).trim() });
      else if (low.startsWith("abrir:")) cmds.push({ kind: "open", text: raw.slice(raw.indexOf(":") + 1).trim() });
      else if (low === "clique" || low === "clicar") cmds.push({ kind: "click" });
    }
    for (const c of cmds) {
      try { await onControl(c); } catch { /* segue */ }
    }
    // Remove os comandos do texto exibido/falado.
    return reply.replace(re, "").replace(/\s{2,}/g, " ").trim() || "Feito.";
  }

  async function ask(text: string) {
    if (!text.trim()) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ history: next.map((m) => ({ role: m.role, text: m.text })), system, tools: true, agentId }),
      });
      const data = await res.json();
      let reply = data.reply || "Não entendi, pode repetir?";
      // Modo autônomo: executa os comandos «…» que a IA emitiu na máquina remota
      // e remove-os do texto que aparece/é falado.
      if (onControl) reply = await runControlCommands(reply);
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
      if (voiceOn) speak(reply);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Tive um problema para responder agora." }]);
    } finally {
      setBusy(false);
    }
  }

  function farewellAndClose() {
    speak("Tchau! Precisando, é só me chamar.");
    stopVoice();
    setTimeout(onClose, 1400);
  }

  function handleTranscript(t: string) {
    // Frase de encerramento → se despede e desliga.
    if (/(finaliz|encerr|deslig|tchau orb|é isso orb|pode sair orb|obrigado orb)/i.test(t)) {
      farewellAndClose();
      return;
    }
    ask(t);
  }

  function startVoice() {
    const w = window as unknown as { webkitSpeechRecognition?: new () => Rec; SpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      alert("Reconhecimento de voz não é suportado neste navegador. Use o Chrome.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = false; // uma fala por vez é mais confiável; reinicia sozinho
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[e.results.length - 1][0].transcript?.trim();
      if (t) handleTranscript(t); // mostra no chat como sua mensagem e responde
    };
    rec.onend = () => {
      // Reinicia a escuta (menos quando o Orb está falando, p/ não se ouvir).
      if (activeRef.current && !speakingRef.current) {
        setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 250);
      }
    };
    rec.onerror = () => {};
    recRef.current = rec;
    activeRef.current = true;
    try { rec.start(); } catch { /* ignore */ }
    setVoiceOn(true);
    setMinimized(true);
    speak("Pode falar, estou te ouvindo.");
  }
  function stopVoice() {
    activeRef.current = false;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    recRef.current = null;
    setVoiceOn(false);
    setMinimized(false);
  }
  useEffect(() => () => { activeRef.current = false; try { recRef.current?.stop(); } catch {} }, []);
  // Ao ser chamado por atalho (tecla "v"), já entra ouvindo.
  useEffect(() => { if (autoVoice) startVoice(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Modo bolinha flutuante (voz ativa e minimizado) — vibe JARVIS.
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title={`${name} ouvindo — toque para abrir o chat`}
        className="fixed bottom-5 right-5 z-[95] w-16 h-16 rounded-full cursor-pointer orb-float flex items-center justify-center"
      >
        <span className="absolute inset-0 rounded-full orb-glow" />
        <Volume2 size={22} className="text-white relative z-10" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[95] w-[320px] max-w-[92vw] bg-[#0b0f16]/95 backdrop-blur border border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-indigo-950/40">
        <span className="text-sm font-bold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full orb-glow flex items-center justify-center"><Bot size={13} className="text-white" /></span>
          {name} {voiceOn && <span className="text-[10px] text-indigo-300 animate-pulse">• ouvindo</span>}
        </span>
        <div className="flex items-center gap-1">
          {onPoint && (
            <button onClick={onPoint} title="Apontar: circula o ponteiro na opção" className="p-1.5 rounded-lg text-gray-300 hover:bg-white/10 cursor-pointer">
              <Crosshair size={14} />
            </button>
          )}
          <button onClick={voiceOn ? stopVoice : startVoice} title={voiceOn ? "Desligar voz" : "Falar por voz"} className={`p-1.5 rounded-lg cursor-pointer ${voiceOn ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-white/10"}`}>
            <Mic size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={14} /></button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 max-h-64 overflow-y-auto custom-scroll p-3 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`text-xs ${m.role === "user" ? "text-right" : ""}`}>
            <span className={`inline-block rounded-2xl px-3 py-1.5 ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-white/10"}`}>{m.text}</span>
          </div>
        ))}
        {busy && <p className="text-[11px] text-gray-500 italic">Orb pensando…</p>}
      </div>
      <div className="p-2 border-t border-white/10 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { ask(input); setInput(""); } }}
          placeholder="Fale ou escreva pro Orb…"
          className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none"
        />
        <button onClick={() => { ask(input); setInput(""); }} disabled={busy || !input.trim()} className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50">
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
