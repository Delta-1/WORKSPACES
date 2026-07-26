// Tipos compartilhados do Estúdio Acadêmico (formulário + trabalho gerado).
export type AcademicInput = {
  tipo?: string; // monografia | tcc | trabalho | redacao | artigo
  tema?: string;
  instituicao?: string;
  curso?: string;
  nivel?: string; // ensino médio, técnico, graduação, pós…
  autor?: string;
  orientador?: string;
  paginas?: number;
  abnt?: boolean;
  observacoes?: string;
  cidade?: string;
  ano?: string;
};

export type AcademicWork = {
  titulo: string;
  resumo: string;
  palavras_chave: string[];
  secoes: { titulo: string; conteudo: string }[];
  referencias: string[];
};
