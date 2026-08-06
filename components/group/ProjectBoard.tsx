"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase-client";
import {
  ArrowLeft, BoxSelect, Check, ChevronDown, Circle, Copy, Diamond,
  Download, Focus, Grid3X3, Hand, Lightbulb, Link2, MousePointer2,
  Maximize2, Minimize2, Pencil, Plus, Redo2, RotateCcw, Shapes, Sparkles, Square, StickyNote,
  Trash2, TriangleAlert, Type, Undo2, Waypoints, ZoomIn, ZoomOut,
} from "lucide-react";

type NodeKind = "box" | "text" | "sticky" | "ellipse" | "diamond";
type Node = { id: string; x: number; y: number; w: number; h: number; text: string; color: string; kind: NodeKind };
type Edge = { id: string; from: string; to: string; color?: string; dashed?: boolean };
type Stroke = { id: string; color: string; width: number; pts: number[][] };
type Scene = { nodes: Node[]; edges: Edge[]; strokes: Stroke[] };
type Tool = "select" | "hand" | "pen" | "sticky" | "shape" | "text" | "connect";
type View = { x: number; y: number; k: number };
type ProjectBoardProps = { projectId: string; title: string; meId: string; onBack: () => void };

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#64748b"];
const uid = () => Math.random().toString(36).slice(2, 10);
const emptyScene = (): Scene => ({ nodes: [], edges: [], strokes: [] });

function normalizeScene(raw: unknown): Scene {
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  const value = (parsed ?? {}) as Partial<Scene>;
  return {
    nodes: Array.isArray(value.nodes)
      ? value.nodes.filter((node) => !!node && typeof node === "object").map((node) => ({ ...node, kind: node.kind ?? "box" }))
      : [],
    edges: Array.isArray(value.edges) ? value.edges.filter((edge) => !!edge && typeof edge === "object") : [],
    strokes: Array.isArray(value.strokes)
      ? value.strokes
        .filter((stroke) => !!stroke && typeof stroke === "object")
        .map((stroke) => ({
          ...stroke,
          pts: Array.isArray(stroke.pts)
            ? stroke.pts.filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))).map((point) => [Number(point[0]), Number(point[1])])
            : [],
        }))
        .filter((stroke) => stroke.pts.length > 0)
      : [],
  };
}

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene;
}

function nodeCenter(node: Node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function edgePath(from: Node, to: Node) {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  const bend = Math.max(70, Math.abs(b.x - a.x) * 0.48);
  const direction = b.x >= a.x ? 1 : -1;
  return `M ${a.x} ${a.y} C ${a.x + bend * direction} ${a.y}, ${b.x - bend * direction} ${b.y}, ${b.x} ${b.y}`;
}

class ProjectBoardBoundary extends Component<{ children: ReactNode; onBack: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha isolada no quadro de Projetos", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-[150] grid place-items-center bg-[#0b0d12] p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151923] p-6 text-center shadow-2xl">
          <TriangleAlert size={32} className="mx-auto text-amber-400" />
          <h2 className="mt-4 text-base font-bold">Não foi possível abrir este quadro</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">O restante do Workspaces continua funcionando. Você pode tentar carregar o quadro novamente sem atualizar a página inteira.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={this.props.onBack} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Voltar</button>
            <button onClick={() => this.setState({ failed: false })} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Tentar novamente</button>
          </div>
        </div>
      </div>
    );
  }
}

export default function ProjectBoard(props: ProjectBoardProps) {
  return <ProjectBoardBoundary onBack={props.onBack}><ProjectBoardCanvas {...props} /></ProjectBoardBoundary>;
}

