"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Download, Eye, File as FileIcon, Folder, FolderPlus, Link2, Pencil, Search, Server, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { extractText } from "@/lib/extract-text";
import { logAction } from "@/lib/activity-log";
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
    storage_path: null,
    mime: null,
    source_path: null,
    server_agent_id: null,
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
  const actor = profile?.full_name ?? profile?.email ?? "Usuário";
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [links, setLinks] = useState<{ id: string; source_id: string; target_id: string }[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [linkPick, setLinkPick] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  // Grafo colapsável: começa mostrando só as pastas raiz; clicar expande.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const expandedRef = useRef<Set<string>>(new Set());
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const downInfo = useRef<{ x: number; y: number; moved: boolean } | null>(null);
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

  // Nós visíveis = raízes + filhos de pastas expandidas (árvore colapsável).
  const visibleIds = useMemo(() => {
    const childrenByParent = new Map<string | null, PositionedNode[]>();
    nodes.forEach((n) => {
      const l = childrenByParent.get(n.parent_id) ?? [];
      l.push(n);
      childrenByParent.set(n.parent_id, l);
    });
    const vis = new Set<string>();
    const roots = nodes.filter((n) => n.parent_id === null);
    const stack = [...roots];
    roots.forEach((r) => vis.add(r.id));
    while (stack.length) {
      const n = stack.pop()!;
      if (n.type === "folder" && expanded.has(n.id)) {
        for (const c of childrenByParent.get(n.id) ?? []) {
          vis.add(c.id);
          stack.push(c);
        }
      }
    }
    return vis;
  }, [nodes, expanded]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  useEffect(() => {
    visibleIdsRef.current = visibleIds;
    kick(0.5); // re-acomoda ao expandir/colapsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);

  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n) => {
      if (n.parent_id) m.set(n.parent_id, (m.get(n.parent_id) ?? 0) + 1);
    });
    return m;
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
    const all = nodesRef.current;
    const vis = visibleIdsRef.current;
    const list = all.filter((n) => vis.has(n.id));
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
    const movedMap = new Map<string, PositionedNode>();
    for (const n of list) {
      if (fixedRef.current.has(n.id)) {
        movedMap.set(n.id, n); // nós arrastados ficam presos ao ponteiro
        continue;
      }
      const v = velRef.current.get(n.id) ?? { vx: 0, vy: 0 };
      let vx = (v.vx + (fx.get(n.id) ?? 0)) * FRICTION;
      let vy = (v.vy + (fy.get(n.id) ?? 0)) * FRICTION;
      vx = Math.max(-V_CLAMP, Math.min(V_CLAMP, vx));
      vy = Math.max(-V_CLAMP, Math.min(V_CLAMP, vy));
      velRef.current.set(n.id, { vx, vy });
      const nx = Math.max(40, Math.min(w - 40, n.pos_x + vx * alpha));
      const ny = Math.max(40, Math.min(h - 48, n.pos_y + vy * alpha));
      movedMap.set(n.id, { ...n, pos_x: nx, pos_y: ny });
    }
    // Mantém todos os nós no estado; só os visíveis se movem.
    const next = all.map((n) => movedMap.get(n.id) ?? n);
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
    const [{ data }, { data: linkRows }] = await Promise.all([
      supabase.from("files").select("*").order("created_at"),
      supabase.from("file_links").select("id,source_id,target_id"),
    ]);
    setLinks(linkRows ?? []);
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

  // Atualização ao vivo do grafo: qualquer arquivo/pasta novo (upload, automação,
  // servidor) ou ligação aparece na hora, sem precisar recarregar.
  useEffect(() => {
    if (!supabase) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (dragging) return; // não recarrega no meio de um arraste
      if (t) clearTimeout(t);
      t = setTimeout(() => load(), 500);
    };
    const ch = supabase
      .channel("files-graph")
      .on("postgres_changes", { event: "*", schema: "public", table: "files" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "file_links" }, reload)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      if (supabase) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selected ? byId.get(selected) ?? null : null;

  async function handleUpload(file: File) {
    const client = supabase;
    if (!client) return;
    // Alvo: pasta selecionada, senão a primeira pasta.
    const targetFolder = selectedNode?.type === "folder" ? selectedNode.id : nodes.find((n) => n.type === "folder")?.id;
    if (!targetFolder) return;
    const parent = byId.get(targetFolder)!;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const textContent = await extractText(file, dataUrl); // lê txt/pdf/word p/ o cérebro
      const { data } = await client
        .from("files")
        .insert({
          name: file.name,
          type: "file",
          parent_id: targetFolder,
          uploaded_by: profile?.id ?? null,
          data_url: dataUrl,
          text_content: textContent,
          pos_x: parent.pos_x + (Math.random() - 0.5) * 40,
          pos_y: parent.pos_y + (Math.random() - 0.5) * 40,
        })
        .select("*")
        .single();
      if (data) {
        setNodes((prev) => [...prev, data as PositionedNode]);
        kick(1);
        logAction(actor, `Enviou o arquivo "${file.name}" para a pasta "${parent.name}"`);
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
    const old = node.name;
    const { error } = await supabase.from("files").update({ name }).eq("id", node.id);
    if (error) {
      alert("Não foi possível renomear: " + error.message);
      return;
    }
    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, name } : n)));
    // Propaga o rename para o disco do servidor (se for um item do servidor).
    if (node.source_path && node.server_agent_id) {
      const sep = node.source_path.includes("\\") ? "\\" : "/";
      const dir = node.source_path.slice(0, node.source_path.lastIndexOf(sep));
      await supabase.rpc("enqueue_server_op", { p_agent_id: node.server_agent_id, p_op: "rename", p_path: node.source_path, p_new_path: `${dir}${sep}${name}` });
    }
    logAction(actor, `Renomeou ${node.type === "folder" ? "a pasta" : "o arquivo"} "${old}" para "${name}"`);
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
    // Propaga o apagar para o disco do servidor (se for item do servidor).
    if (node.source_path && node.server_agent_id) {
      await supabase.rpc("enqueue_server_op", { p_agent_id: node.server_agent_id, p_op: "delete", p_path: node.source_path });
    }
    const { error } = await supabase.from("files").delete().in("id", ids);
    if (error) {
      alert("Não foi possível apagar: " + error.message);
      return;
    }
    setNodes((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelected(null);
    kick(0.6);
    logAction(actor, `Apagou ${label}`);
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

  // Liga uma pasta a outra (ex.: pasta do robô <-> pasta da empresa).
  async function connectFolders(sourceId: string, targetId: string) {
    if (!supabase || !canManage || sourceId === targetId) return;
    const { data, error } = await supabase
      .from("file_links")
      .insert({ source_id: sourceId, target_id: targetId, created_by: profile?.id ?? null })
      .select("id,source_id,target_id")
      .single();
    if (error) {
      alert("Não foi possível conectar: " + error.message);
      return;
    }
    if (data) setLinks((prev) => [...prev, data]);
    setLinkPick("");
  }

  async function removeLink(linkId: string) {
    if (!supabase) return;
    await supabase.from("file_links").delete().eq("id", linkId);
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
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
    const parent = parentId ? byId.get(parentId) : null;
    // Sem pasta-mãe (grafo vazio ou nada selecionado) => cria pasta no topo (raiz).
    const { w, h } = sizeRef.current;
    const { data, error } = await supabase
      .from("files")
      .insert({
        name: "Nova Pasta",
        type: "folder",
        parent_id: parentId ?? null,
        uploaded_by: profile?.id ?? null,
        pos_x: parent ? parent.pos_x + (Math.random() - 0.5) * 40 : w / 2 + (Math.random() - 0.5) * 60,
        pos_y: parent ? parent.pos_y + (Math.random() - 0.5) * 40 : h / 2 + (Math.random() - 0.5) * 60,
      })
      .select("*")
      .single();
    if (error) {
      alert("Não foi possível criar a pasta: " + error.message);
      return;
    }
    if (data) {
      setNodes((prev) => [...prev, data as PositionedNode]);
      setSelected(data.id);
      setExpanded((prev) => (parentId ? new Set(prev).add(parentId) : prev)); // abre a pasta-mãe
      kick(1);
      logAction(actor, `Criou a pasta "${data.name}"${parent ? ` dentro de "${parent.name}"` : ""}`);
    }
  }

  // Abre o arquivo para VISUALIZAR (nova aba) — imagens, PDFs, etc.
  async function openFile(node: PositionedNode) {
    if (node.storage_path && supabase) {
      const { data, error } = await supabase.storage.from("company-files").createSignedUrl(node.storage_path, 300);
      if (error || !data?.signedUrl) {
        alert("Não foi possível abrir este arquivo agora. Tente novamente.");
        return;
      }
      window.open(data.signedUrl, "_blank");
      return;
    }
    if (node.data_url) window.open(node.data_url, "_blank");
  }

  async function download(node: PositionedNode) {
    // Arquivo real no bucket persistente (automação/servidor).
    if (node.storage_path && supabase) {
      const { data, error } = await supabase.storage.from("company-files").createSignedUrl(node.storage_path, 300, { download: node.name });
      if (error || !data?.signedUrl) {
        alert("Não foi possível abrir este arquivo agora. Tente novamente.");
        return;
      }
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = node.name;
      a.target = "_blank";
      a.click();
      return;
    }
    // Arquivo enviado direto pelo site (base64 embutido).
    if (node.data_url) {
      const a = document.createElement("a");
      a.href = node.data_url;
      a.download = node.name;
      a.click();
      return;
    }
    alert("Este arquivo ainda não tem conteúdo para baixar.");
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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    downInfo.current = { x: e.clientX, y: e.clientY, moved: false };
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
    if (downInfo.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) downInfo.current.moved = true;
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
    const clickedId = dragging;
    const wasClick = downInfo.current && !downInfo.current.moved;
    downInfo.current = null;
    fixedRef.current.clear();
    dragStart.current = null;
    setDragging(null);
    // Clique (sem arrastar) numa PASTA = expande/colapsa; num arquivo, só seleciona.
    if (wasClick) {
      const n = byId.get(clickedId);
      if (n?.type === "folder") toggleExpand(clickedId);
    }
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
          {editMode && canManage && (
            <button
              onClick={handleNewFolder}
              className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
            >
              <FolderPlus size={14} /> Nova pasta
            </button>
          )}
          {editMode && (
            <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
              <Upload size={14} /> Upload
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </label>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            title={editMode ? "Sair da edição" : "Editar (criar, renomear, apagar)"}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer ${
              editMode ? "bg-emerald-500/20 text-emerald-400" : "liquid-glass text-gray-300"
            }`}
          >
            {editMode ? <Eye size={14} /> : <Pencil size={14} />}
            {editMode ? "Visualizar" : "Editar"}
          </button>
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
                if (!visibleIds.has(n.id)) return null;
                const parent = byId.get(n.parent_id);
                if (!parent || !visibleIds.has(parent.id)) return null;
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
              {/* Ligações manuais entre pastas (ex.: pasta do robô <-> empresa) */}
              {links.map((l) => {
                const a = byId.get(l.source_id);
                const b = byId.get(l.target_id);
                if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) return null;
                return (
                  <line
                    key={`link-${l.id}`}
                    x1={a.pos_x}
                    y1={a.pos_y}
                    x2={b.pos_x}
                    y2={b.pos_y}
                    stroke="rgba(129,140,248,0.7)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                );
              })}
            </svg>
            {nodes.map((n) => {
              if (!visibleIds.has(n.id)) return null;
              const dim = matches && !matches.has(n.id);
              const radius = n.type === "folder" ? 24 : 14;
              const kids = childCount.get(n.id) ?? 0;
              const isExpanded = expanded.has(n.id);
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => onPointerDownNode(e, n.id)}
                  style={{ left: n.pos_x - radius, top: n.pos_y - radius, width: radius * 2, height: radius * 2 }}
                  className="absolute cursor-grab active:cursor-grabbing select-none touch-none"
                  title={n.type === "folder" ? (isExpanded ? "Clique para recolher" : "Clique para expandir") : n.name}
                >
                  <div
                    className="rounded-full flex items-center justify-center w-full h-full"
                    style={{
                      opacity: dim ? 0.25 : 1,
                      background: n.type === "folder" ? (isExpanded ? "#065f46" : "#064e3b") : "#111827",
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
                  {/* Badge de itens dentro da pasta (some quando expandida) */}
                  {n.type === "folder" && kids > 0 && !isExpanded && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {kids}
                    </span>
                  )}
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
            <p className="text-xs text-gray-500 mb-1">{new Date(selectedNode.created_at).toLocaleString("pt-BR")}</p>
            {selectedNode.source_path && (
              <p className="text-[10px] text-gray-500 mb-3 font-mono truncate flex items-center gap-1" title={selectedNode.source_path}>
                <Server size={10} className="text-sky-400 shrink-0" /> {selectedNode.source_path}
              </p>
            )}

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

            {/* Ligações de pasta (conectar a outra pasta) */}
            {selectedNode.type === "folder" && (
              <div className="mb-3">
                {(() => {
                  const myLinks = links.filter(
                    (l) => l.source_id === selectedNode.id || l.target_id === selectedNode.id
                  );
                  return (
                    <>
                      {myLinks.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          <p className="text-[10px] text-indigo-300 uppercase tracking-wider">Conectada a</p>
                          {myLinks.map((l) => {
                            const otherId = l.source_id === selectedNode.id ? l.target_id : l.source_id;
                            const other = byId.get(otherId);
                            return (
                              <div key={l.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="flex items-center gap-1 truncate">
                                  <Link2 size={11} className="text-indigo-400 shrink-0" />
                                  {other?.name ?? "—"}
                                </span>
                                {canManage && (
                                  <button
                                    onClick={() => removeLink(l.id)}
                                    className="text-gray-500 hover:text-red-400 cursor-pointer"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {editMode && canManage && (
                        <select
                          value={linkPick}
                          onChange={(e) => e.target.value && connectFolders(selectedNode.id, e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none cursor-pointer"
                        >
                          <option value="">🔗 Conectar a outra pasta…</option>
                          {nodes
                            .filter(
                              (n) =>
                                n.type === "folder" &&
                                n.id !== selectedNode.id &&
                                !myLinks.some((l) => l.source_id === n.id || l.target_id === n.id)
                            )
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </>
                  );
                })()}
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
              {selectedNode.type === "file" && (selectedNode.storage_path || selectedNode.data_url) && (
                <button
                  onClick={() => openFile(selectedNode)}
                  className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Eye size={12} /> Abrir
                </button>
              )}
              {selectedNode.type === "file" && (
                <button
                  onClick={() => download(selectedNode)}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Download size={12} /> Baixar
                </button>
              )}
              {editMode &&
                selectedNode.type === "folder" &&
                (selectedNode.bot_share_status === "none" || selectedNode.bot_share_status === "rejected") && (
                  <button
                    onClick={() => requestBotShare(selectedNode)}
                    className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg cursor-pointer"
                    title="Adicionar o conteúdo desta pasta ao cérebro do robô de IA"
                  >
                    <Bot size={12} /> {canManage ? "Dar ao robô" : "Pedir p/ robô"}
                  </button>
                )}
              {editMode && (selectedNode.type === "file" || canManage) && (
                <button
                  onClick={() => handleRename(selectedNode)}
                  className="flex items-center gap-1.5 text-xs liquid-glass px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Pencil size={12} /> Renomear
                </button>
              )}
              {editMode && (selectedNode.type === "file" || canManage) && (
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
