"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Network, Plus, Trash2, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, Sector } from "@/lib/types";

export default function OrgChartTab({ canEdit }: { canEdit: boolean }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  function onPointerDownNode(e: React.PointerEvent, id: string) {
    if (!canEdit) {
      setSelected(id);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const s = byId.get(id);
    if (!rect || !s) return;
    dragOffset.current = { x: e.clientX - rect.left - s.pos_x, y: e.clientY - rect.top - s.pos_y };
    setDragging(id);
    setSelected(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - dragOffset.current.x;
    const y = e.clientY - rect.top - dragOffset.current.y;
    setSectors((prev) => prev.map((s) => (s.id === dragging ? { ...s, pos_x: x, pos_y: y } : s)));
  }

  async function onPointerUp() {
    if (!dragging) return;
    const s = byId.get(dragging);
    setDragging(null);
    if (s) await supabase?.from("sectors").update({ pos_x: s.pos_x, pos_y: s.pos_y }).eq("id", s.id);
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 overflow-hidden">
      <div className="liquid-glass rounded-2xl overflow-hidden relative flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Network className="text-emerald-400" size={20} /> Organograma
          </h3>
          {canEdit && (
            <button
              onClick={addSector}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
            >
              <Plus size={14} /> Novo setor
            </button>
          )}
        </div>
        <div
          ref={containerRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="flex-1 relative overflow-auto custom-scroll"
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 1200, minHeight: 800 }}>
            {sectors.map((s) => {
              if (!s.parent_id) return null;
              const parent = byId.get(s.parent_id);
              if (!parent) return null;
              return (
                <line
                  key={`edge-${s.id}`}
                  x1={parent.pos_x + 70}
                  y1={parent.pos_y + 30}
                  x2={s.pos_x + 70}
                  y2={s.pos_y + 30}
                  stroke="rgba(16,185,129,0.3)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
          <div style={{ position: "relative", minWidth: 1200, minHeight: 800 }}>
            {sectors.map((s) => {
              const leader = s.leader_id ? profiles.find((p) => p.id === s.leader_id) : null;
              return (
                <div
                  key={s.id}
                  onPointerDown={(e) => onPointerDownNode(e, s.id)}
                  style={{ left: s.pos_x, top: s.pos_y }}
                  className={`absolute w-[140px] rounded-xl px-3 py-2.5 select-none ${
                    canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  } liquid-glass border ${
                    selected === s.id ? "border-emerald-500" : "border-white/10"
                  }`}
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
            {sectors.length === 0 && (
              <p className="p-6 text-sm text-gray-500 italic">
                {canEdit ? 'Clique em "Novo setor" para começar a desenhar a hierarquia.' : "Organograma ainda não configurado."}
              </p>
            )}
          </div>
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
