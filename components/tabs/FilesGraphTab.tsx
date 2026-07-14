"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Download, File as FileIcon, Folder, FolderPlus, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { FileNodeRow, Profile } from "@/lib/types";

type PositionedNode = FileNodeRow & { pos_x: number; pos_y: number };

// Centro inicial (recalculado dinamicamente a partir do tamanho do container)
const CENTER_X = 450;
const CENTER_Y = 300;

// Parâmetros da simulação de forças (estilo grafo do Obsidian)
const CHARGE = 11000; // repulsão entre nós
const LINK_LEN = 95; // comprimento de repouso das ligações
const LINK_K = 0.045; // rigidez das ligações (mola)
const GRAVITY = 0.03; // atração suave para o centro
const FRICTION = 0.75; // amortecimento (quanto menor, mais "parado")
const V_CLAMP = 40; // limite de velocidade
const ALPHA_DECAY = 0.985;
const ALPHA_MIN = 0.02;

function computeMissingPositions(nodes: FileNodeRow[]): FileNodeRow[] {
  const byParent = new Map<string | null, FileNodeRow[]>();
  nodes.forEach((n) => {
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  });
  const result = new Map(nodes.map((n) => [n.id, { ...n }]));

  function place(id: string | null, depth: number, angleStart: number, angleEnd: number) {
    const children = byParent.get(id) ?? [];
    const step = (angleEnd - angleStart) / Math.max(children.length, 1);
    children.forEach((child, i) => {
      const node = result.get(child.id)!;
      if (node.pos_x === null || node.pos_y === null) {
        const angle = angleStart + step * (i + 0.5);
        const radius = depth * 150;
        node.pos_x = CENTER_X + radius * Math.cos(angle);
        node.pos_y = CENTER_Y + radius * Math.sin(angle);
      }
      place(child.id, depth + 1, angleStart + step * i, angleStart + step * (i + 1));
    });
  }

  const roots = nodes.filter((n) => n.parent_id === null);
  roots.forEach((root, idx) => {
    const rootNode = result.get(root.id)!;
    if (rootNode.pos_x === null || rootNode.pos_y === null) {
      rootNode.pos_x = CENTER_X + (idx - (roots.length - 1) / 2) * 80;
      rootNode.pos_y = CENTER_Y;
    }
    place(root.id, 1, 0, Math.PI * 2);
  });
  return Array.from(result.values());
}

// Dados de exemplo para o modo demo (sem Supabase), só para visualizar o grafo.
function demoNodes(): PositionedNode[] {
  const mk = (id: string, name: string, type: "folder" | "file", parent: string | null): PositionedNode => ({
    id,
    name,
    type,
    parent_id: parent,
    uploaded_by: null,
    data_url: null,
    drive_file_id: null,
    chatbot_id: null,
    bot_share_status: "none",
    bot_share_requested_by: null,
    text_content: null,
    pos_x: CENTER_X + (Math.random() - 0.5) * 200,
    pos_y: CENTER_Y + (Math.random() - 0.5) * 200,
    created_at: new Date().toISOString(),
  });
  return [
    mk("r", "Empresa", "folder", null),
    mk("a", "Financeiro", "folder", "r"),
    mk("b", "Marketing", "folder", "r"),
    mk("c", "Operações", "folder", "r"),
    mk("a1", "Balanço.pdf", "file", "a"),
    mk("a2", "Notas.xlsx", "file", "a"),
    mk("b1", "Campanha.png", "file", "b"),
    mk("b2", "Roteiro.doc", "file", "b"),
    mk("c1", "Manual.pdf", "file", "c"),
    mk("c2", "Escala.xlsx", "file", "c"),
    mk("c3", "Checklist.txt", "file", "c"),
  ];
}

