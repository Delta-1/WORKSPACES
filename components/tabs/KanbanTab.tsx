"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, SquareKanban, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, Sector, TaskColumn, WorkspaceTask } from "@/lib/types";

const COLUMNS: { id: TaskColumn; label: string; dot: string }[] = [
  { id: "a_fazer", label: "A Fazer", dot: "bg-gray-500" },
  { id: "em_andamento", label: "Em Execução", dot: "bg-blue-500" },
  { id: "concluido", label: "Concluído", dot: "bg-emerald-500" },
];

export default function KanbanTab({ profile }: { profile: Profile | null }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalSectorId, setModalSectorId] = useState("");
  const [modalDue, setModalDue] = useState("");

  const isGestor = profile?.role === "gestor";
  const isGerente = profile?.role === "gerente";

  async function load() {
    if (!supabase) return;
    const sectorsRes = await supabase.from("sectors").select("*").order("created_at");
    if (sectorsRes.data) setSectors(sectorsRes.data);

    const effectiveSector = isGestor ? sectorId : profile?.sector_id ?? null;
    if (!isGestor && !profile?.sector_id) {
      setTasks([]);
      return;
    }
    let query = supabase.from("tasks").select("*").order("created_at");
    if (effectiveSector) query = query.eq("sector_id", effectiveSector);
    const tasksRes = await query;
    if (tasksRes.data) setTasks(tasksRes.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorId, profile?.id]);

  useEffect(() => {
    if (isGestor && !sectorId && sectors.length > 0) setSectorId(sectors[0].id);
  }, [isGestor, sectors, sectorId]);

  const targetSector = isGestor ? sectorId : profile?.sector_id ?? null;

  // Only the general Gestor, or the Gerente in charge of the sector being
  // viewed, can create tasks there — Funcionário can view/move but not add.
  const canCreateInTargetSector =
    isGestor || (isGerente && profile?.sector_id != null && profile.sector_id === targetSector);

  const columns = useMemo(() => {
    const grouped: Record<TaskColumn, WorkspaceTask[]> = { a_fazer: [], em_andamento: [], concluido: [] };
    tasks.forEach((t) => grouped[t.column_name]?.push(t));
    return grouped;
  }, [tasks]);

  function openModal() {
    setModalTitle("");
    setModalSectorId(isGestor ? targetSector ?? sectors[0]?.id ?? "" : profile?.sector_id ?? "");
    setShowModal(true);
  }

  async function submitModal() {
    if (!modalTitle.trim() || !modalSectorId || !supabase) return;
    const { data } = await supabase
      .from("tasks")
      .insert({
        title: modalTitle.trim(),
        sector_id: modalSectorId,
        column_name: "a_fazer",
        due_date: modalDue ? new Date(modalDue).toISOString() : null,
      })
      .select("*")
      .single();
    if (data && data.sector_id === targetSector) setTasks((prev) => [...prev, data]);
    setModalDue("");
    setShowModal(false);
  }

  async function moveTask(id: string, column: TaskColumn) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column_name: column } : t)));
    await supabase?.from("tasks").update({ column_name: column }).eq("id", id);
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase?.from("tasks").delete().eq("id", id);
  }

  if (!isGestor && !profile?.sector_id) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 italic">
        Você ainda não foi vinculado a um setor. Peça a um gestor para te adicionar no organograma.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <SquareKanban className="text-emerald-400" size={20} /> Quadro Kanban
        </h3>
        <div className="flex items-center gap-2">
          {isGestor && (
            <select
              value={sectorId ?? ""}
              onChange={(e) => setSectorId(e.target.value || null)}
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none"
            >
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {canCreateInTargetSector && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
            >
              <Plus size={14} /> Nova tarefa
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragTaskId && moveTask(dragTaskId, col.id)}
            className="liquid-glass rounded-xl p-3 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} /> {col.label}
              </span>
              <span className="bg-black/30 px-2 py-0.5 rounded text-xs font-bold">{columns[col.id].length}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
              {columns[col.id].map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragTaskId(t.id)}
                  className="bg-black/20 border border-white/10 p-3 rounded-lg cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.title}</p>
                    {canCreateInTargetSector && (
                      <button
                        onClick={() => deleteTask(t.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="drawer-anim liquid-glass rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold">Nova tarefa</h4>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Assunto
                </label>
                <input
                  autoFocus
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitModal()}
                  placeholder="Ex: Ligar para o cliente X"
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Setor
                </label>
                <select
                  disabled={!isGestor}
                  value={modalSectorId}
                  onChange={(e) => setModalSectorId(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
                >
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Prazo (opcional — aparece no calendário)
                </label>
                <input
                  type="date"
                  value={modalDue}
                  onChange={(e) => setModalDue(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                onClick={submitModal}
                disabled={!modalTitle.trim() || !modalSectorId}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Criar tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
