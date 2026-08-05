// Sementes de acervo ABERTO — obras que podem ser lidas e redistribuídas.
//
// Cada linha aqui tem licença verificável e página de origem. É o que separa
// este acervo de um diretório de links: dá para provar de onde veio e por que
// pode estar aqui.
//
// `arquivo` fica vazio de propósito na maioria: a página oficial é a fonte da
// verdade, e o PDF que a gente serve no leitor é anexado depois (upload ou link
// do Drive), com o arquivo conferido. Semear URL de PDF de terceiro sem abrir é
// como prometer uma porta que ninguém testou.

export type Semente = {
  titulo: string;
  autor?: string;
  materia: string;
  tipo?: string;
  idioma?: string;
  ano?: number;
  licenca: string;
  fonte: string;
  fonte_url: string;
  descricao?: string;
  arquivo?: string;
};

export const ACERVO_ABERTO: Semente[] = [
  {
    titulo: "StatPearls",
    materia: "Clínica Médica",
    tipo: "Referência",
    idioma: "en",
    licenca: "CC BY-NC-ND 4.0",
    fonte: "NCBI Bookshelf",
    fonte_url: "https://www.ncbi.nlm.nih.gov/books/NBK430685/",
    descricao:
      "A maior referência clínica de acesso aberto: milhares de capítulos revisados por pares, cobrindo praticamente toda a prática médica. Atualizada continuamente.",
  },
  {
    titulo: "Anatomy and Physiology",
    autor: "OpenStax",
    materia: "Anatomia",
    tipo: "Livro",
    idioma: "en",
    ano: 2022,
    licenca: "CC BY 4.0",
    fonte: "OpenStax (Rice University)",
    fonte_url: "https://openstax.org/details/books/anatomy-and-physiology-2e",
    descricao: "Livro-texto completo de anatomia e fisiologia humana, com ilustrações próprias e licença que permite uso e adaptação.",
  },
  {
    titulo: "Microbiology",
    autor: "OpenStax",
    materia: "Microbiologia",
    tipo: "Livro",
    idioma: "en",
    ano: 2016,
    licenca: "CC BY 4.0",
    fonte: "OpenStax (Rice University)",
    fonte_url: "https://openstax.org/details/books/microbiology",
    descricao: "Microbiologia para cursos da área da saúde, do básico à aplicação clínica.",
  },
  {
    titulo: "Biology 2e",
    autor: "OpenStax",
    materia: "Biologia",
    tipo: "Livro",
    idioma: "en",
    ano: 2018,
    licenca: "CC BY 4.0",
    fonte: "OpenStax (Rice University)",
    fonte_url: "https://openstax.org/details/books/biology-2e",
    descricao: "Base de biologia celular, molecular e genética — o alicerce dos ciclos iniciais.",
  },
  {
    titulo: "SciELO Livros — Saúde Coletiva",
    materia: "Saúde Coletiva",
    tipo: "Coleção",
    idioma: "pt",
    licenca: "Acesso aberto (varia por título)",
    fonte: "SciELO Livros",
    fonte_url: "https://books.scielo.org/",
    descricao:
      "Coleção brasileira de livros acadêmicos em acesso aberto, forte em saúde coletiva, epidemiologia e história da medicina.",
  },
  {
    titulo: "PubMed Central — texto completo",
    materia: "Pesquisa",
    tipo: "Base",
    idioma: "en",
    licenca: "Acesso aberto (varia por artigo)",
    fonte: "PubMed Central (NIH)",
    fonte_url: "https://www.ncbi.nlm.nih.gov/pmc/",
    descricao: "Repositório de texto completo do NIH: artigos e capítulos de livre acesso.",
  },
  {
    titulo: "Biblioteca Virtual em Saúde (BVS)",
    materia: "Pesquisa",
    tipo: "Base",
    idioma: "pt",
    licenca: "Acesso aberto",
    fonte: "BIREME / OPAS / OMS",
    fonte_url: "https://bvsalud.org/",
    descricao: "Portal latino-americano de literatura em saúde, com LILACS e conteúdo em português e espanhol.",
  },
];
