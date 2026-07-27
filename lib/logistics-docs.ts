// Documentos de exportação/importação do módulo Logística (TransLog).
//
// Cada tipo tem: um rótulo, os campos que o gerador pergunta, e um renderizador
// que devolve o HTML pronto para imprimir/salvar em PDF. Os documentos seguem o
// formato usual do comércio internacional MERCOSUL (Proforma, Invoice comercial,
// DUE, MIC/DTA e CRT), mas o usuário deve conferir os dados antes do uso oficial.

export type LogiDocType = "proforma" | "invoice" | "due" | "micdta" | "crt";

export type LogiField = { key: string; label: string; type?: "text" | "number" | "date" | "textarea"; hint?: string };

export type LogiDocDef = {
  type: LogiDocType;
  label: string;
  full: string;
  desc: string;
  fields: LogiField[];
};

// Campos comuns de faturamento (Proforma/Invoice).
const commercialFields: LogiField[] = [
  { key: "numero", label: "Nº do documento" },
  { key: "data", label: "Data", type: "date" },
  { key: "importador", label: "Importador (nome)" },
  { key: "importador_end", label: "Importador (endereço/país)", type: "textarea" },
  { key: "produto", label: "Descrição da mercadoria", type: "textarea" },
  { key: "ncm", label: "NCM" },
  { key: "quantidade", label: "Quantidade" },
  { key: "unidade", label: "Unidade (kg, ton, un)" },
  { key: "preco_unit", label: "Preço unitário", type: "number" },
  { key: "moeda", label: "Moeda (USD, EUR, BRL)" },
  { key: "incoterm", label: "Incoterm (FOB, CIF...)" },
  { key: "pagamento", label: "Condições de pagamento" },
  { key: "obs", label: "Observações", type: "textarea" },
];

export const LOGI_DOCS: LogiDocDef[] = [
  {
    type: "proforma",
    label: "Fatura Proforma",
    full: "Proforma Invoice",
    desc: "Proposta comercial inicial que abre a negociação e o pedido de compra.",
    fields: commercialFields,
  },
  {
    type: "invoice",
    label: "Fatura Comercial",
    full: "Commercial Invoice",
    desc: "Fatura definitiva da exportação, emitida na conclusão do embarque.",
    fields: commercialFields,
  },
  {
    type: "due",
    label: "DUE",
    full: "Declaração Única de Exportação",
    desc: "Documento fiscal-aduaneiro que consolida a exportação (Siscomex).",
    fields: [
      { key: "numero", label: "Nº da DUE" },
      { key: "data", label: "Data", type: "date" },
      { key: "ruc", label: "RUC (Registro Único de Carga)" },
      { key: "importador", label: "Importador / Destinatário" },
      { key: "pais_destino", label: "País de destino" },
      { key: "produto", label: "Descrição da mercadoria", type: "textarea" },
      { key: "ncm", label: "NCM" },
      { key: "quantidade", label: "Quantidade" },
      { key: "unidade", label: "Unidade" },
      { key: "valor", label: "Valor total", type: "number" },
      { key: "moeda", label: "Moeda" },
      { key: "cfop", label: "CFOP (6501 / 6502)" },
      { key: "obs", label: "Observações", type: "textarea" },
    ],
  },
  {
    type: "micdta",
    label: "MIC/DTA",
    full: "Manifesto Internacional de Carga / Declaração de Trânsito Aduaneiro",
    desc: "Manifesto do transporte rodoviário internacional e trânsito aduaneiro.",
    fields: [
      { key: "numero", label: "Nº do MIC/DTA" },
      { key: "data", label: "Data", type: "date" },
      { key: "placa_cavalo", label: "Placa do cavalo" },
      { key: "placa_reboque", label: "Placa do reboque" },
      { key: "motorista", label: "Motorista" },
      { key: "aduana_partida", label: "Aduana de partida" },
      { key: "aduana_destino", label: "Aduana de destino" },
      { key: "pais_destino", label: "País de destino" },
      { key: "produto", label: "Mercadoria", type: "textarea" },
      { key: "peso", label: "Peso bruto (kg)" },
      { key: "crt_num", label: "CRT vinculado" },
      { key: "obs", label: "Observações", type: "textarea" },
    ],
  },
  {
    type: "crt",
    label: "CRT",
    full: "Conhecimento de Transporte Rodoviário Internacional",
    desc: "Contrato de transporte internacional de carga rodoviária.",
    fields: [
      { key: "numero", label: "Nº do CRT" },
      { key: "data", label: "Data", type: "date" },
      { key: "remetente", label: "Remetente (exportador)" },
      { key: "destinatario", label: "Destinatário (importador)" },
      { key: "consignatario", label: "Consignatário" },
      { key: "local_emissao", label: "Local e país de emissão" },
      { key: "local_entrega", label: "Local de entrega" },
      { key: "produto", label: "Mercadoria", type: "textarea" },
      { key: "peso", label: "Peso bruto (kg)" },
      { key: "volumes", label: "Volumes" },
      { key: "valor", label: "Valor da mercadoria", type: "number" },
      { key: "moeda", label: "Moeda" },
      { key: "frete", label: "Valor do frete", type: "number" },
      { key: "obs", label: "Observações", type: "textarea" },
    ],
  },
];

