"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Flag,
  GitBranch,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Play,
  Plus,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";

// ---------------------------------------------------------------------------
// Tipos do fluxo (salvos em chatbots.flow como JSON)
// ---------------------------------------------------------------------------
export type FlowNode = {
  id: string;
  type: "start" | "message" | "ask" | "condition" | "buttons" | "ai" | "action" | "end";
  x: number;
  y: number;
  data: {
    text?: string;
    keywords?: string;
    options?: string[];
    action?: "handoff" | "close" | "send_address" | "send_phone" | "send_website";
  };
};
export type FlowEdge = { id: string; from: string; handle: string; to: string };
export type BotFlow = { nodes: FlowNode[]; edges: FlowEdge[] };

const NODE_DEFS: Record<
  FlowNode["type"],
  { label: string; color: string; icon: typeof Bot; hint: string }
> = {
  start: { label: "Início", color: "#6366f1", icon: Play, hint: "Onde a conversa começa" },
  message: { label: "Mensagem", color: "#10b981", icon: MessageSquare, hint: "O bot envia um texto" },
  ask: { label: "Perguntar", color: "#0ea5e9", icon: MessagesSquare, hint: "Pergunta e espera a resposta" },
  buttons: { label: "Opções", color: "#f59e0b", icon: ListChecks, hint: "Oferece opções e desvia por escolha" },
  condition: { label: "Condição", color: "#a855f7", icon: GitBranch, hint: "Desvia por palavras-chave" },
  ai: { label: "IA responde", color: "#ec4899", icon: Bot, hint: "A IA responde livre com o conhecimento" },
  action: { label: "Ação", color: "#ef4444", icon: Wrench, hint: "Transferir, encerrar, mandar endereço…" },
  end: { label: "Fim", color: "#64748b", icon: Flag, hint: "Encerra o fluxo" },
};

