"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, File as FileIcon, Folder, FolderPlus, Search, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { FileNodeRow, Profile } from "@/lib/types";

type PositionedNode = FileNodeRow & { pos_x: number; pos_y: number };

function computeMissingPositions(nodes: FileNodeRow[]): FileNodeRow[] {
  const byParent = new Map<string | null, FileNodeRow[]>();
  nodes.forEach((n) => {
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  });
  const result = new Map(nodes.map((n) => [n.id, { ...n }]));
  const centerX = 480;
  const centerY = 320;

  function place(id: string | null, depth: number, angleStart: number, angleEnd: number) {
    const children = byParent.get(id) ?? [];
    const step = (angleEnd - angleStart) / Math.max(children.length, 1);
    children.forEach((child, i) => {
      const node = result.get(child.id)!;
      if (node.pos_x === null || node.pos_y === null) {
        const angle = angleStart + step * (i + 0.5);
        const radius = depth * 160;
        node.pos_x = centerX + radius * Math.cos(angle);
        node.pos_y = centerY + radius * Math.sin(angle);
      }
      place(child.id, depth + 1, angleStart + step * i, angleStart + step * (i + 1));
    });
  }

  const root = nodes.find((n) => n.parent_id === null);
  if (root) {
    const rootNode = result.get(root.id)!;
    if (rootNode.pos_x === null || rootNode.pos_y === null) {
      rootNode.pos_x = centerX;
      rootNode.pos_y = centerY;
    }
    place(root.id, 1, 0, Math.PI * 2);
  }
  return Array.from(result.values());
}

export default function FilesGraphTab({ profile }: { profile: Profile | null }) {
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  async function load() {
    if (!supabase) return;
    const { data } = await supabase.from("files").select("*").order("created_at");
    if (!data) return;
    const withPositions = computeMissingPositions(data) as PositionedNode[];
    setNodes(withPositions);
    const toPersist = withPositions.filter((n) => {
      const original = data.find((d) => d.id === n.id);
      return original && (original.pos_x === null || original.pos_y === null);
    });
    for (const n of toPersist) {
      await supabase.from("files").update({ pos_x: n.pos_x, pos_y: n.pos_y }).eq("id", n.id);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selected ? byId.get(selected) ?? null : null;

  async function handleUpload(file: File) {
    const client = supabase;
    if (!client) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const targetFolder = nodes.find((n) => n.type === "folder")?.id;
      if (!targetFolder) return;
      const parent = byId.get(targetFolder)!;
      const siblingCount = nodes.filter((n) => n.parent_id === targetFolder).length;
      const { data } = await client
        .from("files")
        .insert({
          name: file.name,
          type: "file",
          parent_id: targetFolder,
          uploaded_by: profile?.id ?? null,
          data_url: reader.result as string,
          pos_x: parent.pos_x + 120 + siblingCount * 20,
          pos_y: parent.pos_y + 100,
        })
        .select("*")
        .single();
      if (data) setNodes((prev) => [...prev, data as PositionedNode]);
    };
    reader.readAsDataURL(file);
  }

  async function handleNewFolder() {
    if (!supabase) return;
    const parentId = selectedNode?.type === "folder" ? selectedNode.id : nodes.find((n) => n.parent_id === null)?.id;
    if (!parentId) return;
    const parent = byId.get(parentId)!;
    const siblingCount = nodes.filter((n) => n.parent_id === parentId).length;
    const { data } = await supabase
      .from("files")
      .insert({
        name: "Nova Pasta",
        type: "folder",
        parent_id: parentId,
        uploaded_by: profile?.id ?? null,
        pos_x: parent.pos_x + 140 + siblingCount * 20,
        pos_y: parent.pos_y + 140,
      })
      .select("*")
      .single();
    if (data) {
      setNodes((prev) => [...prev, data as PositionedNode]);
      setSelected(data.id);
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

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    const n = byId.get(id);
    if (!rect || !n) return;
    dragOffset.current = { x: e.clientX - rect.left - n.pos_x, y: e.clientY - rect.top - n.pos_y };
    setDragging(id);
    setSelected(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - dragOffset.current.x;
    const y = e.clientY - rect.top - dragOffset.current.y;
    setNodes((prev) => prev.map((n) => (n.id === dragging ? { ...n, pos_x: x, pos_y: y } : n)));
  }

  async function onPointerUp() {
    if (!dragging) return;
    const n = byId.get(dragging);
    setDragging(null);
    if (n && supabase) await supabase.from("files").update({ pos_x: n.pos_x, pos_y: n.pos_y }).eq("id", n.id);
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
          <button
            onClick={handleNewFolder}
            className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
          >
            <FolderPlus size={14} /> Nova pasta
          </button>
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
        className="w-full h-full overflow-auto custom-scroll relative"
      >
        <div style={{ position: "relative", minWidth: 1400, minHeight: 900 }}>
          <svg className="absolute inset-0 pointer-events-none" style={{ width: 1400, height: 900 }}>
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
                className="absolute cursor-grab active:cursor-grabbing select-none"
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
            {selectedNode.type === "file" && (
              <button
                onClick={() => download(selectedNode)}
                className="flex items-center gap-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
              >
                <Download size={12} /> Baixar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
