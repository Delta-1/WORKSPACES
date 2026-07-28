// Documentos da operação de exportação/importação (TransLog), modelados a partir
// dos documentos reais de uma transportadora (SHKT): Controle de Romaneio, Fatura
// Comercial/Invoice, Packing List, Fatura de Serviço (frete por caminhão),
// MIC/DTA, CRT e DUE.
//
// Toda a papelada nasce de UMA operação: os dados compartilhados (importador,
// mercadorias em tabela, veículos/placas em tabela, datas do romaneio) são
// preenchidos uma vez e TODOS os documentos saem já preenchidos. O cabeçalho usa
// a LOGO e os dados da empresa (configurados nas Configurações) — no lugar da SHKT.

export type LogiDocType = "romaneio" | "invoice" | "packing" | "fatura_servico" | "micdta" | "crt" | "due";

export type Mercadoria = { descricao: string; ncm?: string; quant?: string; unidade?: string; peso_bruto?: string; peso_neto?: string; preco_unit?: string; total?: string };
export type Veiculo = { placa: string; peso?: string; motorista?: string; mic?: string; crt?: string; valor?: string; rota?: string };

// Dados compartilhados de uma operação (guardados em logistics_cargas.dados).
export type OperacaoData = {
  importador?: string; importador_end?: string; importador_doc?: string; pais_destino?: string;
  incoterm?: string; moeda?: string; condicoes?: string; local_entrega?: string; cidade_destino?: string;
  prestado_a?: string; prestado_a_end?: string; cobrar_de?: string; cobrar_de_end?: string;
  cliente?: string; transportadora?: string; transportadora_transbordo?: string;
  motorista?: string; motorista_doc?: string; responsavel?: string;
  nota_fiscal?: string; cte?: string; placas_chegada?: string; placas_saida?: string;
  chegada_data?: string; chegada_hora?: string; saida_data?: string; saida_hora?: string;
  mercadorias?: Mercadoria[]; veiculos?: Veiculo[];
  num_romaneio?: string; num_invoice?: string; num_packing?: string; num_fatura_servico?: string; num_micdta?: string; num_crt?: string; num_due?: string;
  obs?: string; ncm?: string;
};

export type Company = {
  razao_social?: string | null; cnpj?: string | null; ie?: string | null; nome?: string | null;
  endereco?: string | null; phone?: string | null; email?: string | null; logo_url?: string | null;
  bank_info?: string | null; signatory?: string | null; signatory_doc?: string | null;
};

export type Carga = {
  codigo?: string | null; cliente_nome?: string | null; produto?: string | null; origem?: string | null;
  destino?: string | null; pais_destino?: string | null; incoterm?: string | null; moeda?: string | null;
  valor_declarado?: number | null; peso?: number | null; volumes?: number | null; cfop?: string | null;
};

export const LOGI_DOCS: { type: LogiDocType; label: string; full: string; desc: string; numKey: keyof OperacaoData }[] = [
  { type: "romaneio", label: "Romaneio", full: "Controle de Romaneio", desc: "Chegada/saída, transportadora, motorista, placas, NF e CTE. O ponto de partida da operação.", numKey: "num_romaneio" },
  { type: "invoice", label: "Fatura Comercial", full: "Factura Invoice", desc: "Mercadoria, NCM, quantidade, preço e total (valor da carga).", numKey: "num_invoice" },
  { type: "packing", label: "Packing List", full: "Lista de Empaque", desc: "Itens, embalagens, peso bruto e líquido.", numKey: "num_packing" },
  { type: "fatura_servico", label: "Fatura de Serviço", full: "Fatura de Serviço (Frete)", desc: "Cobrança do frete por caminhão/placa (cada linha com MIC e peso).", numKey: "num_fatura_servico" },
  { type: "micdta", label: "MIC/DTA", full: "Manifesto Internacional / Trânsito Aduaneiro", desc: "Manifesto do transporte rodoviário internacional.", numKey: "num_micdta" },
  { type: "crt", label: "CRT", full: "Conhecimento de Transporte Rodoviário Internacional", desc: "Contrato de transporte internacional.", numKey: "num_crt" },
  { type: "due", label: "DUE", full: "Declaração Única de Exportação", desc: "Documento fiscal-aduaneiro da exportação.", numKey: "num_due" },
];

