"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, ChevronRight, Download, Eye, File as FileIcon, Folder, FolderPlus, LocateFixed, Link2, Maximize2, Minus, Pencil, Plus, Search, Server, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { extractText } from "@/lib/extract-text";
import { logAction } from "@/lib/activity-log";
import type { FileNodeRow, Profile } from "@/lib/types";

type PositionedNode = FileNodeRow & { pos_x: number; pos_y: number };

// Centro inicial (recalculado dinamicamente a partir do tamanho do container)
const CENTER_X = 450;
const CENTER_Y = 300;

// Parâmetros da simulação de forças (estilo grafo do Obsidian)
const CHARGE = 9000; // repulsão entre nós
const LINK_LEN = 95; // comprimento de repouso das ligações
const LINK_K = 0.05; // rigidez das ligações (mola)
const GRAVITY = 0.035; // atração suave para o centro
const FRICTION = 0.7; // amortecimento (quanto menor, mais "parado")
const V_CLAMP = 18; // limite de velocidade (menor = mais calmo, sem tremer)
const ALPHA_DECAY = 0.94; // esfria mais rápido → estabiliza logo
const ALPHA_MIN = 0.08; // para de mexer mais cedo (nada de tremer eterno)
const F_CLAMP = 120; // teto da força por nó (evita "explosões"/tremores)

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
  // "Ver tudo aberto": mostra todas as pastas/arquivos de uma vez (padrão: recolhido).
  const [expandAll, setExpandAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Estilo do grafo (escolhido em Configurações → Aparência):
  //  obsidian  → nuvem force-directed (padrão);
  //  arvore    → árvore de habilidades (RPG), de cima pra baixo, posições fixas;
  //  diretorio → lista de pastas indentada (explorador de arquivos).
  const [graphStyle, setGraphStyle] = useState<"obsidian" | "arvore" | "diretorio">("obsidian");
  const graphStyleRef = useRef(graphStyle);
  useEffect(() => { graphStyleRef.current = graphStyle; }, [graphStyle]);
  useEffect(() => {
    // Preferência deste aparelho primeiro (instantâneo), depois confirma no banco.
    try { const ls = localStorage.getItem("graph_style"); if (ls === "obsidian" || ls === "arvore" || ls === "diretorio") setGraphStyle(ls); } catch {}
    // IMPORTANTE: filtra pela EMPRESA DO USUÁRIO. Sem o filtro, o limit(1) podia
    // devolver a linha de OUTRA empresa (a policy de leitura é aberta) e o estilo
    // salvo "voltava" sozinho — era o bug do "não salva".
    if (supabase && profile?.company_id) {
      supabase.from("company_settings").select("graph_style").eq("company_id", profile.company_id).maybeSingle().then(({ data }) => {
        const s = data?.graph_style;
        if (s === "obsidian" || s === "arvore" || s === "diretorio") setGraphStyle(s);
      });
    }
    // Troca AO VIVO quando muda em Configurações (mesmo sem reabrir a aba).
    const onStyle = (e: Event) => {
      const s = (e as CustomEvent).detail;
      if (s === "obsidian" || s === "arvore" || s === "diretorio") setGraphStyle(s);
    };
    window.addEventListener("graph-style", onStyle);
    return () => window.removeEventListener("graph-style", onStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  // Trocar o estilo DIRETO no grafo (sem ir em Configurações) e salvar de verdade.
  async function changeStyle(s: "obsidian" | "arvore" | "diretorio") {
    setGraphStyle(s);
    try { localStorage.setItem("graph_style", s); } catch {}
    try { window.dispatchEvent(new CustomEvent("graph-style", { detail: s })); } catch {}
    if (!supabase || !profile?.company_id) return;
    const { error } = await supabase.from("company_settings").update({ graph_style: s }).eq("company_id", profile.company_id);
    if (error) alert("Não consegui salvar o estilo: " + error.message);
  }
  // Canvas infinito estilo Miro: pan (arrastar fundo) + zoom (roda do mouse).
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  // Multitouch: dedos ativos + estado do "pinch" (zoom com dois dedos, natural).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number; view: { scale: number; tx: number; ty: number } } | null>(null);
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
    if (expandAll) {
      nodes.forEach((n) => vis.add(n.id));
      return vis;
    }
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
  }, [nodes, expanded, expandAll]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);
  useEffect(() => {
    visibleIdsRef.current = visibleIds;
    if (graphStyle === "arvore") layoutTree(); // posições fixas em árvore
    else kick(0.4); // Obsidian: re-acomoda de leve (filhos entram no vazio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, graphStyle]);

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

  // Salvar posições dispara eventos realtime na tabela "files". Sem isso, o
  // grafo recarregava e re-energizava sozinho a cada salvamento → tremia sem
  // parar. Suprimimos os reloads por uma janelinha após salvar.
  const suppressReloadUntil = useRef(0);
  const persistPositions = useCallback(async () => {
    if (!supabase) return;
    const client = supabase;
    suppressReloadUntil.current = Date.now() + 2500;
    await Promise.all(
      nodesRef.current.map((n) =>
        client.from("files").update({ pos_x: Math.round(n.pos_x), pos_y: Math.round(n.pos_y) }).eq("id", n.id)
      )
    ).catch(() => {});
    suppressReloadUntil.current = Date.now() + 2500;
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
    // Gravidade hierárquica: só as pastas RAIZ são puxadas ao centro (o "sol").
    // Todo o resto é segurado pela mola do próprio pai — cada pasta cuida da
    // gravidade dos seus filhos, e eles orbitam ela (não o centro da tela).
    for (const n of list) {
      if (!n.parent_id) {
        fx.set(n.id, (cx - n.pos_x) * GRAVITY);
        fy.set(n.id, (cy - n.pos_y) * GRAVITY);
      } else {
        fx.set(n.id, 0);
        fy.set(n.id, 0);
      }
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
        let rep = CHARGE / d2;
        // Órbita própria: cada nó tem um "raio pessoal". Se dois nós invadem a
        // órbita um do outro, entra uma separação forte (evita sobreposição/bug).
        const ra = a.type === "folder" ? 30 : 20;
        const rb = b.type === "folder" ? 30 : 20;
        const minDist = ra + rb + 16;
        if (d < minDist) rep += ((minDist - d) / minDist) * 260;
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
      // Teto na força total do nó — evita "explodir" e tremer.
      let ffx = fx.get(n.id) ?? 0;
      let ffy = fy.get(n.id) ?? 0;
      const fmag = Math.hypot(ffx, ffy);
      if (fmag > F_CLAMP) { ffx = (ffx / fmag) * F_CLAMP; ffy = (ffy / fmag) * F_CLAMP; }
      let vx = (v.vx + ffx) * FRICTION;
      let vy = (v.vy + ffy) * FRICTION;
      vx = Math.max(-V_CLAMP, Math.min(V_CLAMP, vx));
      vy = Math.max(-V_CLAMP, Math.min(V_CLAMP, vy));
      velRef.current.set(n.id, { vx, vy });
      // Canvas infinito: sem limite de janela — os arquivos se espalham como um
      // universo (o pan/zoom navega). A gravidade suave mantém tudo coeso.
      const nx = n.pos_x + vx * alpha;
      const ny = n.pos_y + vy * alpha;
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
      // Só o modo Obsidian tem física; nos outros as posições são calculadas.
      if (graphStyleRef.current !== "obsidian") return;
      alphaRef.current = Math.max(alphaRef.current, energy);
      settledPersistRef.current = false;
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    },
    [tick]
  );

  // Layout ÁRVORE DE HABILIDADES: de cima pra baixo, cada nível numa linha, filhos
  // espalhados embaixo do pai (folhas em sequência; pai centrado nos filhos).
  const layoutTree = useCallback(() => {
    const vis = visibleIdsRef.current;
    const all = nodesRef.current;
    const kidsOf = new Map<string | null, PositionedNode[]>();
    for (const n of all) {
      if (!vis.has(n.id)) continue;
      const k = kidsOf.get(n.parent_id) ?? [];
      k.push(n);
      kidsOf.set(n.parent_id, k);
    }
    const sortByName = (a: PositionedNode, b: PositionedNode) =>
      (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1) || a.name.localeCompare(b.name);
    const COL = 92, ROW = 130, SUBROW = 66;
    const pos = new Map<string, { x: number; y: number }>();
    let leaf = 0;
    const isLeaf = (n: PositionedNode) => (kidsOf.get(n.id)?.length ?? 0) === 0;
    // Empacota vários ARQUIVOS soltos numa GRADE (várias sub-linhas), em vez de
    // uma linha reta enorme. Assim já vem "amontoado", sem precisar bagunçar.
    const gridPack = (items: PositionedNode[], baseDepth: number): number => {
      const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(items.length))));
      const start = leaf;
      items.forEach((k, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        pos.set(k.id, { x: (start + col) * COL, y: baseDepth * ROW + row * SUBROW });
      });
      leaf = start + cols + 0.6; // um respiro entre grupos
      return (start + (cols - 1) / 2) * COL;
    };
    const walk = (node: PositionedNode, depth: number): number => {
      const kids = (kidsOf.get(node.id) ?? []).slice().sort(sortByName);
      if (kids.length === 0) { const x = leaf * COL; leaf += 1; pos.set(node.id, { x, y: depth * ROW }); return x; }
      const xs: number[] = [];
      // Subpastas descem como galhos; arquivos soltos viram grade compacta.
      for (const f of kids.filter((k) => !isLeaf(k))) xs.push(walk(f, depth + 1));
      const leafKids = kids.filter(isLeaf);
      if (leafKids.length) xs.push(gridPack(leafKids, depth + 1));
      const x = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : leaf * COL;
      pos.set(node.id, { x, y: depth * ROW });
      return x;
    };
    const roots = (all.filter((n) => vis.has(n.id) && (n.parent_id === null || !vis.has(n.parent_id))))
      .slice().sort(sortByName);
    for (const r of roots.filter((r) => !isLeaf(r))) { walk(r, 0); leaf += 1; }
    const leafRoots = roots.filter(isLeaf);
    if (leafRoots.length) gridPack(leafRoots, 0); // arquivos soltos na raiz também em grade
    // Centraliza no meio do mundo.
    const xsAll = [...pos.values()].map((p) => p.x);
    const midX = xsAll.length ? (Math.min(...xsAll) + Math.max(...xsAll)) / 2 : 0;
    const next = all.map((n) => {
      const p = pos.get(n.id);
      if (!p) return n;
      velRef.current.set(n.id, { vx: 0, vy: 0 });
      return { ...n, pos_x: CENTER_X + (p.x - midX), pos_y: 80 + p.y };
    });
    nodesRef.current = next;
    setNodes(next);
  }, []);

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

  // Recarrega os arquivos quando muda o ambiente ativo (empresa/casa) do usuário,
  // para não ficar mostrando o grafo do ambiente anterior (ou vazio) depois da troca.
  useEffect(() => {
    load();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  // Atualização ao vivo do grafo: qualquer arquivo/pasta novo (upload, automação,
  // servidor) ou ligação aparece na hora, sem precisar recarregar.
  useEffect(() => {
    if (!supabase) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (dragging) return; // não recarrega no meio de um arraste
      if (Date.now() < suppressReloadUntil.current) return; // ignora nosso próprio salvamento de posições
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (Date.now() < suppressReloadUntil.current) return;
        load();
      }, 600);
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

  // Ao abrir uma pasta, os filhos NÃO ficam em volta empurrando os vizinhos: a
  // gente acha a DIREÇÃO mais VAZIA em torno da pasta (o "quadrante" com menos
  // arquivos por perto) e abre os filhos num ARCO ali, com velocidade zero. Assim
  // não colidem com o que já existe e o grafo não fica tremendo/piscando.
  function seedRing(folderId: string) {
    const parent = nodesRef.current.find((n) => n.id === folderId);
    if (!parent) return;
    const kids = nodesRef.current.filter((n) => n.parent_id === folderId);
    if (kids.length === 0) return;

    // Vizinhos VISÍVEIS por perto (sem contar a própria pasta e seus filhos).
    const vis = visibleIdsRef.current;
    const kidIds = new Set(kids.map((k) => k.id));
    const neighbors = nodesRef.current.filter(
      (n) => n.id !== parent.id && !kidIds.has(n.id) && vis.has(n.id) &&
        Math.hypot(n.pos_x - parent.pos_x, n.pos_y - parent.pos_y) < 900,
    );

    // Testa 24 direções e escolhe a de MENOR ocupação (vizinho perto e alinhado
    // àquela direção "pesa" mais). É o "abre onde não tem muita coisa".
    const SECTORS = 24;
    let bestAngle = -Math.PI / 2; // padrão: para cima
    let bestScore = Infinity;
    for (let s = 0; s < SECTORS; s++) {
      const ang = (s / SECTORS) * Math.PI * 2;
      let score = 0;
      for (const nb of neighbors) {
        const dx = nb.pos_x - parent.pos_x;
        const dy = nb.pos_y - parent.pos_y;
        const dist = Math.hypot(dx, dy) || 1;
        let diff = Math.abs(Math.atan2(dy, dx) - ang);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        score += Math.max(0, 1 - diff / (Math.PI / 2)) * (600 / dist);
      }
      if (score < bestScore) { bestScore = score; bestAngle = ang; }
    }

    // Abre num arco centrado na direção vazia (não em volta toda).
    const radius = LINK_LEN + kids.length * 8;
    const arc = Math.min(Math.PI * 1.6, Math.PI / 4 + kids.length * 0.3);
    const start = bestAngle - arc / 2;
    const step = kids.length > 1 ? arc / (kids.length - 1) : 0;
    const kidSet = new Map<string, { x: number; y: number }>();
    kids.forEach((k, i) => {
      const a = kids.length === 1 ? bestAngle : start + step * i;
      kidSet.set(k.id, { x: parent.pos_x + Math.cos(a) * radius, y: parent.pos_y + Math.sin(a) * radius });
    });
    const next = nodesRef.current.map((n) => {
      const p = kidSet.get(n.id);
      if (!p) return n;
      velRef.current.set(n.id, { vx: 0, vy: 0 });
      return { ...n, pos_x: p.x, pos_y: p.y };
    });
    nodesRef.current = next;
    setNodes(next);
  }

  function toggleExpand(id: string) {
    const isOpen = expandedRef.current.has(id);
    if (!isOpen && graphStyleRef.current === "obsidian") seedRing(id); // abre → distribui os filhos no vazio
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  // Registra um dedo e, ao chegar no 2º, inicia o "pinch" (zoom com dois dedos):
  // guarda a distância inicial e o ponto médio, cancelando arrasto/pan em curso.
  function registerPointer(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) startPinch();
  }
  function startPinch() {
    const el = containerRef.current;
    const pts = [...pointersRef.current.values()];
    if (!el || pts.length < 2) return;
    const [a, b] = pts;
    const rect = el.getBoundingClientRect();
    pinchRef.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      view: { ...viewRef.current },
    };
    // Cancela qualquer arrasto/pan de um dedo só.
    panRef.current = null;
    dragStart.current = null;
    fixedRef.current.clear();
    setDragging(null);
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    e.stopPropagation(); // não inicia o pan do fundo
    registerPointer(e);
    if (pointersRef.current.size >= 2) return; // 2 dedos = zoom, não arrasta o nó
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
    // Atualiza a posição deste dedo (se estava registrado).
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // ZOOM COM DOIS DEDOS (pinch), natural, em direção ao ponto entre os dedos —
    // e move junto (dois dedos também arrastam). Igual app de desenho.
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const el = containerRef.current;
      const pts = [...pointersRef.current.values()];
      if (!el || pts.length < 2) return;
      const [a, b] = pts;
      const rect = el.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      const p = pinchRef.current;
      const scale = Math.max(0.15, Math.min(4, p.view.scale * (dist / p.dist)));
      const worldX = (p.midX - p.view.tx) / p.view.scale;
      const worldY = (p.midY - p.view.ty) / p.view.scale;
      setView({ scale, tx: midX - worldX * scale, ty: midY - worldY * scale });
      return;
    }
    // Arrastar o FUNDO = pan (mover a câmera pelo universo).
    if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
      return;
    }
    if (!dragging || !dragStart.current) return;
    const { pointerX, pointerY, positions } = dragStart.current;
    const s = viewRef.current.scale || 1;
    const dx = (e.clientX - pointerX) / s;
    const dy = (e.clientY - pointerY) / s;
    if (downInfo.current && (Math.abs(e.clientX - pointerX) > 4 || Math.abs(e.clientY - pointerY) > 4)) downInfo.current.moved = true;
    const next = nodesRef.current.map((n) => {
      const start = positions.get(n.id);
      return start ? { ...n, pos_x: start.x + dx, pos_y: start.y + dy } : n;
    });
    nodesRef.current = next;
    setNodes(next);
    kick(0.9);
  }

  // Pan: arrastar em qualquer lugar do fundo (fora de um nó).
  function onBackgroundPointerDown(e: React.PointerEvent) {
    registerPointer(e);
    if (pointersRef.current.size >= 2) return; // 2 dedos = zoom, não faz pan
    if (dragging) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    setSelected(null);
  }
  // Zoom com a roda do mouse, centrado no ponteiro (estilo Miro).
  function onWheelZoom(e: React.WheelEvent) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const scale = Math.max(0.15, Math.min(4, v.scale * factor));
      const k = scale / v.scale;
      // Mantém o ponto sob o cursor fixo enquanto amplia/reduz.
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }
  // Centraliza a câmera no MEIO dos arquivos (útil quando a pessoa se perde
  // arrastando). Coloca o centro dos nós visíveis no meio da tela, zoom 100%.
  function resetView() {
    const el = containerRef.current;
    const W = el?.clientWidth ?? 900;
    const H = el?.clientHeight ?? 600;
    const all = nodesRef.current;
    const vis = all.filter((n) => (visibleIdsRef.current.size === 0 || visibleIdsRef.current.has(n.id)) && n.pos_x != null && n.pos_y != null);
    const pts = vis.length ? vis : all.filter((n) => n.pos_x != null && n.pos_y != null);
    if (!pts.length) { setView({ tx: W / 2 - CENTER_X, ty: H / 2 - CENTER_Y, scale: 1 }); return; }
    const cx = pts.reduce((s, n) => s + (n.pos_x as number), 0) / pts.length;
    const cy = pts.reduce((s, n) => s + (n.pos_y as number), 0) / pts.length;
    setView({ tx: W / 2 - cx, ty: H / 2 - cy, scale: 1 });
  }

  function onPointerUp(e?: React.PointerEvent) {
    // Tira o dedo que levantou; se sobrar menos de 2, encerra o pinch. Se ainda
    // houver 1 dedo, ele NÃO vira arrasto (evita "pulo" ao soltar um dedo).
    if (e) pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size >= 1 && !panRef.current && !dragging) return;

    if (panRef.current) { panRef.current = null; return; }
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Estilo do grafo direto aqui (sem ir em Configurações) — salva na empresa. */}
          <div className="liquid-glass rounded-lg flex items-center p-0.5" title="Estilo do grafo">
            {([["obsidian", "🕸️", "Obsidian (nuvem)"], ["arvore", "🌳", "Árvore (RPG)"], ["diretorio", "🗂️", "Diretório (lista)"]] as const).map(([id, emoji, label]) => (
              <button
                key={id}
                onClick={() => changeStyle(id)}
                title={label}
                className={`px-2 py-1.5 rounded-md text-sm cursor-pointer ${graphStyle === id ? "bg-emerald-500/25" : "hover:bg-white/10 opacity-60"}`}
              >
                {emoji}
              </button>
            ))}
          </div>
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
            onClick={() => { setExpandAll((v) => !v); kick(0.8); }}
            title={expandAll ? "Voltar ao normal (recolhido)" : "Ver tudo aberto (todas as pastas)"}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer ${
              expandAll ? "bg-emerald-500/20 text-emerald-400" : "liquid-glass text-gray-300"
            }`}
          >
            <Maximize2 size={14} /> {expandAll ? "Tudo aberto" : "Ver tudo"}
          </button>
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
        {/* Modo DIRETÓRIO: lista indentada (explorador de arquivos), por cima do canvas. */}
        {graphStyle === "diretorio" && (
          <div className="absolute inset-0 z-20 bg-[#0b0f16]/95 overflow-y-auto custom-scroll p-3">
            {(() => {
              const byParentLocal = new Map<string | null, PositionedNode[]>();
              for (const n of nodes) { const l = byParentLocal.get(n.parent_id) ?? []; l.push(n); byParentLocal.set(n.parent_id, l); }
              const sortFn = (a: PositionedNode, b: PositionedNode) => (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1) || a.name.localeCompare(b.name);
              const rows: React.ReactNode[] = [];
              const walk = (parentId: string | null, depth: number) => {
                for (const n of (byParentLocal.get(parentId) ?? []).slice().sort(sortFn)) {
                  const isFolder = n.type === "folder";
                  const isOpen = expanded.has(n.id) || expandAll;
                  const kids = childCount.get(n.id) ?? 0;
                  const dim = matches && !matches.has(n.id);
                  rows.push(
                    <button
                      key={n.id}
                      onClick={() => { setSelected(n.id); if (isFolder) toggleExpand(n.id); else openFile(n); }}
                      style={{ paddingLeft: 8 + depth * 18, opacity: dim ? 0.4 : 1 }}
                      className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-left cursor-pointer hover:bg-white/5 ${selected === n.id ? "bg-emerald-950/40" : ""}`}
                    >
                      {isFolder ? (isOpen ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />) : <span className="w-3.5 shrink-0" />}
                      {isFolder ? <Folder size={15} className="text-emerald-400 shrink-0" /> : <FileIcon size={15} className="text-gray-400 shrink-0" />}
                      <span className="text-sm truncate flex-1">{n.name}</span>
                      {isFolder && kids > 0 && <span className="text-[10px] text-gray-500 shrink-0">{kids}</span>}
                    </button>
                  );
                  if (isFolder && isOpen) walk(n.id, depth + 1);
                }
              };
              walk(null, 0);
              return rows.length ? <div className="space-y-0.5">{rows}</div> : <p className="text-sm text-gray-500 p-4 text-center">Sem arquivos ainda.</p>;
            })()}
          </div>
        )}
        <div
          ref={containerRef}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") onPointerUp(e); }}
          onWheel={onWheelZoom}
          className="w-full h-full overflow-hidden relative touch-none cursor-grab active:cursor-grabbing"
        >
          {/* Mundo infinito: pan + zoom aplicados via transform (estilo Miro). */}
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`, transformOrigin: "0 0" }}
          >
            <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible", width: 1, height: 1 }}>
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
              const isExpanded = expanded.has(n.id) || expandAll;
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

          {/* Controles de zoom (canto inferior esquerdo) */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 z-10" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => setView((v) => ({ ...v, scale: Math.min(4, v.scale * 1.2) }))} title="Aproximar" className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center cursor-pointer hover:bg-white/10"><Plus size={14} /></button>
            <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.15, v.scale / 1.2) }))} title="Afastar" className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center cursor-pointer hover:bg-white/10"><Minus size={14} /></button>
            <button onClick={resetView} title="Voltar pro meio dos arquivos" className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center cursor-pointer hover:bg-white/10 text-emerald-300"><LocateFixed size={15} /></button>
            <button onClick={() => setView((v) => ({ ...v, scale: 1 }))} title="Zoom 100%" className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center text-[9px] font-bold cursor-pointer hover:bg-white/10">{Math.round(view.scale * 100)}%</button>
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
