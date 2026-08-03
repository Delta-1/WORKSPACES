// Normas acadêmicas (monografia / trabalho acadêmico).
//
// Portado do MONOFY: cada norma carrega a formatação REAL exigida pelo manual da
// instituição — margens em cm, fonte, corpo, entrelinha, recuo, tamanho do papel,
// moldura de capa e estilo de citação. Trocar de norma reformata o documento
// inteiro; é por isso que a formatação mora aqui como dado, e não espalhada no CSS.

import type { DocField, PageSetup } from "./types";

export type CitationStyle = "APA" | "Vancouver" | "ABNT";

// Uma seção do trabalho. `instructions` é o briefing que vai para a IA quando
// aquela seção é redigida — cada seção é gerada SEPARADAMENTE, senão o marco
// teórico (15-17 páginas) estoura o limite de resposta e volta truncado.
export type NormSection = {
  id: string;
  label: string;
  instructions: string | null; // null = seção montada sem IA (ex.: Referências)
};

export type NormTemplate = {
  id: string;
  nome: string;
  descricao: string;
  page: PageSetup;
  citacao: CitationStyle;
  /** Capa com moldura/borda ao redor da página inteira. */
  capaMoldura: boolean;
  capaAlinhamento: "center" | "left";
  /** Linha fixa extra na capa (ex.: "INVESTIGACIÓN EN ASIGNATURA"). */
  capaLinhaExtra?: string;
  /** Pré-preenche a capa ao aplicar a norma — editável depois. */
  capaDados?: Partial<Record<"universidade" | "faculdade" | "carreira" | "local", string>>;
  secoes: NormSection[];
};

// ── Estruturas de seções ────────────────────────────────────────────────────

/** Estrutura padrão (Resumo → Introdução → Marco teórico → Conclusão → Refs). */
export const SECOES_PADRAO: NormSection[] = [
  { id: "resumo", label: "Resumo", instructions: "Redija um RESUMO de aproximadamente 250 palavras, em um único parágrafo, sem subtítulos, sintetizando: objetivo do trabalho, problema, método utilizado, base teórica e uma conclusão geral." },
  { id: "introducao", label: "Introdução", instructions: "Redija a INTRODUÇÃO: contextualize o tema, apresente o problema, os objetivos e a justificativa do trabalho. De 2 a 4 parágrafos bem desenvolvidos." },
  { id: "marco_teorico", label: "Marco Teórico", instructions: "Redija o MARCO TEÓRICO completo e MUITO EXTENSO: no mínimo o equivalente a 15 a 17 páginas (cerca de 6000-7500 palavras). Desenvolva analiticamente os conceitos, teorias e argumentos a partir das notas e do material de referência, com MUITOS subtítulos <h2> (e <h3> para sub-subtemas), cada um com vários parágrafos bem desenvolvidos. É a seção mais extensa e profunda do trabalho — não resuma nem encurte. Apoie-se em DADOS REAIS E VERIFICÁVEIS (estudos, estatísticas, autores reais); NÃO invente dados nem fontes." },
  { id: "conclusao", label: "Conclusão", instructions: "Redija a CONCLUSÃO: sintetize os achados, retome os objetivos apresentados na introdução e proponha considerações finais. De 2 a 3 parágrafos." },
  { id: "referencias", label: "Referências", instructions: null },
];

