"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import {
  ArrowLeft, Hand, MousePointer2, Pencil, Redo2, Square, Trash2, Type, Undo2, Waypoints, ZoomIn, ZoomOut,
} from "lucide-react";

// QUADRO DE PROJETO — a tela infinita, estilo Miro, dentro do Group.
//
// Feito para desenhar durante a reunião: caixas de mapa mental, setas de
// fluxograma, texto e caneta livre, numa tela que dá para arrastar e dar zoom
// sem fim. Tudo é guardado como um JSON só (a "cena") e sincronizado em tempo
// real — quando um colega mexe, aparece na sua tela.
//
// Como a coordenada funciona: cada elemento tem posição no MUNDO (infinito). O
// que a gente vê é o mundo transladado (pan) e escalado (zoom). Converter tela
// → mundo é `(tela - pan) / zoom`; é isso que faz o desenho cair no lugar certo
// independimente de onde a tela está.

type Node = { id: string; x: number; y: number; w: number; h: number; text: string; color: string; kind: "box" | "text" };
type Edge = { id: string; from: string; to: string };
type Stroke = { id: string; color: string; width: number; pts: number[][] };
type Scene = { nodes: Node[]; edges: Edge[]; strokes: Stroke[] };

type Tool = "select" | "hand" | "pen" | "box" | "text" | "connect";

const CORES = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#38bdf8", "#f43f5e", "#a855f7", "#64748b"];
const uid = () => Math.random().toString(36).slice(2, 10);
const cenaVazia = (): Scene => ({ nodes: [], edges: [], strokes: [] });

function normalizar(s: unknown): Scene {
  const o = (s ?? {}) as Partial<Scene>;
  return {
    nodes: Array.isArray(o.nodes) ? o.nodes : [],
    edges: Array.isArray(o.edges) ? o.edges : [],
    strokes: Array.isArray(o.strokes) ? o.strokes : [],
  };
}

