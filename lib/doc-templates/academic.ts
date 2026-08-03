// Trabalho acadêmico / monografia — estado do documento e montagem do HTML.
//
// O documento é guardado como dados (capa + seções em HTML). A partir daí saem
// os três formatos: prévia na tela, PDF (impressão) e .docx — todos usando a
// MESMA montagem, para o que a pessoa vê ser exatamente o que ela recebe.

import type { CustomNorm, NormTemplate } from "./norms";
import { normById, resolveNorm } from "./norms";
import { PAPER } from "./types";

export type AcademicSection = { id: string; label: string; html: string };

export type AcademicDoc = {
  norma: string;
  /** Ajustes extraídos do arquivo-modelo da pessoa, por cima da norma escolhida. */
  normaCustom?: CustomNorm | null;
  capa: Record<string, string>;
  notas: string;
  secoes: AcademicSection[];
};

/** A norma que vale para este documento — a escolhida, com os ajustes do modelo. */
export const normOf = (doc: AcademicDoc) => resolveNorm(doc.norma, doc.normaCustom);

export const EMPTY_ACADEMIC = (normaId: string, capa: Record<string, string> = {}): AcademicDoc => {
  const norma = normById(normaId);
  return {
    norma: norma.id,
    capa: { ano: String(new Date().getFullYear()), ...(norma.capaDados ?? {}), ...capa },
    notas: "",
    secoes: norma.secoes.map((s) => ({ id: s.id, label: s.label, html: "" })),
  };
};

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/** Capa no padrão dos manuais: instituição no topo, título ao centro, local/ano embaixo. */
export function renderCoverHtml(capa: Record<string, string>, norma: NormTemplate): string {
  const line = (v?: string, style = "") => (v?.trim() ? `<p style="margin:0 0 4pt;text-indent:0;${style}">${esc(v)}</p>` : "");
  const alturaUtil = PAPER[norma.page.paper].h - norma.page.margins.mt - norma.page.margins.mb;

  // Logo da instituição no topo da capa. Altura fixa em pontos (não em %) para
  // sair do mesmo tamanho na tela, no PDF e no Word — os manuais costumam pedir
  // o brasão com ~2,5 cm.
  const logo = capa.logo_url?.trim()
    ? `<p style="margin:0 0 8pt;text-indent:0"><img src="${esc(capa.logo_url)}" alt="" width="96" style="width:96px;height:auto;max-height:110px;object-fit:contain" /></p>`
    : "";

  const topo = [
    logo,
    line(capa.universidade, "font-weight:bold;text-transform:uppercase"),
    line(capa.faculdade, "text-transform:uppercase"),
    line(capa.carreira, "text-transform:uppercase"),
    norma.capaLinhaExtra ? line(norma.capaLinhaExtra, "font-weight:bold;text-transform:uppercase;margin-top:12pt") : "",
  ].join("");

  const meio = [
    `<p style="margin:0 0 10pt;text-indent:0;font-weight:bold;text-transform:uppercase;font-size:1.15em">${esc(capa.titulo || "TÍTULO DO TRABALHO")}</p>`,
    line(capa.disciplina),
  ].join("");

  const baixo = [
    capa.professor ? line(`Docente: ${capa.professor}`) : "",
    capa.estudante ? line(`Estudante(s): ${capa.estudante}`) : "",
    `<div style="height:16pt"></div>`,
    line(capa.cidade),
    line(capa.ano),
  ].join("");

  const inner = `<div style="text-align:${norma.capaAlinhamento};display:flex;flex-direction:column;justify-content:space-between;min-height:${alturaUtil}cm;box-sizing:border-box${norma.capaMoldura ? ";border:3pt solid #000080;padding:14pt" : ""}">
    <div>${topo}</div>
    <div>${meio}</div>
    <div>${baixo}</div>
  </div>`;

  return `<div class="cover">${inner}</div><div class="pgbreak"></div>`;
}

/** Documento inteiro: capa + seções, pronto para prévia, impressão e .docx. */
export function renderAcademicHtml(doc: AcademicDoc, opts: { comCapa?: boolean } = {}): string {
  const norma = normOf(doc);
  const cover = opts.comCapa === false ? "" : renderCoverHtml(doc.capa, norma);
  const corpo = doc.secoes
    .filter((s) => s.html.trim())
    .map((s) => `<h1 style="text-transform:uppercase">${esc(s.label)}</h1>${s.html}`)
    .join("");
  return cover + corpo;
}

/** Quantas seções já têm conteúdo — usado na barra de progresso. */
export const filledCount = (doc: AcademicDoc) => doc.secoes.filter((s) => s.html.trim()).length;
