// NICHOS — o atalho entre "o que você faz" e "quais apps já vêm ligados".
//
// Ninguém que acaba de entrar sabe o que é "feature" ou quais ferramentas
// combinam. Então, no cadastro, a pessoa só diz o ramo — e a gente pré-liga o
// conjunto que faz sentido para ele. Dá para ajustar tudo depois na tela de
// Planos; isto é só o ponto de partida certo, em vez de uma tela em branco.

import type { FeatureId } from "@/lib/plan";
import { RECOMMENDED, RECOMMENDED_WA_LIMIT } from "@/lib/plan";

export type Niche = {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  features: FeatureId[];
  waLimit: number;
};

// ── Empresas ────────────────────────────────────────────────────────────────
export const COMPANY_NICHES: Niche[] = [
  {
    id: "escritorio",
    label: "Escritório / Administrativo",
    emoji: "🏢",
    desc: "Tarefas, calendário, arquivos, mural e atendimento por WhatsApp.",
    features: ["mensagens", "labs", "clientes"],
    waLimit: 2,
  },
  {
    id: "transportadora",
    label: "Transportadora / Logística",
    emoji: "🚚",
    desc: "Rastreio de cargas, frota, estoque e documentos aduaneiros.",
    features: ["mensagens", "logistica", "labs", "clientes"],
    waLimit: 3,
  },
  {
    id: "comercio",
    label: "Comércio / Loja",
    emoji: "🛍️",
    desc: "Atendimento, clientes, cobranças por Pix e financeiro.",
    features: ["mensagens", "clientes", "cobranca", "financeiro"],
    waLimit: 2,
  },
  {
    id: "servicos",
    label: "Prestador de serviços",
    emoji: "🔧",
    desc: "Agenda, clientes, orçamentos e cobrança automática.",
    features: ["mensagens", "clientes", "cobranca", "labs"],
    waLimit: 2,
  },
  {
    id: "saude",
    label: "Saúde / Clínica",
    emoji: "🩺",
    desc: "Agenda, atendimento por WhatsApp, formulários e clientes.",
    features: ["mensagens", "clientes", "labs"],
    waLimit: 2,
  },
  {
    id: "ti",
    label: "Suporte técnico / TI",
    emoji: "💻",
    desc: "Acesso remoto às máquinas, atendimento e automação de arquivos.",
    features: ["mensagens", "remoto", "automacao", "labs"],
    waLimit: 2,
  },
  {
    id: "contabilidade",
    label: "Contabilidade / Financeiro",
    emoji: "📊",
    desc: "Financeiro, clientes, cobranças e documentos.",
    features: ["financeiro", "clientes", "cobranca", "mensagens"],
    waLimit: 2,
  },
  {
    id: "educacao",
    label: "Educação / Cursos",
    emoji: "🎓",
    desc: "Atendimento, formulários, mural e o Estúdio de documentos.",
    features: ["mensagens", "clientes", "labs"],
    waLimit: 2,
  },
  {
    id: "outro",
    label: "Outro ramo",
    emoji: "✨",
    desc: "Começa com o plano recomendado — você ajusta depois.",
    features: RECOMMENDED,
    waLimit: RECOMMENDED_WA_LIMIT,
  },
];

// ── Contas pessoais ─────────────────────────────────────────────────────────
// A "casa" não é uma empresa: aqui não se cobra por número de WhatsApp e o
// conjunto é enxuto, voltado para organização pessoal.
export const PERSONAL_KINDS: Niche[] = [
  {
    id: "estudante",
    label: "Estudante",
    emoji: "🎓",
    desc: "Organize matérias e prazos no Kanban + Calendário, e use o Estúdio para trabalhos.",
    features: ["labs"],
    waLimit: 1,
  },
  {
    id: "pessoal",
    label: "Uso pessoal / Casa",
    emoji: "🏠",
    desc: "Tarefas, calendário, finanças de casa e arquivos — tudo num lugar só.",
    features: ["financeiro"],
    waLimit: 1,
  },
  {
    id: "autonomo",
    label: "Autônomo / Freelancer",
    emoji: "💼",
    desc: "Atenda clientes pelo WhatsApp, faça orçamentos e cobre por Pix.",
    features: ["mensagens", "clientes", "cobranca"],
    waLimit: 1,
  },
];

export const nicheById = (list: Niche[], id: string | null | undefined) =>
  list.find((n) => n.id === id) ?? null;
