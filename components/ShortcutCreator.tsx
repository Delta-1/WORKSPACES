"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow, Check, Computer, ExternalLink, Link2, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import {
  detectShortcutProvider, isSafeLocalTarget, normalizeWebTarget, shortcutChanged,
  type ShortcutScope, type ShortcutTargetKind,
} from "@/lib/workspace-shortcuts";
import ShortcutIcon from "@/components/ShortcutIcon";

const NATIVE_APPS = [
  ["inicio", "Início"], ["group", "Group"], ["arquivos", "Arquivos"],
  ["mensagens", "Mensagens"], ["kanban", "Kanban"], ["calendario", "Calendário"],
  ["estudio", "Estúdio"], ["chat", "Copiloto IA"], ["remoto", "Acesso Remoto"],
  ["automacao", "Automação"], ["links", "Links"], ["mundo", "Mundo"],
] as const;

export default function ShortcutCreator({
  open, onClose, profile, group,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  group?: { id: string; name: string; canManage: boolean } | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ShortcutTargetKind>("web");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<ShortcutScope>(group ? "group" : "personal");
  const [pin, setPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCompany = profile?.role === "gestor" || profile?.role === "gerente";

  useEffect(() => {
    if (!open) return;
    setScope(group ? "group" : "personal");
    setError(null);
  }, [group, open]);

  const provider = useMemo(() => detectShortcutProvider(target, kind), [target, kind]);
  if (!open) return null;

  async function save() {
    if (!supabase || !profile?.id || !profile.company_id || !name.trim() || !target.trim()) return;
    if (group && !group.canManage) return;
    if (kind === "local_app" && !isSafeLocalTarget(target)) {
      setError("Use um protocolo seguro do aplicativo, como vscode://, steam://, spotify:// ou ms-settings:.");
      return;
    }
    setSaving(true);
    setError(null);
    const finalTarget = kind === "web" ? normalizeWebTarget(target) : target.trim();
    const { error: insertError } = await supabase.from("workspace_shortcuts").insert({
      company_id: profile.company_id,
      group_id: group?.id ?? null,
      created_by: profile.id,
      scope: group ? "group" : scope,
      name: name.trim(),
      description: description.trim() || null,
      target_kind: kind,
      target: finalTarget,
      provider: detectShortcutProvider(finalTarget, kind),
      pin_to_dock: group ? false : pin,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message.includes("workspace_shortcuts")
        ? "A atualização do banco de atalhos ainda não foi aplicada."
        : insertError.message);
      return;
    }
    shortcutChanged();
    setName(""); setDescription(""); setTarget(""); setKind("web"); setPin(false);
    onClose();
  }

  const kinds: [ShortcutTargetKind, string, typeof Link2, string][] = [
    ["web", "Link ou nuvem", Link2, "Google Drive, GitHub, OneDrive…"],
    ["workspace", "App do Workspaces", AppWindow, "Abre uma ferramenta nativa"],
    ["local_app", "App do computador", Computer, "Abre por protocolo instalado"],
  ];

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <div className="workspace-shortcut-modal liquid-glass w-full max-w-xl rounded-3xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShortcutIcon provider={provider} size={22} className="h-11 w-11" />
            <div>
              <h3 className="font-bold text-white">{group ? `Adicionar ao ${group.name}` : "Criar atalho"}</h3>
              <p className="text-[11px] text-slate-400">O ícone é identificado automaticamente pelo endereço.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {kinds.map(([id, label, Icon, desc]) => (
            <button key={id} onClick={() => { setKind(id); setTarget(id === "workspace" ? "inicio" : ""); setError(null); }} className={`rounded-xl border p-3 text-left transition ${kind === id ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 hover:border-white/25"}`}>
              <Icon size={17} className={kind === id ? "text-emerald-300" : "text-slate-400"} />
              <span className="mt-2 block text-xs font-semibold">{label}</span>
              <span className="mt-0.5 block text-[9px] leading-tight text-slate-500">{desc}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Biblioteca de livros" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{kind === "workspace" ? "Ferramenta" : kind === "local_app" ? "Protocolo do aplicativo" : "Endereço"}</label>
            {kind === "workspace" ? (
              <select value={target || "inicio"} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c111b] px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
                {NATIVE_APPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            ) : (
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={kind === "web" ? "drive.google.com/drive/folders/…" : "vscode:// ou steam://…"} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
            )}
            {kind === "local_app" && <p className="mt-1 text-[10px] text-slate-500">Não executa comandos: somente protocolos registrados e seguros.</p>}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Descrição opcional</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explique para que serve" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
          </div>

          {!group && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="radio" checked={scope === "personal"} onChange={() => setScope("personal")} /> Só para mim
              </label>
              {canCompany && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="radio" checked={scope === "company"} onChange={() => setScope("company")} /> Toda a empresa</label>}
              <label className="ml-auto flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Fixar no dock</label>
            </div>
          )}

          {group && <p className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-3 py-2 text-[11px] text-indigo-200">Será exibido para todos os membros e materializado na pasta deste Group no servidor vinculado.</p>}
          {error && <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-xs text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || !target.trim()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Criar atalho
          </button>
        </div>
      </div>
    </div>
  );
}
