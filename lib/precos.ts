// Preços dos serviços da Yumi, em REAIS.
//
// Tudo em CENTAVOS (inteiro). Dinheiro em ponto flutuante arredonda errado —
// 0.1 + 0.2 não dá 0.3 — e um centavo furado numa cobrança é problema de
// verdade. Reais só aparecem na hora de escrever para a pessoa.
//
// Preço, saldo e cobrança leem daqui e do banco: não existe a chance de a Yumi
// falar um valor e o Pix vir com outro.

export const centsToBrl = (cents: number) => Math.round(cents) / 100;
export const brlToCents = (brl: number) => Math.round(brl * 100);

/** "R$ 50,00" — o jeito que a Yumi deve falar de dinheiro. */
export function reais(cents: number): string {
  return `R$ ${centsToBrl(cents).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type Servico = { id: string; nome: string; cents: number; descricao: string };

export const SERVICOS: Servico[] = [
  {
    id: "monografia",
    nome: "Monografia completa",
    cents: 5000,
    descricao:
      "Trabalho completo na norma da sua instituição, com capa e todas as seções escritas. " +
      "É uma base pronta para você desenvolver e ajustar — a entrega é do documento, não da revisão final.",
  },
  {
    id: "trabalho",
    nome: "Trabalho acadêmico",
    cents: 5000,
    descricao: "Mesma base da monografia, em formato mais enxuto (trabalho, TCC ou artigo).",
  },
  {
    id: "apresentacao",
    nome: "Apresentação de slides",
    cents: 1000,
    descricao: "Apresentação montada sobre o tema, pronta em .pptx e editável.",
  },
];

export const servicoById = (id?: string | null) => SERVICOS.find((s) => s.id === id) ?? null;

/** Valores sugeridos na hora de colocar saldo. */
export const RECARGAS = [
  { cents: 1000, destaque: "uma apresentação" },
  { cents: 5000, destaque: "uma monografia" },
  { cents: 10000, destaque: "duas monografias" },
];
