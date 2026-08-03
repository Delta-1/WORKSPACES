// Gera as imagens de prévia dos modelos do Estúdio → Documentos.
//
// A Yumi manda essas imagens no WhatsApp para o cliente aprovar o visual ANTES
// de ela produzir o documento. Elas são geradas aqui, no build, e versionadas em
// public/modelos/ — assim o serviço do WhatsApp (que não tem navegador) só
// precisa mandar a URL, sem renderizar nada em tempo de execução.
//
// Rodar:  npx tsx scripts/gen-model-previews.mts
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { pageCss, PAPER, type PageSetup } from "../lib/doc-templates/types.ts";
import { RESUME_PAGE, RESUME_THEMES, renderResumeHtml, type Resume } from "../lib/doc-templates/resume.ts";
import { NORM_TEMPLATES, normById } from "../lib/doc-templates/norms.ts";
import { renderAcademicHtml, EMPTY_ACADEMIC } from "../lib/doc-templates/academic.ts";
import {
  BUSINESS_PAGE, renderContratoHtml, renderOrcamentoHtml, renderQuestionarioHtml, renderResumoHtml,
  EMPTY_CONTRATO, EMPTY_ORCAMENTO, EMPTY_QUESTIONARIO, EMPTY_RESUMO, type DocCompany,
} from "../lib/doc-templates/business.ts";
import { DECK_THEMES, renderSlideHtml } from "../lib/doc-templates/deck.ts";

const OUT = path.join(process.cwd(), "public", "modelos");

// Empresa fictícia só para a prévia ficar com cara de documento real.
const EMPRESA: DocCompany = {
  nome: "Sua Empresa", razao_social: "SUA EMPRESA LTDA",
  cnpj: "00.000.000/0001-00", endereco: "Rua Exemplo, 100 — Centro",
  phone: "(11) 4000-0000", email: "contato@suaempresa.com.br",
};

const CURRICULO: Resume = {
  name: "Ana Beatriz Souza",
  title: "Analista de Marketing",
  phone: "(11) 98888-7777",
  email: "ana.souza@email.com",
  location: "São Paulo, SP",
  photo: "",
  photoSize: 100,
  about: "Profissional de marketing com 6 anos de experiência em campanhas digitais, gestão de redes sociais e análise de resultados. Especialista em transformar dados em decisões que aumentam vendas.",
  keywords: ["Marketing Digital", "Google Ads", "SEO", "Análise de dados"],
  skills: ["Google Ads", "Meta Ads", "SEO e conteúdo", "Power BI", "Gestão de equipe"],
  experiences: [
    { role: "Analista de Marketing Sênior", company: "Empresa Exemplo", period: "2022 - Atual", description: "Responsável pelas campanhas digitais da marca, com crescimento de 40% em leads qualificados no primeiro ano." },
    { role: "Assistente de Marketing", company: "Agência Modelo", period: "2019 - 2022", description: "Criação de conteúdo, gestão de redes sociais e apoio no planejamento de mídia." },
  ],
  education: [{ degree: "Bacharelado em Publicidade e Propaganda", institution: "Universidade Exemplo", period: "2015 - 2019" }],
  theme: "executive",
  accent: "#4f46e5",
};

