// Estrutura automática de pastas do TransLog (usada tanto pelo servidor — envio
// de fotos do motorista — quanto pelo app, ao gerar documentos):
//
//   TransLog / <MM-AAAA> / <código> - <cliente> / Documentos [ / Fotos ]
//
// O mês/ano usa a data de ABERTURA da operação (created_at da carga) — assim
// tudo daquela operação (documentos e fotos) fica sempre na mesma pasta, mesmo
// que leve semanas para concluir. Quando o mês vira, a próxima operação nova já
// cai sozinha numa pasta nova (MM-AAAA), sem precisar de nenhuma ação manual.

export function monthYearFolder(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}-${d.getFullYear()}`;
}

export type OperationFolders = { opFolderId: string | null; docsFolderId: string | null; fotosFolderId: string | null };

// Garante a cadeia inteira (TransLog / mês-ano / operação / Documentos [/Fotos])
// e devolve os ids das pastas. Aceita tanto o cliente do browser quanto o de
// service role — ambos falam a mesma API do supabase-js.
export async function ensureOperationFolders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  companyId: string,
  opts: { codigo?: string | null; cliente?: string | null; createdAt?: string | null; withFotos?: boolean }
): Promise<OperationFolders> {
  const findOrCreate = async (parentId: string | null, name: string): Promise<string | null> => {
    let q = sb.from("files").select("id").eq("company_id", companyId).eq("type", "folder").eq("name", name);
    q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data: created, error } = await sb.from("files").insert({ name, type: "folder", parent_id: parentId, company_id: companyId }).select("id").single();
    if (error) return null;
    return (created?.id as string) ?? null;
  };

  const rootId = await findOrCreate(null, "TransLog");
  if (!rootId) return { opFolderId: null, docsFolderId: null, fotosFolderId: null };
  const monthId = await findOrCreate(rootId, monthYearFolder(opts.createdAt));
  if (!monthId) return { opFolderId: null, docsFolderId: null, fotosFolderId: null };
  const opName = `${opts.codigo || "Operação"}${opts.cliente ? " - " + opts.cliente : ""}`.slice(0, 120);
  const opFolderId = await findOrCreate(monthId, opName);
  if (!opFolderId) return { opFolderId: null, docsFolderId: null, fotosFolderId: null };
  const docsFolderId = await findOrCreate(opFolderId, "Documentos");
  let fotosFolderId: string | null = null;
  if (opts.withFotos && docsFolderId) fotosFolderId = await findOrCreate(docsFolderId, "Fotos");
  return { opFolderId, docsFolderId, fotosFolderId };
}
