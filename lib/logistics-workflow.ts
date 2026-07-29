export type LogisticsStageId =
  | "proforma"
  | "pedido"
  | "entrada"
  | "fumigacao"
  | "documentacao"
  | "transbordo"
  | "exportacao"
  | "em_transito"
  | "concluido";

export type LogisticsStage = {
  id: LogisticsStageId;
  label: string;
  shortLabel: string;
  hint: string;
  color: string;
  slaHours: number | null;
};

// Ordem operacional única usada pelo painel, Kanban, portal do motorista e
// automações do banco. O transbordo é uma etapa operacional opcional e nunca
// cria outra fatura comercial.
export const LOGISTICS_STAGES: LogisticsStage[] = [
  { id: "proforma", label: "Negociação & Proforma", shortLabel: "Proforma", hint: "Proposta, preço e condições comerciais", color: "text-zinc-300", slaHours: 72 },
  { id: "pedido", label: "Pedido de Compra", shortLabel: "Pedido", hint: "Abre o Contas a Pagar da operação", color: "text-blue-300", slaHours: 48 },
  { id: "entrada", label: "Entrada NF & Romaneio", shortLabel: "Entrada", hint: "Gera lote, saldo físico e romaneio", color: "text-emerald-300", slaHours: 24 },
  { id: "fumigacao", label: "Fumigação por Lote", shortLabel: "Fumigação", hint: "Certificado e baixa controlada do lote", color: "text-lime-300", slaHours: 48 },
  { id: "documentacao", label: "Início da Exportação", shortLabel: "Documentos", hint: "DUE, MIC/DTA, CRT e fatura de frete", color: "text-sky-300", slaHours: 48 },
  { id: "transbordo", label: "Transbordo", shortLabel: "Transbordo", hint: "Troca de conjunto sem nova fatura", color: "text-amber-300", slaHours: 24 },
  { id: "exportacao", label: "Faturamento & Invoice", shortLabel: "Invoice", hint: "Invoice definitiva e Contas a Receber", color: "text-purple-300", slaHours: 48 },
  { id: "em_transito", label: "Em Trânsito", shortLabel: "Em trânsito", hint: "Rastreamento até a entrega", color: "text-orange-300", slaHours: 120 },
  { id: "concluido", label: "Entregue & Concluído", shortLabel: "Concluído", hint: "Operação finalizada e conferida", color: "text-emerald-400", slaHours: null },
];

export function logisticsStageIndex(stage: string | null | undefined) {
  const index = LOGISTICS_STAGES.findIndex((item) => item.id === stage);
  return index < 0 ? 0 : index;
}

export function logisticsStage(stage: string | null | undefined) {
  return LOGISTICS_STAGES[logisticsStageIndex(stage)];
}

export function logisticsStageDue(stage: string, from = new Date()) {
  const hours = logisticsStage(stage).slaHours;
  if (!hours) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function logisticsProgress(stage: string | null | undefined) {
  return Math.round((logisticsStageIndex(stage) / (LOGISTICS_STAGES.length - 1)) * 100);
}

export function isLogisticsLate(stage: string | null | undefined, dueAt: string | null | undefined, now = Date.now()) {
  return stage !== "concluido" && Boolean(dueAt) && new Date(dueAt as string).getTime() < now;
}

export function formatLogisticsDeadline(value: string | null | undefined) {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  const hours = Math.round(Math.abs(delta) / 3_600_000);
  if (delta < 0) return hours < 24 ? `${hours}h atrasada` : `${Math.ceil(hours / 24)}d atrasada`;
  if (hours < 24) return `${Math.max(1, hours)}h restantes`;
  return `${Math.ceil(hours / 24)}d restantes`;
}
