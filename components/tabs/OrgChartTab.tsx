"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Eye, Maximize2, Minus, Network, Pencil, Plus, Trash2, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, Sector } from "@/lib/types";

const NODE_W = 150;
const SLOT = 190; // espaço horizontal por folha
const ROW = 150; // espaço vertical por nível

// Layout "tidy tree": separa os setores por hierarquia, filhos centrados sob o pai.
function autoLayout(sectors: Sector[]): Map<string, { x: number; y: number }> {
  const ids = new Set(sectors.map((s) => s.id));
  const childrenOf = new Map<string, Sector[]>();
  const roots: Sector[] = [];
  for (const s of sectors) {
    const pid = s.parent_id && ids.has(s.parent_id) ? s.parent_id : null;
    if (pid) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(s);
    } else roots.push(s);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  const dfs = (node: Sector, depth: number): number => {
    const kids = childrenOf.get(node.id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leaf * SLOT;
      leaf++;
    } else {
      const xs = kids.map((k) => dfs(k, depth + 1));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    pos.set(node.id, { x, y: depth * ROW });
    return x;
  };
  for (const r of roots) {
    dfs(r, 0);
    leaf += 1; // respiro entre árvores (setores raiz separados)
  }
  return pos;
}

export default function OrgChartTab({ canEdit }: { canEdit: boolean }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [editMode, setEditMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 50 });
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const editing = canEdit && editMode;

  async function load() {
    if (!supabase) return;
    const [sectorsRes, profilesRes] = await Promise.all([
      supabase.from("sectors").select("*").order("created_at"),
      supabase.from("profiles").select("*"),
    ]);
    if (sectorsRes.data) setSectors(sectorsRes.data);
    if (profilesRes.data) setProfiles(profilesRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  const byId = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const employeesOf = (sectorId: string) => profiles.filter((p) => p.sector_id === sectorId);
  const selectedSector = selected ? byId.get(selected) ?? null : null;

  // Em visualização usamos o layout automático (bonitinho); ao editar, as
  // posições salvas (arrastáveis).
  const layout = useMemo(() => autoLayout(sectors), [sectors]);
  const posOf = (s: Sector) => (editing ? { x: s.pos_x, y: s.pos_y } : layout.get(s.id) ?? { x: 0, y: 0 });

  async function addSector() {
    if (!supabase) return;
    const parent = selected ? byId.get(selected) : sectors.find((s) => s.parent_id === null);
    const siblings = sectors.filter((s) => s.parent_id === (parent?.id ?? null));
    const x = 120 + siblings.length * 180;
    const y = parent ? parent.pos_y + 150 : 80;
    const { data } = await supabase
      .from("sectors")
      .insert({ name: "Novo Setor", parent_id: parent?.id ?? null, pos_x: x, pos_y: y })
      .select("*")
      .single();
    if (data) {
      setSectors((prev) => [...prev, data]);
      setSelected(data.id);
    }
  }

  async function renameSector(id: string, name: string) {
    setSectors((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    await supabase?.from("sectors").update({ name }).eq("id", id);
  }

  async function setLeader(id: string, leaderId: string | null) {
    setSectors((prev) => prev.map((s) => (s.id === id ? { ...s, leader_id: leaderId } : s)));
    await supabase?.from("sectors").update({ leader_id: leaderId }).eq("id", id);
  }

  async function setSectorForProfile(profileId: string, sectorId: string | null) {
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, sector_id: sectorId } : p)));
    await supabase?.from("profiles").update({ sector_id: sectorId }).eq("id", profileId);
  }

  async function setRole(profileId: string, role: Profile["role"]) {
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? { ...p, role } : p)));
    await supabase?.from("profiles").update({ role }).eq("id", profileId);
  }

  async function deleteSector(id: string) {
    if (!confirm("Remover este setor? Os sub-setores também serão removidos.")) return;
    setSectors((prev) => prev.filter((s) => s.id !== id && s.parent_id !== id));
    setSelected(null);
    await supabase?.from("sectors").delete().eq("id", id);
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    e.stopPropagation(); // não inicia o "pan" do fundo ao pegar um nó
    setSelected(id);
    if (!editing) return;
    const s = byId.get(id);
    if (!s) return;
    const w = screenToWorld(e.clientX, e.clientY);
    dragOffset.current = { x: w.x - s.pos_x, y: w.y - s.pos_y };
    setDragging(id);
  }

  function onBgPointerDown(e: React.PointerEvent) {
    panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragging) {
      const w = screenToWorld(e.clientX, e.clientY);
      setSectors((prev) =>
        prev.map((s) => (s.id === dragging ? { ...s, pos_x: w.x - dragOffset.current.x, pos_y: w.y - dragOffset.current.y } : s))
      );
    } else if (panRef.current) {
      const { sx, sy, px, py } = panRef.current;
      setPan({ x: px + (e.clientX - sx), y: py + (e.clientY - sy) });
    }
  }

  async function onPointerUp() {
    panRef.current = null;
    if (!dragging) return;
    const s = byId.get(dragging);
    setDragging(null);
    if (s) await supabase?.from("sectors").update({ pos_x: s.pos_x, pos_y: s.pos_y }).eq("id", s.id);
  }

  function onWheel(e: React.WheelEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nz = Math.min(2.5, Math.max(0.3, zoom * Math.exp(-e.deltaY * 0.0015)));
    setPan({ x: mx - (mx - pan.x) * (nz / zoom), y: my - (my - pan.y) * (nz / zoom) });
    setZoom(nz);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 60, y: 50 });
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 overflow-y-auto lg:overflow-hidden">
      <div className="liquid-glass rounded-2xl overflow-hidden relative flex flex-col min-h-[55vh] lg:min-h-0">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Network className="text-emerald-400" size={20} /> Organograma
          </h3>
          <div className="flex items-center gap-2">
            {editing && (
              <button
                onClick={addSector}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
              >
                <Plus size={14} /> Novo setor
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? "Sair da edição (voltar à visualização)" : "Editar organograma"}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer ${
                  editMode ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 hover:bg-white/10 text-gray-300"
                }`}
              >
                {editMode ? <Eye size={14} /> : <Pencil size={14} />}
                {editMode ? "Visualizar" : "Editar"}
              </button>
            )}
          </div>
        </div>
        <div
          ref={containerRef}
          onPointerDown={onBgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing touch-none"
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1 }}>
              {sectors.map((s) => {
                if (!s.parent_id) return null;
                const parent = byId.get(s.parent_id);
                if (!parent) return null;
                const c = posOf(s);
                const p = posOf(parent);
                return (
                  <line
                    key={`edge-${s.id}`}
                    x1={p.x + NODE_W / 2}
                    y1={p.y + 34}
                    x2={c.x + NODE_W / 2}
                    y2={c.y + 34}
                    stroke="rgba(16,185,129,0.35)"
                    strokeWidth={2}
                  />
                );
              })}
            </svg>
            {sectors.map((s) => {
              const leader = s.leader_id ? profiles.find((p) => p.id === s.leader_id) : null;
              const p = posOf(s);
              return (
                <div
                  key={s.id}
                  onPointerDown={(e) => onPointerDownNode(e, s.id)}
                  style={{ left: p.x, top: p.y, width: NODE_W }}
                  className={`absolute rounded-xl px-3 py-2.5 select-none ${
                    editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  } liquid-glass border ${selected === s.id ? "border-emerald-500" : "border-white/10"}`}
                >
                  <p className="text-sm font-bold truncate">{s.name}</p>
                  {leader && (
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                      <Crown size={10} /> {leader.full_name ?? leader.email}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-0.5">{employeesOf(s.id).length} pessoa(s)</p>
                </div>
              );
            })}
          </div>

          {sectors.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-sm text-gray-500 italic text-center">
              {canEdit ? 'Clique em "Editar" e depois "Novo setor" para desenhar a hierarquia.' : "Organograma ainda não configurado."}
            </p>
          )}

          {/* Controles de zoom (estilo Miro) */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 liquid-glass rounded-lg px-1.5 py-1 text-gray-300">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} title="Diminuir" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <Minus size={14} />
            </button>
            <span className="text-[11px] w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} title="Aumentar" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <Plus size={14} />
            </button>
            <button onClick={resetView} title="Voltar ao formato original" className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <Maximize2 size={14} />
            </button>
          </div>

          {!editing && (
            <p className="absolute top-3 right-3 text-[10px] text-gray-500 bg-black/30 rounded px-2 py-1 pointer-events-none">
              Arraste para mover · role para dar zoom
            </p>
          )}
        </div>
      </div>

      <div className="liquid-glass rounded-2xl p-4 overflow-y-auto custom-scroll">
        {!selectedSector ? (
          <p className="text-sm text-gray-500 italic">Selecione um setor para ver detalhes.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Nome</label>
              <input
                disabled={!canEdit}
                value={selectedSector.name}
                onChange={(e) => renameSector(selectedSector.id, e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Líder do setor
              </label>
              <select
                disabled={!canEdit}
                value={selectedSector.leader_id ?? ""}
                onChange={(e) => setLeader(selectedSector.id, e.target.value || null)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
              >
                <option value="">Sem líder definido</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Funcionários vinculados
              </label>
              <div className="space-y-1.5">
                {employeesOf(selectedSector.id).length === 0 && (
                  <p className="text-xs text-gray-500 italic">Nenhum funcionário neste setor ainda.</p>
                )}
                {employeesOf(selectedSector.id).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs bg-black/20 rounded-lg px-2.5 py-1.5">
                    <User size={12} className="text-gray-500 shrink-0" />
                    <span className="truncate flex-1">{p.full_name ?? p.email}</span>
                    {canEdit && (
                      <>
                        <select
                          value={p.role}
                          onChange={(e) => setRole(p.id, e.target.value as Profile["role"])}
                          className="bg-black/30 border border-white/10 rounded px-1 py-0.5 text-[11px] outline-none"
                        >
                          <option value="funcionario">Funcionário</option>
                          <option value="gerente">Gerente</option>
                          <option value="gestor">Gestor</option>
                        </select>
                        <button
                          onClick={() => setSectorForProfile(p.id, null)}
                          title="Remover do setor"
                          className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={addEmployeeId}
                    onChange={(e) => setAddEmployeeId(e.target.value)}
                    className="flex-1 bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="">Adicionar funcionário existente...</option>
                    {profiles
                      .filter((p) => p.sector_id !== selectedSector.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name ?? p.email}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => {
                      if (addEmployeeId) setSectorForProfile(addEmployeeId, selectedSector.id);
                      setAddEmployeeId("");
                    }}
                    disabled={!addEmployeeId}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => deleteSector(selectedSector.id)}
                className="flex items-center gap-2 text-xs text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-lg cursor-pointer"
              >
                <Trash2 size={12} /> Remover setor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
