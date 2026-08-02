// Contrato, Orçamento, Questionário, Resumo e Resumão.
//
// A linguagem visual segue os documentos do TransLog (lib/logistics-docs.ts):
// cabeçalho com logo e dados da empresa sobre régua preta, tabelas de rótulo/
// valor com fundo claro, painéis com faixa escura, tabela de itens com cabeçalho
// preto e total destacado, e bloco de assinatura centralizado.
//
// Todo o CSS é prefixado por `.wsdoc` porque este HTML é injetado tanto na
// prévia (dentro do app) quanto na janela de impressão — sem o prefixo, as
// regras vazariam e bagunçariam a interface inteira.

import type { PageSetup } from "./types";

export type DocCompany = {
  nome?: string | null;
  razao_social?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  endereco?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
};

export const BUSINESS_PAGE: PageSetup = {
  paper: "a4",
  margins: { mt: 1.6, mb: 1.6, ml: 1.6, mr: 1.6 },
  font: "'Segoe UI', -apple-system, Roboto, Arial, sans-serif",
  fontSize: "10.5pt",
  lineHeight: 1.5,
  indent: 0,
};

// ── modelos de dados ────────────────────────────────────────────────────────

export type Parte = { nome: string; doc: string; endereco: string; rep: string };
export type Clausula = { titulo: string; texto: string };

export type Contrato = {
  numero: string; cidade: string; data: string;
  objeto: string;
  contratante: Parte; contratada: Parte;
  valor: string; pagamento: string; prazo: string; vigencia: string;
  clausulas: Clausula[];
  foro: string;
  testemunhas: { nome: string; doc: string }[];
};

export type OrcamentoItem = { descricao: string; quant: string; unidade: string; valor: string };
export type Orcamento = {
  numero: string; data: string; validade: string; moeda: string;
  cliente: Parte;
  itens: OrcamentoItem[];
  desconto: string;
  pagamento: string; prazoEntrega: string; observacoes: string;
};

export type Questao = { enunciado: string; tipo: "objetiva" | "dissertativa"; alternativas: string[]; resposta: string; valor: string };
export type Questionario = {
  titulo: string; disciplina: string; professor: string; turma: string; data: string;
  instrucoes: string;
  questoes: Questao[];
  gabarito: boolean;
};

export type ResumoTopico = { titulo: string; conteudo: string; destaque: string };
export type Resumo = {
  titulo: string; materia: string; autor: string; data: string;
  topicos: ResumoTopico[];
  /** Só no Resumão: glossário e o que mais cai na prova. */
  conceitos: { termo: string; definicao: string }[];
  maisCai: string[];
};

export const EMPTY_CONTRATO = (): Contrato => ({
  numero: "", cidade: "", data: new Date().toLocaleDateString("pt-BR"),
  objeto: "",
  contratante: { nome: "", doc: "", endereco: "", rep: "" },
  contratada: { nome: "", doc: "", endereco: "", rep: "" },
  valor: "", pagamento: "", prazo: "", vigencia: "",
  clausulas: [],
  foro: "",
  testemunhas: [],
});

export const EMPTY_ORCAMENTO = (): Orcamento => ({
  numero: "", data: new Date().toLocaleDateString("pt-BR"), validade: "15 dias", moeda: "R$",
  cliente: { nome: "", doc: "", endereco: "", rep: "" },
  itens: [{ descricao: "", quant: "1", unidade: "un", valor: "" }],
  desconto: "",
  pagamento: "", prazoEntrega: "", observacoes: "",
});

export const EMPTY_QUESTIONARIO = (): Questionario => ({
  titulo: "", disciplina: "", professor: "", turma: "", data: new Date().toLocaleDateString("pt-BR"),
  instrucoes: "Leia com atenção antes de responder. Não é permitido consulta.",
  questoes: [],
  gabarito: false,
});

export const EMPTY_RESUMO = (): Resumo => ({
  titulo: "", materia: "", autor: "", data: new Date().toLocaleDateString("pt-BR"),
  topicos: [],
  conceitos: [],
  maisCai: [],
});

