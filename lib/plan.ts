// Modelo de PLANOS: quais ferramentas a empresa liga e quanto custa por mês.
// Ferramentas "base" (início, tarefas, arquivos, organograma, etc.) vêm sempre.
// As ferramentas abaixo são opcionais e somam no valor mensal.

export type FeatureId = "mensagens" | "remoto" | "labs" | "financeiro" | "clientes" | "automacao";

export const FEATURES: { id: FeatureId; label: string; desc: string; price: number }[] = [
  { id: "mensagens", label: "WhatsApp / Mensagens", desc: "Atendimento por WhatsApp com bots e etiquetas", price: 0 /* por número registrado */ },
  { id: "remoto", label: "Acesso Remoto", desc: "Ver e controlar computadores à distância", price: 40 },
  { id: "labs", label: "Agentes de IA + Copiloto", desc: "Criar robôs de IA e o copiloto interno", price: 50 },
  { id: "financeiro", label: "Financeiro", desc: "Controle de contas da empresa e de casa", price: 20 },
  { id: "clientes", label: "Clientes (CRM)", desc: "Cadastro de clientes e Clientes.IA", price: 20 },
  { id: "automacao", label: "Automação de arquivos", desc: "Sincronizar/automatizar pastas de servidores", price: 30 },
];

// Cada app (aba) depende de uma feature. Apps que não estão aqui vêm sempre.
export const APP_FEATURE: Record<string, FeatureId> = {
  mensagens: "mensagens",
  atendimentos: "mensagens",
  remoto: "remoto",
  labs: "labs",
  chat: "labs",
  financeiro: "financeiro",
  clientes: "clientes",
  clientes_ia: "clientes",
  automacao: "automacao",
};

// Plano recomendado (já vem marcado). O WhatsApp vem com 3 números por padrão.
export const RECOMMENDED: FeatureId[] = ["mensagens", "remoto", "labs"];
export const RECOMMENDED_WA_LIMIT = 3; // números de WhatsApp (linhas/QR) inclusos
export const WA_PRICE_PER_NUMBER = 10; // R$ por número registrado

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