export function docLabel(type: LogiDocType): string {
  return LOGI_DOCS.find((d) => d.type === type)?.label || type;
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function num(v: unknown): number { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; }
function money(v: unknown, moeda: string | null = "") { const n = num(v); return `${esc(moeda)} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`.trim(); }
function cell(v: unknown) { return esc(v) || "—"; }

// Cabeçalho com LOGO + dados da empresa (substitui a SHKT).
function header(company: Company, docTitle: string, right: string): string {
  const emp = company.razao_social || company.nome || "Sua Empresa";
  const logo = company.logo_url
    ? `<img src="${esc(company.logo_url)}" alt="logo" class="logo" />`
    : `<div class="logo ph">${esc(emp.slice(0, 2)).toUpperCase()}</div>`;
  const linhas = [
    company.endereco ? esc(company.endereco) : "",
    [company.cnpj ? `CNPJ: ${esc(company.cnpj)}` : "", company.ie ? `I.E.: ${esc(company.ie)}` : ""].filter(Boolean).join(" · "),
    [company.phone ? `Fone: ${esc(company.phone)}` : "", company.email ? `E-mail: ${esc(company.email)}` : ""].filter(Boolean).join(" · "),
  ].filter(Boolean).join("<br>");
  return `<div class="head">
    <div class="brand">${logo}<div><div class="emp">${esc(emp)}</div><div class="sub">${linhas}</div></div></div>
    <div class="docbox"><div class="dt">${esc(docTitle)}</div>${right}</div>
  </div>`;
}

function bankBlock(company: Company): string {
  if (!company.bank_info) return "";
  return `<div class="bank"><div class="bank-t">Dados do Beneficiário</div><div>${esc(company.bank_info).replace(/\n/g, "<br>")}</div></div>`;
}
function signature(company: Company): string {
  const nome = company.signatory || company.razao_social || company.nome || "";
  const doc = company.signatory_doc ? `CPF: ${esc(company.signatory_doc)}` : "";
  return `<div class="sign"><div class="line"></div><div class="who">${esc(company.razao_social || company.nome || "")}</div><div class="who2">${esc(nome)}${doc ? " · " + doc : ""}</div></div>`;
}

// ---- Renderizadores por documento (corpo) ----
function romaneioBody(d: OperacaoData, c: Carga): string {
  const kv = (l: string, v: unknown) => `<tr><td class="lbl">${esc(l)}</td><td>${cell(v)}</td></tr>`;
  return `
    <div class="grid2">
      <table class="kv">
        ${kv("Cliente", d.cliente || c.cliente_nome)}
        ${kv("Cidade / País destino", `${esc(d.cidade_destino || c.destino || "")} ${d.pais_destino || c.pais_destino ? "· " + esc(d.pais_destino || c.pais_destino) : ""}`)}
        ${kv("Produto", c.produto)}
        ${kv("Nota Fiscal", d.nota_fiscal)}
        ${kv("CTE", d.cte)}
      </table>
      <table class="kv">
        ${kv("Transportadora", d.transportadora)}
        ${kv("Motorista", d.motorista)}
        ${kv("Documento motorista", d.motorista_doc)}
        ${kv("Responsável", d.responsavel)}
        ${kv("Observação", d.obs)}
      </table>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-t">Dados de Chegada</div><table class="kv">
        ${kv("Data / Hora", `${esc(d.chegada_data || "")} ${d.chegada_hora ? "· " + esc(d.chegada_hora) : ""}`)}
        ${kv("Placa(s)", d.placas_chegada)}
      </table></div>
      <div class="panel"><div class="panel-t">Dados de Saída</div><table class="kv">
        ${kv("Data / Hora", `${esc(d.saida_data || "")} ${d.saida_hora ? "· " + esc(d.saida_hora) : ""}`)}
        ${kv("Placa(s)", d.placas_saida)}
      </table></div>
    </div>
    ${veiculosTable(d, { mic: true, crt: true, peso: true, motorista: true })}`;
}

function veiculosTable(d: OperacaoData, cols: { mic?: boolean; crt?: boolean; peso?: boolean; motorista?: boolean; valor?: boolean; moeda?: string }): string {
  const vs = d.veiculos || [];
  if (!vs.length) return "";
  const th = ["Placa", cols.peso ? "Peso" : "", cols.motorista ? "Motorista" : "", cols.mic ? "MIC" : "", cols.crt ? "CRT" : "", cols.valor ? "Valor" : ""].filter(Boolean);
  const rows = vs.map((v) => `<tr>
    <td>${cell(v.placa)}</td>
    ${cols.peso ? `<td>${v.peso ? esc(v.peso) + " t" : "—"}</td>` : ""}
    ${cols.motorista ? `<td>${cell(v.motorista)}</td>` : ""}
    ${cols.mic ? `<td>${cell(v.mic)}</td>` : ""}
    ${cols.crt ? `<td>${cell(v.crt)}</td>` : ""}
    ${cols.valor ? `<td>${money(v.valor, cols.moeda)}</td>` : ""}
  </tr>`).join("");
  const total = cols.valor ? `<tfoot><tr><td colspan="${th.length - 1}" class="tr">TOTAL</td><td>${money(vs.reduce((a, b) => a + num(b.valor), 0), cols.moeda)}</td></tr></tfoot>` : "";
  return `<table class="items"><thead><tr>${th.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>${total}</table>`;
}

function invoiceBody(d: OperacaoData, c: Carga): string {
  const moeda = d.moeda || c.moeda || "USD";
  const ms = d.mercadorias && d.mercadorias.length ? d.mercadorias : [{ descricao: c.produto || "", ncm: d.ncm || "", quant: String(c.volumes || ""), preco_unit: "", total: String(c.valor_declarado || "") }];
  const rows = ms.map((m) => {
    const total = num(m.total) || num(m.quant) * num(m.preco_unit);
    return `<tr><td>${esc(m.descricao)}</td><td>${cell(m.ncm)}</td><td>${cell(m.quant)}${m.unidade ? " " + esc(m.unidade) : ""}</td><td>${money(m.preco_unit, moeda)}</td><td>${money(total, moeda)}</td></tr>`;
  }).join("");
  const total = ms.reduce((a, m) => a + (num(m.total) || num(m.quant) * num(m.preco_unit)), 0);
  return `
    ${importadorBlock(d)}
    <table class="items"><thead><tr><th>Descrição da mercadoria</th><th>NCM</th><th>Qtd</th><th>Preço unit.</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4" class="tr">TOTAL ${esc(d.incoterm || c.incoterm || "")}</td><td>${money(total, moeda)}</td></tr></tfoot>
    </table>
    ${d.condicoes ? `<p class="obs"><b>Condições de venda:</b> ${esc(d.condicoes)}</p>` : ""}
    <p class="decl">Declaramos que as mercadorias constantes na presente fatura comercial são de origem e produção Brasileira, e que a fatura acima é a pura expressão da verdade.</p>`;
}

function packingBody(d: OperacaoData, c: Carga): string {
  const ms = d.mercadorias && d.mercadorias.length ? d.mercadorias : [{ descricao: c.produto || "", quant: String(c.volumes || ""), peso_bruto: String(c.peso || ""), peso_neto: "" }];
  const rows = ms.map((m) => `<tr><td>${esc(m.descricao)}</td><td>${cell(m.quant)}${m.unidade ? " " + esc(m.unidade) : ""}</td><td>${cell(m.peso_bruto)}</td><td>${cell(m.peso_neto)}</td></tr>`).join("");
  const tb = ms.reduce((a, m) => a + num(m.peso_bruto), 0), tn = ms.reduce((a, m) => a + num(m.peso_neto), 0);
  return `
    ${importadorBlock(d)}
    <table class="items"><thead><tr><th>Produtos</th><th>Cantidad / Embalajes</th><th>Peso Bruto</th><th>Peso Neto</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2" class="tr">TOTAL</td><td>${tb.toLocaleString("pt-BR")}</td><td>${tn.toLocaleString("pt-BR")}</td></tr></tfoot>
    </table>
    ${d.condicoes ? `<p class="obs"><b>Condições de venda:</b> ${esc(d.condicoes)}</p>` : ""}
    <p class="decl">Declaramos que as mercadorias constantes na presente fatura comercial são de origem e produção Brasileira.</p>`;
}

function faturaServicoBody(d: OperacaoData, c: Carga): string {
  const moeda = d.moeda || c.moeda || "BRL";
  const cobrar = d.cobrar_de || d.importador || d.cliente || c.cliente_nome || "";
  const rota = `${esc(c.origem || "")} → ${esc(c.destino || "")}`;
  return `
    <div class="grid2">
      <div class="panel"><div class="panel-t">Cobrar de</div><div class="ptext">${esc(cobrar)}<br>${esc(d.cobrar_de_end || d.importador_end || "")}</div></div>
      <div class="panel"><div class="panel-t">Enviar para</div><div class="ptext">${esc(cobrar)}<br>${esc(d.cobrar_de_end || d.importador_end || "")}</div></div>
    </div>
    <p class="rota"><b>Frete:</b> ${rota}</p>
    ${veiculosTable(d, { peso: true, mic: true, valor: true, moeda }) || `<p class="obs">Adicione os veículos (placas) na operação para detalhar o frete por caminhão.</p>`}
    ${bankBlock({ bank_info: null } as Company)}`;
}

function importadorBlock(d: OperacaoData): string {
  return `<div class="grid2">
    <div class="panel"><div class="panel-t">Exportador</div><div class="ptext" id="exp"></div></div>
    <div class="panel"><div class="panel-t">Importador</div><div class="ptext">${esc(d.importador || "")}<br>${esc(d.importador_end || "")}${d.importador_doc ? "<br>" + esc(d.importador_doc) : ""}</div></div>
  </div>`;
}

function micdtaBody(d: OperacaoData, c: Carga): string {
  const kv = (l: string, v: unknown) => `<tr><td class="lbl">${esc(l)}</td><td>${cell(v)}</td></tr>`;
  return `<table class="kv">
    ${kv("Nº MIC/DTA", d.num_micdta)}
    ${kv("Transportadora", d.transportadora)}
    ${kv("País de destino", d.pais_destino || c.pais_destino)}
    ${kv("Aduana", `${esc(c.origem || "")} → ${esc(c.destino || "")}`)}
    ${kv("Mercadoria", c.produto)}
    ${kv("CRT vinculado", d.num_crt)}
  </table>
  ${veiculosTable(d, { peso: true, motorista: true, mic: true }) || ""}`;
}
function crtBody(d: OperacaoData, c: Carga): string {
  const kv = (l: string, v: unknown) => `<tr><td class="lbl">${esc(l)}</td><td>${cell(v)}</td></tr>`;
  return `<table class="kv">
    ${kv("Nº CRT", d.num_crt)}
    ${kv("Remetente (exportador)", "—")}
    ${kv("Destinatário (importador)", d.importador)}
    ${kv("Local de entrega", d.local_entrega || c.destino)}
    ${kv("Mercadoria", c.produto)}
    ${kv("Peso / Volumes", `${c.peso || "—"} · ${c.volumes || "—"}`)}
    ${kv("Valor / Frete", money(c.valor_declarado, d.moeda || c.moeda))}
    ${kv("MIC/DTA vinculado", d.num_micdta)}
  </table>`;
}
function dueBody(d: OperacaoData, c: Carga): string {
  const kv = (l: string, v: unknown) => `<tr><td class="lbl">${esc(l)}</td><td>${cell(v)}</td></tr>`;
  return `<table class="kv">
    ${kv("Nº DUE", d.num_due)}
    ${kv("Importador / Destinatário", d.importador)}
    ${kv("País de destino", d.pais_destino || c.pais_destino)}
    ${kv("Mercadoria", c.produto)}
    ${kv("NCM", d.ncm || (d.mercadorias?.[0]?.ncm ?? ""))}
    ${kv("Valor", money(c.valor_declarado, d.moeda || c.moeda))}
    ${kv("CFOP", c.cfop)}
  </table>`;
}

// Renderiza o documento completo (HTML pronto para imprimir/salvar PDF).
export function renderLogisticsDoc(type: LogiDocType, carga: Carga, d: OperacaoData, company: Company): string {
  const def = LOGI_DOCS.find((x) => x.type === type) || LOGI_DOCS[0];
  const numero = String(d[def.numKey] || "");
  const right = `<div class="drow"><span>Nº</span><b>${esc(numero) || "—"}</b></div><div class="drow"><span>Op.</span><b>${esc(carga.codigo || "")}</b></div><div class="drow"><span>Data</span><b>${new Date().toLocaleDateString("pt-BR")}</b></div>`;
  const bodies: Record<LogiDocType, () => string> = {
    romaneio: () => romaneioBody(d, carga),
    invoice: () => invoiceBody(d, carga),
    packing: () => packingBody(d, carga),
    fatura_servico: () => faturaServicoBody(d, carga),
    micdta: () => micdtaBody(d, carga),
    crt: () => crtBody(d, carga),
    due: () => dueBody(d, carga),
  };
  const showBank = type === "invoice" || type === "packing" || type === "fatura_servico";
  const showSign = type === "invoice" || type === "packing";
  // Preenche o bloco "Exportador" com os dados da empresa (nas faturas/packing).
  const empExport = `${esc(company.razao_social || company.nome || "")}<br>${esc(company.endereco || "")}${company.cnpj ? "<br>CNPJ: " + esc(company.cnpj) : ""}`;
  const body = bodies[type]().replace('id="exp"></div>', `id="exp">${empExport}</div>`);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(def.label)} ${esc(numero)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b;margin:0;padding:28px;background:#fff;font-size:12.5px}
  .doc{max-width:840px;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:6px}
  .brand{display:flex;gap:12px;align-items:center}
  .logo{height:52px;max-width:120px;object-fit:contain} .logo.ph{width:52px;display:flex;align-items:center;justify-content:center;background:#18181b;color:#fff;border-radius:8px;font-weight:700}
  .emp{font-size:15px;font-weight:800;letter-spacing:-.2px} .sub{font-size:10.5px;color:#52525b;line-height:1.5;margin-top:2px}
  .docbox{text-align:right;min-width:180px} .dt{font-size:15px;font-weight:800;text-transform:uppercase;margin-bottom:4px}
  .drow{font-size:11px;color:#3f3f46;display:flex;justify-content:flex-end;gap:8px} .drow span{color:#a1a1aa}
  h2.title{font-size:16px;margin:14px 0 8px;font-weight:800}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}
  .kv td{padding:5px 8px;border:1px solid #e4e4e7;vertical-align:top} .kv td.lbl{background:#fafafa;font-weight:600;width:42%;color:#3f3f46}
  .panel{border:1px solid #e4e4e7;border-radius:6px;overflow:hidden} .panel-t{background:#18181b;color:#fff;font-weight:600;font-size:11px;padding:5px 8px} .panel .kv{margin:0} .ptext{padding:8px;line-height:1.5}
  .items th,.items td{border:1px solid #e4e4e7;padding:7px 8px;text-align:left} .items th{background:#18181b;color:#fff;font-weight:600;font-size:11px} .items tfoot td{font-weight:700;background:#fafafa} .items .tr{text-align:right}
  .rota{margin:8px 0;font-size:13px} .obs{font-size:11.5px;color:#3f3f46;border-left:3px solid #d4d4d8;padding-left:10px} .decl{font-size:10.5px;color:#52525b;margin-top:10px}
  .bank{margin-top:14px;border:1px dashed #d4d4d8;border-radius:6px;padding:8px;font-size:11px;color:#3f3f46} .bank-t{font-weight:700;margin-bottom:3px}
  .sign{margin-top:36px;text-align:center;font-size:11px;color:#52525b} .sign .line{border-top:1px solid #a1a1aa;width:280px;margin:0 auto 4px} .sign .who{font-weight:600;color:#18181b} .sign .who2{font-size:10.5px}
  .note{margin-top:22px;font-size:9.5px;color:#a1a1aa;text-align:center}
  @media print{body{padding:0}.doc{max-width:none}@page{margin:14mm}}
</style></head>
<body onload="setTimeout(function(){window.print&&window.print()},350)">
  <div class="doc">
    ${header(company, def.label, right)}
    <div class="full" style="font-size:11px;color:#52525b;margin-bottom:6px">${esc(def.full)}</div>
    ${body}
    ${showBank ? bankBlock(company) : ""}
    ${showSign ? signature(company) : ""}
    <div class="note">Documento gerado pelo TransLog (Workspace). Confira todos os dados antes do uso oficial/aduaneiro.</div>
  </div>
</body></html>`;
}