export default function ProjectBoard({
  projectId, title, meId, onBack,
}: { projectId: string; title: string; meId: string; onBack: () => void }) {
  const [scene, setScene] = useState<Scene>(cenaVazia);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); // pan x/y e zoom k
  const [tool, setTool] = useState<Tool>("select");
  const [cor, setCor] = useState(CORES[0]);
  const [sel, setSel] = useState<string | null>(null);
  const [conectDe, setConectDe] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  // Refs para o que muda a cada frame de arraste — sem re-render no meio do gesto.
  const gesto = useRef<{ tipo: string; id?: string; ox: number; oy: number; nx: number; ny: number } | null>(null);
  const strokeAtual = useRef<Stroke | null>(null);
  const interagindo = useRef(false); // trava o merge do tempo real enquanto desenho
  const historico = useRef<Scene[]>([]);
  const futuro = useRef<Scene[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espelho da cena para os handlers de ponteiro lerem o estado atual sem virar
  // dependência (senão cada traço recriaria os callbacks). Sincronizado por
  // efeito — escrever ref no corpo do render é o que o compilador proíbe.
  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);

  // ── carregar + tempo real ────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    void supabase?.from("group_projects").select("scene").eq("id", projectId).maybeSingle().then(({ data }) => {
      if (vivo && data) setScene(normalizar(data.scene));
    });
    const ch = supabase?.channel(`board:${projectId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "group_projects", filter: `id=eq.${projectId}` },
      (payload) => {
        // Não sobrescreve enquanto a pessoa está desenhando — senão o traço some
        // no meio. Quando ela solta, o próximo evento reconcilia.
        if (interagindo.current) return;
        const nova = normalizar((payload.new as { scene: unknown }).scene);
        setScene(nova);
      }
    ).subscribe();
    return () => { vivo = false; if (ch) void supabase?.removeChannel(ch); };
  }, [projectId]);

  // ── salvar (debounce) ──────────────────────────────────────────────────────
  const salvar = useCallback((s: Scene) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSalvando(true);
      await supabase?.from("group_projects").update({ scene: s, updated_by: meId, updated_at: new Date().toISOString() }).eq("id", projectId);
      setSalvando(false);
    }, 500);
  }, [projectId, meId]);

  // Aplica uma mudança: empilha no histórico (para desfazer), atualiza e agenda o save.
  const aplicar = useCallback((mut: (s: Scene) => Scene, registra = true) => {
    setScene((atual) => {
      if (registra) { historico.current.push(atual); if (historico.current.length > 60) historico.current.shift(); futuro.current = []; }
      const nova = mut(atual);
      salvar(nova);
      return nova;
    });
  }, [salvar]);

  const desfazer = () => {
    const ant = historico.current.pop();
    if (!ant) return;
    futuro.current.push(sceneRef.current);
    setScene(ant); salvar(ant);
  };
  const refazer = () => {
    const prox = futuro.current.pop();
    if (!prox) return;
    historico.current.push(sceneRef.current);
    setScene(prox); salvar(prox);
  };

  // ── coordenadas ────────────────────────────────────────────────────────────
  const paraMundo = (cx: number, cy: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  // ── zoom na direção do cursor ────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const r = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const fator = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const k = Math.min(3, Math.max(0.2, view.k * fator));
    // Mantém o ponto sob o cursor fixo ao dar zoom.
    setView((v) => ({ k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }));
  }

  // ── pointer ──────────────────────────────────────────────────────────────────
  function onDownCanvas(e: React.PointerEvent) {
    if (e.button === 1 || tool === "hand" || (tool === "select" && e.button === 0 && (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas))) {
      if (tool !== "hand" && tool !== "select") return;
    }
    const alvoVazio = (e.target as HTMLElement).dataset.canvas === "1";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // Pan: mão, botão do meio, ou clique no vazio com a seta.
    if (tool === "hand" || e.button === 1 || (tool === "select" && alvoVazio)) {
      gesto.current = { tipo: "pan", ox: e.clientX, oy: e.clientY, nx: view.x, ny: view.y };
      return;
    }
    if (!alvoVazio) return;
    const p = paraMundo(e.clientX, e.clientY);

    if (tool === "pen") {
      interagindo.current = true;
      strokeAtual.current = { id: uid(), color: cor, width: 3, pts: [[p.x, p.y]] };
      aplicar((s) => ({ ...s, strokes: [...s.strokes, strokeAtual.current!] }));
      return;
    }
    if (tool === "box" || tool === "text") {
      const n: Node = {
        id: uid(), x: p.x - 70, y: p.y - 30, w: 140, h: 60, text: tool === "text" ? "Texto" : "Ideia",
        color: cor, kind: tool === "text" ? "text" : "box",
      };
      aplicar((s) => ({ ...s, nodes: [...s.nodes, n] }));
      setSel(n.id); setTool("select");
      return;
    }
    if (tool === "select") setSel(null);
  }

  function onMove(e: React.PointerEvent) {
    const g = gesto.current;
    if (g?.tipo === "pan") { setView((v) => ({ ...v, x: g.nx + (e.clientX - g.ox), y: g.ny + (e.clientY - g.oy) })); return; }
    if (g?.tipo === "node") {
      const p = paraMundo(e.clientX, e.clientY);
      setScene((s) => ({ ...s, nodes: s.nodes.map((n) => n.id === g.id ? { ...n, x: p.x - g.ox, y: p.y - g.oy } : n) }));
      return;
    }
    if (strokeAtual.current && tool === "pen") {
      const p = paraMundo(e.clientX, e.clientY);
      strokeAtual.current.pts.push([p.x, p.y]);
      setScene((s) => ({ ...s, strokes: s.strokes.map((st) => st.id === strokeAtual.current!.id ? { ...st, pts: [...strokeAtual.current!.pts] } : st) }));
    }
  }

  function onUp() {
    if (gesto.current?.tipo === "node") salvar(sceneRef.current);
    if (strokeAtual.current) { salvar(sceneRef.current); strokeAtual.current = null; }
    gesto.current = null;
    interagindo.current = false;
  }

  function onDownNode(e: React.PointerEvent, n: Node) {
    e.stopPropagation();
    if (tool === "connect") {
      if (!conectDe) { setConectDe(n.id); return; }
      if (conectDe !== n.id) aplicar((s) => ({ ...s, edges: [...s.edges, { id: uid(), from: conectDe, to: n.id }] }));
      setConectDe(null); return;
    }
    setSel(n.id);
    if (tool !== "select") return;
    const p = paraMundo(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesto.current = { tipo: "node", id: n.id, ox: p.x - n.x, oy: p.y - n.y, nx: 0, ny: 0 };
  }

  function editarNode(id: string, text: string) {
    aplicar((s) => ({ ...s, nodes: s.nodes.map((n) => n.id === id ? { ...n, text } : n) }), false);
  }
  function apagarSel() {
    if (!sel) return;
    aplicar((s) => ({ nodes: s.nodes.filter((n) => n.id !== sel), edges: s.edges.filter((ed) => ed.from !== sel && ed.to !== sel), strokes: s.strokes }));
    setSel(null);
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") apagarSel();
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); desfazer(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); refazer(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const centro = (n: Node) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const cursor = tool === "hand" ? "grab" : tool === "pen" ? "crosshair" : tool === "connect" ? "crosshair" : "default";

  const ferramentas: [Tool, string, typeof MousePointer2][] = [
    ["select", "Selecionar", MousePointer2], ["hand", "Mover a tela", Hand], ["pen", "Caneta", Pencil],
    ["box", "Caixa (mapa mental)", Square], ["text", "Texto", Type], ["connect", "Ligar (fluxograma)", Waypoints],
  ];

  return (
    <div className="flex flex-col h-full">
      {/* barra */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-white/10 flex-wrap">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" title="Voltar aos projetos"><ArrowLeft size={17} /></button>
        <span className="text-sm font-semibold truncate max-w-[30%]">{title}</span>
        <div className="flex items-center gap-0.5 bg-black/20 rounded-lg p-0.5">
          {ferramentas.map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setTool(id); setConectDe(null); }} title={label}
              className={`p-1.5 rounded-md cursor-pointer ${tool === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {CORES.map((c) => (
            <button key={c} onClick={() => { setCor(c); if (sel) aplicar((s) => ({ ...s, nodes: s.nodes.map((n) => n.id === sel ? { ...n, color: c } : n) })); }}
              className={`w-5 h-5 rounded-full cursor-pointer ${cor === c ? "ring-2 ring-white" : ""}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-0.5 ml-auto">
          <button onClick={desfazer} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" title="Desfazer"><Undo2 size={16} /></button>
          <button onClick={refazer} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" title="Refazer"><Redo2 size={16} /></button>
          <button onClick={apagarSel} disabled={!sel} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 disabled:opacity-30 cursor-pointer" title="Apagar selecionado"><Trash2 size={16} /></button>
          <button onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.1) }))} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><ZoomIn size={16} /></button>
          <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.1) }))} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><ZoomOut size={16} /></button>
          <span className="text-[10px] text-slate-500 w-10 text-center">{salvando ? "salvando…" : `${Math.round(view.k * 100)}%`}</span>
        </div>
      </div>

      {conectDe && <div className="text-[11px] text-indigo-300 bg-indigo-950/40 px-3 py-1">Clique em outra caixa para ligar — ou troque de ferramenta para cancelar.</div>}

      {/* tela infinita */}
      <div
        ref={wrapRef}
        data-canvas="1"
        onPointerDown={onDownCanvas}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
        className="relative flex-1 overflow-hidden bg-[#0c1018] touch-none select-none"
        style={{ cursor, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        <div data-canvas="1" className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
          {/* setas + traços num SVG grande o suficiente para o mundo visível */}
          <svg data-canvas="1" className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1 }}>
            <defs>
              <marker id="seta" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" /></marker>
            </defs>
            {scene.edges.map((ed) => {
              const a = scene.nodes.find((n) => n.id === ed.from); const b = scene.nodes.find((n) => n.id === ed.to);
              if (!a || !b) return null;
              const p1 = centro(a), p2 = centro(b);
              return <line key={ed.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#seta)" />;
            })}
            {scene.strokes.map((st) => (
              <polyline key={st.id} points={st.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={st.color} strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>

          {/* caixas / textos */}
          {scene.nodes.map((n) => (
            <div
              key={n.id}
              onPointerDown={(e) => onDownNode(e, n)}
              className={`absolute rounded-xl ${n.kind === "box" ? "border-2 shadow-lg" : ""} ${sel === n.id ? "ring-2 ring-white" : ""} ${conectDe === n.id ? "ring-2 ring-indigo-400" : ""}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h, background: n.kind === "box" ? `${n.color}22` : "transparent", borderColor: n.color, cursor: tool === "select" ? "move" : "pointer" }}
            >
              <div
                contentEditable suppressContentEditableWarning
                onBlur={(e) => editarNode(n.id, e.currentTarget.textContent || "")}
                onPointerDown={(e) => { if (tool === "select") e.stopPropagation(); }}
                className="w-full h-full grid place-items-center text-center text-[13px] font-medium outline-none px-2 break-words"
                style={{ color: n.kind === "text" ? n.color : "#e2e8f0" }}
              >{n.text}</div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-2 left-2 text-[10px] text-slate-600 pointer-events-none">Role para dar zoom · arraste no vazio para mover a tela</div>
      </div>
    </div>
  );
}
