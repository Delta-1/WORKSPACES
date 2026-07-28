"use client";

// Navegador de pastas estilo "gerenciador de arquivos": mostra só a pasta atual
// (não abre tudo de uma vez) — a pessoa precisa ENTRAR na pasta para achar a que
// quer, com breadcrumb para voltar. Cada pasta tem um checkbox para marcar/
// desmarcar (seleção por NOME, compatível com o formato já usado no acesso de
// terceiros: visible_folders é uma lista de nomes).

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, Home } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type FolderRow = { id: string; name: string; parent_id: string | null };

export default function FolderBrowser({
  companyId, selected, onToggle, allSelectedWhenEmpty = true,
}: {
  companyId: string | null;
  selected: string[];
  onToggle: (folderName: string) => void;
  allSelectedWhenEmpty?: boolean;
}) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Raiz" }]);

  useEffect(() => {
    if (!supabase || !companyId) { setLoading(false); return; }
    supabase.from("files").select("id,name,parent_id").eq("company_id", companyId).eq("type", "folder").order("name").then(({ data }) => {
      setFolders((data as FolderRow[]) ?? []);
      setLoading(false);
    });
  }, [companyId]);

  const byParent = useMemo(() => {
    const m = new Map<string | null, FolderRow[]>();
    for (const f of folders) {
      const list = m.get(f.parent_id) ?? [];
      list.push(f);
      m.set(f.parent_id, list);
    }
    return m;
  }, [folders]);

  const currentId = stack[stack.length - 1].id;
  const here = byParent.get(currentId) ?? [];
  const isChecked = (name: string) => (allSelectedWhenEmpty && selected.length === 0) || selected.includes(name);

  function open(f: FolderRow) {
    setStack((s) => [...s, { id: f.id, name: f.name }]);
  }
  function jumpTo(idx: number) {
    setStack((s) => s.slice(0, idx + 1));
  }

  if (loading) return <p className="text-[11px] text-gray-500 py-2">Carregando pastas…</p>;

  return (
    <div className="border border-white/10 rounded-lg bg-black/20 overflow-hidden">
      {/* Breadcrumb — mostra o caminho até aqui e permite voltar a qualquer nível. */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/10 bg-black/20 flex-wrap text-[11px]">
        {stack.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="text-gray-600" />}
            <button
              type="button"
              onClick={() => jumpTo(i)}
              className={`px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 ${i === stack.length - 1 ? "text-emerald-300 font-medium" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
            >
              {i === 0 && <Home size={11} />} {s.name}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-52 overflow-y-auto custom-scroll">
        {here.length === 0 ? (
          <p className="text-[11px] text-gray-600 text-center py-4">Nenhuma subpasta aqui.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {here.map((f) => {
              const hasKids = (byParent.get(f.id)?.length ?? 0) > 0;
              const checked = isChecked(f.name);
              return (
                <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(f.name)}
                    className="accent-emerald-500 cursor-pointer shrink-0"
                  />
                  <button type="button" onClick={() => open(f)} className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer">
                    {checked ? <FolderOpen size={13} className="text-emerald-400 shrink-0" /> : <Folder size={13} className="text-gray-400 shrink-0" />}
                    <span className="truncate text-[12px]">{f.name}</span>
                  </button>
                  {hasKids && (
                    <button type="button" onClick={() => open(f)} title="Abrir pasta" className="text-gray-500 hover:text-white cursor-pointer shrink-0 px-1">
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
