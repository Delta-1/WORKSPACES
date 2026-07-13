"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, SquareKanban, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { CalendarEvent, Profile, WorkspaceTask } from "@/lib/types";

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarTab({ profile }: { profile: Profile | null }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [time, setTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [toGoogle, setToGoogle] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const first = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1).toISOString();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0).toISOString();
    const [ev, tk] = await Promise.all([
      supabase.from("events").select("*").gte("starts_at", first).lte("starts_at", last).order("starts_at"),
      supabase.from("tasks").select("*").not("due_date", "is", null),
    ]);
    if (ev.data) setEvents(ev.data as CalendarEvent[]);
    if (tk.data) setTasks(tk.data as WorkspaceTask[]);
  }, [cursor]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // detecta retorno do OAuth do Google Agenda
    if (typeof window !== "undefined" && window.location.search.includes("calendar=1")) {
      supabase?.auth.getSession().then(({ data }) => {
        if (data.session?.provider_token) setGoogleReady(true);
      });
    }
  }, []);

  const grid = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(1 - firstOfMonth.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const itemsFor = useCallback(
    (day: Date) => {
      const evs = events.filter((e) => sameDay(new Date(e.starts_at), day)).map((e) => ({ kind: "event" as const, e }));
      const tks = tasks
        .filter((t) => t.due_date && sameDay(new Date(t.due_date), day))
        .map((t) => ({ kind: "task" as const, t }));
      return { evs, tks };
    },
    [events, tasks]
  );

  const selectedItems = itemsFor(selected);

  async function connectGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { scopes: CAL_SCOPE, redirectTo: `${window.location.origin}?calendar=1` },
    });
  }

  async function createGoogleEvent(ev: { title: string; description: string; location: string; startISO: string; endISO: string; allDay: boolean; date: string }, token: string) {
    const body = {
      summary: ev.title,
      description: ev.description || undefined,
      location: ev.location || undefined,
      start: ev.allDay ? { date: ev.date } : { dateTime: ev.startISO },
      end: ev.allDay ? { date: ev.date } : { dateTime: ev.endISO },
    };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()).id as string;
    return null;
  }

  async function submit() {
    if (!supabase || !title.trim()) return;
    setSaving(true);
    try {
      const startISO = new Date(`${date}T${allDay ? "00:00" : time}`).toISOString();
      const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
      let googleId: string | null = null;
      if (toGoogle) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.provider_token;
        if (token) {
          googleId = await createGoogleEvent(
            { title: title.trim(), description, location, startISO, endISO, allDay, date },
            token
          );
        } else {
          alert("Conecte o Google Agenda primeiro (botão no topo).");
        }
      }
      await supabase.from("events").insert({
        title: title.trim(),
        description: description || null,
        starts_at: startISO,
        ends_at: endISO,
        all_day: allDay,
        location: location || null,
        google_event_id: googleId,
        created_by: profile?.id ?? null,
      });
      setTitle("");
      setDescription("");
      setLocation("");
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (!supabase) return;
    if (!confirm("Remover este agendamento?")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <CalendarDays className="text-emerald-400" size={20} /> Calendário
        </h3>
        <div className="flex items-center gap-2">
          {!googleReady ? (
            <button
              onClick={connectGoogle}
              className="text-xs liquid-glass px-3 py-2 rounded-lg cursor-pointer"
            >
              Conectar Google Agenda
            </button>
          ) : (
            <span className="text-xs text-emerald-400">Google Agenda conectado</span>
          )}
          <button
            onClick={() => {
              setDate(ymd(selected));
              setShowForm(true);
            }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
          >
            <Plus size={14} /> Novo agendamento
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 overflow-hidden">
        {/* Grade do mês */}
        <div className="liquid-glass rounded-2xl p-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 px-1">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] text-gray-500 mb-1">
            {WEEK.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr overflow-y-auto custom-scroll">
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = sameDay(d, new Date());
              const isSel = sameDay(d, selected);
              const { evs, tks } = itemsFor(d);
              return (
                <button
                  key={i}
                  onClick={() => setSelected(new Date(d))}
                  className={`rounded-lg p-1.5 text-left border transition-colors cursor-pointer min-h-[56px] ${
                    isSel ? "border-emerald-500 bg-emerald-950/30" : "border-white/5 hover:bg-white/5"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className={`text-[11px] ${isToday ? "text-emerald-400 font-bold" : "text-gray-300"}`}>
                    {d.getDate()}
                  </div>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {evs.slice(0, 2).map((x) => (
                      <span key={x.e.id} className="text-[9px] truncate rounded px-1 bg-emerald-600/70 text-white">
                        {x.e.title}
                      </span>
                    ))}
                    {tks.slice(0, 1).map((x) => (
                      <span key={x.t.id} className="text-[9px] truncate rounded px-1 bg-sky-600/70 text-white flex items-center gap-0.5">
                        <SquareKanban size={8} /> {x.t.title}
                      </span>
                    ))}
                    {evs.length + tks.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{evs.length + tks.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel do dia selecionado */}
        <div className="liquid-glass rounded-2xl p-4 flex flex-col overflow-hidden">
          <p className="text-sm font-bold mb-1">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <div className="flex-1 overflow-y-auto custom-scroll space-y-2 mt-2">
            {selectedItems.evs.length === 0 && selectedItems.tks.length === 0 && (
              <p className="text-xs text-gray-500 italic">Nada agendado neste dia.</p>
            )}
            {selectedItems.evs.map((x) => (
              <div key={x.e.id} className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{x.e.title}</p>
                  <button onClick={() => removeEvent(x.e.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  {x.e.all_day ? "Dia inteiro" : new Date(x.e.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {x.e.google_event_id && <span className="text-emerald-500 ml-1">· Google</span>}
                </p>
                {x.e.description && <p className="text-[11px] text-gray-400 mt-1">{x.e.description}</p>}
              </div>
            ))}
            {selectedItems.tks.map((x) => (
              <div key={x.t.id} className="bg-sky-950/30 border border-sky-800/40 rounded-lg p-2.5">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <SquareKanban size={13} className="text-sky-400" /> {x.t.title}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Tarefa do Kanban</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="liquid-glass rounded-2xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold">Novo agendamento</h4>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-white/10 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título *" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={allDay} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-emerald-600" /> Dia inteiro
            </label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Local (opcional)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={toGoogle} onChange={(e) => setToGoogle(e.target.checked)} className="accent-emerald-600" /> Adicionar também no Google Agenda
            </label>
            <button onClick={submit} disabled={saving || !title.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {saving ? "Salvando..." : "Agendar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
