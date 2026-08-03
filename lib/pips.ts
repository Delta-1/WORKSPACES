// PIPS — a moeda dos serviços da Nina.
//
// Preço e tabela num lugar só: o site, a rota de pagamento e a Nina leem daqui,
// então não existe a chance de a Nina falar um valor e o Pix vir com outro.

/** Quanto vale 1 pip, em reais. */
export const PIP_BRL = 0.5;

export const pipsToBrl = (pips: number) => Math.round(pips * PIP_BRL * 100) / 100;
export const brlToPips = (brl: number) => Math.round(brl / PIP_BRL);

/** "100 pips (R$ 50,00)" — o jeito que a Nina deve falar de preço. */
export function precoTexto(pips: number): string {
  const brl = pipsToBrl(pips).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${pips} pips (R$ ${brl})`;
}

export type Servico = { id: string; nome: string; pips: number; descricao: string };

// Tabela de preços dos serviços.
export const SERVICOS: Servico[] = [
  {
    id: "monografia",
    nome: "Monografia completa",
    pips: 100,
    descricao:
      "Trabalho completo na norma da sua instituição, com capa e todas as seções escritas. " +
      "É uma base pronta para você desenvolver e ajustar — a entrega é do documento, não da revisão final.",
  },
  {
    id: "trabalho",
    nome: "Trabalho acadêmico",
    pips: 100,
    descricao: "Mesma base da monografia, em formato mais enxuto (trabalho, TCC ou artigo).",
  },
  {
    id: "apresentacao",
    nome: "Apresentação de slides",
    pips: 20,
    descricao: "Apresentação montada sobre o tema, pronta em .pptx e editável.",
  },
];

export const servicoById = (id?: string | null) => SERVICOS.find((s) => s.id === id) ?? null;

/** Pacotes sugeridos na hora de comprar. */
export const PACOTES = [
  { pips: 20, destaque: "só uma apresentação" },
  { pips: 100, destaque: "uma monografia" },
  { pips: 220, destaque: "duas monografias + uma apresentação" },
];