/** UAP — Universidad Amazónica de Pando (estrutura do manual). */
export const SECOES_UAP: NormSection[] = [
  { id: "introducao", label: "Introducción", instructions: "Redacta la INTRODUCCIÓN: contextualiza el tema, presenta el problema, los objetivos y la justificación del trabajo. 2 a 4 párrafos." },
  { id: "problema", label: "1. Problema Investigado", instructions: "Desarrolla el PROBLEMA INVESTIGADO con estos subtítulos (usa <h2> para cada uno): 1.1 Descripción de la Situación Problemática, 1.2 Delimitación del Problema, 1.3 Problema Científico, 1.4 Objeto de Estudio, 1.4.1 Objetivo General, 1.4.2 Objetivos Específicos, 1.5 Justificación." },
  { id: "sustento", label: "2. Sustento Teórico, Debate y Reflexión", instructions: "Desarrolla de forma extensa y analítica con estos subtítulos (usa <h2>): 2.1 Marco Teórico, 2.2 Marco Conceptual, 2.3 Debate. Es la sección más profunda del trabajo, basada en las notas y el material de referencia." },
  { id: "difusion", label: "3. Difusión de Resultados", instructions: "Redacta la DIFUSIÓN DE RESULTADOS: cómo se comunican o aplican los hallazgos del trabajo. 1 a 2 párrafos." },
  { id: "conclusao", label: "4. Conclusión", instructions: "Redacta la CONCLUSIÓN: sintetiza los hallazgos, retoma los objetivos y propone consideraciones finales. 2 a 3 párrafos." },
  { id: "referencias", label: "5. Bibliografía", instructions: null },
];

/** UPDS — "Trabajo de Investigación" (variação com objetivos/discussão/recomendações). */
export const SECOES_UPDS_INV: NormSection[] = [
  { id: "introducao", label: "Introducción", instructions: "Redacta la INTRODUCCIÓN (equivalente a 1-2 páginas): contextualiza el tema, presenta el problema de investigación y la relevancia del trabajo. Redacción académica, impersonal, en varios párrafos bien desarrollados." },
  { id: "objetivos", label: "Objetivos", instructions: "Redacta la sección OBJETIVOS. Usa <h2>Objetivo General</h2> con un único objetivo general claro (verbo en infinitivo). Luego <h2>Objetivos Específicos</h2> con una lista <ul><li> de 3 a 5 objetivos específicos, cada uno iniciando con un verbo en infinitivo." },
  { id: "justificacao", label: "Justificación", instructions: "Redacta la JUSTIFICACIÓN: explica la importancia, pertinencia y utilidad del trabajo (académica, social y/o práctica). 2 a 4 párrafos." },
  { id: "marco_teorico", label: "Marco Teórico", instructions: "Redacta el MARCO TEÓRICO completo y MUY EXTENSO: como mínimo el equivalente a 15 a 17 páginas (aproximadamente 6000-7500 palabras). Desarrolla analíticamente los conceptos, teorías y argumentos a partir de las notas y del material de referencia, con MUCHOS subtítulos <h2> (y <h3> para sub-subtemas), cada uno con varios párrafos bien desarrollados. Es la sección más extensa y profunda del trabajo — no la resumas ni la acortes. Apóyate en DATOS CIENTÍFICOS REALES Y VERIFICABLES (estudios, estadísticas, guías clínicas, autores reales); NO inventes datos ni fuentes. Usa citas en formato Vancouver: numéralas entre paréntesis en el texto —(1), (2), (3)…— en el orden en que aparecen." },
  { id: "discussao", label: "Discusión", instructions: "Redacta la DISCUSIÓN (equivalente a 3-4 páginas): analiza e interpreta lo expuesto en el marco teórico, contrasta posturas de diferentes autores y relaciona los conceptos con el problema planteado. Argumentación crítica y académica." },
  { id: "conclusao", label: "Conclusiones", instructions: "Redacta las CONCLUSIONES (equivalente a 1-2 páginas): sintetiza los hallazgos principales y retoma los objetivos planteados. Puedes usar una lista numerada de conclusiones." },
  { id: "recomendacoes", label: "Recomendaciones", instructions: "Redacta las RECOMENDACIONES: sugerencias prácticas y concretas derivadas de las conclusiones. Puedes presentarlas como una lista <ul><li>." },
  { id: "referencias", label: "Bibliografía", instructions: null },
];

// ── Normas embutidas ────────────────────────────────────────────────────────

const TIMES = "'Times New Roman', Times, serif";

