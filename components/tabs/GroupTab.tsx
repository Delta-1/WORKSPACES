"use client";

import { useEffect, useRef, useState } from "react";
import {
  Users2, Plus, LogIn, Copy, Check, Crown, Vote, CalendarPlus,
  Link2, Image as ImageIcon, FileText, Send, Video, Megaphone,
  CalendarDays, ArrowLeft, Paperclip, ShieldCheck, Pencil, Trash2,
  PenTool, Loader2, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import ProjectBoard from "@/components/group/ProjectBoard";
import ShortcutCreator from "@/components/ShortcutCreator";
import ShortcutIcon from "@/components/ShortcutIcon";
import { openWorkspaceShortcut, shortcutChanged, type WorkspaceShortcut } from "@/lib/workspace-shortcuts";

type Group = {
  id: string;
  name: string;
  code: string;
  created_by: string;
  leader_id: string | null;
  purpose: string | null;
  created_at: string;
};
type Member = { user_id: string; joined_at: string; full_name: string | null; email: string };
type Post = {
  id: string;
  group_id: string;
  user_id: string;
  kind: "text" | "link" | "photo" | "file";
  content: string | null;
  url: string | null;
  name: string | null;
  created_at: string;
  author?: string | null;
};
type Agenda = {
  id: string;
  group_id: string;
  title: string;
  due: string | null;
  done: boolean;
  created_by: string;
  created_at: string;
  event_ids?: string[] | null;
  task_ids?: string[] | null;
};

type Section = "mural" | "chamada" | "agenda" | "projetos" | "links" | "membros";

type Projeto = { id: string; group_id: string; title: string; updated_at: string };

export default function GroupTab({ profile, onOpenApp }: { profile: Profile | null; onOpenApp: (id: string) => void }) {
  const me = profile?.id ?? "";
  const [groups, setGroups] = useState<Group[]>([]);
  const [sel, setSel] = useState<Group | null>(null);
  const [section, setSection] = useState<Section>("mural");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [gName, setGName] = useState("");
  const [gPurpose, setGPurpose] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadGroups() {
    if (!supabase) return;
    const { data } = await supabase
      .from("group_members")
      .select("groups(*)")
      .eq("user_id", me)
      .order("joined_at", { ascending: false });
    const gs = ((data as unknown as { groups: Group }[]) || [])
      .map((r) => r.groups)
      .filter(Boolean);
    setGroups(gs);
    // mantém a seleção sincronizada com a versão mais nova (líder pode ter mudado)
    if (sel) {
      const fresh = gs.find((g) => g.id === sel.id);
      if (fresh) setSel(fresh);
    }
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function createGroup() {
    if (!supabase || !gName.trim() || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_group", {
        p_name: gName.trim(),
        p_purpose: gPurpose.trim() || null,
      });
      if (error) { alert("Erro ao criar: " + error.message); return; }
      setGName(""); setGPurpose(""); setCreating(false);
      await loadGroups();
      if (data) { setSel(data as Group); setSection("membros"); }
    } finally { setBusy(false); }
  }

  async function joinGroup() {
    if (!supabase || !joinCode.trim() || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("join_group", { p_code: joinCode.trim() });
      if (error) { alert(error.message); return; }
      setJoinCode(""); setJoining(false);
      await loadGroups();
      if (data) { setSel(data as Group); setSection("mural"); }
    } finally { setBusy(false); }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ---------- Lista de grupos ----------
  if (!sel) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <Users2 className="text-indigo-400" /> Group
            </h1>
            <p className="text-sm text-slate-400">
              Rede social de estudos: grupos, chamada de vídeo, mural e agenda compartilhada.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setJoining((v) => !v); setCreating(false); }}
              className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
            >
              <LogIn size={16} /> Entrar por código
            </button>
            <button
              onClick={() => { setCreating((v) => !v); setJoining(false); }}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Plus size={16} /> Criar grupo
            </button>
          </div>
        </div>

        {joining && (
          <div className="mb-4 flex gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código do grupo (ex.: 7K3P9Q)"
              className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-indigo-500"
              onKeyDown={(e) => e.key === "Enter" && joinGroup()}
            />
            <button onClick={joinGroup} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              Entrar
            </button>
          </div>
        )}

        {creating && (
          <div className="mb-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
            <input
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="Nome do grupo (ex.: 3º Ano B — ENEM)"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <input
              value={gPurpose}
              onChange={(e) => setGPurpose(e.target.value)}
              placeholder="Para que serve? (ex.: revisão para a prova de física)"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <button onClick={createGroup} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              Criar
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
            <Users2 className="mx-auto mb-2 text-slate-600" size={40} />
            Você ainda não participa de nenhum grupo.<br />
            Crie um grupo de estudos ou entre com um código.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setSel(g); setSection("mural"); }}
                className="group rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-left transition hover:border-indigo-500 hover:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{g.name}</span>
                  {g.leader_id === me && <Crown size={16} className="text-amber-400" />}
                </div>
                {g.purpose && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{g.purpose}</p>}
                <span className="mt-2 inline-block rounded bg-slate-900 px-2 py-0.5 font-mono text-xs text-indigo-300">
                  {g.code}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- Grupo aberto ----------
  return (
    <div className="mx-auto max-w-4xl p-4">
      <button onClick={() => setSel(null)} className="mb-3 flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={16} /> Meus grupos
      </button>

      <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Users2 className="text-indigo-400" /> {sel.name}
          </h1>
          <button
            onClick={() => copyCode(sel.code)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-sm text-indigo-300 hover:bg-slate-700"
            title="Copiar código do grupo"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {sel.code}
          </button>
        </div>
        {sel.purpose && <p className="mt-1 text-sm text-slate-400">{sel.purpose}</p>}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-900 p-1 custom-scroll">
        {([
          ["mural", "Mural", Megaphone],
          ["chamada", "Chamada", Video],
          ["agenda", "Agenda", CalendarDays],
          ["projetos", "Projetos", PenTool],
          ["links", "Links", Link2],
          ["membros", "Membros", Users2],
        ] as [Section, string, typeof Users2][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
              section === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {section === "mural" && <Mural group={sel} me={me} />}
      {section === "chamada" && <Chamada group={sel} profile={profile} />}
      {section === "agenda" && <AgendaView group={sel} me={me} />}
      {section === "projetos" && <ProjetosView group={sel} me={me} />}
      {section === "links" && <GroupLinksView group={sel} profile={profile} onOpenApp={onOpenApp} />}
      {section === "membros" && <Membros group={sel} me={me} onLeaderChange={loadGroups} />}
    </div>
  );
}

// =================== MURAL ===================
function Mural({ group, me }: { group: Group; me: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    if (!supabase) return;
    const { data } = await supabase
      .from("group_posts")
      .select("*")
      .eq("group_id", group.id)
      .order("created_at", { ascending: true });
    const list = (data as unknown as Post[]) || [];
    setPosts(list);
    const ids = Array.from(new Set(list.map((p) => p.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: { id: string; full_name: string | null; email: string }) => {
        map[p.id] = p.full_name || p.email;
      });
      setNames(map);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [group.id]);

  async function sendText() {
    if (!supabase || !text.trim() || busy) return;
    setBusy(true);
    try {
      const isLink = /^https?:\/\//i.test(text.trim());
      await supabase.from("group_posts").insert({
        group_id: group.id, user_id: me,
        kind: isLink ? "link" : "text",
        content: text.trim(), url: isLink ? text.trim() : null,
      });
      setText("");
      await load();
    } finally { setBusy(false); }
  }

  async function sendFile(file: File) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const path = `${group.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("group-files").upload(path, buf, {
        contentType: file.type || "application/octet-stream", upsert: true,
      });
      if (error) { alert("Erro ao enviar arquivo: " + error.message); return; }
      const url = supabase.storage.from("group-files").getPublicUrl(path).data.publicUrl;
      const isImg = (file.type || "").startsWith("image/");
      await supabase.from("group_posts").insert({
        group_id: group.id, user_id: me,
        kind: isImg ? "photo" : "file",
        url, name: file.name,
      });
      await load();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {posts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Ainda não há nada no mural. Compartilhe links, fotos e documentos.</p>}
        {posts.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-300">{names[p.user_id] || "Alguém"}</span>
              <span>{new Date(p.created_at).toLocaleString("pt-BR")}</span>
            </div>
            {p.kind === "text" && <p className="whitespace-pre-wrap text-sm text-slate-100">{p.content}</p>}
            {p.kind === "link" && (
              <a href={p.url!} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-300 hover:underline">
                <Link2 size={16} /> {p.content}
              </a>
            )}
            {p.kind === "photo" && (
              <a href={p.url!} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url!} alt={p.name || "foto"} className="max-h-72 rounded-lg border border-slate-700" />
              </a>
            )}
            {p.kind === "file" && (
              <a href={p.url!} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
                <FileText size={16} className="text-indigo-300" /> {p.name || "documento"}
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-2">
        <button onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white" title="Foto ou documento">
          <Paperclip size={18} />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0])} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendText()}
          placeholder="Escreva algo ou cole um link…"
          className="flex-1 bg-transparent px-2 text-white outline-none placeholder:text-slate-500"
        />
        <button onClick={sendText} disabled={busy} className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:opacity-50">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

// =================== CHAMADA (vídeo tipo Teams via Jitsi) ===================
function Chamada({ group, profile }: { group: Group; profile: Profile | null }) {
  const [open, setOpen] = useState(false);
  const room = `workspace-group-${group.id}`;
  const name = encodeURIComponent(profile?.full_name || profile?.email || "Convidado");
  const src = `https://meet.jit.si/${room}#userInfo.displayName=%22${name}%22&config.prejoinPageEnabled=false`;

  if (!open) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center">
        <Video className="mx-auto mb-3 text-indigo-400" size={40} />
        <h3 className="text-lg font-semibold text-white">Chamada de vídeo do grupo</h3>
        <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-slate-400">
          Sala de reunião só deste grupo (áudio, vídeo e compartilhar tela). Todo mundo entra na mesma sala.
        </p>
        <button onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500">
          Entrar na chamada
        </button>
      </div>
    );
  }
  // A chamada abre em tela cheia (overlay fixo) para nunca vazar/cortar — funciona
  // igual no computador e no celular, ocupando exatamente a tela disponível.
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" style={{ height: "100dvh" }}>
      <div className="flex items-center justify-between bg-slate-900 px-3 py-2 shrink-0" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <span className="truncate text-sm text-slate-300">Chamada — {group.name}</span>
        <button onClick={() => setOpen(false)} className="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500">
          Sair da chamada
        </button>
      </div>
      <iframe
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="w-full flex-1 border-0"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

// =================== AGENDA ===================
function AgendaView({ group, me }: { group: Group; me: string }) {
  const [items, setItems] = useState<Agenda[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const canEdit = group.leader_id === me || group.created_by === me;
  const localCompletionKey = `group:completion:${me}:${group.id}`;

  function readLocalCompletion() {
    if (typeof window === "undefined") return new Map<string, boolean>();
    try {
      const saved = JSON.parse(window.localStorage.getItem(localCompletionKey) || "{}") as Record<string, boolean>;
      return new Map(Object.entries(saved));
    } catch {
      return new Map<string, boolean>();
    }
  }

  function saveLocalCompletion(agendaId: string, done: boolean) {
    if (typeof window === "undefined") return;
    const saved = Object.fromEntries(readLocalCompletion());
    saved[agendaId] = done;
    window.localStorage.setItem(localCompletionKey, JSON.stringify(saved));
  }

  async function load() {
    if (!supabase) return;
    const { data } = await supabase
      .from("group_agenda")
      .select("*")
      .eq("group_id", group.id)
      .order("due", { ascending: true, nullsFirst: false });
    const agenda = (data as unknown as Agenda[]) || [];
    if (agenda.length === 0) {
      setItems([]);
      return;
    }
    const { data: completion, error: completionError } = await supabase
      .from("group_agenda_completion")
      .select("agenda_id, done")
      .eq("user_id", me)
      .in("agenda_id", agenda.map((item) => item.id));
    const personalDone = completionError
      ? readLocalCompletion()
      : new Map(
          ((completion as { agenda_id: string; done: boolean }[] | null) ?? []).map((row) => [row.agenda_id, row.done])
        );
    setItems(agenda.map((item) => ({ ...item, done: personalDone.get(item.id) ?? false })));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [group.id, me]);

  async function add() {
    if (!supabase || !title.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("add_group_agenda", {
        p_group: group.id, p_title: title.trim(), p_due: due || null,
      });
      if (error) { alert(error.message); return; }
      setTitle(""); setDue("");
      await load();
    } finally { setBusy(false); }
  }

  async function toggle(a: Agenda) {
    if (!supabase || !me) return;
    const next = !a.done;
    setItems((current) => current.map((item) => (item.id === a.id ? { ...item, done: next } : item)));
    const { error } = await supabase.from("group_agenda_completion").upsert(
      { agenda_id: a.id, user_id: me, done: next, updated_at: new Date().toISOString() },
      { onConflict: "agenda_id,user_id" }
    );
    if (error) {
      // Mantém a conclusão isolada no aparelho enquanto a migração do banco ainda
      // não tiver sido aplicada. Outros erros são exibidos e revertem o estado.
      if (error.code === "42P01" || error.code === "PGRST205") {
        saveLocalCompletion(a.id, next);
        return;
      }
      setItems((current) => current.map((item) => (item.id === a.id ? { ...item, done: a.done } : item)));
      alert(error.message);
      return;
    }
    await load();
  }

  function startEdit(a: Agenda) {
    setEditing(a.id); setEditTitle(a.title); setEditDue(a.due || "");
  }
  async function saveEdit() {
    if (!supabase || !editing || !editTitle.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("edit_group_agenda", {
        p_id: editing, p_title: editTitle.trim(), p_due: editDue || null,
      });
      if (error) { alert(error.message); return; }
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  }
  async function remove(a: Agenda) {
    if (!supabase || !canEdit) return;
    if (!confirm(`Excluir "${a.title}" da agenda compartilhada do grupo?`)) return;
    const { error } = await supabase.rpc("delete_group_agenda", { p_id: a.id });
    if (error) { alert(error.message); return; }
    await load();
  }

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tarefa (ex.: estudar cap. 4 de biologia)"
            className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <button onClick={add} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <CalendarPlus size={16} /> Adicionar
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
          <ShieldCheck size={13} className="mr-1 inline" />
          Só o líder edita a agenda compartilhada. Cada membro marca a própria conclusão sem alterar a tarefa dos demais.
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhuma tarefa na agenda ainda.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
              {editing === a.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 rounded-lg border border-indigo-500 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none"
                    autoFocus
                  />
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none"
                  />
                  <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Salvar</button>
                  <button onClick={() => setEditing(null)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600">Cancelar</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggle(a)}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${a.done ? "border-emerald-500 bg-emerald-500" : "border-slate-500"}`}
                    title={a.done ? "Marcar como pendente para mim" : "Marcar como concluída para mim"}
                  >
                    {a.done && <Check size={14} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${a.done ? "text-slate-500 line-through" : "text-slate-100"}`}>{a.title}</p>
                    {a.due && <p className="text-xs text-indigo-300">{new Date(a.due + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(a)} title="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"><Pencil size={14} /></button>
                      <button onClick={() => remove(a)} title="Excluir" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-600/30 hover:text-red-300"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =================== MEMBROS + VOTAÇÃO DE LÍDER ===================
function Membros({ group, me, onLeaderChange }: { group: Group; me: string; onLeaderChange: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [myVote, setMyVote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("group_member_directory", { p_group_id: group.id });
    // Compatibilidade enquanto a migração nova ainda não chegou ao banco.
    let list: Member[] = (data as Member[] | null) ?? [];
    if (error) {
      const fallback = await supabase.from("group_members").select("user_id, joined_at").eq("group_id", group.id);
      const base = (fallback.data as { user_id: string; joined_at: string }[] | null) ?? [];
      const ids = base.map((item) => item.user_id);
      const profiles = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
      const names = new Map(((profiles.data as { id: string; full_name: string | null; email: string }[] | null) ?? []).map((item) => [item.id, item]));
      list = base.map((item) => ({ ...item, full_name: names.get(item.user_id)?.full_name ?? null, email: names.get(item.user_id)?.email ?? "Membro do Group" }));
    }
    setMembers(list);

    const { data: votes } = await supabase
      .from("group_leader_votes")
      .select("voter_id, candidate_id")
      .eq("group_id", group.id);
    const t: Record<string, number> = {};
    (votes || []).forEach((v: { voter_id: string; candidate_id: string }) => {
      t[v.candidate_id] = (t[v.candidate_id] || 0) + 1;
      if (v.voter_id === me) setMyVote(v.candidate_id);
    });
    setTally(t);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [group.id]);

  async function vote(candidate: string) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cast_leader_vote", { p_group: group.id, p_candidate: candidate });
      if (error) { alert(error.message); return; }
      setMyVote(candidate);
      await load();
      onLeaderChange(); // líder pode ter mudado
    } finally { setBusy(false); }
  }

  const nameOf = (m: Member) => m.full_name || m.email || "Alguém";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-700/50 bg-indigo-900/20 p-3 text-sm text-indigo-200">
        <Vote size={15} className="mr-1 inline" />
        Vote em quem deve ser o <b>líder</b> do grupo. Quem tiver mais votos vira líder na hora e passa a editar a agenda de todos.
      </div>
      <div className="space-y-2">
        {members.map((m) => {
          const isLeader = group.leader_id === m.user_id;
          const votes = tally[m.user_id] || 0;
          return (
            <div key={m.user_id} className={`flex items-center gap-3 rounded-xl border p-3 ${isLeader ? "border-amber-500/60 bg-amber-500/10" : "border-slate-700 bg-slate-800/50"}`}>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-700 text-sm font-semibold text-white">
                {nameOf(m).slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                  {nameOf(m)}
                  {m.user_id === me && <span className="text-xs text-slate-400">(você)</span>}
                  {isLeader && <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300"><Crown size={11} /> líder</span>}
                  {group.created_by === m.user_id && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">criador</span>}
                </p>
                <p className="text-xs text-slate-500">{votes} voto{votes === 1 ? "" : "s"}</p>
              </div>
              <button
                onClick={() => vote(m.user_id)}
                disabled={busy}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  myVote === m.user_id ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                }`}
              >
                {myVote === m.user_id ? "Seu voto" : "Votar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// LINKS DO GROUP — gerenciados pelo criador/líder e visíveis para todo membro.
function GroupLinksView({ group, profile, onOpenApp }: { group: Group; profile: Profile | null; onOpenApp: (id: string) => void }) {
  const [items, setItems] = useState<WorkspaceShortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const canManage = group.created_by === profile?.id || group.leader_id === profile?.id;

  async function load() {
    if (!supabase) return;
    const { data } = await supabase.from("workspace_shortcuts").select("*").eq("group_id", group.id).order("updated_at", { ascending: false });
    setItems((data as WorkspaceShortcut[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener("workspace-shortcuts-changed", changed);
    const channel = supabase?.channel(`group-links:${group.id}`).on("postgres_changes", { event: "*", schema: "public", table: "workspace_shortcuts", filter: `group_id=eq.${group.id}` }, changed).subscribe();
    return () => { window.removeEventListener("workspace-shortcuts-changed", changed); if (channel) void supabase?.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  async function remove(item: WorkspaceShortcut) {
    if (!supabase || !canManage || !confirm(`Remover "${item.name}" deste Group?`)) return;
    const { error } = await supabase.from("workspace_shortcuts").delete().eq("id", item.id);
    if (error) { alert(error.message); return; }
    shortcutChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold"><Link2 size={16} className="text-cyan-300" /> Links compartilhados</h3>
          <p className="mt-1 text-[11px] text-slate-500">Bibliotecas, nuvens e ferramentas disponíveis para todos deste Group.</p>
        </div>
        {canManage && <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"><Plus size={14} /> Adicionar link</button>}
      </div>

      {!canManage && <p className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-[11px] text-slate-400"><ShieldCheck size={13} className="mr-1 inline" /> O dono ou líder organiza os links; todos os membros podem abrir.</p>}

      {loading ? <div className="grid place-items-center py-16 text-slate-500"><Loader2 size={20} className="animate-spin" /></div> : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-14 text-center">
          <Link2 className="mx-auto mb-2 text-slate-600" size={28} />
          <p className="text-sm font-semibold text-slate-300">Nenhum link compartilhado</p>
          <p className="mt-1 text-xs text-slate-500">{canManage ? "Adicione uma pasta do Drive, ferramenta ou aplicativo." : "O líder ainda não adicionou nenhum atalho."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-cyan-500/35 hover:bg-white/[0.055]">
              <button onClick={() => openWorkspaceShortcut(item, onOpenApp)} className="w-full text-left">
                <ShortcutIcon provider={item.provider} size={22} className="mb-3 h-11 w-11" />
                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{item.description || item.target}</p>
                <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-[9px] ${item.server_status === "synced" ? "bg-emerald-500/10 text-emerald-300" : item.server_status === "waiting_server" ? "bg-amber-500/10 text-amber-300" : "bg-sky-500/10 text-sky-300"}`}>
                  {item.server_status === "synced" ? "No servidor" : item.server_status === "waiting_server" ? "Aguardando servidor" : "Sincronizando"}
                </span>
              </button>
              {canManage && <button onClick={() => remove(item)} className="absolute right-2 top-2 rounded-lg bg-black/40 p-1.5 text-slate-500 opacity-0 transition hover:bg-red-500/25 hover:text-red-300 group-hover:opacity-100" title="Remover"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}

      <ShortcutCreator open={creating} onClose={() => setCreating(false)} profile={profile} group={{ id: group.id, name: group.name, canManage }} />
    </div>
  );
}

// PROJETOS — a lista de quadros do grupo (as "pastinhas") e a porta para o
// quadro infinito. Cada projeto é uma tela de desenho independente.
function ProjetosView({ group, me }: { group: Group; me: string }) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<Projeto | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar() {
    if (!supabase) return;
    const { data } = await supabase
      .from("group_projects")
      .select("id, group_id, title, updated_at")
      .eq("group_id", group.id)
      .order("updated_at", { ascending: false });
    setProjetos((data as Projeto[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    setAberto(null);
    void carregar();
    // A lista se atualiza sozinha quando alguém cria/renomeia um quadro.
    const ch = supabase?.channel(`projetos:${group.id}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_projects", filter: `group_id=eq.${group.id}` },
      () => void carregar()
    ).subscribe();
    return () => { if (ch) void supabase?.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  async function criar() {
    if (!supabase) return;
    setCriando(true);
    const { data } = await supabase
      .from("group_projects")
      .insert({ group_id: group.id, title: "Novo projeto", created_by: me, updated_by: me })
      .select("id, group_id, title, updated_at")
      .single();
    setCriando(false);
    if (data) setAberto(data as Projeto);
  }

  async function renomear(p: Projeto) {
    const novo = prompt("Nome do projeto:", p.title);
    if (!novo || !novo.trim() || !supabase) return;
    await supabase.from("group_projects").update({ title: novo.trim() }).eq("id", p.id);
    void carregar();
  }

  async function apagar(p: Projeto) {
    if (!confirm(`Apagar o projeto "${p.title}"? O quadro é perdido.`) || !supabase) return;
    await supabase.from("group_projects").delete().eq("id", p.id);
    void carregar();
  }

  if (aberto) {
    return (
      <ProjectBoard projectId={aberto.id} title={aberto.title} meId={me} onBack={() => { setAberto(null); void carregar(); }} />
    );
  }

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold">Projetos do grupo</h3>
          <p className="text-[11px] text-slate-500">Quadros para desenhar, mapear ideias e montar fluxogramas — juntos, na reunião.</p>
        </div>
        <button onClick={criar} disabled={criando} className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50">
          {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Novo projeto
        </button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16 text-slate-500"><Loader2 size={20} className="animate-spin" /></div>
      ) : projetos.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950/50 grid place-items-center mx-auto mb-3"><PenTool size={22} className="text-indigo-300" /></div>
          <p className="text-sm text-slate-300 font-semibold">Nenhum projeto ainda</p>
          <p className="text-[12px] text-slate-500 mt-1">Crie um quadro em branco e comece a desenhar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {projetos.map((p) => (
            <div key={p.id} className="group relative rounded-xl border border-white/10 bg-white/5 hover:border-indigo-500/40 transition overflow-hidden">
              <button onClick={() => setAberto(p)} className="w-full text-left cursor-pointer">
                <div className="h-24 bg-[#0c1018] grid place-items-center" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
                  <PenTool size={22} className="text-indigo-400/60" />
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] font-semibold truncate">{p.title}</p>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><Clock size={10} /> {new Date(p.updated_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </button>
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => renomear(p)} className="p-1 rounded bg-black/50 hover:bg-black/70 text-slate-300 cursor-pointer" title="Renomear"><Pencil size={12} /></button>
                <button onClick={() => apagar(p)} className="p-1 rounded bg-black/50 hover:bg-red-600/70 text-slate-300 cursor-pointer" title="Apagar"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