/** Envolve o miolo numa folha do tamanho certo, pronta para a foto. */
function sheet(inner: string, page: PageSetup, extraCss = ""): string {
  const { w } = PAPER[page.paper];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${pageCss(page)}
html,body{margin:0;background:#fff}
.sheet{width:${w}cm;padding:${page.margins.mt}cm ${page.margins.mr}cm ${page.margins.mb}cm ${page.margins.ml}cm;background:#fff;box-sizing:border-box}
${extraCss}
</style></head><body><div class="sheet">${inner}</div></body></html>`;
}

// Mesmas regras da impressão: texto corrido justificado com recuo, capa sem
// recuo e centralizada. (Não pôr text-align no próprio <p> — senão ele vence
// o alinhamento da capa por especificidade e a capa desalinha.)
const ACADEMIC_CSS = `
.sheet{text-align:justify}
.sheet h1{font-size:1em;font-weight:bold;margin:16pt 0 8pt;text-align:left}
.sheet p{margin:0 0 8pt}
.pgbreak{display:none}`;

async function main() {
  await mkdir(OUT, { recursive: true });
  // CHROME_PATH permite apontar para um Chromium já instalado na máquina —
  // útil quando a versão baixada pelo Playwright não é a que está no ambiente.
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const shots: string[] = [];

  async function shoot(name: string, html: string, clipHeight?: number) {
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$(".sheet, .slide");
    if (!el) throw new Error(`sem folha em ${name}`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`sem medida em ${name}`);
    // Corta na altura pedida (a folha inteira em branco não ajuda a decidir).
    const h = clipHeight ? Math.min(box.height, clipHeight) : box.height;
    const file = path.join(OUT, `${name}.jpg`);
    const buf = await page.screenshot({
      type: "jpeg", quality: 82,
      clip: { x: box.x, y: box.y, width: box.width, height: h },
    });
    await writeFile(file, buf);
    shots.push(name);
  }

  // ── Currículo: um por tema ────────────────────────────────────────────────
  for (const t of RESUME_THEMES) {
    const r: Resume = { ...CURRICULO, theme: t.id };
    await shoot(`curriculo-${t.id}`, sheet(renderResumeHtml(r), RESUME_PAGE));
  }

  // ── Monografia: a capa de cada norma (é o que muda entre elas) ────────────
  for (const n of NORM_TEMPLATES) {
    const doc = EMPTY_ACADEMIC(n.id, {
      titulo: "TÍTULO DO SEU TRABALHO",
      disciplina: "Metodologia da Pesquisa",
      professor: "Prof. Dr. Nome do Docente",
      estudante: "Seu Nome Completo",
      cidade: normById(n.id).capaDados?.local ?? "Cidade — País",
    });
    await shoot(`monografia-${n.id}`, sheet(renderAcademicHtml(doc), n.page, ACADEMIC_CSS));
  }

  // ── Negócios e estudo ─────────────────────────────────────────────────────
  const contrato = {
    ...EMPTY_CONTRATO(),
    numero: "001/2026", cidade: "São Paulo",
    objeto: "Prestação de serviços de consultoria em marketing digital, incluindo planejamento de campanhas, gestão de mídia paga e relatórios mensais de desempenho.",
    contratante: { nome: "Cliente Exemplo Ltda", doc: "11.111.111/0001-11", endereco: "Av. Central, 500", rep: "João da Silva" },
    contratada: { nome: "SUA EMPRESA LTDA", doc: "00.000.000/0001-00", endereco: "Rua Exemplo, 100", rep: "Maria Santos" },
    valor: "R$ 3.500,00", pagamento: "Mensal, todo dia 10", prazo: "12 meses", vigencia: "01/01/2026 a 31/12/2026",
    foro: "São Paulo",
    clausulas: [
      { titulo: "DO OBJETO", texto: "O presente contrato tem por objeto a prestação dos serviços descritos acima, a serem executados pela CONTRATADA em favor da CONTRATANTE." },
      { titulo: "DAS OBRIGAÇÕES", texto: "A CONTRATADA obriga-se a executar os serviços com zelo e técnica, e a CONTRATANTE a fornecer as informações necessárias e efetuar os pagamentos no prazo." },
    ],
  };
  await shoot("contrato", sheet(renderContratoHtml(contrato, EMPRESA), BUSINESS_PAGE));

  const orcamento = {
    ...EMPTY_ORCAMENTO(),
    numero: "042/2026",
    cliente: { nome: "Cliente Exemplo Ltda", doc: "11.111.111/0001-11", endereco: "Av. Central, 500", rep: "(11) 3000-0000" },
    itens: [
      { descricao: "Instalação de ponto de tomada", quant: "20", unidade: "un", valor: "85,00" },
      { descricao: "Quadro de distribuição 12 disjuntores", quant: "1", unidade: "un", valor: "640,00" },
      { descricao: "Mão de obra — instalação completa", quant: "1", unidade: "serv", valor: "1200,00" },
    ],
    desconto: "150,00",
    pagamento: "50% na aprovação e 50% na entrega", prazoEntrega: "10 dias úteis",
    observacoes: "Material de primeira linha, com garantia de 12 meses sobre a instalação.",
  };
  await shoot("orcamento", sheet(renderOrcamentoHtml(orcamento, EMPRESA), BUSINESS_PAGE));

  const quest = {
    ...EMPTY_QUESTIONARIO(),
    titulo: "Avaliação de Biologia — 1º Bimestre",
    disciplina: "Biologia", professor: "Prof.ª Carla Menezes", turma: "2º ano B",
    questoes: [
      { enunciado: "Qual é o principal pigmento responsável pela fotossíntese nas plantas?", tipo: "objetiva" as const, alternativas: ["Clorofila", "Caroteno", "Xantofila", "Antocianina"], resposta: "a", valor: "1,0" },
      { enunciado: "Explique, com suas palavras, por que a fotossíntese é importante para a vida na Terra.", tipo: "dissertativa" as const, alternativas: [], resposta: "", valor: "2,0" },
    ],
  };
  await shoot("questionario", sheet(renderQuestionarioHtml(quest, EMPRESA), BUSINESS_PAGE));

  const resumoBase = {
    ...EMPTY_RESUMO(),
    titulo: "Revolução Francesa", materia: "História", autor: "Seu Nome",
    topicos: [
      { titulo: "Contexto", conteudo: "A França do fim do século XVIII vivia uma crise econômica profunda, agravada por safras ruins e pelos gastos da corte. A sociedade era dividida em três estados, e o terceiro — a maioria da população — sustentava sozinho os impostos.", destaque: "A desigualdade entre os três estados é a raiz do conflito." },
      { titulo: "A queda da Bastilha", conteudo: "Em 14 de julho de 1789, a população tomou a prisão da Bastilha, símbolo do poder absolutista. O episódio marcou o início da revolução e virou data nacional na França.", destaque: "14 de julho de 1789." },
    ],
  };
  await shoot("resumo", sheet(renderResumoHtml(resumoBase, EMPRESA, false), BUSINESS_PAGE));

  const resumao = {
    ...resumoBase,
    conceitos: [
      { termo: "Antigo Regime", definicao: "Ordem política e social da França antes de 1789, baseada na monarquia absoluta e na divisão em três estados." },
      { termo: "Jacobinos", definicao: "Grupo político radical liderado por Robespierre, responsável pelo período do Terror." },
    ],
    maisCai: ["Causas econômicas", "Queda da Bastilha", "Declaração dos Direitos do Homem", "Período do Terror", "Ascensão de Napoleão"],
  };
  await shoot("resumao", sheet(renderResumoHtml(resumao, EMPRESA, true), BUSINESS_PAGE));

  // ── Temas de apresentação ─────────────────────────────────────────────────
  for (const t of DECK_THEMES) {
    const slide = { titulo: "Título da apresentação", topicos: ["Um subtítulo curto aqui"] };
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0}.slide{width:1000px;height:562px}ul{margin:0}
    </style></head><body><div class="slide">${renderSlideHtml(slide, 0, t, { unit: "vh" })}</div></body></html>`;
    await page.setViewportSize({ width: 1000, height: 562 });
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$(".slide");
    const box = await el!.boundingBox();
    const buf = await page.screenshot({ type: "jpeg", quality: 82, clip: box! });
    await writeFile(path.join(OUT, `slide-${t.id}.jpg`), buf);
    shots.push(`slide-${t.id}`);
  }

  await browser.close();
  console.log(`✓ ${shots.length} prévias geradas em public/modelos/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