export const NORM_TEMPLATES: NormTemplate[] = [
  {
    id: "abnt",
    nome: "ABNT (genérica)",
    descricao: "Norma brasileira padrão — A4, margens 3/2/3/2, Times 12, espaço 1,5.",
    page: { paper: "a4", margins: { mt: 3, mb: 2, ml: 3, mr: 2 }, font: TIMES, fontSize: "12pt", lineHeight: 1.5, indent: 1.25 },
    citacao: "ABNT",
    capaMoldura: false,
    capaAlinhamento: "center",
    secoes: SECOES_PADRAO,
  },
  {
    id: "apa-upds",
    nome: "UPDS — Domingo Savio",
    descricao: "Universidad Privada Domingo Savio — papel carta, capa com moldura, citação APA.",
    page: { paper: "carta", margins: { mt: 2.54, mb: 2.54, ml: 3.0, mr: 2.54 }, font: TIMES, fontSize: "12pt", lineHeight: 1.5, indent: 1.27 },
    citacao: "APA",
    capaMoldura: true,
    capaAlinhamento: "center",
    capaDados: { universidade: "UNIVERSIDAD PRIVADA DOMINGO SAVIO", faculdade: "FACULTAD DE CIENCIA DE LA SALUD", carreira: "CARRERA DE MEDICINA", local: "Cobija-Pando-Bolivia" },
    secoes: SECOES_PADRAO,
  },
  {
    id: "upds-inv4",
    nome: "UPDS — Trabajo de Investigación",
    descricao: "Variação do UPDS com objetivos, discussão e recomendações. Citação Vancouver.",
    page: { paper: "carta", margins: { mt: 2.5, mb: 2.5, ml: 3.0, mr: 2.5 }, font: TIMES, fontSize: "12pt", lineHeight: 1.5, indent: 1.25 },
    citacao: "Vancouver",
    capaMoldura: true,
    capaAlinhamento: "center",
    capaDados: { universidade: "UNIVERSIDAD PRIVADA DOMINGO SAVIO", faculdade: "FACULTAD DE CIENCIA DE LA SALUD", carreira: "CARRERA DE MEDICINA", local: "Cobija-Pando-Bolivia" },
    secoes: SECOES_UPDS_INV,
  },
  {
    id: "uap",
    nome: "UAP — Amazónica de Pando",
    descricao: "Universidad Amazónica de Pando — estrutura própria (problema, sustento, difusión).",
    page: { paper: "carta", margins: { mt: 2.54, mb: 2.54, ml: 3.0, mr: 2.54 }, font: TIMES, fontSize: "12pt", lineHeight: 1.5, indent: 1.27 },
    citacao: "APA",
    capaMoldura: false,
    capaAlinhamento: "center",
    capaLinhaExtra: "INVESTIGACIÓN EN ASIGNATURA",
    capaDados: { universidade: "UNIVERSIDAD AMAZÓNICA DE PANDO", faculdade: "UNIDAD ACADÉMICA DESCONCENTRADA PUERTO EVO", carreira: "CARRERA DE MEDICINA", local: "Bella Flor - Pando - Bolivia" },
    secoes: SECOES_UAP,
  },
];

export const normById = (id?: string | null) => NORM_TEMPLATES.find((n) => n.id === id) ?? NORM_TEMPLATES[0];

// ── Norma sob medida (lida de um arquivo-modelo) ────────────────────────────
//
// Quando a pessoa manda o modelo da própria faculdade, a formatação é extraída
// dele e chega aqui como um remendo por cima de uma norma conhecida. Fica só o
// que foi RECONHECIDO no arquivo — o resto continua vindo da norma base, então
// uma extração incompleta nunca produz um documento sem margem ou sem fonte.
export type CustomNorm = {
  nome?: string;
  descricao?: string;
  page?: Partial<Omit<PageSetup, "margins">> & { margins?: Partial<PageSetup["margins"]> };
  citacao?: CitationStyle;
  capaMoldura?: boolean;
  capaAlinhamento?: "center" | "left";
  capaLinhaExtra?: string;
  capaDados?: NormTemplate["capaDados"];
};

