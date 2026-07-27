// Cobrador — helpers de cobrança (template de mensagem + datas).

export const BILLING_DEFAULT_TEMPLATE =
  "Olá {nome}! 👋 Passando para avisar da sua cobrança de {valor}, com vencimento em {vencimento}.\n" +
  "{extrato}\n" +
  "Para pagar via Pix, use a chave abaixo:\n{pix}\n\n" +
  "Assim que fizer o pagamento, é só me enviar o comprovante aqui por mensagem que eu confirmo para você. 🙏\n\n" +
  "Obrigado!\n— {empresa}";

// Modelitos prontos de mensagem/extrato — a pessoa escolhe e edita se quiser.
export const BILLING_TEMPLATES: { id: string; label: string; template: string }[] = [
  { id: "padrao", label: "Padrão (amigável)", template: BILLING_DEFAULT_TEMPLATE },
  {
    id: "curto",
    label: "Curto e direto",
    template: "Oi {nome}! Sua cobrança de {valor} vence em {vencimento}.{extrato}\nPix: {pix}\nMe manda o comprovante quando pagar. 🙏",
  },
  {
    id: "formal",
    label: "Formal",
    template:
      "Prezado(a) {nome},\n\nInformamos a cobrança no valor de {valor}, com vencimento em {vencimento}.{extrato}\n" +
      "Pagamento via Pix pela chave: {pix}\n\nApós o pagamento, favor encaminhar o comprovante. Atenciosamente, {empresa}.",
  },
  {
    id: "extrato",
    label: "Com extrato detalhado",
    template:
      "Olá {nome}! 👋 Segue o detalhamento da sua cobrança (vencimento {vencimento}):\n{extrato}\n" +
      "Para pagar via Pix, use a chave: {pix}\n\nAssim que pagar, me envie o comprovante que eu confirmo. Obrigado!\n— {empresa}",
  },
  {
    id: "lembrete",
    label: "Lembrete gentil",
    template:
      "Oi {nome}, tudo bem? 😊 Passando só pra lembrar da cobrança de {valor} (vence {vencimento}).{extrato}\n" +
      "Pix: {pix}\nQualquer dúvida é só chamar!",
  },
];

export type BillingItem = { descricao: string; valor: number | string };
export type TemplateVars = { nome?: string; valor?: number | string; vencimento?: string; pix?: string; empresa?: string; extrato?: string; motivo?: string };

const brl = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// Soma os itens do extrato.
export function itemsTotal(itens?: BillingItem[] | null): number {
  return (itens || []).reduce((a, b) => a + (Number(b.valor) || 0), 0);
}

// Monta o texto do extrato (itens + total). Vazio se não houver itens.
export function renderExtrato(itens?: BillingItem[] | null, motivo?: string | null): string {
  const list = (itens || []).filter((i) => (i.descricao || "").trim() || Number(i.valor));
  const lines: string[] = [];
  if (motivo && motivo.trim()) lines.push(`Referente a: ${motivo.trim()}`);
  if (list.length) {
    lines.push("Itens inclusos:");
    for (const i of list) lines.push(`• ${i.descricao || "Item"} — ${brl(Number(i.valor) || 0)}`);
    lines.push(`Total: ${brl(itemsTotal(list))}`);
  }
  return lines.length ? "\n" + lines.join("\n") + "\n" : "";
}

export function fillTemplate(tpl: string, v: TemplateVars): string {
  const valor = typeof v.valor === "number" ? brl(v.valor) : (v.valor || "");
  let out = (tpl || BILLING_DEFAULT_TEMPLATE)
    .replace(/\{nome\}/g, v.nome || "")
    .replace(/\{valor\}/g, String(valor))
    .replace(/\{vencimento\}/g, v.vencimento || "")
    .replace(/\{pix\}/g, v.pix || "(informe a chave Pix nas configurações)")
    .replace(/\{empresa\}/g, v.empresa || "")
    .replace(/\{motivo\}/g, v.motivo || "")
    .replace(/\{extrato\}/g, v.extrato || "");
  // Se o extrato não foi usado no template mas existe, acrescenta antes da chave Pix.
  if (v.extrato && !/\{extrato\}/.test(tpl || "") && !out.includes(v.extrato)) {
    out = out.replace(/(\n?Para pagar via Pix)/i, `\n${v.extrato}$1`);
    if (!out.includes(v.extrato)) out += `\n${v.extrato}`;
  }
  return out.replace(/\n{3,}/g, "\n\n");
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
