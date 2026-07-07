"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Power, QrCode, RefreshCcw, Send } from "lucide-react";

type WaMessage = { id: string; from: string; text: string; direction: "in" | "out"; at: string };

type WaStatus = {
  status: "disconnected" | "connecting" | "qr_pending" | "connected";
  qrDataUrl: string | null;
  phoneNumber: string | null;
  autoReply: boolean;
  lastError: string | null;
  messages: WaMessage[];
};

export default function WhatsappTab() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [connectingLong, setConnectingLong] = useState(false);
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const res = await fetch("/api/whatsapp/status");
    const data: WaStatus = await res.json();
    setStatus(data);
    if (data.status !== "connecting") setConnectingLong(false);
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function connect() {
    setConnectingLong(false);
    await fetch("/api/whatsapp/connect", { method: "POST" });
    refresh();
    setTimeout(() => setConnectingLong(true), 15000);
  }

  async function disconnect() {
    await fetch("/api/whatsapp/disconnect", { method: "POST" });
    refresh();
  }

  async function sendMessage() {
    if (!to || !text) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      });
      const data = await res.json();
      if (!data.success) alert(data.message);
      setText("");
      refresh();
    } finally {
      setSending(false);
    }
  }

  const badge = {
    disconnected: { label: "Desconectado", cls: "border-gray-700 text-gray-400 bg-gray-900/40" },
    connecting: { label: "Conectando...", cls: "border-amber-700 text-amber-400 bg-amber-950/40" },
    qr_pending: { label: "Aguardando leitura do QR Code", cls: "border-amber-700 text-amber-400 bg-amber-950/40" },
    connected: { label: "Conectado", cls: "border-emerald-700 text-emerald-400 bg-emerald-950/40" },
  }[status?.status ?? "disconnected"];

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
      <div className="liquid-glass rounded-2xl p-5 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="text-emerald-400" size={20} /> WhatsApp
          </h3>
          <span className={`text-[11px] px-2 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
        </div>

        {status?.status !== "connected" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            {status?.qrDataUrl ? (
              <img src={status.qrDataUrl} alt="QR Code do WhatsApp" className="w-56 h-56 rounded-xl bg-white p-3" />
            ) : (
              <div className="w-56 h-56 rounded-xl border border-dashed border-gray-700 flex items-center justify-center text-gray-500">
                <QrCode size={48} />
              </div>
            )}
            <p className="text-sm text-gray-400 max-w-xs">
              Abra o WhatsApp no celular, vá em Aparelhos Conectados e escaneie o QR Code para conectar o número da
              empresa.
            </p>
            {status?.lastError && <p className="text-xs text-red-400">{status.lastError}</p>}
            {connectingLong && status?.status === "connecting" && (
              <p className="text-xs text-amber-400 max-w-xs">
                Ainda conectando ao WhatsApp Web. Se demorar muito, verifique se este servidor tem acesso de saída à
                internet (necessário para falar com os servidores do WhatsApp).
              </p>
            )}
            <button
              onClick={connect}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
            >
              <RefreshCcw size={14} /> {status?.status === "connecting" ? "Gerando QR..." : "Gerar QR Code"}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm">
              Número conectado: <span className="font-mono text-emerald-400">{status.phoneNumber}</span>
            </p>
            <button
              onClick={disconnect}
              className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
            >
              <Power size={14} /> Desconectar
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-500 border-t border-white/10 pt-3">
          A IA responde automaticamente clientes que escreverem no número conectado, usando o nome da empresa
          configurado. Sem sessão conectada, o teste abaixo só registra localmente.
        </p>
      </div>

      <div className="liquid-glass rounded-2xl p-5 flex flex-col gap-4 overflow-hidden">
        <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400">Conversas recentes</h4>
        <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
          {(status?.messages ?? []).length === 0 && (
            <p className="text-xs text-gray-500 italic text-center py-8">Nenhuma mensagem ainda.</p>
          )}
          {(status?.messages ?? [])
            .slice()
            .reverse()
            .map((m) => (
              <div
                key={m.id}
                className={`text-xs rounded-lg px-3 py-2 max-w-[85%] ${
                  m.direction === "in" ? "bg-gray-800/60" : "bg-emerald-950/40 ml-auto text-right"
                }`}
              >
                <p className="text-gray-500 mb-0.5">{m.from}</p>
                <p>{m.text}</p>
              </div>
            ))}
        </div>
        <div className="border-t border-white/10 pt-3 space-y-2">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Número (ex: 5511999999999)"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none"
          />
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mensagem de teste..."
              className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending}
              className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