const CITACOES: CitationStyle[] = ["APA", "Vancouver", "ABNT"];
const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/**
 * Aceita o que veio da extração e devolve uma norma válida.
 *
 * Cada campo é conferido antes de entrar: margem fora de 0-8 cm, entrelinha
 * absurda ou estilo de citação inventado são descartados em silêncio e o valor
 * da norma base prevalece. É a fronteira entre o palpite da IA e a formatação
 * do documento — nada não validado passa daqui.
 */
export function resolveNorm(id?: string | null, custom?: CustomNorm | null): NormTemplate {
  const base = normById(id);
  if (!custom || typeof custom !== "object") return base;

  const m = custom.page?.margins ?? {};
  const page: PageSetup = {
    paper: custom.page?.paper === "carta" || custom.page?.paper === "a4" ? custom.page.paper : base.page.paper,
    margins: {
      mt: num(m.mt, 0.5, 8) ?? base.page.margins.mt,
      mb: num(m.mb, 0.5, 8) ?? base.page.margins.mb,
      ml: num(m.ml, 0.5, 8) ?? base.page.margins.ml,
      mr: num(m.mr, 0.5, 8) ?? base.page.margins.mr,
    },
    font: typeof custom.page?.font === "string" && custom.page.font.trim() ? custom.page.font : base.page.font,
    fontSize: /^\d{1,2}(\.\d)?pt$/.test(String(custom.page?.fontSize)) ? String(custom.page?.fontSize) : base.page.fontSize,
    lineHeight: num(custom.page?.lineHeight, 1, 3) ?? base.page.lineHeight,
    indent: num(custom.page?.indent, 0, 5) ?? base.page.indent,
  };

  return {
    ...base,
    id: `${base.id}+custom`,
    nome: custom.nome?.trim() || `${base.nome} (do seu modelo)`,
    descricao: custom.descricao?.trim() || base.descricao,
    page,
    citacao: CITACOES.includes(custom.citacao as CitationStyle) ? (custom.citacao as CitationStyle) : base.citacao,
    capaMoldura: typeof custom.capaMoldura === "boolean" ? custom.capaMoldura : base.capaMoldura,
    capaAlinhamento: custom.capaAlinhamento === "left" || custom.capaAlinhamento === "center" ? custom.capaAlinhamento : base.capaAlinhamento,
    capaLinhaExtra: custom.capaLinhaExtra?.trim() || base.capaLinhaExtra,
    capaDados: { ...(base.capaDados ?? {}), ...(custom.capaDados ?? {}) },
  };
}

// Campos da capa. É exatamente esta lista que a Nina percorre no WhatsApp,
// perguntando um por vez, e que a interface mostra no formulário da capa.
export const COVER_FIELDS: DocField[] = [
  { id: "universidade", label: "Universidade", question: "Qual é o nome da sua universidade ou instituição?", required: true },
  { id: "faculdade", label: "Faculdade", question: "Qual é o nome da faculdade?" },
  { id: "carreira", label: "Curso / carreira", question: "Qual é o nome do curso ou carreira?" },
  { id: "titulo", label: "Título do trabalho", question: "Qual é o título do trabalho?", required: true },
  { id: "disciplina", label: "Disciplina", question: "Qual é a disciplina ou matéria deste trabalho?" },
  { id: "professor", label: "Docente / orientador(a)", question: "Qual é o nome completo do(a) professor(a) ou orientador(a)?" },
  { id: "estudante", label: "Estudante(s)", question: "Qual é o seu nome completo? (se houver mais de um estudante, separe por vírgula)", type: "textarea", required: true },
  { id: "cidade", label: "Cidade / país", question: "Em que cidade e país você está?" },
  { id: "ano", label: "Ano", question: "Qual é o ano deste trabalho?", default: String(new Date().getFullYear()) },
];