function ProjectBoardCanvas({
  projectId, title, meId, onBack,
}: ProjectBoardProps) {
  const [scene, setScene] = useState<Scene>(emptyScene);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grid, setGrid] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [shapeKind, setShapeKind] = useState<NodeKind>("box");
  const [spacePressed, setSpacePressed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ type: "pan" | "node" | "resize" | "stroke"; id?: string; sx: number; sy: number; ox: number; oy: number; w?: number; h?: number } | null>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const interacting = useRef(false);
  const history = useRef<Scene[]>([]);
  const future = useRef<Scene[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef(scene);
  const viewRef = useRef(view);

  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
    const sync = () => setFullscreen((document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement) === boardRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = boardRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    if (!element) return;
    try {
      const active = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      if (active) {
        const exit = document.exitFullscreen?.bind(document) ?? fullscreenDocument.webkitExitFullscreen?.bind(document);
        if (exit) await Promise.resolve(exit());
        setFullscreen(false);
        return;
      }
      const enter = element.requestFullscreen?.bind(element) ?? element.webkitRequestFullscreen?.bind(element);
      if (enter) await Promise.resolve(enter());
      else setFullscreen((current) => !current);
    } catch (error) {
      console.warn("Tela cheia não disponível neste navegador", error);
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void supabase?.from("group_projects").select("scene").eq("id", projectId).maybeSingle().then(({ data }) => {
      if (alive && data) setScene(normalizeScene(data.scene));
    });
    const channel = supabase?.channel(`board:${projectId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "group_projects", filter: `id=eq.${projectId}` },
      (payload) => {
        if (!interacting.current) setScene(normalizeScene((payload.new as { scene: unknown }).scene));
      },
    ).subscribe();
    return () => { alive = false; if (channel) void supabase?.removeChannel(channel); };
  }, [projectId]);

  const save = useCallback((next: Scene) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved(false);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await supabase?.from("group_projects").update({
        scene: next, updated_by: meId, updated_at: new Date().toISOString(),
      }).eq("id", projectId);
      setSaving(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    }, 450);
  }, [meId, projectId]);

  const apply = useCallback((mutate: (current: Scene) => Scene, register = true) => {
    setScene((current) => {
      if (register) {
        history.current.push(cloneScene(current));
        if (history.current.length > 80) history.current.shift();
        future.current = [];
      }
      const next = mutate(current);
      save(next);
      return next;
    });
  }, [save]);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(cloneScene(sceneRef.current));
    setScene(previous); save(previous); setSelected(null);
  }, [save]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(cloneScene(sceneRef.current));
    setScene(next); save(next); setSelected(null);
  }, [save]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const currentView = viewRef.current;
    return {
      x: (clientX - rect.left - currentView.x) / currentView.k,
      y: (clientY - rect.top - currentView.y) / currentView.k,
    };
  }, []);

  const createNode = useCallback((kind: NodeKind, x: number, y: number, text?: string, nodeColor = color) => {
    const sizes: Record<NodeKind, [number, number]> = {
      box: [180, 86], text: [180, 56], sticky: [170, 150], ellipse: [170, 100], diamond: [150, 120],
    };
    const [w, h] = sizes[kind];
    const defaults: Record<NodeKind, string> = {
      box: "Nova ideia", text: "Digite um texto", sticky: "Nota", ellipse: "Tópico", diamond: "Decisão",
    };
    const node: Node = { id: uid(), x: x - w / 2, y: y - h / 2, w, h, text: text ?? defaults[kind], color: nodeColor, kind };
    apply((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected(node.id);
    return node;
  }, [apply, color]);

  const addBranch = useCallback((sourceId: string) => {
    const source = sceneRef.current.nodes.find((node) => node.id === sourceId);
    if (!source) return;
    const siblings = sceneRef.current.edges.filter((edge) => edge.from === sourceId).length;
    const node: Node = {
      id: uid(), x: source.x + source.w + 150, y: source.y + siblings * 115 - Math.max(0, siblings - 1) * 35,
      w: 180, h: 86, text: "Novo tópico", color: COLORS[(siblings + 1) % COLORS.length], kind: "box",
    };
    const edge: Edge = { id: uid(), from: source.id, to: node.id, color: source.color };
    apply((current) => ({ ...current, nodes: [...current.nodes, node], edges: [...current.edges, edge] }));
    setSelected(node.id);
  }, [apply]);

  const duplicateSelected = useCallback(() => {
    const node = sceneRef.current.nodes.find((item) => item.id === selected);
    if (node) {
      const copy = { ...node, id: uid(), x: node.x + 32, y: node.y + 32 };
      apply((current) => ({ ...current, nodes: [...current.nodes, copy] }));
      setSelected(copy.id);
      return;
    }
    const stroke = sceneRef.current.strokes.find((item) => item.id === selected);
    if (!stroke) return;
    const copy: Stroke = { ...stroke, id: uid(), pts: stroke.pts.map(([x, y]) => [x + 24, y + 24]) };
    apply((current) => ({ ...current, strokes: [...current.strokes, copy] }));
    setSelected(copy.id);
  }, [apply, selected]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    apply((current) => ({
      nodes: current.nodes.filter((node) => node.id !== selected),
      edges: current.edges.filter((edge) => edge.from !== selected && edge.to !== selected),
      strokes: current.strokes.filter((stroke) => stroke.id !== selected),
    }));
    setSelected(null);
  }, [apply, selected]);

  const fitContent = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const points = [
      ...sceneRef.current.nodes.flatMap((node) => [[node.x, node.y], [node.x + node.w, node.y + node.h]]),
      ...sceneRef.current.strokes.flatMap((stroke) => stroke.pts),
    ];
    if (!points.length) { setView({ x: rect.width / 2, y: rect.height / 2, k: 1 }); return; }
    const minX = Math.min(...points.map(([x]) => x));
    const minY = Math.min(...points.map(([, y]) => y));
    const maxX = Math.max(...points.map(([x]) => x));
    const maxY = Math.max(...points.map(([, y]) => y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const k = Math.min(1.35, Math.max(0.2, Math.min((rect.width - 180) / width, (rect.height - 180) / height)));
    setView({ x: rect.width / 2 - (minX + width / 2) * k, y: rect.height / 2 - (minY + height / 2) * k, k });
  }, []);

  const addTemplate = useCallback((template: "mind" | "flow" | "retro") => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const center = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    let nodes: Node[] = [];
    let edges: Edge[] = [];
    if (template === "mind") {
      const root: Node = { id: uid(), x: center.x - 100, y: center.y - 48, w: 200, h: 96, text: "Tema central", color: COLORS[0], kind: "ellipse" };
      const labels = ["Objetivos", "Ideias", "Recursos", "Próximos passos"];
      nodes = [root, ...labels.map((label, index) => ({ id: uid(), x: center.x + (index % 2 ? 270 : -450), y: center.y + (Math.floor(index / 2) * 180 - 120), w: 180, h: 86, text: label, color: COLORS[index + 2], kind: "box" as const }))];
      edges = nodes.slice(1).map((node) => ({ id: uid(), from: root.id, to: node.id, color: node.color }));
    } else if (template === "flow") {
      const labels: [string, NodeKind][] = [["Início", "ellipse"], ["Etapa do processo", "box"], ["Decisão?", "diamond"], ["Resultado", "ellipse"]];
      nodes = labels.map(([label, kind], index) => ({ id: uid(), x: center.x - 360 + index * 250, y: center.y - 55, w: kind === "diamond" ? 150 : 175, h: kind === "diamond" ? 120 : 90, text: label, color: COLORS[index], kind }));
      edges = nodes.slice(0, -1).map((node, index) => ({ id: uid(), from: node.id, to: nodes[index + 1].id, color: COLORS[index] }));
    } else {
      const labels = ["Funcionou bem", "Pode melhorar", "Novas ideias"];
      nodes = labels.flatMap((label, column) => {
        const header: Node = { id: uid(), x: center.x - 360 + column * 250, y: center.y - 150, w: 220, h: 64, text: label, color: COLORS[[5, 4, 0][column]], kind: "box" };
        const note: Node = { id: uid(), x: header.x + 25, y: center.y - 50, w: 170, h: 150, text: "Adicione uma nota", color: header.color, kind: "sticky" };
        return [header, note];
      });
    }
    apply((current) => ({ ...current, nodes: [...current.nodes, ...nodes], edges: [...current.edges, ...edges] }));
    setTemplatesOpen(false);
    window.setTimeout(fitContent, 60);
  }, [apply, fitContent, toWorld]);

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * 0.0013);
      setView((current) => {
        const k = Math.min(4, Math.max(0.15, current.k * factor));
        return { k, x: mx - (mx - current.x) * (k / current.k), y: my - (my - current.y) * (k / current.k) };
      });
    } else {
      setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  }

  function onCanvasDown(event: React.PointerEvent) {
    const target = event.target as HTMLElement;
    const blank = target.dataset.canvas === "1";
    if (!blank) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (tool === "hand" || spacePressed || event.button === 1 || (tool === "select" && event.button === 0)) {
      gesture.current = { type: "pan", sx: event.clientX, sy: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
      setSelected(null);
      return;
    }
    const point = toWorld(event.clientX, event.clientY);
    if (tool === "pen") {
      interacting.current = true;
      const stroke = { id: uid(), color, width: 3, pts: [[point.x, point.y]] };
      currentStroke.current = stroke;
      apply((current) => ({ ...current, strokes: [...current.strokes, stroke] }));
    } else if (tool === "sticky") {
      createNode("sticky", point.x, point.y); setTool("select");
    } else if (tool === "shape") {
      createNode(shapeKind, point.x, point.y); setTool("select");
    } else if (tool === "text") {
      const node = createNode("text", point.x, point.y); setEditing(node.id); setTool("select");
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = gesture.current;
    if (active?.type === "pan") {
      setView((current) => ({ ...current, x: active.ox + event.clientX - active.sx, y: active.oy + event.clientY - active.sy }));
      return;
    }
    if (active?.type === "node" && active.id) {
      const point = toWorld(event.clientX, event.clientY);
      setScene((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === active.id ? { ...node, x: point.x - active.ox, y: point.y - active.oy } : node) }));
      return;
    }
    if (active?.type === "resize" && active.id) {
      const dx = (event.clientX - active.sx) / viewRef.current.k;
      const dy = (event.clientY - active.sy) / viewRef.current.k;
      setScene((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === active.id ? { ...node, w: Math.max(90, (active.w ?? node.w) + dx), h: Math.max(48, (active.h ?? node.h) + dy) } : node) }));
      return;
    }
    if (active?.type === "stroke" && active.id) {
      const point = toWorld(event.clientX, event.clientY);
      const dx = point.x - active.ox;
      const dy = point.y - active.oy;
      setScene((current) => ({ ...current, strokes: current.strokes.map((stroke) => stroke.id === active.id ? { ...stroke, pts: stroke.pts.map(([x, y]) => [x + dx, y + dy]) } : stroke) }));
      active.ox = point.x;
      active.oy = point.y;
      return;
    }
    if (currentStroke.current) {
      const point = toWorld(event.clientX, event.clientY);
      currentStroke.current.pts.push([point.x, point.y]);
      setScene((current) => ({ ...current, strokes: current.strokes.map((stroke) => stroke.id === currentStroke.current!.id ? { ...stroke, pts: [...currentStroke.current!.pts] } : stroke) }));
    }
  }

  function onPointerUp() {
    if (gesture.current?.type === "node" || gesture.current?.type === "resize" || gesture.current?.type === "stroke" || currentStroke.current) save(sceneRef.current);
    gesture.current = null;
    currentStroke.current = null;
    interacting.current = false;
  }

  function onStrokeDown(event: React.PointerEvent<SVGPolylineElement>, stroke: Stroke) {
    event.stopPropagation();
    if (tool !== "select") return;
    const point = toWorld(event.clientX, event.clientY);
    history.current.push(cloneScene(sceneRef.current)); future.current = [];
    interacting.current = true;
    setSelected(stroke.id);
    gesture.current = { type: "stroke", id: stroke.id, sx: event.clientX, sy: event.clientY, ox: point.x, oy: point.y };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* SVG sem captura de ponteiro */ }
  }

  function onNodeDown(event: React.PointerEvent, node: Node) {
    event.stopPropagation();
    if (tool === "connect") {
      if (!connectFrom) { setConnectFrom(node.id); setSelected(node.id); return; }
      if (connectFrom !== node.id && !sceneRef.current.edges.some((edge) => edge.from === connectFrom && edge.to === node.id)) {
        const source = sceneRef.current.nodes.find((item) => item.id === connectFrom);
        apply((current) => ({ ...current, edges: [...current.edges, { id: uid(), from: connectFrom, to: node.id, color: source?.color }] }));
      }
      setConnectFrom(null); setTool("select"); setSelected(node.id); return;
    }
    setSelected(node.id);
    if (tool !== "select" || editing === node.id) return;
    const point = toWorld(event.clientX, event.clientY);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    history.current.push(cloneScene(sceneRef.current)); future.current = [];
    gesture.current = { type: "node", id: node.id, sx: event.clientX, sy: event.clientY, ox: point.x - node.x, oy: point.y - node.y };
  }

  function startResize(event: React.PointerEvent, node: Node) {
    event.stopPropagation();
    history.current.push(cloneScene(sceneRef.current)); future.current = [];
    gesture.current = { type: "resize", id: node.id, sx: event.clientX, sy: event.clientY, ox: 0, oy: 0, w: node.w, h: node.h };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.code === "Space") { event.preventDefault(); setSpacePressed(true); }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) deleteSelected();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
      const shortcuts: Record<string, Tool> = { v: "select", h: "hand", p: "pen", n: "sticky", t: "text", l: "connect" };
      if (!event.ctrlKey && !event.metaKey && shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
      if (event.key === "Escape") { setEditing(null); setConnectFrom(null); setSelected(null); setTool("select"); }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePressed(false); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
  }, [deleteSelected, duplicateSelected, redo, selected, undo]);

  const selectedNode = useMemo(() => scene.nodes.find((node) => node.id === selected) ?? null, [scene.nodes, selected]);
  const selectedStroke = useMemo(() => scene.strokes.find((stroke) => stroke.id === selected) ?? null, [scene.strokes, selected]);
  const minimap = useMemo(() => {
    if (!scene.nodes.length) return null;
    const minX = Math.min(...scene.nodes.map((node) => node.x));
    const minY = Math.min(...scene.nodes.map((node) => node.y));
    const maxX = Math.max(...scene.nodes.map((node) => node.x + node.w));
    const maxY = Math.max(...scene.nodes.map((node) => node.y + node.h));
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [scene.nodes]);

  const toolbar: [Tool, string, typeof MousePointer2, string][] = [
    ["select", "Selecionar", MousePointer2, "V"], ["hand", "Mover", Hand, "H"], ["pen", "Caneta", Pencil, "P"],
    ["sticky", "Nota adesiva", StickyNote, "N"], ["text", "Texto", Type, "T"], ["connect", "Conectar", Waypoints, "L"],
  ];

  function nodeStyle(node: Node): React.CSSProperties {
    const common: React.CSSProperties = { left: node.x, top: node.y, width: node.w, height: node.h, borderColor: node.color };
    if (node.kind === "sticky") return { ...common, background: node.color, color: "#10131c", borderColor: "rgba(255,255,255,.26)" };
    if (node.kind === "text") return { ...common, background: "transparent", color: node.color, borderColor: "transparent" };
    return { ...common, background: `${node.color}1c`, color: "#f8fafc" };
  }

  return (
    <div ref={boardRef} className="fixed inset-0 z-[150] flex flex-col overflow-hidden bg-[#0b0d12] text-slate-100">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#12151d]/95 px-2.5 shadow-xl backdrop-blur-xl sm:px-4">
        <button onClick={onBack} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white" title="Voltar aos projetos">
          <ArrowLeft size={18} /><span className="hidden sm:inline">Projetos</span>
        </button>
        <div className="h-6 w-px bg-white/10" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white sm:max-w-[300px]">{title}</p>
          <p className="hidden items-center gap-1 text-[10px] text-slate-500 sm:flex">
            {saving ? <><RotateCcw size={10} className="animate-spin" /> Salvando alterações</> : saved ? <><Check size={10} className="text-emerald-400" /> Tudo salvo</> : "Quadro colaborativo"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <button onClick={() => setTemplatesOpen((open) => !open)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-500">
              <Sparkles size={15} /><span className="hidden sm:inline">Modelos</span><ChevronDown size={13} />
            </button>
            {templatesOpen && (
              <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#191d28] p-2 shadow-2xl">
                <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Começar rapidamente</p>
                {([
                  ["mind", "Mapa mental", "Tema central com quatro ramificações", Lightbulb],
                  ["flow", "Fluxograma", "Processo completo com decisão", Waypoints],
                  ["retro", "Retrospectiva", "Colunas para organizar feedback", BoxSelect],
                ] as const).map(([id, label, description, Icon]) => (
                  <button key={id} onClick={() => addTemplate(id)} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition hover:bg-white/7">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300"><Icon size={17} /></span>
                    <span><span className="block text-xs font-semibold text-white">{label}</span><span className="text-[10px] leading-tight text-slate-500">{description}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(sceneRef.current, null, 2)], { type: "application/json" });
            const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-quadro.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
          }} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" title="Baixar cópia do quadro"><Download size={17} /></button>
          <button onClick={() => void toggleFullscreen()} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" title={fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"} aria-label={fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}>
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <aside className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-white/10 bg-[#171a23]/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {toolbar.slice(0, 3).map(([id, label, Icon, shortcut]) => (
            <button key={id} onClick={() => { setTool(id); setConnectFrom(null); }} className={`group relative grid h-9 w-9 place-items-center rounded-xl transition ${tool === id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50" : "text-slate-400 hover:bg-white/10 hover:text-white"}`} title={`${label} (${shortcut})`}><Icon size={17} /></button>
          ))}
          <div className="my-0.5 h-px bg-white/10" />
          {toolbar.slice(3, 4).map(([id, label, Icon, shortcut]) => (
            <button key={id} onClick={() => { setTool(id); setConnectFrom(null); }} className={`grid h-9 w-9 place-items-center rounded-xl transition ${tool === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"}`} title={`${label} (${shortcut})`}><Icon size={17} /></button>
          ))}
          <div className="relative">
            <button onClick={() => setShapeMenu((open) => !open)} className={`grid h-9 w-9 place-items-center rounded-xl transition ${tool === "shape" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"}`} title="Formas"><Shapes size={17} /></button>
            {shapeMenu && (
              <div className="absolute left-12 top-0 flex gap-1 rounded-xl border border-white/10 bg-[#171a23] p-1.5 shadow-2xl">
                {([["box", Square], ["ellipse", Circle], ["diamond", Diamond]] as [NodeKind, typeof Square][]).map(([kind, Icon]) => (
                  <button key={kind} onClick={() => { setShapeKind(kind); setTool("shape"); setShapeMenu(false); }} className={`grid h-8 w-8 place-items-center rounded-lg ${shapeKind === kind ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10"}`}><Icon size={16} /></button>
                ))}
              </div>
            )}
          </div>
          {toolbar.slice(4).map(([id, label, Icon, shortcut]) => (
            <button key={id} onClick={() => { setTool(id); setConnectFrom(null); }} className={`grid h-9 w-9 place-items-center rounded-xl transition ${tool === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"}`} title={`${label} (${shortcut})`}><Icon size={17} /></button>
          ))}
        </aside>

        {(selectedNode || selectedStroke) && (
          <div className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100vw-150px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-[#171a23]/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-1 px-1">
              {COLORS.map((item) => <button key={item} onClick={() => { setColor(item); apply((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected ? { ...node, color: item } : node), strokes: current.strokes.map((stroke) => stroke.id === selected ? { ...stroke, color: item } : stroke) })); }} className={`h-5 w-5 shrink-0 rounded-full transition hover:scale-110 ${(selectedNode?.color ?? selectedStroke?.color) === item ? "ring-2 ring-white ring-offset-2 ring-offset-[#171a23]" : ""}`} style={{ background: item }} aria-label={`Usar cor ${item}`} />)}
            </div>
            <div className="mx-1 h-6 w-px shrink-0 bg-white/10" />
            {selectedNode && <button onClick={() => addBranch(selectedNode.id)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-white/10" title="Criar ramificação"><Plus size={14} /> Ramificar</button>}
            <button onClick={duplicateSelected} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Duplicar (Ctrl+D)"><Copy size={15} /></button>
            <button onClick={deleteSelected} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300" title="Excluir"><Trash2 size={15} /></button>
          </div>
        )}

        {connectFrom && <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-indigo-400/30 bg-indigo-950/90 px-4 py-2 text-xs text-indigo-200 shadow-xl">Agora clique na forma de destino · Esc para cancelar</div>}

        <div ref={canvasRef} data-canvas="1" onPointerDown={onCanvasDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
          className="absolute inset-0 touch-none select-none overflow-hidden bg-[#0d1017]"
          style={{ cursor: spacePressed || tool === "hand" ? "grab" : tool === "pen" || tool === "connect" || tool === "shape" || tool === "sticky" || tool === "text" ? "crosshair" : "default", backgroundImage: grid ? "radial-gradient(circle, rgba(148,163,184,.18) 1px, transparent 1.2px)" : "none", backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
          <div data-canvas="1" className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}>
            <svg data-canvas="1" className="absolute overflow-visible" style={{ width: 1, height: 1 }}>
              <defs>{COLORS.map((item, index) => <marker key={item} id={`arrow-${index}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill={item} /></marker>)}</defs>
              {scene.edges.map((edge) => {
                const from = scene.nodes.find((node) => node.id === edge.from);
                const to = scene.nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                const edgeColor = edge.color ?? from.color ?? COLORS[7];
                const colorIndex = Math.max(0, COLORS.indexOf(edgeColor));
                return <path key={edge.id} d={edgePath(from, to)} fill="none" stroke={edgeColor} strokeWidth={2.5} strokeDasharray={edge.dashed ? "8 7" : undefined} opacity={0.8} markerEnd={`url(#arrow-${colorIndex})`} pointerEvents="none" />;
              })}
              {scene.strokes.map((stroke) => {
                const points = stroke.pts.map((point) => point.join(",")).join(" ");
                const isSelected = selected === stroke.id;
                return <g key={stroke.id}>
                  {isSelected && <polyline points={points} fill="none" stroke="white" strokeWidth={stroke.width + 6} strokeLinecap="round" strokeLinejoin="round" opacity={.7} pointerEvents="none" strokeDasharray="8 5" />}
                  <polyline points={points} fill="none" stroke="transparent" strokeWidth={Math.max(16, stroke.width + 12)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" onPointerDown={(event) => onStrokeDown(event, stroke)} style={{ cursor: tool === "select" ? "move" : "crosshair" }} />
                  <polyline points={points} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                </g>;
              })}
            </svg>

            {scene.nodes.map((node) => {
              const isSelected = selected === node.id;
              const isDiamond = node.kind === "diamond";
              return (
                <div key={node.id} onPointerDown={(event) => onNodeDown(event, node)} onDoubleClick={(event) => { event.stopPropagation(); setEditing(node.id); setSelected(node.id); }}
                  className={`absolute border-2 shadow-xl transition-shadow ${node.kind === "ellipse" ? "rounded-[999px]" : node.kind === "sticky" ? "rounded-md shadow-black/30" : node.kind === "text" ? "border-transparent shadow-none" : "rounded-2xl"} ${isSelected ? "ring-[3px] ring-white/90 ring-offset-2 ring-offset-[#0d1017]" : ""} ${connectFrom === node.id ? "ring-[3px] ring-indigo-300" : ""}`}
                  style={{ ...nodeStyle(node), transform: isDiamond ? "rotate(45deg) scale(.78)" : undefined, cursor: tool === "select" ? "move" : "pointer" }}>
                  <div contentEditable={editing === node.id} suppressContentEditableWarning autoFocus={editing === node.id}
                    onBlur={(event) => { const text = event.currentTarget.textContent?.trim() || "Sem título"; apply((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === node.id ? { ...item, text } : item) }), false); setEditing(null); }}
                    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.blur(); } }}
                    onPointerDown={(event) => { if (editing === node.id) event.stopPropagation(); }}
                    className="grid h-full w-full place-items-center overflow-hidden whitespace-pre-wrap break-words px-4 text-center text-[13px] font-semibold leading-snug outline-none"
                    style={{ transform: isDiamond ? "rotate(-45deg) scale(1.22)" : undefined, cursor: editing === node.id ? "text" : "inherit", pointerEvents: editing === node.id ? "auto" : "none" }}>
                    {node.text}
                  </div>
                  {isSelected && tool === "select" && editing !== node.id && <button onPointerDown={(event) => startResize(event, node)} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border-2 border-[#0d1017] bg-white shadow-lg" style={{ transform: isDiamond ? "rotate(-45deg)" : undefined, cursor: "nwse-resize" }} aria-label="Redimensionar" />}
                  {isSelected && tool === "select" && editing !== node.id && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setConnectFrom(node.id); setTool("connect"); }} className="absolute -right-4 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-indigo-300/50 bg-indigo-600 text-white shadow-lg" style={{ transform: isDiamond ? "translateY(-50%) rotate(-45deg)" : undefined }} title="Criar conexão"><Link2 size={13} /></button>}
                </div>
              );
            })}
          </div>

          {!scene.nodes.length && !scene.strokes.length && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300"><Lightbulb size={28} /></div>
                <h2 className="text-lg font-semibold text-white">Transforme ideias em planos</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">Escolha um modelo no topo ou use a barra lateral para adicionar notas, formas, textos e conexões.</p>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-[#171a23]/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <button onClick={() => setView((current) => ({ ...current, k: Math.max(.15, current.k / 1.15) }))} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><ZoomOut size={16} /></button>
          <button onClick={fitContent} className="min-w-14 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10" title="Enquadrar conteúdo">{Math.round(view.k * 100)}%</button>
          <button onClick={() => setView((current) => ({ ...current, k: Math.min(4, current.k * 1.15) }))} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><ZoomIn size={16} /></button>
          <div className="mx-0.5 h-5 w-px bg-white/10" />
          <button onClick={fitContent} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Mostrar tudo"><Focus size={16} /></button>
          <button onClick={() => setGrid((visible) => !visible)} className={`rounded-lg p-1.5 hover:bg-white/10 ${grid ? "text-indigo-300" : "text-slate-500"}`} title="Grade"><Grid3X3 size={16} /></button>
          <div className="mx-0.5 h-5 w-px bg-white/10" />
          <button onClick={undo} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Desfazer"><Undo2 size={16} /></button>
          <button onClick={redo} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Refazer"><Redo2 size={16} /></button>
        </div>

        {minimap && (
          <button onClick={fitContent} className="absolute bottom-4 right-4 z-20 hidden h-24 w-36 overflow-hidden rounded-xl border border-white/10 bg-[#171a23]/90 shadow-2xl sm:block" title="Enquadrar todo o quadro">
            {scene.nodes.map((node) => {
              const scale = Math.min(116 / minimap.width, 68 / minimap.height);
              return <span key={node.id} className="absolute rounded-sm opacity-75" style={{ left: 10 + (node.x - minimap.minX) * scale, top: 10 + (node.y - minimap.minY) * scale, width: Math.max(3, node.w * scale), height: Math.max(3, node.h * scale), background: node.color }} />;
            })}
            <span className="absolute bottom-1.5 left-2 text-[8px] font-semibold uppercase tracking-wider text-slate-500">Mapa</span>
          </button>
        )}

        <div className="pointer-events-none absolute bottom-5 left-4 z-10 hidden text-[10px] text-slate-600 lg:block">Espaço + arrastar para mover · roda para zoom · duplo clique para editar</div>
      </div>
    </div>
  );
}
