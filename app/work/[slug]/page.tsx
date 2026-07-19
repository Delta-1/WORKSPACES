"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, Download, Eye, KeyRound, Send, X } from "lucide-react";

type Info = { name: string; logo_url: string | null; theme_color: string; icon_color: string | null; download_url: string | null };
type Msg = { role: "user" | "assistant"; text: string };

// Página PÚBLICA do Workspace.IA — qualquer pessoa com o link usa, sem login.
// Ajuda a pessoa no computador dela e, se ela colar o código do acesso remoto,
// a IA passa a "ver a tela" para guiar passo a passo.
export default function WorkPage() {
  const slug = String(useParams()?.slug || "");
  const [info, setInfo] = useState<Info | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [linked, setLinked] = useState(false);
  const [mode, setMode] = useState<"guiado" | "autonomo">("guiado");
  const [sessionId, setSessionId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let sid = "";
    try { sid = localStorage.getItem("work_sid") || ""; } catch {}
    if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem("work_sid", sid); } catch {} }
    setSessionId(sid);
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/work/info?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Info) => {
        setInfo(d);
        setMsgs([{ role: "assistant", text: `Oi! Eu sou o assistente de ${d.name}. Como posso te ajudar hoje? Posso te guiar a instalar programas, achar coisas ou resolver problemas no seu computador.` }]);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
  }, [msgs, busy]);

  const accent = info?.theme_color || "#6366f1";

  // Tira um print da tela da pessoa e devolve como imagem base64 (para a IA ver).
  async function grabScreenshot(): Promise<{ mediaType: string; base64: string } | null> {
    try {
      const res = await fetch("/api/work/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, access_code: code.trim() }) });
      const data = await res.json();
      if (!data.url) return null;
      const blob = await (await fetch(data.url)).blob();
      const base64 = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
      return { mediaType: blob.type || "image/jpeg", base64 };
    } catch { return null; }
  }

  // Extrai os comandos «…» da resposta e os executa: no modo GUIADO desenha o
  // círculo onde clicar; no AUTÔNOMO a IA clica/digita de fato. Devolve o texto
  // limpo e se houve alguma AÇÃO de controle (para o autônomo continuar).
  async function runCommands(reply: string): Promise<{ text: string; acted: boolean }> {
    const re = /«\s*([^»]+?)\s*»/g;
    let m: RegExpExecArray | null;
    let acted = false;
    const act = (payload: Record<string, unknown>) =>
      fetch("/api/work/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, access_code: code.trim(), mode, ...payload }) }).catch(() => {});
    while ((m = re.exec(reply)) !== null) {
      const raw = m[1].trim();
      const low = raw.toLowerCase();
      if (low === "fim") continue;
      const after = raw.slice(raw.indexOf(":") + 1);
      if (low.startsWith("apontar:") || low.startsWith("duploapontar:")) {
        const [coords, label] = after.split("|");
        const nums = coords.split(",").map((s) => parseFloat(s.trim()));
        if (nums.length >= 2 && nums.every((n) => Number.isFinite(n))) {
          const dbl = low.startsWith("duplo");
          const x = nums[0] > 1 ? nums[0] / 100 : nums[0];
          const y = nums[1] > 1 ? nums[1] / 100 : nums[1];
          if (mode === "autonomo") { await act({ action: dbl ? "doubleclickat" : "clickat", x, y }); acted = true; }
          else await act({ action: dbl ? "doubleclickat" : "clickat", x, y, color: "vermelho", label: (label || "").trim() || "clique aqui" });
        }
      } else if (mode === "autonomo" && low.startsWith("digitar:")) { await act({ action: "type", text: after.trim() }); acted = true; }
      else if (mode === "autonomo" && low.startsWith("abrir:")) { await act({ action: "open", text: after.trim() }); acted = true; }
      else if (mode === "autonomo" && low.startsWith("tecla:")) { await act({ action: "key", name: after.trim().toLowerCase() }); acted = true; }
    }
    const text = reply.replace(re, "").replace(/\s{2,}/g, " ").trim() || "Feito.";
    return { text, acted };
  }

  async function send(text: string, image?: { mediaType: string; base64: string }) {
    if (!text.trim() || busy) return;
    let convo: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(convo);
    setInput("");
    setBusy(true);
    try {
      // No autônomo, roda em passos (age → vê o resultado → continua). No guiado
      // e no chat comum, é uma resposta só (a pessoa age depois de ver o círculo).
      const maxSteps = linked && mode === "autonomo" ? 6 : 1;
      let img = image ?? null;
      for (let step = 0; step < maxSteps; step++) {
        const res = await fetch("/api/work/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, session_id: sessionId, text: step === 0 ? text : "(feito — aqui está a tela agora, continue; se terminou responda «fim»)", history: convo.slice(-10), image: img, has_access: linked, mode }),
        });
        const data = await res.json();
        const raw: string = data.answer || data.error || "Não consegui responder.";
        let shown = raw;
        let acted = false;
        if (linked) { const r = await runCommands(raw); shown = r.text; acted = r.acted; }
        convo = [...convo, { role: "assistant", text: shown }];
        setMsgs(convo);
        if (!linked || mode !== "autonomo" || !acted || /«?\s*fim\s*»?/i.test(raw)) break;
        await new Promise((r) => setTimeout(r, 1300));
        img = await grabScreenshot();
        if (!img) break;
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Tive um problema de conexão. Tenta de novo?" }]);
    } finally {
      setBusy(false);
    }
  }

  // Valida o código pedindo um print — se vier, o acesso está ligado e a IA
  // passa a enxergar a tela.
  async function linkAccess() {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "assistant", text: "Conectando ao seu computador…" }]);
    try {
      const res = await fetch("/api/work/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, access_code: c }),
      });
      const data = await res.json();
      if (data.url) {
        setLinked(true);
        setShowCode(false);
        setMsgs((m) => [...m, { role: "assistant", text: `Pronto, conectei no seu computador${data.agent ? ` (${data.agent})` : ""}! Agora consigo ver sua tela. Me diga o que você quer fazer.` }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", text: data.error || "Não consegui conectar com esse código." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Falha ao conectar. Confirme se o acesso remoto está aberto." }]);
    } finally {
      setBusy(false);
    }
  }

  // Tira um print da tela da pessoa e manda para a IA "ver" e orientar/agir.
  async function seeScreen() {
    if (!linked || busy) return;
    const img = await grabScreenshot();
    if (!img) { setMsgs((m) => [...m, { role: "assistant", text: "Não consegui ver a tela agora. O computador está ligado e com o acesso aberto?" }]); return; }
    await send(mode === "autonomo" ? "Veja minha tela e faça o que eu pedi." : "Veja minha tela e me marque onde eu clico.", img);
  }

  if (notFound) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <Bot size={40} className="mx-auto text-gray-500 mb-3" />
          <p className="text-gray-300 font-semibold">Este Workspace.IA não está disponível.</p>
          <p className="text-gray-500 text-sm mt-1">Confira o link com quem te enviou.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center bg-gradient-to-b from-[#0b0f16] to-black text-white min-h-screen">
      <div className="w-full max-w-2xl flex-1 flex flex-col px-4">
        {/* Cabeçalho */}
        <header className="flex items-center gap-3 py-4 border-b border-white/10">
          {info?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent }}><Bot size={18} /></span>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{info?.name || "Workspace.IA"}</p>
            <p className="text-[11px] text-gray-400">Assistente • {linked ? "vendo sua tela" : "online"}</p>
          </div>
        </header>

        {/* Mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <span
                className={`inline-block rounded-2xl px-4 py-2 text-sm max-w-[85%] whitespace-pre-wrap text-left ${m.role === "user" ? "text-white" : "bg-white/10"}`}
                style={m.role === "user" ? { background: accent } : undefined}
              >
                {m.text}
              </span>
            </div>
          ))}
          {busy && <p className="text-[12px] text-gray-500 italic">digitando…</p>}
        </div>

        {/* Ações: instalar acesso + conectar código + ver a tela */}
        <div className="flex flex-wrap items-center gap-2 py-2">
          {info?.download_url && (
            <a href={info.download_url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer">
              <Download size={13} /> Instalar acesso remoto
            </a>
          )}
          {!linked ? (
            <button onClick={() => setShowCode((v) => !v)} className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer">
              <KeyRound size={13} /> Colar código de acesso
            </button>
          ) : (
            <>
              <button onClick={seeScreen} disabled={busy} className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer disabled:opacity-50" style={{ background: accent }}>
                <Eye size={13} /> Ver minha tela
              </button>
              {/* Dois poderes: Guiado (círculo mostrando onde clicar) e Autônomo (a IA faz). */}
              <div className="flex items-center rounded-lg bg-white/10 p-0.5 text-[11px]">
                <button onClick={() => setMode("guiado")} className={`px-2 py-1 rounded-md cursor-pointer ${mode === "guiado" ? "bg-white/20 font-semibold" : "text-gray-400"}`}>Guiado</button>
                <button onClick={() => setMode("autonomo")} title="A IA faz sozinha (uso avançado)" className={`px-2 py-1 rounded-md cursor-pointer ${mode === "autonomo" ? "text-white font-semibold" : "text-gray-400"}`} style={mode === "autonomo" ? { background: accent } : undefined}>Autônomo</button>
              </div>
            </>
          )}
        </div>
        {linked && (
          <p className="text-[10px] text-gray-500 -mt-1 pb-1">
            {mode === "guiado" ? "Guiado: eu circulo na sua tela onde você deve clicar e te explico." : "Autônomo: eu mesmo clico e digito por você. Peça e eu faço."}
          </p>
        )}

        {showCode && (
          <div className="flex items-center gap-2 pb-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Cole aqui o código do seu acesso"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none font-mono"
            />
            <button onClick={linkAccess} disabled={busy || !code.trim()} className="text-xs px-3 py-2 rounded-lg text-white cursor-pointer disabled:opacity-50" style={{ background: accent }}>Conectar</button>
            <button onClick={() => setShowCode(false)} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer"><X size={14} /></button>
          </div>
        )}

        {/* Entrada */}
        <div className="flex items-center gap-2 py-3 border-t border-white/10">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder="Escreva sua mensagem…"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none"
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()} className="p-2.5 rounded-xl text-white cursor-pointer disabled:opacity-50" style={{ background: accent }}>
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-gray-600 text-center pb-3">Assistente público. Não compartilhe senhas ou dados sensíveis.</p>
      </div>
    </main>
  );
}