export default function FilesGraphTab({ profile }: { profile: Profile | null }) {
  const canManage = profile?.role === "gestor" || profile?.role === "gerente";
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    positions: Map<string, { x: number; y: number }>;
  } | null>(null);

  // Estado da simulação de forças
  const nodesRef = useRef<PositionedNode[]>([]);
  const velRef = useRef<Map<string, { vx: number; vy: number }>>(new Map());
  const fixedRef = useRef<Set<string>>(new Set());
  const alphaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const settledPersistRef = useRef(false);
  const sizeRef = useRef({ w: CENTER_X * 2, h: CENTER_Y * 2 });

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Acompanha o tamanho real do container para centralizar/limitar o grafo.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth && el.clientHeight) sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persistPositions = useCallback(async () => {
    if (!supabase) return;
    const client = supabase;
    await Promise.all(
      nodesRef.current.map((n) =>
        client.from("files").update({ pos_x: Math.round(n.pos_x), pos_y: Math.round(n.pos_y) }).eq("id", n.id)
      )
    ).catch(() => {});
  }, []);

  const tick = useCallback(() => {
    const list = nodesRef.current;
    if (list.length === 0) {
      rafRef.current = null;
      return;
    }
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const fx = new Map<string, number>();
    const fy = new Map<string, number>();
    for (const n of list) {
      fx.set(n.id, (cx - n.pos_x) * GRAVITY);
      fy.set(n.id, (cy - n.pos_y) * GRAVITY);
    }
    // Repulsão entre todos os pares (campo tipo elétrico/gravitacional)
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        let dx = a.pos_x - b.pos_x;
        let dy = a.pos_y - b.pos_y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const rep = CHARGE / d2;
        const rx = (dx / d) * rep;
        const ry = (dy / d) * rep;
        fx.set(a.id, (fx.get(a.id) ?? 0) + rx);
        fy.set(a.id, (fy.get(a.id) ?? 0) + ry);
        fx.set(b.id, (fx.get(b.id) ?? 0) - rx);
        fy.set(b.id, (fy.get(b.id) ?? 0) - ry);
      }
    }
    // Molas nas ligações (pai -> filho)
    const byIdLocal = new Map(list.map((n) => [n.id, n]));
    for (const n of list) {
      if (!n.parent_id) continue;
      const p = byIdLocal.get(n.parent_id);
      if (!p) continue;
      const dx = n.pos_x - p.pos_x;
      const dy = n.pos_y - p.pos_y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (d - LINK_LEN) * LINK_K;
      const ax = (dx / d) * force;
      const ay = (dy / d) * force;
      fx.set(n.id, (fx.get(n.id) ?? 0) - ax);
      fy.set(n.id, (fy.get(n.id) ?? 0) - ay);
      fx.set(p.id, (fx.get(p.id) ?? 0) + ax);
      fy.set(p.id, (fy.get(p.id) ?? 0) + ay);
    }

    const alpha = alphaRef.current;
    const next = list.map((n) => {
      if (fixedRef.current.has(n.id)) return n; // nós arrastados ficam presos ao ponteiro
      const v = velRef.current.get(n.id) ?? { vx: 0, vy: 0 };
      let vx = (v.vx + (fx.get(n.id) ?? 0)) * FRICTION;
      let vy = (v.vy + (fy.get(n.id) ?? 0)) * FRICTION;
      vx = Math.max(-V_CLAMP, Math.min(V_CLAMP, vx));
      vy = Math.max(-V_CLAMP, Math.min(V_CLAMP, vy));
      velRef.current.set(n.id, { vx, vy });
      const nx = Math.max(40, Math.min(w - 40, n.pos_x + vx * alpha));
      const ny = Math.max(40, Math.min(h - 48, n.pos_y + vy * alpha));
      return { ...n, pos_x: nx, pos_y: ny };
    });
    nodesRef.current = next;
    setNodes(next);

    alphaRef.current = alpha * ALPHA_DECAY;
    if (alphaRef.current > ALPHA_MIN) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
      if (!settledPersistRef.current) {
        settledPersistRef.current = true;
        persistPositions();
      }
    }
  }, [persistPositions]);

  const kick = useCallback(
    (energy = 1) => {
      alphaRef.current = Math.max(alphaRef.current, energy);
      settledPersistRef.current = false;
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    },
    [tick]
  );

  async function load() {
    if (!supabase) {
      const demo = demoNodes();
      setNodes(demo);
      nodesRef.current = demo;
      kick(1);
      return;
    }
    const { data } = await supabase.from("files").select("*").order("created_at");
    if (!data) return;
    const withPositions = computeMissingPositions(data) as PositionedNode[];
    setNodes(withPositions);
    nodesRef.current = withPositions;
    const toPersist = withPositions.filter((n) => {
      const original = data.find((d) => d.id === n.id);
      return original && (original.pos_x === null || original.pos_y === null);
    });
    for (const n of toPersist) {
      await supabase.from("files").update({ pos_x: n.pos_x, pos_y: n.pos_y }).eq("id", n.id);
    }
    kick(0.6);
  }

  useEffect(() => {
    load();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selected ? byId.get(selected) ?? null : null;

  async function readTextContent(file: File): Promise<string | null> {
    const textLike = /\.(txt|md|csv|json|log|html?|xml|yml|yaml|js|ts|css)$/i.test(file.name) ||
      file.type.startsWith("text/");
    if (!textLike || file.size > 200_000) return null;
    try {
      return await file.text();
    } catch {
      return null;
    }
  }

  async function handleUpload(file: File) {
    const client = supabase;
    if (!client) return;
    // Alvo: pasta selecionada, senão a primeira pasta.
    const targetFolder = selectedNode?.type === "folder" ? selectedNode.id : nodes.find((n) => n.type === "folder")?.id;
    if (!targetFolder) return;
    const parent = byId.get(targetFolder)!;
    const textContent = await readTextContent(file);
    const reader = new FileReader();
    reader.onload = async () => {
      const { data } = await client
        .from("files")
        .insert({
          name: file.name,
          type: "file",
          parent_id: targetFolder,
          uploaded_by: profile?.id ?? null,
          data_url: reader.result as string,
          text_content: textContent,
          pos_x: parent.pos_x + (Math.random() - 0.5) * 40,
          pos_y: parent.pos_y + (Math.random() - 0.5) * 40,
        })
        .select("*")
        .single();
      if (data) {
        setNodes((prev) => [...prev, data as PositionedNode]);
        kick(1);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRename(node: PositionedNode) {
    if (!supabase) return;
    if (node.type === "folder" && !canManage) {
      alert("Apenas gestores e gerentes podem renomear pastas.");
      return;
    }
    const name = prompt("Novo nome:", node.name)?.trim();
    if (!name || name === node.name) return;
    const { error } = await supabase.from("files").update({ name }).eq("id", node.id);
    if (error) {
      alert("Não foi possível renomear: " + error.message);
      return;
    }
    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, name } : n)));
  }

  async function handleDelete(node: PositionedNode) {
    if (!supabase) return;
    if (node.type === "folder" && !canManage) {
      alert("Apenas gestores e gerentes podem apagar pastas.");
      return;
    }
    const ids = collectSubtree(node.id);
    const label = node.type === "folder" ? `a pasta "${node.name}" e todo o seu conteúdo` : `o arquivo "${node.name}"`;
    if (!confirm(`Apagar ${label}?`)) return;
    const { error } = await supabase.from("files").delete().in("id", ids);
    if (error) {
      alert("Não foi possível apagar: " + error.message);
      return;
    }
    setNodes((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelected(null);
    kick(0.6);
  }

  // Compartilhar pasta com o robô de IA (passa por aprovação do gestor/gerente).
  async function requestBotShare(node: PositionedNode) {
    if (!supabase || node.type !== "folder") return;
    // Gerenciadores aprovam direto; funcionários enviam pedido.
    const status = canManage ? "approved" : "pending";
    const { error } = await supabase
      .from("files")
      .update({ bot_share_status: status, bot_share_requested_by: profile?.id ?? null })
      .eq("id", node.id);
    if (error) {
      alert("Não foi possível compartilhar: " + error.message);
      return;
    }
    setNodes((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, bot_share_status: status, bot_share_requested_by: profile?.id ?? null } : n))
    );
    alert(canManage ? "Pasta liberada para o robô de IA." : "Pedido enviado ao gestor para aprovação.");
  }

  async function reviewBotShare(node: PositionedNode, approve: boolean) {
    if (!supabase || !canManage) return;
    const status = approve ? "approved" : "rejected";
    const { error } = await supabase.from("files").update({ bot_share_status: status }).eq("id", node.id);
    if (error) {
      alert("Falha ao atualizar: " + error.message);
      return;
    }
    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, bot_share_status: status } : n)));
  }

  async function handleNewFolder() {
    if (!supabase) return;
    if (!canManage) {
      alert("Apenas gestores e gerentes podem criar pastas.");
      return;
    }
    const parentId = selectedNode?.type === "folder" ? selectedNode.id : nodes.find((n) => n.parent_id === null)?.id;
    if (!parentId) return;
    const parent = byId.get(parentId)!;
    const { data } = await supabase
      .from("files")
      .insert({
        name: "Nova Pasta",
        type: "folder",
        parent_id: parentId,
        uploaded_by: profile?.id ?? null,
        pos_x: parent.pos_x + (Math.random() - 0.5) * 40,
        pos_y: parent.pos_y + (Math.random() - 0.5) * 40,
      })
      .select("*")
      .single();
    if (data) {
      setNodes((prev) => [...prev, data as PositionedNode]);
      setSelected(data.id);
      kick(1);
    }
  }

  function download(node: PositionedNode) {
    if (!node.data_url) {
      alert("Este arquivo não possui conteúdo para download (dado de demonstração).");
      return;
    }
    const a = document.createElement("a");
    a.href = node.data_url;
    a.download = node.name;
    a.click();
  }

  function collectSubtree(rootId: string): string[] {
    const childrenByParent = new Map<string | null, string[]>();
    nodesRef.current.forEach((n) => {
      const list = childrenByParent.get(n.parent_id) ?? [];
      list.push(n.id);
      childrenByParent.set(n.parent_id, list);
    });
    const ids: string[] = [rootId];
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop()!;
      for (const childId of childrenByParent.get(current) ?? []) {
        ids.push(childId);
        stack.push(childId);
      }
    }
    return ids;
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    const positions = new Map<string, { x: number; y: number }>();
    const subtree = collectSubtree(id);
    for (const nodeId of subtree) {
      const n = byId.get(nodeId);
      if (n) {
        positions.set(nodeId, { x: n.pos_x, y: n.pos_y });
        fixedRef.current.add(nodeId);
        velRef.current.set(nodeId, { vx: 0, vy: 0 });
      }
    }
    dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, positions };
    setDragging(id);
    setSelected(id);
    kick(0.9); // deixa o resto do grafo reagir enquanto arrasta
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current) return;
    const { pointerX, pointerY, positions } = dragStart.current;
    const dx = e.clientX - pointerX;
    const dy = e.clientY - pointerY;
    const next = nodesRef.current.map((n) => {
      const start = positions.get(n.id);
      return start ? { ...n, pos_x: start.x + dx, pos_y: start.y + dy } : n;
    });
    nodesRef.current = next;
    setNodes(next);
    kick(0.9);
  }

  function onPointerUp() {
    if (!dragging) return;
    fixedRef.current.clear();
    dragStart.current = null;
    setDragging(null);
    kick(0.7); // relaxa suavemente e persiste ao assentar
  }

  const matches = query
    ? new Set(nodes.filter((n) => n.name.toLowerCase().includes(query.toLowerCase())).map((n) => n.id))
    : null;

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Folder className="text-emerald-400" size={20} /> Arquivos em Grafo
        </h3>
        <div className="flex items-center gap-2">
          <div className="liquid-glass rounded-lg flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar arquivo ou pasta..."
              className="bg-transparent outline-none text-xs w-48"
            />
          </div>
          {canManage && (
            <button
              onClick={handleNewFolder}
              className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
            >
              <FolderPlus size={14} /> Nova pasta
            </button>
          )}
          <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
            <Upload size={14} /> Upload
            <input
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      <div className="flex-1 liquid-glass rounded-2xl overflow-hidden relative">
        <div
          ref={containerRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="w-full h-full overflow-hidden relative touch-none"
        >
          <div className="absolute inset-0">
            <svg className="absolute inset-0 pointer-events-none w-full h-full">
              {nodes.map((n) => {
                if (n.parent_id === null) return null;
                const parent = byId.get(n.parent_id);
                if (!parent) return null;
                return (
                  <line
                    key={`edge-${n.id}`}
                    x1={parent.pos_x}
                    y1={parent.pos_y}
                    x2={n.pos_x}
                    y2={n.pos_y}
                    stroke="rgba(16,185,129,0.25)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>
            {nodes.map((n) => {
              const dim = matches && !matches.has(n.id);
              const radius = n.type === "folder" ? 24 : 14;
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => onPointerDownNode(e, n.id)}
                  style={{ left: n.pos_x - radius, top: n.pos_y - radius, width: radius * 2, height: radius * 2 }}
                  className="absolute cursor-grab active:cursor-grabbing select-none touch-none"
                >
                  <div
                    className="rounded-full flex items-center justify-center w-full h-full"
                    style={{
                      opacity: dim ? 0.25 : 1,
                      background: n.type === "folder" ? "#064e3b" : "#111827",
                      border: `1.5px solid ${selected === n.id ? "#10b981" : n.type === "folder" ? "#10b981" : "#374151"}`,
                      borderWidth: selected === n.id ? 3 : 1.5,
                    }}
                  >
                    {n.type === "folder" ? (
                      <Folder size={radius} className="text-emerald-400" />
                    ) : (
                      <FileIcon size={radius} className="text-gray-400" />
                    )}
                  </div>
                  <span
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[11px] text-gray-300 whitespace-nowrap select-none"
                    style={{ opacity: dim ? 0.25 : 1 }}
                  >
                    {n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {selectedNode && (
          <div className="drawer-anim absolute bottom-4 right-4 liquid-glass rounded-xl p-4 w-64">
            <div className="flex items-center gap-2 mb-2">
              {selectedNode.type === "folder" ? (
                <Folder size={16} className="text-emerald-400" />
              ) : (
                <FileIcon size={16} />
              )}
              <p className="text-sm font-semibold truncate">{selectedNode.name}</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">{new Date(selectedNode.created_at).toLocaleString("pt-BR")}</p>

            {/* Estado de compartilhamento com o robô (só pastas) */}
            {selectedNode.type === "folder" && selectedNode.bot_share_status !== "none" && (
              <div className="mb-3 text-[11px] flex items-center gap-1.5">
                <Bot size={12} className="text-indigo-400" />
                {selectedNode.bot_share_status === "approved" && (
                  <span className="text-emerald-400">No cérebro do robô de IA</span>
                )}
                {selectedNode.bot_share_status === "pending" && (
                  <span className="text-amber-400">Aguardando aprovação do gestor</span>
                )}
                {selectedNode.bot_share_status === "rejected" && (
                  <span className="text-gray-500">Compartilhamento recusado</span>
                )}
              </div>
            )}

            {/* Aprovação (gerenciadores) */}
            {selectedNode.type === "folder" && selectedNode.bot_share_status === "pending" && canManage && (
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => reviewBotShare(selectedNode, true)}
                  className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg cursor-pointer"
                >
                  <Check size={12} /> Aprovar p/ robô
                </button>
                <button
                  onClick={() => reviewBotShare(selectedNode, false)}
                  className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg cursor-pointer"
                >
                  <X size={12} /> Recusar
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {selectedNode.type === "file" && (
                <button
                  onClick={() => download(selectedNode)}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Download size={12} /> Baixar
                </button>
              )}
              {selectedNode.type === "folder" &&
                (selectedNode.bot_share_status === "none" || selectedNode.bot_share_status === "rejected") && (
                  <button
                    onClick={() => requestBotShare(selectedNode)}
                    className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                    title="Adicionar o conteúdo desta pasta ao cérebro do robô de IA"
                  >
                    <Bot size={12} /> {canManage ? "Dar ao robô" : "Pedir p/ robô"}
                  </button>
                )}
              {(selectedNode.type === "file" || canManage) && (
                <button
                  onClick={() => handleRename(selectedNode)}
                  className="flex items-center gap-1.5 text-xs liquid-glass px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Pencil size={12} /> Renomear
                </button>
              )}
              {(selectedNode.type === "file" || canManage) && (
                <button
                  onClick={() => handleDelete(selectedNode)}
                  className="flex items-center gap-1.5 text-xs bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Trash2 size={12} /> Apagar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
