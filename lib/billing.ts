// Cobrador — helpers de cobrança (template de mensagem + datas).

export const BILLING_DEFAULT_TEMPLATE =
  "Olá {nome}! 👋 Passando para avisar da sua cobrança de {valor}, com vencimento em {vencimento}.\n\n" +
  "Para pagar via Pix, use a chave abaixo:\n{pix}\n\n" +
  "Assim que fizer o pagamento, é só me enviar o comprovante aqui por mensagem que eu confirmo para você. 🙏\n\n" +
  "Obrigado!\n— {empresa}";

export type TemplateVars = { nome?: string; valor?: number | string; vencimento?: string; pix?: string; empresa?: string };

export function fillTemplate(tpl: string, v: TemplateVars): string {
  const valor = typeof v.valor === "number" ? `R$ ${v.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : (v.valor || "");
  return (tpl || BILLING_DEFAULT_TEMPLATE)
    .replace(/\{nome\}/g, v.nome || "")
    .replace(/\{valor\}/g, String(valor))
    .replace(/\{vencimento\}/g, v.vencimento || "")
    .replace(/\{pix\}/g, v.pix || "(informe a chave Pix nas configurações)")
    .replace(/\{empresa\}/g, v.empresa || "");
}

// Próxima data com o dia de vencimento informado (neste mês se ainda não passou,
// senão no mês seguinte). Devolve YYYY-MM-DD.
export function nextDueDate(diaVencimento: number, from = new Date()): string {
  const day = Math.min(Math.max(1, diaVencimento || 1), 28);
  const d = new Date(from.getFullYear(), from.getMonth(), day);
  if (d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function fmtDatePt(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
