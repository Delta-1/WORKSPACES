import { supabase } from "./supabase-client";

// MÉTRICAS DE ATENDIMENTO por funcionário.
//
// Um "atendimento" contado = uma conversa FECHADA com aquele atendente como
// responsável (assignee_id). Contamos por semana e por mês (pela data de
// fechamento) e também quantas conversas cada um tem EM ANDAMENTO agora — é isso
// que o líder vê ("quanto de cliente o pessoal está conversando"). Tudo sai
// direto da tabela conversations, sem tabela extra.

export type EmployeeMetrics = {
  profileId: string;
  emAndamento: number; // conversas "atendendo" agora
  semana: number; // fechadas nesta semana
  mes: number; // fechadas neste mês
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // segunda = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function loadTeamMetrics(companyId: string): Promise<Map<string, EmployeeMetrics>> {
  const out = new Map<string, EmployeeMetrics>();
  if (!supabase || !companyId) return out;
  const now = new Date();
  const wk = startOfWeek(now).toISOString();
  const mo = startOfMonth(now).toISOString();

  const bump = (id: string): EmployeeMetrics => {
    let m = out.get(id);
    if (!m) { m = { profileId: id, emAndamento: 0, semana: 0, mes: 0 }; out.set(id, m); }
    return m;
  };

  // Em andamento agora.
  const { data: ativos } = await supabase
    .from("conversations")
    .select("assignee_id")
    .eq("company_id", companyId)
    .eq("status", "atendendo")
    .not("assignee_id", "is", null)
    .limit(2000);
  for (const c of ativos || []) if (c.assignee_id) bump(c.assignee_id).emAndamento++;

  // Fechadas neste mês (a semana é um subconjunto do mês).
  const { data: fechadas } = await supabase
    .from("conversations")
    .select("assignee_id, closed_at")
    .eq("company_id", companyId)
    .eq("status", "fechado")
    .not("assignee_id", "is", null)
    .gte("closed_at", mo)
    .limit(5000);
  for (const c of fechadas || []) {
    if (!c.assignee_id || !c.closed_at) continue;
    const m = bump(c.assignee_id);
    m.mes++;
    if (c.closed_at >= wk) m.semana++;
  }
  return out;
}
