// Tipos base do Estúdio → Documentos.
//
// Tudo aqui é DADO PURO (serializável em JSON) de propósito: a mesma definição
// alimenta a interface do site e, via /api/studio/models, também a Nina no
// WhatsApp — assim os dois nunca ficam desencontrados sobre quais modelos
// existem, o que cada um pergunta e como cada um é formatado.

export type PaperId = "a4" | "carta";

// Medidas reais da folha, em centímetros (usadas na prévia e na exportação).
export const PAPER: Record<PaperId, { w: number; h: number; label: string }> = {
  a4: { w: 21, h: 29.7, label: "A4" },
  carta: { w: 21.59, h: 27.94, label: "Carta (Letter)" },
};

// Configuração de página de um modelo/norma. Margens sempre em CM — é assim que
// os manuais das universidades especificam, e é o que evita o erro clássico de
// converter errado para pixel e a margem "andar" na exportação.
export type PageSetup = {
  paper: PaperId;
  margins: { mt: number; mb: number; ml: number; mr: number };
  font: string;
  fontSize: string; // ex.: "12pt"
  lineHeight: number; // 1.5 = espaço um e meio
  indent: number; // recuo da primeira linha do parágrafo, em cm (0 = sem recuo)
};

// 1cm = 566.93 twips (unidade que a lib `docx` usa nas margens).
export const CM_TO_TWIP = 566.93;
export const cmToTwip = (cm: number) => Math.round(cm * CM_TO_TWIP);
// 1cm = 567 twips; o recuo de primeira linha também vai em twips.
export const ptToHalfPt = (pt: number) => Math.round(pt * 2);
export const parsePt = (size: string) => parseFloat(String(size).replace(/[^\d.]/g, "")) || 12;

export type DocFieldType = "text" | "textarea" | "number" | "select";

// Um campo que o modelo precisa saber para se montar. `question` é a forma
// falada — é literalmente o que a Nina pergunta no WhatsApp, um campo por vez.
export type DocField = {
  id: string;
  label: string;
  question: string;
  type?: DocFieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  default?: string;
};

export type DocModelId =
  | "curriculo"
  | "monografia"
  | "trabalho"
  | "contrato"
  | "orcamento"
  | "questionario"
  | "resumo"
  | "resumao"
  | "livre";

export type DocGroup = "carreira" | "academico" | "negocios" | "estudo";

export type DocModel = {
  id: DocModelId;
  label: string;
  desc: string;
  group: DocGroup;
  accent: string;
  page: PageSetup;
  fields: DocField[];
  /** "pronto" aparece para uso; "em_breve" fica visível mas desabilitado. */
  status: "pronto" | "em_breve";
};

export const GROUP_LABEL: Record<DocGroup, string> = {
  carreira: "Carreira",
  academico: "Acadêmico",
  negocios: "Negócios",
  estudo: "Estudo",
};

// Página padrão (ABNT-ish) usada pelos modelos que não definem a sua.
export const DEFAULT_PAGE: PageSetup = {
  paper: "a4",
  margins: { mt: 3, mb: 2, ml: 3, mr: 2 },
  font: "'Times New Roman', Times, serif",
  fontSize: "12pt",
  lineHeight: 1.5,
  indent: 1.25,
};

/** CSS de `@page` + corpo, compartilhado pela prévia e pela janela de impressão/PDF. */
export function pageCss(p: PageSetup): string {
  const { w, h } = PAPER[p.paper];
  return `@page{size:${w}cm ${h}cm;margin:${p.margins.mt}cm ${p.margins.mr}cm ${p.margins.mb}cm ${p.margins.ml}cm}
body{font-family:${p.font};font-size:${p.fontSize};line-height:${p.lineHeight};color:#000;margin:0}`;
}

/** Estilo inline da "folha" na tela — mesma medida da folha real. */
export function pageStyle(p: PageSetup): Record<string, string> {
  const { w, h } = PAPER[p.paper];
  return {
    width: `${w}cm`,
    minHeight: `${h}cm`,
    padding: `${p.margins.mt}cm ${p.margins.mr}cm ${p.margins.mb}cm ${p.margins.ml}cm`,
    fontFamily: p.font,
    fontSize: p.fontSize,
    lineHeight: String(p.lineHeight),
  };
}
