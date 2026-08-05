// BIBLIOPEN — acervo, busca e contribuição.
//
// Um lugar só para a regra do acervo, porque quem consulta são três caminhos
// diferentes: o site, a rota do leitor e a Nina no WhatsApp. Se cada um tivesse
// a sua versão, um deles acabaria abrindo o que não pode.

export const CONTRIBUICAO = {
  /** Contribuição mínima para abrir UM livro. */
  avulsaCents: 200,
  /** Contribuição mínima do passe mensal (qualquer livro por 30 dias). */
  mensalCents: 1000,
  diasDoPasse: 30,
};

export const reais = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * De onde o livro veio — e é isto que decide o que pode ser feito com ele.
 *
 * `link` é o acervo antigo: ponteiros para arquivos que NÃO são nossos. Ele
 * continua sendo indexado e a Nina indica, mas nunca entra no leitor e nunca é
 * cobrado. Cobrar acesso a obra de terceiro não é curadoria, é venda do que não
 * nos pertence.
 */
export type Origem = "aberto" | "proprio" | "link";

export const ORIGEM_ROTULO: Record<Origem, string> = {
  aberto: "Acesso aberto",
  proprio: "Acervo BibliOpen",
  link: "Link externo",
};

export type Livro = {
  id: string;
  titulo: string;
  autor: string | null;
  area: string | null;
  materia: string | null;
  tipo: string | null;
  edicao: string | null;
  ano: number | null;
  idioma: string | null;
  capa_url: string | null;
  descricao: string | null;
  origem: Origem;
  fonte: string | null;
  licenca: string | null;
  fonte_url: string | null;
  link_externo: string | null;
  disponivel_no_leitor: boolean;
};

/** Campos que podem ir para fora — `arquivo_url` nunca sai daqui. */
export const CAMPOS_PUBLICOS =
  "id, titulo, autor, area, materia, tipo, edicao, ano, idioma, capa_url, descricao, origem, fonte, licenca, fonte_url, link_externo, disponivel_no_leitor";

/** Só livro que a gente tem direito de servir é cobrado. */
export const podeSerLido = (l: Pick<Livro, "origem" | "disponivel_no_leitor">) =>
  l.disponivel_no_leitor && (l.origem === "aberto" || l.origem === "proprio");

/**
 * Prepara o termo para o `websearch_to_tsquery`.
 *
 * Sem isto, "Guyton 14ª edição" vira uma consulta que não casa com nada: o
 * ordinal e a pontuação atrapalham mais do que ajudam numa busca de título.
 */
export function termoDeBusca(q: string): string {
  return String(q || "")
    .replace(/[ªº°]/g, " ")
    .replace(/["':&|!()<>*]/g, " ")
    .replace(/\b(ed|edicao|edição|vol|volume)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Guyton — Tratado de Fisiologia (14ª ed., 2020)" */
export function tituloCompleto(l: Pick<Livro, "titulo" | "edicao" | "ano">): string {
  const detalhe = [l.edicao ? `${l.edicao} ed.` : null, l.ano ? String(l.ano) : null].filter(Boolean).join(", ");
  return detalhe ? `${l.titulo} (${detalhe})` : l.titulo;
}

/**
 * Referência do pagamento de uma contribuição: `bib:<tipo>:<quem>:<livro|->`.
 *
 * `quem` é o uuid do contato (quando veio pelo WhatsApp, com a Nina) ou o
 * e-mail (quando veio pelo site). É o que permite devolver a licença para a
 * pessoa certa quando o Pix cai.
 */
export const bibliRef = (tipo: "avulsa" | "mensal", quem: string, livroId?: string | null) =>
  `bib:${tipo}:${quem}:${livroId || "-"}`;

export function parseBibliRef(ref?: string | null) {
  const m = /^bib:(avulsa|mensal):([^:]+):(.+)$/.exec(String(ref ?? ""));
  if (!m) return null;
  return { tipo: m[1] as "avulsa" | "mensal", quem: m[2], livroId: m[3] === "-" ? null : m[3] };
}