export function docDef(type: LogiDocType): LogiDocDef {
  return LOGI_DOCS.find((d) => d.type === type) || LOGI_DOCS[0];
}

type Company = { razao_social?: string | null; cnpj?: string | null; nome?: string | null; endereco?: string | null; logo_url?: string | null };

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function row(label: string, value: unknown): string {
  return `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value) || "—"}</td></tr>`;
}
function money(v: unknown, moeda?: unknown): string {
  const n = Number(v);
  if (!isFinite(n) || !v) return "—";
  return `${esc(moeda || "")} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`.trim();
}

// Renderiza o documento completo (HTML autônomo, pronto para imprimir/salvar PDF).
export function renderLogisticsDoc(type: LogiDocType, data: Record<string, string>, company: Company): string {
  const def = docDef(type);
  const emp = company.razao_social || company.nome || "Sua Empresa";
  const cnpj = company.cnpj ? `CNPJ ${esc(company.cnpj)}` : "";
  const logo = company.logo_url
    ? `<img src="${esc(company.logo_url)}" alt="logo" style="height:44px;object-fit:contain" />`
    : `<div style="width:44px;height:44px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${esc(emp.slice(0, 1))}</div>`;

  let body = "";
  if (type === "proforma" || type === "invoice") {
    const qtd = Number(data.quantidade) || 0;
    const pu = Number(data.preco_unit) || 0;
    const total = qtd * pu;
    body = `
      <table class="kv">
        ${row("Nº", data.numero)}${row("Data", data.data)}
        ${row("Importador", data.importador)}${row("Endereço", data.importador_end)}
        ${row("Incoterm", data.incoterm)}${row("Pagamento", data.pagamento)}
      </table>
      <table class="items">
        <thead><tr><th>Descrição / NCM</th><th>Qtd</th><th>Un.</th><th>Preço unit.</th><th>Total</th></tr></thead>
        <tbody>
          <tr>
            <td>${esc(data.produto)}${data.ncm ? `<br><span class="muted">NCM ${esc(data.ncm)}</span>` : ""}</td>
            <td>${esc(data.quantidade) || "—"}</td>
            <td>${esc(data.unidade) || "—"}</td>
            <td>${money(pu, data.moeda)}</td>
            <td>${money(total, data.moeda)}</td>
          </tr>
        </tbody>
        <tfoot><tr><td colspan="4" class="tr">TOTAL</td><td>${money(total, data.moeda)}</td></tr></tfoot>
      </table>
      ${data.obs ? `<p class="obs"><b>Observações:</b> ${esc(data.obs)}</p>` : ""}`;
  } else if (type === "due") {
    body = `
      <table class="kv">
        ${row("Nº da DUE", data.numero)}${row("Data", data.data)}${row("RUC", data.ruc)}
        ${row("Importador", data.importador)}${row("País de destino", data.pais_destino)}
        ${row("Mercadoria", data.produto)}${row("NCM", data.ncm)}
        ${row("Quantidade", `${esc(data.quantidade)} ${esc(data.unidade)}`)}
        ${row("Valor", money(data.valor, data.moeda))}${row("CFOP", data.cfop)}
      </table>
      ${data.obs ? `<p class="obs"><b>Observações:</b> ${esc(data.obs)}</p>` : ""}`;
  } else if (type === "micdta") {
    body = `
      <table class="kv">
        ${row("Nº MIC/DTA", data.numero)}${row("Data", data.data)}
        ${row("Cavalo", data.placa_cavalo)}${row("Reboque", data.placa_reboque)}${row("Motorista", data.motorista)}
        ${row("Aduana de partida", data.aduana_partida)}${row("Aduana de destino", data.aduana_destino)}
        ${row("País de destino", data.pais_destino)}
        ${row("Mercadoria", data.produto)}${row("Peso bruto", data.peso ? `${esc(data.peso)} kg` : "")}
        ${row("CRT vinculado", data.crt_num)}
      </table>
      ${data.obs ? `<p class="obs"><b>Observações:</b> ${esc(data.obs)}</p>` : ""}`;
  } else {
    // CRT
    body = `
      <table class="kv">
        ${row("Nº CRT", data.numero)}${row("Data", data.data)}
        ${row("Remetente", data.remetente)}${row("Destinatário", data.destinatario)}${row("Consignatário", data.consignatario)}
        ${row("Local de emissão", data.local_emissao)}${row("Local de entrega", data.local_entrega)}
        ${row("Mercadoria", data.produto)}
        ${row("Peso bruto", data.peso ? `${esc(data.peso)} kg` : "")}${row("Volumes", data.volumes)}
        ${row("Valor da mercadoria", money(data.valor, data.moeda))}${row("Frete", money(data.frete, data.moeda))}
      </table>
      ${data.obs ? `<p class="obs"><b>Observações:</b> ${esc(data.obs)}</p>` : ""}`;
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(def.label)} ${esc(data.numero || "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #18181b; margin: 0; padding: 32px; background:#fff; }
  .doc { max-width: 820px; margin: 0 auto; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #18181b; padding-bottom:14px; }
  .head .emp { font-size: 15px; font-weight:700; }
  .head .sub { font-size: 11px; color:#52525b; }
  .title { margin: 18px 0 4px; font-size: 20px; font-weight:800; letter-spacing:-.3px; }
  .full { font-size: 12px; color:#52525b; margin-bottom:16px; }
  table { width:100%; border-collapse: collapse; margin: 8px 0 14px; }
  .kv td { padding:7px 10px; border:1px solid #e4e4e7; font-size:12.5px; vertical-align:top; }
  .kv td.lbl { background:#fafafa; font-weight:600; width:34%; color:#3f3f46; }
  .items th, .items td { border:1px solid #e4e4e7; padding:8px 10px; font-size:12.5px; text-align:left; }
  .items th { background:#18181b; color:#fff; font-weight:600; }
  .items tfoot td { font-weight:700; background:#fafafa; }
  .items .tr { text-align:right; }
  .muted { color:#71717a; font-size:11px; }
  .obs { font-size:12px; color:#3f3f46; border-left:3px solid #d4d4d8; padding-left:10px; }
  .foot { margin-top:34px; display:flex; justify-content:space-between; gap:24px; }
  .sign { flex:1; border-top:1px solid #a1a1aa; padding-top:6px; font-size:11px; color:#52525b; text-align:center; }
  .note { margin-top:26px; font-size:10px; color:#a1a1aa; text-align:center; }
  @media print { body { padding:0; } .doc { max-width:none; } @page { margin: 16mm; } }
</style></head>
<body onload="setTimeout(function(){window.print&&window.print()},350)">
  <div class="doc">
    <div class="head">
      <div style="display:flex;align-items:center;gap:12px">${logo}<div><div class="emp">${esc(emp)}</div><div class="sub">${cnpj}</div></div></div>
      <div style="text-align:right"><div class="sub">Documento nº</div><div style="font-weight:700">${esc(data.numero || "—")}</div></div>
    </div>
    <div class="title">${esc(def.label)}</div>
    <div class="full">${esc(def.full)}</div>
    ${body}
    <div class="foot">
      <div class="sign">Exportador / Emitente</div>
      <div class="sign">Importador / Destinatário</div>
    </div>
    <div class="note">Documento gerado pelo TransLog (Workspace). Confira todos os dados antes do uso oficial/aduaneiro.</div>
  </div>
</body></html>`;
}
