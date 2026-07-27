"use client";

// Portal do Motorista — página pública acessada por link/token individual.
// Mobile-first (estilo app de entrega): status da viagem, GPS ao vivo, seletor
// de app de navegação (Google Maps/Waze/Apple), envio de fotos (POD), chat com a
// central e edição do próprio perfil. Não vê banco de dados nem financeiro.

import { useCallback, useEffect, useRef, useState } from "react";
import { use } from "react";
import { Camera, MapPin, MessageSquare, Navigation, Send, Truck, User, Power } from "lucide-react";

type Carga = { id: string; codigo: string | null; cliente_nome: string | null; produto: string | null; origem: string | null; destino: string | null; pais_destino: string | null; stage: string };
type Msg = { id: string; sender: string; text: string | null; created_at: string };
type Data = { driver: { id: string; nome: string; telefone: string | null; veiculo: string | null }; cargas: Carga[]; messages: Msg[] };

const STAGE_LABEL: Record<string, string> = {
  proforma: "Proforma", pedido: "Pedido", entrada: "Entrada", fumigacao: "Fumigação",
  documentacao: "Documentação", transbordo: "Transbordo", exportacao: "Exportação", concluido: "Concluído",
};

export default function DriverPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<"viagem" | "chat" | "perfil">("viagem");
  const [gpsOn, setGpsOn] = useState(false);
  const [navApp, setNavApp] = useState<"google" | "waze" | "apple">("google");
  const watchRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/motorista/${token}`);
    if (!r.ok) { setErr(true); return; }
    setData(await r.json());
  }, [token]);
  useEffect(() => { load(); }, [load]);
  // Recarrega o chat periodicamente.
  useEffect(() => { const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await fetch(`/api/motorista/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }, [token]);

  // Liga/desliga a transmissão de GPS ao vivo.
  function toggleGps() {
    if (gpsOn) {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null; setGpsOn(false); return;
    }
    if (!navigator.geolocation) { alert("Seu aparelho não permite GPS."); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => post({ action: "ping", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert("Não consegui pegar sua localização. Autorize o GPS."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    setGpsOn(true);
  }
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  function openNav(c: Carga) {
    const dest = encodeURIComponent(`${c.destino || ""} ${c.pais_destino || ""}`.trim());
    const url = navApp === "waze" ? `https://waze.com/ul?q=${dest}&navigate=yes`
      : navApp === "apple" ? `https://maps.apple.com/?daddr=${dest}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    window.open(url, "_blank");
  }

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [podKind, setPodKind] = useState("carga");
  async function sendPhoto(file: File) {
    const reader = new FileReader();
    reader.onload = async () => { await post({ action: "pod", photoBase64: reader.result, kind: podKind }); alert("Foto enviada à central."); };
    reader.readAsDataURL(file);
  }

  const [chatInput, setChatInput] = useState("");
  async function sendMsg() {
    if (!chatInput.trim()) return;
    await post({ action: "message", text: chatInput.trim() });
    setChatInput(""); load();
  }

  if (err) return <div className="min-h-screen bg-zinc-950 text-zinc-300 flex items-center justify-center p-6 text-center"><div><Truck className="mx-auto mb-2 text-zinc-600" /><p>Link inválido ou expirado. Peça um novo à central.</p></div></div>;
  if (!data) return <div className="min-h-screen bg-zinc-950" />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto">
      <header className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">{data.driver.nome.slice(0, 1)}</div>
          <div><div className="font-semibold text-sm">{data.driver.nome}</div><div className="text-[11px] text-zinc-500">{data.driver.veiculo || "Portal do Motorista"}</div></div>
        </div>
        <button onClick={toggleGps} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${gpsOn ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-zinc-300"}`}>
          <Power size={13} /> GPS {gpsOn ? "ligado" : "desligado"}
        </button>
      </header>

      {gpsOn && <div className="bg-emerald-500/10 text-emerald-400 text-[11px] px-4 py-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Transmitindo sua localização ao vivo para a central.</div>}

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === "viagem" && (
          <>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>App de navegação:</span>
              {(["google", "waze", "apple"] as const).map((a) => (
                <button key={a} onClick={() => setNavApp(a)} className={`px-2 py-1 rounded-md ${navApp === a ? "bg-amber-500/15 text-amber-400" : "bg-white/5"}`}>{a === "google" ? "Maps" : a === "waze" ? "Waze" : "Apple"}</button>
              ))}
            </div>
            {data.cargas.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">Nenhuma carga atribuída a você no momento.</p>}
            {data.cargas.map((c) => (
              <div key={c.id} className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-amber-400">{c.codigo}</span>
                  <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-zinc-300">{STAGE_LABEL[c.stage] || c.stage}</span>
                </div>
                <div className="font-semibold mt-1">{c.cliente_nome || "—"}</div>
                <div className="text-xs text-zinc-400">{c.produto || ""}</div>
                <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><MapPin size={12} /> {c.origem || "?"} → {c.destino || "?"} {c.pais_destino ? `(${c.pais_destino})` : ""}</div>
                <button onClick={() => openNav(c)} className="w-full mt-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm py-2 rounded-xl flex items-center justify-center gap-1.5"><Navigation size={15} /> Navegar até o destino</button>
              </div>
            ))}

            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
              <div className="text-sm font-semibold flex items-center gap-1.5"><Camera size={15} /> Comprovante de entrega (POD)</div>
              <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">Envie fotos da carga, dos lacres e do canhoto assinado.</p>
              <div className="flex gap-2 mb-2">
                {["carga", "lacre", "canhoto"].map((k) => <button key={k} onClick={() => setPodKind(k)} className={`text-xs px-2.5 py-1 rounded-md ${podKind === k ? "bg-white/15" : "bg-white/5 text-zinc-400"}`}>{k}</button>)}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendPhoto(f); e.currentTarget.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} className="w-full bg-white/10 hover:bg-white/15 text-sm py-2 rounded-xl flex items-center justify-center gap-1.5"><Camera size={15} /> Tirar / enviar foto ({podKind})</button>
            </div>
          </>
        )}

        {tab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 space-y-2">
              {data.messages.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">Sem mensagens ainda. Fale com a central.</p>}
              {data.messages.map((m) => (
                <div key={m.id} className={`max-w-[85%] p-2.5 rounded-2xl text-sm ${m.sender === "motorista" ? "ml-auto bg-amber-500/15 text-amber-100" : "bg-sky-500/10 text-sky-100"}`}>
                  <div className="text-[9px] opacity-60 mb-0.5">{m.sender === "motorista" ? "Você" : "Central TransLog"} · {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "perfil" && <ProfileEditor data={data} onSave={(p) => post({ action: "profile", ...p })} />}
      </main>

      {tab === "chat" && (
        <div className="p-3 border-t border-white/10 flex gap-2 sticky bottom-14 bg-zinc-950">
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMsg()} placeholder="Mensagem para a central…" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-sm" />
          <button onClick={sendMsg} className="w-10 h-10 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center"><Send size={16} /></button>
        </div>
      )}

      <nav className="border-t border-white/10 grid grid-cols-3 sticky bottom-0 bg-zinc-950">
        {([["viagem", "Viagem", Truck], ["chat", "Chat", MessageSquare], ["perfil", "Perfil", User]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`py-2.5 flex flex-col items-center gap-0.5 text-[10px] ${tab === id ? "text-amber-400" : "text-zinc-500"}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ProfileEditor({ data, onSave }: { data: Data; onSave: (p: { nome: string; telefone: string; veiculo: string }) => void }) {
  const [nome, setNome] = useState(data.driver.nome);
  const [telefone, setTelefone] = useState(data.driver.telefone || "");
  const [veiculo, setVeiculo] = useState(data.driver.veiculo || "");
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Ajuste seus dados básicos. Isso não altera as regras do sistema.</p>
      {[["Nome", nome, setNome], ["Telefone", telefone, setTelefone], ["Veículo", veiculo, setVeiculo]].map(([label, val, set]) => (
        <label key={label as string} className="block">
          <span className="text-[11px] text-zinc-400 mb-1 block">{label as string}</span>
          <input value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
        </label>
      ))}
      <button onClick={() => { onSave({ nome, telefone, veiculo }); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2 rounded-xl text-sm">{saved ? "Salvo!" : "Salvar perfil"}</button>
    </div>
  );
}
