"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, File as FileIcon, Folder, Search, Upload } from "lucide-react";

type FileNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  uploadedBy?: string;
  createdAt: string;
  dataUrl?: string;
};

type Positioned = FileNode & { x: number; y: number; depth: number };

function layout(nodes: FileNode[]): Positioned[] {
  const byParent = new Map<string | null, FileNode[]>();
  nodes.forEach((n) => {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  });

  const positioned: Positioned[] = [];
  const centerX = 480;
  const centerY = 300;

  function place(id: string | null, depth: number, angleStart: number, angleEnd: number) {
    const children = byParent.get(id) ?? [];
    const step = (angleEnd - angleStart) / Math.max(children.length, 1);
    children.forEach((child, i) => {
      const angle = angleStart + step * (i + 0.5);
      const radius = depth * 150;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positioned.push({ ...child, x, y, depth });
      place(child.id, depth + 1, angle - step / 2.2, angle + step / 2.2);
    });
  }

  const root = nodes.find((n) => n.parentId === null);
  if (root) {
    positioned.push({ ...root, x: centerX, y: centerY, depth: 0 });
    place(root.id, 1, 0, Math.PI * 2);
  }
  return positioned;
}

export default function FilesGraphTab() {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Positioned | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/files");
    const data = await res.json();
    setNodes(data.files);
  }

  useEffect(() => {
    load();
  }, []);

  const positioned = useMemo(() => layout(nodes), [nodes]);
  const byId = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  async function handleUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const targetFolder = positioned.find((n) => n.type === "folder" && n.depth === 1)?.id ?? "root";
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          parentId: targetFolder,
          uploadedBy: "Você",
          dataUrl: reader.result,
        }),
      });
      load();
    };
    reader.readAsDataURL(file);
  }

  function download(node: Positioned) {
    if (!node.dataUrl) {
      alert("Este arquivo não possui conteúdo para download (dado de demonstração).");
      return;
    }
    const a = document.createElement("a");
    a.href = node.dataUrl;
    a.download = node.name;
    a.click();
  }

  const matches = query
    ? new Set(
        positioned
          .filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
          .map((n) => n.id)
      )
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
          <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
            <Upload size={14} /> Upload
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      <div className="flex-1 liquid-glass rounded-2xl overflow-hidden relative">
        <svg viewBox="0 0 960 600" className="w-full h-full">
          {positioned.map((n) => {
            if (n.parentId === null) return null;
            const parent = byId.get(n.parentId);
            if (!parent) return null;
            return (
              <line
                key={`edge-${n.id}`}
                x1={parent.x}
                y1={parent.y}
                x2={n.x}
                y2={n.y}
                stroke="rgba(16,185,129,0.25)"
                strokeWidth={1.5}
              />
            );
          })}
          {positioned.map((n) => {
            const dim = matches && !matches.has(n.id);
            const radius = n.type === "folder" ? 26 - n.depth * 4 : 14;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className="cursor-pointer"
                opacity={dim ? 0.25 : 1}
                onClick={() => setSelected(n)}
              >
                <circle
                  r={radius}
                  fill={n.type === "folder" ? "#064e3b" : "#111827"}
                  stroke={n.type === "folder" ? "#10b981" : "#374151"}
                  strokeWidth={selected?.id === n.id ? 3 : 1.5}
                />
                <text
                  y={radius + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#cbd5e1"
                  className="select-none"
                >
                  {n.name.length > 16 ? `${n.name.slice(0, 14)}…` : n.name}
                </text>
              </g>
            );
          })}
        </svg>

        {selected && (
          <div className="drawer-anim absolute bottom-4 right-4 liquid-glass rounded-xl p-4 w-64">
            <div className="flex items-center gap-2 mb-2">
              {selected.type === "folder" ? <Folder size={16} className="text-emerald-400" /> : <FileIcon size={16} />}
              <p className="text-sm font-semibold truncate">{selected.name}</p>
            </div>
            {selected.uploadedBy && <p className="text-xs text-gray-400 mb-1">Enviado por {selected.uploadedBy}</p>}
            <p className="text-xs text-gray-500 mb-3">{new Date(selected.createdAt).toLocaleString("pt-BR")}</p>
            {selected.type === "file" && (
              <button
                onClick={() => download(selected)}
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
