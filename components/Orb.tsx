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
  getScreenshot,
  onClose,
}: {
  slot?: string;
  title?: string;
  contextLabel?: string;
  autoVoice?: boolean;
  onPoint?: () => void;
  onControl?: (a: { kind: string; text?: string; name?: string; x?: number; y?: number }) => Promise<string>;
  getScreenshot?: () => { mediaType: string; base64: string } | null;
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
    ? `Você é o ${name}, copiloto de voz estilo JARVIS que CONTROLA a máquina remota "${contextLabel || ""}" de forma autônoma e PRECISA. ` +
      `Seja BREVE e falado. ENTENDA a intenção e AJA na máquina emitindo comandos entre «» (o sistema executa e você narra):\n` +
      `• «digitar: TEXTO» — digita o texto no campo que está EM FOCO.\n` +
      `• «tecla: NOME» — pressiona uma tecla/atalho (enter, tab, esc, copy, paste, save, selectall, home).\n` +
      `• «clique» — clica onde o cursor já está.\n` +
      `• «abrir: APP» — abre um programa pelo nome via menu (ex.: chrome, notepad, cmd).\n` +
      `• «clicar: x,y» — UM clique num ponto; x e y são frações de 0 a 1 (x=esquerda→direita, y=cima→baixo) do CENTRO EXATO do elemento.\n` +
      `• «duploclique: x,y» — DOIS cliques nesse ponto.\n` +
      `\nCOMO ACERTAR (MUITO IMPORTANTE):\n` +
      `1) VOCÊ VÊ A TELA: em cada mensagem vem um print ATUAL da máquina. Olhe com atenção, identifique o elemento certo (leia os rótulos/ícones) e mire no CENTRO dele. Não chute — se dois ícones parecem próximos, escolha o que tem o rótulo/logo correto.\n` +
      `2) TRABALHE EM PASSOS: faça UM passo por vez (no máximo 2 comandos ligados, ex.: clicar num campo E já digitar). Depois da ação eu te mando um NOVO print — confira se deu certo e continue. Se o passo falhou (nada mudou / abriu o errado), CORRIJA no próximo passo.\n` +
      `3) COMPLETE A TAREFA INTEIRA: não pare no meio. Ex.: "pesquisa X no Google" = clicar na barra de pesquisa → «digitar: X» → «tecla: enter». Clicar no campo e parar NÃO resolve.\n` +
      `4) ABRIR PROGRAMAS: ícone na ÁREA DE TRABALHO abre com «duploclique» (um clique só seleciona!). Ícone na BARRA DE TAREFAS ou item do MENU INICIAR abre com um «clicar». Se o app não estiver visível, «abrir: nome».\n` +
      `5) INSTALAR ALGO (ex.: "instala o Minecraft"): abra o navegador padrão, vá ao SITE OFICIAL do programa (digite o endereço oficial na barra e enter), baixe o instalador oficial e execute. Se houver versões/edições diferentes, PERGUNTE qual antes.\n` +
      `\nQUANDO PERGUNTAR (não adivinhe): se houver DOIS OU MAIS itens com nome parecido/idêntico (ex.: três coisas com "Google" no nome), ou se você NÃO encontrar o ícone/nome no print, PERGUNTE qual a pessoa quer e NÃO emita comando nessa vez — espere a resposta.\n` +
      `\nQuando a tarefa estiver 100% concluída, diga uma frase curta e termine com «fim». Fale curtinho o que está fazendo a cada passo. Ao ouvir que vão finalizar, despeça-se em uma frase com «fim».`
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
  async function runControlCommands(reply: string): Promise<{ text: string; count: number }> {
    if (!onControl) return { text: reply, count: 0 };
    const re = /«\s*([^»]+?)\s*»/g;
    const cmds: { kind: string; text?: string; name?: string; x?: number; y?: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(reply)) !== null) {
      const raw = m[1].trim();
      const low = raw.toLowerCase();
      if (low === "fim") continue; // marcador de fim — não é comando
      if (low.startsWith("digitar:")) cmds.push({ kind: "type", text: raw.slice(raw.indexOf(":") + 1).trim() });
      else if (low.startsWith("tecla:")) cmds.push({ kind: "key", name: low.slice(low.indexOf(":") + 1).trim() });
      else if (low.startsWith("abrir:")) cmds.push({ kind: "open", text: raw.slice(raw.indexOf(":") + 1).trim() });
      else if (low.startsWith("clicar:") || low.startsWith("duploclique:")) {
        const nums = raw.slice(raw.indexOf(":") + 1).split(",").map((s) => parseFloat(s.trim()));
        if (nums.length === 2 && nums.every((n) => Number.isFinite(n))) {
          cmds.push({ kind: low.startsWith("duplo") ? "doubleclickat" : "clickat", x: nums[0] > 1 ? nums[0] / 100 : nums[0], y: nums[1] > 1 ? nums[1] / 100 : nums[1] });
        }
      } else if (low === "clique" || low === "clicar") cmds.push({ kind: "click" });
    }
    for (const c of cmds) {
      try { await onControl(c); } catch { /* segue */ }
    }
    // Remove os comandos e o marcador «fim» do texto exibido/falado.
    const text = reply.replace(re, "").replace(/\s{2,}/g, " ").trim() || "Feito.";
    return { text, count: cmds.length };
  }

  async function ask(text: string) {
    if (!text.trim()) return;
    let convo: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(convo);
    setBusy(true);
    try {
      // Modo autônomo (acesso remoto): loop passo-a-passo — age, VÊ o resultado
      // num print novo e continua até terminar («fim») ou parar p/ perguntar.
      // Modo assessor comum: uma resposta só.
      const maxSteps = onControl ? 8 : 1;
      for (let step = 0; step < maxSteps; step++) {
        const headers = await authHeaders();
        // Visão: manda o print ATUAL da tela para a IA "enxergar" e decidir.
        const shot = onControl && getScreenshot ? getScreenshot() : null;
        const turns = convo.map((m) => ({ role: m.role, text: m.text })) as { role: string; text: string; image?: { mediaType: string; base64: string } }[];
        if (shot && turns.length) turns[turns.length - 1].image = shot;
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ history: turns, system, tools: true, agentId }),
        });
        const data = await res.json();
        const raw: string = data.reply || (step === 0 ? "Não entendi, pode repetir?" : "");
        let reply = raw;
        let count = 0;
        if (onControl) { const r = await runControlCommands(raw); reply = r.text; count = r.count; }
        if (reply) { convo = [...convo, { role: "assistant", text: reply }]; setMsgs(convo); if (voiceOn) speak(reply); }
        // Para o loop quando: não é modo controle; a IA não executou nenhum
        // comando (está falando ou perguntando algo e esperando você); ou marcou «fim».
        if (!onControl || count === 0 || /«?\s*fim\s*»?/i.test(raw)) break;
        // Deixa a tela reagir e alimenta o próximo passo com um print novo.
        await new Promise((r) => setTimeout(r, 1100));
        convo = [...convo, { role: "user", text: "(feito — aqui está a tela agora. Confira o resultado e continue a tarefa; se já terminou, responda com «fim».)" }];
      }
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
