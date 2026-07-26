// Modelo de PLANOS: quais ferramentas a empresa liga e quanto custa por mês.
// Ferramentas "base" (início, tarefas, arquivos, organograma, etc.) vêm sempre.
// As ferramentas abaixo são opcionais e somam no valor mensal.

export type FeatureId = "mensagens" | "remoto" | "labs" | "financeiro" | "clientes" | "automacao";

export const FEATURES: { id: FeatureId; label: string; desc: string; price: number }[] = [
  { id: "mensagens", label: "WhatsApp / Mensagens", desc: "Atendimento por WhatsApp com bots e etiquetas", price: 0 /* por número registrado */ },
  { id: "remoto", label: "Acesso Remoto", desc: "Ver e controlar computadores à distância", price: 40 },
  { id: "labs", label: "Agentes de IA + Copiloto", desc: "Criar robôs de IA e o copiloto interno", price: 50 },
  { id: "financeiro", label: "Financeiro", desc: "Controle de contas da empresa e de casa", price: 20 },
  { id: "clientes", label: "Clientes (CRM)", desc: "Cadastro de clientes, formulário e acesso de terceiros", price: 20 },
  { id: "automacao", label: "Automação de arquivos", desc: "Sincronizar/automatizar pastas de servidores", price: 30 },
];

// Cada app (aba) depende de uma feature. Apps que não estão aqui vêm sempre.
export const APP_FEATURE: Record<string, FeatureId> = {
  mensagens: "mensagens",
  contatos: "mensagens",
  atendimentos: "mensagens",
  remoto: "remoto",
  labs: "labs",
  chat: "labs",
  financeiro: "financeiro",
  clientes: "clientes",
  clientes_ia: "clientes",
  automacao: "automacao",
};

// Plano recomendado (já vem marcado): WhatsApp/mensagens, acesso remoto, agentes
// de IA e clientes. Automação e Financeiro NÃO vêm inclusos — a empresa adiciona
// à parte se quiser. O WhatsApp vem com 3 números por padrão.
export const RECOMMENDED: FeatureId[] = ["mensagens", "remoto", "labs", "clientes"];
export const RECOMMENDED_WA_LIMIT = 3; // números de WhatsApp (linhas/QR) inclusos
export const WA_PRICE_PER_NUMBER = 10; // R$ por número registrado
export const TRIAL_DAYS = 3; // dias grátis de teste ao criar a empresa

// Planos da tela de cadastro. "Simples" = o essencial com limitação (sem agentes
// de IA), "Avançado" = o recomendado completo, "Customizado" = a pessoa monta o
// seu escolhendo cada ferramenta. Todos começam com 3 dias grátis.
export type PlanTierId = "simples" | "avancado" | "customizado" | "criacao";
export const CRIACAO_PRICE = 2000; // entrada única (parcelável); demais combinados
export const PLAN_TIERS: {
  id: PlanTierId;
  name: string;
  tagline: string;
  features: FeatureId[]; // vazio em "customizado" = a pessoa escolhe
  custom?: boolean;
  highlight?: boolean;
  bespoke?: boolean; // plano sob medida (Criação) — pagamento à parte/combinado
}[] = [
  {
    id: "simples",
    name: "Plano Simples",
    tagline: "O essencial para começar — sem agentes de IA.",
    features: ["mensagens", "remoto", "clientes"],
  },
  {
    id: "avancado",
    name: "Plano Avançado",
    tagline: "O recomendado: WhatsApp, acesso remoto, agentes de IA e clientes.",
    features: RECOMMENDED,
    highlight: true,
  },
  {
    id: "customizado",
    name: "Plano Customizado",
    tagline: "Monte o seu: escolha exatamente as ferramentas que quiser.",
    features: [],
    custom: true,
  },
  {
    id: "criacao",
    name: "Plano Criação",
    tagline: "Algo sob medida para você, com a auditoria do Victor. Entrada de R$2000 (parcelável); os pagamentos seguintes são combinados.",
    features: [],
    bespoke: true,
  },
];

// Preço mensal de um plano da tela de cadastro (com o limite de WhatsApp inclusos).
export function tierPrice(tier: PlanTierId): number {
  const t = PLAN_TIERS.find((x) => x.id === tier);
  if (!t || t.custom) return 0;
  return planPrice(t.features, RECOMMENDED_WA_LIMIT);
}

// Preço do WhatsApp: R$10 por NÚMERO registrado (linha/conexão via QR Code).
// Ex.: 3 números = R$30. "Número registrado" é a linha de WhatsApp que aparece
// dentro do Workspace — não é o contato de um cliente.
export function whatsappPrice(numbers: number): number {
  return Math.max(1, Math.floor(numbers)) * WA_PRICE_PER_NUMBER;
}

// Valor mensal total do plano.
export function planPrice(features: FeatureId[], waLimit: number): number {
  let total = 0;
  for (const f of features) {
    if (f === "mensagens") total += whatsappPrice(waLimit);
    else total += FEATURES.find((x) => x.id === f)?.price ?? 0;
  }
  return total;
}

// Uma aba está liberada? (enabled = null significa "tudo liberado").
export function appEnabled(appId: string, enabled: FeatureId[] | null): boolean {
  const f = APP_FEATURE[appId];
  if (!f) return true; // app base, sempre
  if (!enabled) return true; // sem plano definido = tudo liberado
  return enabled.includes(f);
}