const ACTIONS: { id: NonNullable<FlowNode["data"]["action"]>; label: string }[] = [
  { id: "handoff", label: "Transferir para atendente humano" },
  { id: "close", label: "Encerrar atendimento" },
  { id: "send_address", label: "Enviar endereço da empresa" },
  { id: "send_phone", label: "Enviar telefone da empresa" },
  { id: "send_website", label: "Enviar site da empresa" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

// Saídas (handles) de cada nó conforme o tipo.
function handlesOf(n: FlowNode): { id: string; label: string }[] {
  if (n.type === "end") return [];
  if (n.type === "condition") return [{ id: "sim", label: "combina" }, { id: "nao", label: "senão" }];
  if (n.type === "buttons") return (n.data.options ?? []).map((o, i) => ({ id: `opt${i}`, label: o || `Opção ${i + 1}` }));
  return [{ id: "out", label: "" }];
}

const NODE_W = 180;

export default function BotFlowBuilder({
  agentId,
  agentName,
  initial,
  onClose,
  onSaved,
}: {
  agentId: string;
  agentName: string;
  initial: BotFlow | null;
  onClose: () => void;
  onSaved?: (flow: BotFlow) => void;
}) {
  const [nodes, setNodes] = useState<FlowNode[]>(
    initial?.nodes?.length ? initial.nodes : [{ id: "start", type: "start", x: 80, y: 60, data: {} }]
  );
  const [edges, setEdges] = useState<FlowEdge[]>(initial?.edges ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<{ node: string; handle: string } | null>(null);
  const [view, setView] = useState({ tx: 0, ty: 0 });
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const selNode = nodes.find((n) => n.id === selected) ?? null;

  const addNode = (type: FlowNode["type"]) => {
    const id = uid();
    const base = { x: 120 - view.tx + Math.random() * 60, y: 120 - view.ty + Math.random() * 60 };
    const data: FlowNode["data"] =
      type === "message" ? { text: "Olá! Como posso ajudar?" }
      : type === "ask" ? { text: "Me conte o que você precisa." }
      : type === "condition" ? { keywords: "" }
      : type === "buttons" ? { text: "Escolha uma opção:", options: ["Opção 1", "Opção 2"] }
      : type === "action" ? { action: "handoff" }
      : {};
    setNodes((p) => [...p, { id, type, x: base.x, y: base.y, data }]);
    setSelected(id);
  };

  const patchNode = (id: string, patch: Partial<FlowNode["data"]>) =>
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));

  const removeNode = (id: string) => {
    if (id === "start") return;
    setNodes((p) => p.filter((n) => n.id !== id));
    setEdges((p) => p.filter((e) => e.from !== id && e.to !== id));
    setSelected(null);
  };

  // Conexão: clica numa saída, depois clica no nó de destino.
  const startConnect = (node: string, handle: string) => setConnectFrom({ node, handle });
  const completeConnect = (to: string) => {
    if (!connectFrom || connectFrom.node === to) {
      setConnectFrom(null);
      return;
    }
    setEdges((p) => [
      // Uma saída (handle) só aponta para um destino — substitui se já existir.
      ...p.filter((e) => !(e.from === connectFrom.node && e.handle === connectFrom.handle)),
      { id: uid(), from: connectFrom.node, handle: connectFrom.handle, to },
    ]);
    setConnectFrom(null);
  };

  // Drag de nó + pan de fundo
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const n = nodes.find((x) => x.id === id)!;
    dragRef.current = { id, dx: e.clientX - (n.x + view.tx), dy: e.clientY - (n.y + view.ty) };
    setSelected(id);
    if (connectFrom) completeConnect(id);
  };
  const onBgDown = (e: React.PointerEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    setSelected(null);
    if (connectFrom) setConnectFrom(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current;
      const nx = e.clientX - dx - view.tx;
      const ny = e.clientY - dy - view.ty;
      setNodes((p) => p.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)));
    } else if (panRef.current) {
      const pn = panRef.current;
      setView({ tx: pn.tx + (e.clientX - pn.x), ty: pn.ty + (e.clientY - pn.y) });
    }
  };
  const onUp = () => {
    dragRef.current = null;
    panRef.current = null;
  };

  const save = useCallback(async () => {
    setSaving(true);
    const flow: BotFlow = { nodes, edges };
    if (supabase) await supabase.from("chatbots").update({ flow }).eq("id", agentId);
    setSaving(false);
    onSaved?.(flow);
    onClose();
  }, [nodes, edges, agentId, onSaved, onClose]);

  // ESC fecha; Delete apaga o nó selecionado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (connectFrom) setConnectFrom(null); else onClose(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && selNode?.type !== "start") {
        const t = e.target as HTMLElement;
        if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") removeNode(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectFrom, selected, selNode]);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="fixed inset-0 z-[70] bg-[#070b12] flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2"><GitBranch size={16} className="text-indigo-400" /> Fluxograma — {agentName}</h3>
          <p className="text-[11px] text-gray-500">Monte como o bot conversa, ligando os blocos. Clique numa saída (•) e depois no bloco de destino.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
            <Save size={14} /> {saving ? "Salvando…" : "Salvar fluxo"}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X size={18} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Paleta de blocos */}
        <div className="w-44 shrink-0 border-r border-white/10 p-3 space-y-1.5 overflow-y-auto custom-scroll">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Adicionar bloco</p>
          {(Object.keys(NODE_DEFS) as FlowNode["type"][]).filter((t) => t !== "start").map((t) => {
            const d = NODE_DEFS[t];
            return (
              <button key={t} onClick={() => addNode(t)} title={d.hint} className="w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-left">
                <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: d.color }}><d.icon size={13} className="text-white" /></span>
                <span className="min-w-0"><span className="block font-semibold">{d.label}</span></span>
                <Plus size={12} className="text-gray-500 ml-auto shrink-0" />
              </button>
            );
          })}
          {connectFrom && (
            <p className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg p-2 mt-2">Clique no bloco de destino para conectar. (Esc cancela)</p>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onPointerDown={onBgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="flex-1 relative overflow-hidden bg-[#070b12] cursor-grab active:cursor-grabbing"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        >
          <div className="absolute inset-0" style={{ transform: `translate(${view.tx}px, ${view.ty}px)` }}>
            {/* Arestas */}
            <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible", width: 1, height: 1 }}>
              {edges.map((e) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return null;
                const hs = handlesOf(a);
                const idx = Math.max(0, hs.findIndex((h) => h.id === e.handle));
                const x1 = a.x + NODE_W / 2;
                const y1 = a.y + 74 + idx * 22;
                const x2 = b.x + NODE_W / 2;
                const y2 = b.y + 6;
                const mid = (y1 + y2) / 2;
                return (
                  <path key={e.id} d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`} stroke="rgba(129,140,248,0.6)" strokeWidth={2} fill="none" markerEnd="url(#arrow)" />
                );
              })}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(129,140,248,0.8)" />
                </marker>
              </defs>
            </svg>

            {/* Nós */}
            {nodes.map((n) => {
              const d = NODE_DEFS[n.type];
              const hs = handlesOf(n);
              const isSel = selected === n.id;
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                  style={{ left: n.x, top: n.y, width: NODE_W, borderColor: isSel ? d.color : "rgba(255,255,255,0.12)" }}
                  className="absolute rounded-xl bg-[#0d131e] border-2 shadow-lg cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-t-xl" style={{ background: `${d.color}22` }}>
                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: d.color }}><d.icon size={12} className="text-white" /></span>
                    <span className="text-[11px] font-bold truncate">{d.label}</span>
                  </div>
                  <div className="px-2.5 py-2 text-[10px] text-gray-400 min-h-[26px]">
                    {n.type === "message" || n.type === "ask" || n.type === "buttons" ? (
                      <span className="line-clamp-2">{n.data.text || "—"}</span>
                    ) : n.type === "condition" ? (
                      <span>se contém: <b className="text-gray-200">{n.data.keywords || "…"}</b></span>
                    ) : n.type === "action" ? (
                      <span>{ACTIONS.find((a) => a.id === n.data.action)?.label ?? "—"}</span>
                    ) : n.type === "ai" ? (
                      <span>IA responde com o conhecimento do agente</span>
                    ) : n.type === "start" ? (
                      <span>Entrada da conversa</span>
                    ) : (
                      <span>Encerra o fluxo</span>
                    )}
                  </div>
                  {/* Saídas */}
                  {hs.length > 0 && (
                    <div className="px-2.5 pb-2 space-y-1">
                      {hs.map((h) => {
                        const active = connectFrom?.node === n.id && connectFrom.handle === h.id;
                        return (
                          <button
                            key={h.id}
                            onPointerDown={(e) => { e.stopPropagation(); startConnect(n.id, h.id); }}
                            className={`w-full flex items-center justify-between gap-1 text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${active ? "bg-amber-500/30 text-amber-200" : "bg-white/5 hover:bg-white/10 text-gray-400"}`}
                          >
                            <span className="truncate">{h.label || "seguir"}</span>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel de edição do nó */}
        {selNode && (
          <div className="w-72 shrink-0 border-l border-white/10 p-4 overflow-y-auto custom-scroll space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">{NODE_DEFS[selNode.type].label}</h4>
              {selNode.type !== "start" && (
                <button onClick={() => removeNode(selNode.id)} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 size={15} /></button>
              )}
            </div>
            <p className="text-[10px] text-gray-500">{NODE_DEFS[selNode.type].hint}</p>

            {(selNode.type === "message" || selNode.type === "ask" || selNode.type === "buttons") && (
              <div>
                <label className="text-[11px] text-gray-400">Texto que o bot envia</label>
                <textarea value={selNode.data.text ?? ""} onChange={(e) => patchNode(selNode.id, { text: e.target.value })} rows={3} className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none resize-none" />
              </div>
            )}

            {selNode.type === "buttons" && (
              <div>
                <label className="text-[11px] text-gray-400">Opções (cada uma vira uma saída)</label>
                <div className="space-y-1.5 mt-1">
                  {(selNode.data.options ?? []).map((o, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={o} onChange={(e) => { const opts = [...(selNode.data.options ?? [])]; opts[i] = e.target.value; patchNode(selNode.id, { options: opts }); }} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none" />
                      <button onClick={() => { const opts = (selNode.data.options ?? []).filter((_, j) => j !== i); patchNode(selNode.id, { options: opts }); setEdges((p) => p.filter((ed) => !(ed.from === selNode.id && ed.handle === `opt${i}`))); }} className="text-gray-500 hover:text-red-400 cursor-pointer"><X size={13} /></button>
                    </div>
                  ))}
                  <button onClick={() => patchNode(selNode.id, { options: [...(selNode.data.options ?? []), `Opção ${(selNode.data.options?.length ?? 0) + 1}`] })} className="text-[11px] text-indigo-300 hover:text-white cursor-pointer flex items-center gap-1"><Plus size={12} /> adicionar opção</button>
                </div>
              </div>
            )}

            {selNode.type === "condition" && (
              <div>
                <label className="text-[11px] text-gray-400">Palavras-chave (separadas por vírgula)</label>
                <input value={selNode.data.keywords ?? ""} onChange={(e) => patchNode(selNode.id, { keywords: e.target.value })} placeholder="boleto, fatura, 2ª via" className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none" />
                <p className="text-[10px] text-gray-500 mt-1">Se a mensagem do cliente contém alguma → saída "combina". Senão → "senão".</p>
              </div>
            )}

            {selNode.type === "action" && (
              <div>
                <label className="text-[11px] text-gray-400">O que fazer</label>
                <select value={selNode.data.action ?? "handoff"} onChange={(e) => patchNode(selNode.id, { action: e.target.value as NonNullable<FlowNode["data"]["action"]> })} className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer">
                  {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            )}

            {selNode.type === "ai" && (
              <p className="text-[11px] text-gray-400">A partir daqui a IA assume e responde livremente usando a persona e o conhecimento do agente. Ligue a saída a um próximo passo se quiser retomar o roteiro.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
