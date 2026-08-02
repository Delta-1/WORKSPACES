// Registry dos modelos do Estúdio → Documentos.
//
// FONTE ÚNICA DE VERDADE: a galeria "Selecione o modelo" no site lê daqui, e a
// Nina (WhatsApp) também — ela consome via /api/studio/models. Assim, quando um
// modelo novo entra aqui, a Nina passa a saber oferecê-lo e quais perguntas
// fazer, sem precisar mexer no código dela.

import type { DocModel } from "./types";
import { DEFAULT_PAGE } from "./types";
import { RESUME_PAGE } from "./resume";
import { BUSINESS_PAGE } from "./business";
import { COVER_FIELDS, NORM_TEMPLATES } from "./norms";

export * from "./types";
export * from "./norms";
export * from "./resume";
export * from "./business";

const ABNT = NORM_TEMPLATES[0].page;

export const DOC_MODELS: DocModel[] = [
  {
    id: "curriculo",
    label: "Currículo",
    desc: "4 temas prontos, edição campo a campo e exportação em Word e PDF.",
    group: "carreira",
    accent: "#6366f1",
    page: RESUME_PAGE,
    status: "pronto",
    fields: [
      { id: "name", label: "Nome completo", question: "Qual é o seu nome completo?", required: true },
      { id: "title", label: "Cargo desejado", question: "Qual cargo ou área você está buscando?", required: true },
      { id: "phone", label: "Telefone", question: "Qual é o seu telefone de contato?" },
      { id: "email", label: "E-mail", question: "Qual é o seu e-mail?" },
      { id: "location", label: "Cidade", question: "Em que cidade você mora?" },
      { id: "about", label: "Resumo profissional", question: "Me conte um resumo da sua trajetória profissional (pode ser em poucas linhas, eu deixo apresentável).", type: "textarea" },
      { id: "experiences", label: "Experiências", question: "Quais foram suas últimas experiências? Para cada uma: cargo, empresa, período e o que você fazia.", type: "textarea" },
      { id: "education", label: "Formação", question: "Qual a sua formação? Curso, instituição e período.", type: "textarea" },
      { id: "skills", label: "Habilidades", question: "Quais são suas principais habilidades? (separe por vírgula)", type: "textarea" },
    ],
  },
  {
    id: "monografia",
    label: "Monografia",
    desc: "Normas reais de universidade (UPDS, UAP, ABNT) com capa, margens e citação.",
    group: "academico",
    accent: "#a855f7",
    page: NORM_TEMPLATES[1].page,
    status: "pronto",
    fields: COVER_FIELDS,
  },
  {
    id: "trabalho",
    label: "Trabalho acadêmico",
    desc: "Trabalho, TCC ou artigo — mesma base da monografia, mais enxuto.",
    group: "academico",
    accent: "#8b5cf6",
    page: ABNT,
    status: "pronto",
    fields: COVER_FIELDS,
  },
  {
    id: "contrato",
    label: "Contrato",
    desc: "Contrato de prestação de serviço com partes, cláusulas e assinaturas.",
    group: "negocios",
    accent: "#0ea5e9",
    page: BUSINESS_PAGE,
    status: "pronto",
    fields: [
      { id: "objeto", label: "Objeto", question: "O que vai ser contratado? Descreva o serviço ou produto.", type: "textarea", required: true },
      { id: "contratante", label: "Contratante", question: "Quem está contratando? Nome completo (ou razão social) e CPF/CNPJ.", required: true },
      { id: "contratada", label: "Contratada", question: "Quem vai prestar o serviço? Nome completo (ou razão social) e CPF/CNPJ.", required: true },
      { id: "valor", label: "Valor", question: "Qual é o valor combinado?", required: true },
      { id: "pagamento", label: "Forma de pagamento", question: "Como o pagamento será feito? (à vista, parcelado, entrada…)" },
      { id: "prazo", label: "Prazo", question: "Qual é o prazo de execução?" },
      { id: "cidade", label: "Cidade / foro", question: "Em que cidade o contrato é assinado?" },
    ],
  },
  {
    id: "orcamento",
    label: "Orçamento",
    desc: "Proposta comercial com tabela de itens, quantidades e total automático.",
    group: "negocios",
    accent: "#10b981",
    page: BUSINESS_PAGE,
    status: "pronto",
    fields: [
      { id: "cliente", label: "Cliente", question: "Para quem é este orçamento? Nome e, se tiver, CPF/CNPJ.", required: true },
      { id: "itens", label: "Itens", question: "Quais itens entram no orçamento? Para cada um: descrição, quantidade e valor unitário.", type: "textarea", required: true },
      { id: "validade", label: "Validade", question: "Por quantos dias esta proposta vale?", default: "15 dias" },
      { id: "pagamento", label: "Forma de pagamento", question: "Qual a condição de pagamento?" },
      { id: "prazoEntrega", label: "Prazo de entrega", question: "Em quanto tempo você entrega?" },
    ],
  },
  {
    id: "questionario",
    label: "Questionário",
    desc: "Prova ou formulário com questões numeradas e gabarito.",
    group: "estudo",
    accent: "#f59e0b",
    page: BUSINESS_PAGE,
    status: "pronto",
    fields: [
      { id: "titulo", label: "Título", question: "Qual é o título da prova ou questionário?", required: true },
      { id: "disciplina", label: "Disciplina", question: "De qual disciplina é?" },
      { id: "assunto", label: "Assunto", question: "Sobre qual assunto são as questões?", type: "textarea", required: true },
      { id: "quantidade", label: "Quantidade", question: "Quantas questões você quer?", type: "number", default: "10" },
      { id: "tipo", label: "Tipo", question: "As questões devem ser objetivas, dissertativas ou misturadas?", type: "select", options: ["objetivas", "dissertativas", "misturadas"] },
      { id: "gabarito", label: "Gabarito", question: "Quer que eu inclua o gabarito no fim?", type: "select", options: ["sim", "não"] },
    ],
  },
  {
    id: "resumo",
    label: "Resumo",
    desc: "Resumo de um conteúdo, organizado em tópicos.",
    group: "estudo",
    accent: "#ec4899",
    page: BUSINESS_PAGE,
    status: "pronto",
    fields: [
      { id: "titulo", label: "Título", question: "Qual é o assunto do resumo?", required: true },
      { id: "materia", label: "Matéria", question: "De qual matéria é?" },
      { id: "conteudo", label: "Conteúdo", question: "Cole o conteúdo que você quer resumir (ou me diga o tema que eu escrevo).", type: "textarea", required: true },
    ],
  },
  {
    id: "resumao",
    label: "Resumão",
    desc: "Revisão completa da matéria, com destaques e o que mais cai na prova.",
    group: "estudo",
    accent: "#ef4444",
    page: BUSINESS_PAGE,
    status: "pronto",
    fields: [
      { id: "titulo", label: "Título", question: "Qual matéria você quer revisar?", required: true },
      { id: "materia", label: "Matéria", question: "De qual disciplina é?" },
      { id: "conteudo", label: "Conteúdo", question: "Cole a matéria toda (ou me diga os temas) que eu monto a revisão completa.", type: "textarea", required: true },
      { id: "prova", label: "Foco da prova", question: "Tem algum tema que o professor avisou que vai cair? Me conte para eu destacar." },
    ],
  },
  {
    id: "livre",
    label: "Documento em branco",
    desc: "Folha vazia com a barra de ferramentas completa, do jeito que você quiser.",
    group: "negocios",
    accent: "#64748b",
    page: DEFAULT_PAGE,
    status: "pronto",
    fields: [],
  },
];

export const modelById = (id?: string | null) => DOC_MODELS.find((m) => m.id === id) ?? null;

/** Modelos acadêmicos compartilham o mesmo fluxo (capa → norma → seções). */
export const isAcademicModel = (id?: string | null) => id === "monografia" || id === "trabalho";