// ── helpers ─────────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function multiline(v: string): string {
  return esc(v).replace(/\n/g, "<br>");
}
/** "1.234,56" ou "1234.56" → número. Aceita o jeito que a pessoa digitar. */
export function parseNum(v: unknown): number {
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  // Se tem vírgula, ela é o separador decimal (padrão brasileiro).
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}
export const fmtMoney = (n: number, moeda = "R$") => `${moeda} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Total de um orçamento: soma dos itens menos o desconto. */
export function orcamentoTotais(o: Orcamento) {
  const subtotal = o.itens.reduce((acc, i) => acc + parseNum(i.quant) * parseNum(i.valor), 0);
  const desconto = parseNum(o.desconto);
  return { subtotal, desconto, total: Math.max(0, subtotal - desconto) };
}

const cell = (v: unknown) => esc(v) || "—";

/** CSS do documento — prefixado por .wsdoc para não vazar para o app. */
export const BUSINESS_CSS = `
.wsdoc{color:#18181b}
.wsdoc .head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:2px solid #18181b;padding-bottom:10px;margin-bottom:10px}
.wsdoc .brand{display:flex;gap:10px;align-items:center;min-width:0}
.wsdoc .logo{height:46px;max-width:110px;object-fit:contain}
.wsdoc .logo.ph{width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:#18181b;color:#fff;border-radius:8px;font-weight:700;font-size:15px}
.wsdoc .emp{font-size:14px;font-weight:800;letter-spacing:-.2px}
.wsdoc .sub{font-size:9px;color:#52525b;line-height:1.5;margin-top:2px}
.wsdoc .docbox{text-align:right;min-width:150px}
.wsdoc .dt{font-size:14px;font-weight:800;text-transform:uppercase}
.wsdoc .drow{font-size:9.5px;color:#3f3f46}
.wsdoc h2.title{font-size:13px;margin:14px 0 6px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.wsdoc table{width:100%;border-collapse:collapse;margin:6px 0}
.wsdoc .grid2{display:flex;gap:10px;margin:6px 0}
.wsdoc .grid2>*{flex:1;min-width:0}
.wsdoc .panel{border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;page-break-inside:avoid;break-inside:avoid}
.wsdoc .panel-t{background:#18181b;color:#fff;font-weight:600;font-size:10px;padding:4px 8px;text-transform:uppercase;letter-spacing:.04em}
.wsdoc .kv td{padding:4px 8px;border:1px solid #e4e4e7;vertical-align:top;font-size:10px}
.wsdoc .kv td.lbl{background:#fafafa;font-weight:600;width:34%;color:#3f3f46}
.wsdoc .panel .kv{margin:0}
.wsdoc .panel .kv td{border-left:0;border-right:0}
.wsdoc .items th,.wsdoc .items td{border:1px solid #e4e4e7;padding:6px 8px;text-align:left;font-size:10px}
.wsdoc .items th{background:#18181b;color:#fff;font-weight:600;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
.wsdoc .items .tr{text-align:right;white-space:nowrap}
.wsdoc .items tfoot td{font-weight:700;background:#fafafa}
.wsdoc .items tfoot tr.total td{background:#18181b;color:#fff;font-size:11px}
.wsdoc .ptext{padding:8px;line-height:1.55;font-size:10px;text-align:justify}
.wsdoc .obs{font-size:10px;color:#3f3f46;border-left:3px solid #d4d4d8;padding-left:10px;margin:8px 0;line-height:1.5}
.wsdoc .cl{margin:8px 0;page-break-inside:avoid;break-inside:avoid}
.wsdoc .cl-t{font-weight:700;font-size:10.5px;margin-bottom:2px}
.wsdoc .cl-x{font-size:10px;text-align:justify;line-height:1.55}
.wsdoc .sign-row{display:flex;gap:24px;margin-top:32px;page-break-inside:avoid}
.wsdoc .sign{flex:1;text-align:center;font-size:9.5px;color:#52525b}
.wsdoc .sign .line{border-top:1px solid #a1a1aa;margin:0 0 4px}
.wsdoc .sign .who{font-weight:700;color:#18181b;font-size:10px}
.wsdoc .q{margin:10px 0;page-break-inside:avoid;break-inside:avoid}
.wsdoc .q-h{display:flex;gap:6px;font-size:10.5px;font-weight:700;align-items:baseline}
.wsdoc .q-n{background:#18181b;color:#fff;border-radius:4px;padding:1px 6px;font-size:9.5px;flex-shrink:0}
.wsdoc .q-v{margin-left:auto;font-weight:600;color:#52525b;font-size:9px;flex-shrink:0}
.wsdoc .q-alt{margin:4px 0 0 22px;font-size:10px;line-height:1.7}
.wsdoc .q-line{border-bottom:1px solid #d4d4d8;height:16px;margin:6px 0 0 22px}
.wsdoc .note{margin-top:18px;font-size:8.5px;color:#a1a1aa;text-align:center;border-top:1px solid #e4e4e7;padding-top:6px}
.wsdoc .chip{display:inline-block;font-size:9.5px;padding:2px 7px;border-radius:4px;background:#fafafa;border:1px solid #e4e4e7;margin:0 4px 4px 0}
`;

/** Cabeçalho com logo e dados da empresa (o mesmo dos documentos do TransLog). */
function header(c: DocCompany, docTitle: string, right: string): string {
  const emp = c.razao_social || c.nome || "Sua Empresa";
  const logo = c.logo_url
    ? `<img src="${esc(c.logo_url)}" alt="" class="logo" />`
    : `<div class="logo ph">${esc(emp.slice(0, 2)).toUpperCase()}</div>`;
  const linhas = [
    c.endereco ? esc(c.endereco) : "",
    [c.cnpj ? `CNPJ: ${esc(c.cnpj)}` : "", c.ie ? `I.E.: ${esc(c.ie)}` : ""].filter(Boolean).join(" · "),
    [c.phone ? `Fone: ${esc(c.phone)}` : "", c.email ? esc(c.email) : ""].filter(Boolean).join(" · "),
  ].filter(Boolean).join("<br>");
  return `<div class="head">
    <div class="brand">${logo}<div><div class="emp">${esc(emp)}</div><div class="sub">${linhas}</div></div></div>
    <div class="docbox"><div class="dt">${esc(docTitle)}</div>${right}</div>
  </div>`;
}

const kvPanel = (titulo: string, rows: [string, string][]) => `<div class="panel">
  <div class="panel-t">${esc(titulo)}</div>
  <table class="kv"><tbody>${rows.map(([l, v]) => `<tr><td class="lbl">${esc(l)}</td><td>${cell(v)}</td></tr>`).join("")}</tbody></table>
</div>`;

const wrap = (inner: string) => `<style>${BUSINESS_CSS}</style><div class="wsdoc">${inner}</div>`;
const rodape = `<div class="note">Documento gerado no Estúdio (Workspace). Confira os dados antes de enviar ou assinar.</div>`;

// ── renderizadores ──────────────────────────────────────────────────────────

export function renderContratoHtml(d: Contrato, c: DocCompany): string {
  const right = `<div class="drow">${d.numero ? `Nº ${esc(d.numero)}` : ""}</div><div class="drow">${esc(d.data)}</div>`;
  const partes = `<div class="grid2">
    ${kvPanel("Contratante", [["Nome / razão social", d.contratante.nome], ["CPF / CNPJ", d.contratante.doc], ["Endereço", d.contratante.endereco], ["Representante", d.contratante.rep]])}
    ${kvPanel("Contratada", [["Nome / razão social", d.contratada.nome], ["CPF / CNPJ", d.contratada.doc], ["Endereço", d.contratada.endereco], ["Representante", d.contratada.rep]])}
  </div>`;
  const condicoes = kvPanel("Condições", [["Valor", d.valor], ["Forma de pagamento", d.pagamento], ["Prazo de execução", d.prazo], ["Vigência", d.vigencia]]);
  const clausulas = d.clausulas.length
    ? `<h2 class="title">Cláusulas</h2>` + d.clausulas.map((cl, i) => `<div class="cl"><div class="cl-t">CLÁUSULA ${i + 1}ª — ${esc(cl.titulo)}</div><div class="cl-x">${multiline(cl.texto)}</div></div>`).join("")
    : "";
  const foro = d.foro ? `<div class="obs">Fica eleito o foro da comarca de <b>${esc(d.foro)}</b> para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</div>` : "";
  const local = [d.cidade, d.data].filter(Boolean).map(esc).join(", ");
  const assinaturas = `<div class="sign-row">
    <div class="sign"><div class="line"></div><div class="who">${cell(d.contratante.nome)}</div><div>Contratante</div></div>
    <div class="sign"><div class="line"></div><div class="who">${cell(d.contratada.nome)}</div><div>Contratada</div></div>
  </div>` + (d.testemunhas.length ? `<div class="sign-row">${d.testemunhas.map((t) => `<div class="sign"><div class="line"></div><div class="who">${cell(t.nome)}</div><div>${t.doc ? "CPF " + esc(t.doc) : "Testemunha"}</div></div>`).join("")}</div>` : "");

  return wrap(`${header(c, "Contrato", right)}
    ${d.objeto ? `<div class="panel"><div class="panel-t">Objeto do contrato</div><div class="ptext">${multiline(d.objeto)}</div></div>` : ""}
    ${partes}${condicoes}${clausulas}${foro}
    ${local ? `<p style="font-size:10px;margin-top:18px">${esc(local)}.</p>` : ""}
    ${assinaturas}${rodape}`);
}

export function renderOrcamentoHtml(d: Orcamento, c: DocCompany): string {
  const { subtotal, desconto, total } = orcamentoTotais(d);
  const right = `<div class="drow">${d.numero ? `Nº ${esc(d.numero)}` : ""}</div><div class="drow">${esc(d.data)}</div>${d.validade ? `<div class="drow">Validade: ${esc(d.validade)}</div>` : ""}`;
  const linhas = d.itens.map((i, k) => {
    const sub = parseNum(i.quant) * parseNum(i.valor);
    return `<tr>
      <td class="tr">${k + 1}</td>
      <td>${cell(i.descricao)}</td>
      <td class="tr">${cell(i.quant)}</td>
      <td>${cell(i.unidade)}</td>
      <td class="tr">${fmtMoney(parseNum(i.valor), d.moeda)}</td>
      <td class="tr">${fmtMoney(sub, d.moeda)}</td>
    </tr>`;
  }).join("");

  return wrap(`${header(c, "Orçamento", right)}
    ${kvPanel("Cliente", [["Nome / razão social", d.cliente.nome], ["CPF / CNPJ", d.cliente.doc], ["Endereço", d.cliente.endereco], ["Contato", d.cliente.rep]])}
    <h2 class="title">Itens</h2>
    <table class="items">
      <thead><tr><th class="tr" style="width:28px">#</th><th>Descrição</th><th class="tr" style="width:56px">Qtd.</th><th style="width:52px">Un.</th><th class="tr" style="width:92px">Valor un.</th><th class="tr" style="width:100px">Total</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="6" style="text-align:center;color:#a1a1aa">Nenhum item.</td></tr>`}</tbody>
      <tfoot>
        <tr><td colspan="5" class="tr">Subtotal</td><td class="tr">${fmtMoney(subtotal, d.moeda)}</td></tr>
        ${desconto > 0 ? `<tr><td colspan="5" class="tr">Desconto</td><td class="tr">− ${fmtMoney(desconto, d.moeda)}</td></tr>` : ""}
        <tr class="total"><td colspan="5" class="tr">Total</td><td class="tr">${fmtMoney(total, d.moeda)}</td></tr>
      </tfoot>
    </table>
    ${(d.pagamento || d.prazoEntrega) ? kvPanel("Condições", [["Forma de pagamento", d.pagamento], ["Prazo de entrega", d.prazoEntrega]]) : ""}
    ${d.observacoes ? `<div class="obs">${multiline(d.observacoes)}</div>` : ""}
    <div class="sign-row"><div class="sign"><div class="line"></div><div class="who">${esc(c.razao_social || c.nome || "")}</div><div>Responsável</div></div></div>
    ${rodape}`);
}

export function renderQuestionarioHtml(d: Questionario, c: DocCompany): string {
  const right = `<div class="drow">${esc(d.data)}</div>${d.turma ? `<div class="drow">Turma: ${esc(d.turma)}</div>` : ""}`;
  const letra = (i: number) => String.fromCharCode(97 + i);
  const questoes = d.questoes.map((q, i) => `<div class="q">
    <div class="q-h"><span class="q-n">${i + 1}</span><span>${multiline(q.enunciado)}</span>${q.valor ? `<span class="q-v">(${esc(q.valor)})</span>` : ""}</div>
    ${q.tipo === "objetiva"
      ? `<div class="q-alt">${q.alternativas.map((a, k) => `<div>( &nbsp; ) <b>${letra(k)})</b> ${esc(a)}</div>`).join("")}</div>`
      : `<div class="q-line"></div><div class="q-line"></div><div class="q-line"></div>`}
  </div>`).join("");

  const gabarito = d.gabarito && d.questoes.some((q) => q.resposta.trim())
    ? `<div class="pgbreak"></div><h2 class="title">Gabarito</h2>
       <table class="items"><thead><tr><th class="tr" style="width:40px">#</th><th>Resposta</th></tr></thead>
       <tbody>${d.questoes.map((q, i) => `<tr><td class="tr">${i + 1}</td><td>${cell(q.resposta)}</td></tr>`).join("")}</tbody></table>`
    : "";

  const total = d.questoes.reduce((a, q) => a + parseNum(q.valor), 0);

  return wrap(`${header(c, "Questionário", right)}
    <h2 class="title" style="margin-top:6px">${cell(d.titulo)}</h2>
    ${kvPanel("Identificação", [["Disciplina", d.disciplina], ["Professor(a)", d.professor], ["Aluno(a)", "_________________________________________________"], ["Nota", total > 0 ? `_______ / ${total.toLocaleString("pt-BR")}` : "_______"]])}
    ${d.instrucoes ? `<div class="obs">${multiline(d.instrucoes)}</div>` : ""}
    ${questoes || `<p style="font-size:10px;color:#a1a1aa">Nenhuma questão ainda.</p>`}
    ${gabarito}${rodape}`);
}

export function renderResumoHtml(d: Resumo, c: DocCompany, resumao: boolean): string {
  const right = `<div class="drow">${esc(d.data)}</div>${d.materia ? `<div class="drow">${esc(d.materia)}</div>` : ""}`;
  const topicos = d.topicos.map((t, i) => `<div class="cl">
    <div class="cl-t">${i + 1}. ${esc(t.titulo)}</div>
    <div class="cl-x">${multiline(t.conteudo)}</div>
    ${t.destaque ? `<div class="obs" style="margin-top:5px"><b>Guarde isto:</b> ${multiline(t.destaque)}</div>` : ""}
  </div>`).join("");

  const extras = resumao ? `
    ${d.conceitos.length ? `<h2 class="title">Conceitos-chave</h2>
      <table class="items"><thead><tr><th style="width:30%">Termo</th><th>Definição</th></tr></thead>
      <tbody>${d.conceitos.map((k) => `<tr><td><b>${cell(k.termo)}</b></td><td>${cell(k.definicao)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${d.maisCai.length ? `<h2 class="title">O que mais cai na prova</h2><div>${d.maisCai.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>` : ""}` : "";

  return wrap(`${header(c, resumao ? "Resumão" : "Resumo", right)}
    <h2 class="title" style="margin-top:6px">${cell(d.titulo)}</h2>
    ${(d.materia || d.autor) ? `<div class="sub" style="margin-bottom:8px">${[d.materia, d.autor].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
    ${topicos || `<p style="font-size:10px;color:#a1a1aa">Nenhum tópico ainda.</p>`}
    ${extras}${rodape}`);
}
