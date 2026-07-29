import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Body = {
  userId?: string;
  reason?: string;
};

export async function POST(request: Request) {
  const auth = supabaseForRequest(request);
  const service = supabaseService();
  if (!auth || !service) {
    return NextResponse.json({ error: "Servidor não configurado para remover acessos." }, { status: 500 });
  }

  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Entre novamente no Workspace." }, { status: 401 });

  const body = (await request.json()) as Body;
  const targetId = String(body.userId || "");
  const reason = String(body.reason || "").trim();
  if (!targetId || reason.length < 3) {
    return NextResponse.json({ error: "Informe a pessoa e o motivo da remoção." }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: "Você não pode remover o próprio acesso por aqui." }, { status: 400 });
  }

  const { data: actor } = await auth
    .from("profiles")
    .select("id,company_id,role,full_name,email")
    .eq("id", user.id)
    .maybeSingle();
  if (!actor?.company_id || actor.role !== "gestor") {
    return NextResponse.json({ error: "Somente o gestor deste ambiente pode remover pessoas." }, { status: 403 });
  }

  const companyId = actor.company_id as string;
  const [{ data: company }, { data: target }, { data: membership }] = await Promise.all([
    service.from("companies").select("owner_id,name").eq("id", companyId).maybeSingle(),
    service.from("profiles").select("id,company_id,full_name,email").eq("id", targetId).maybeSingle(),
    service.from("memberships").select("user_id,company_id").eq("user_id", targetId).eq("company_id", companyId).maybeSingle(),
  ]);
  if (!target || (!membership && target.company_id !== companyId)) {
    return NextResponse.json({ error: "Essa pessoa já não possui acesso a este ambiente." }, { status: 404 });
  }
  if (company?.owner_id === targetId) {
    return NextResponse.json({ error: "O proprietário do ambiente não pode ser removido." }, { status: 400 });
  }

  const { error: membershipError } = await service
    .from("memberships")
    .delete()
    .eq("user_id", targetId)
    .eq("company_id", companyId);
  if (membershipError) {
    return NextResponse.json({ error: `Não foi possível revogar o ambiente: ${membershipError.message}` }, { status: 500 });
  }

  await Promise.all([
    service.from("sectors").update({ leader_id: null }).eq("company_id", companyId).eq("leader_id", targetId),
    service.from("tasks").update({ assignee_id: null }).eq("company_id", companyId).eq("assignee_id", targetId),
  ]);

  if (target.company_id === companyId) {
    const { data: nextMembership } = await service
      .from("memberships")
      .select("company_id,role")
      .eq("user_id", targetId)
      .limit(1)
      .maybeSingle();
    const { error: profileError } = await service
      .from("profiles")
      .update({
        company_id: nextMembership?.company_id ?? null,
        role: nextMembership?.role ?? "funcionario",
        sector_id: null,
        finance_access: false,
        tool_access: null,
      })
      .eq("id", targetId);
    if (profileError) {
      return NextResponse.json({ error: `O acesso foi revogado, mas o perfil não foi atualizado: ${profileError.message}` }, { status: 500 });
    }
  }

  await service.from("activity_log").insert({
    actor: actor.full_name || actor.email || "Gestor",
    action: `Removeu ${target.full_name || target.email || targetId} de ${company?.name || "um ambiente"}. Motivo: ${reason}`,
  });

  return NextResponse.json({ ok: true });
}
