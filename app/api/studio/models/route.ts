import { NextResponse } from "next/server";
import { DOC_MODELS } from "@/lib/doc-templates";
import { NORM_TEMPLATES } from "@/lib/doc-templates/norms";
import { RESUME_THEMES } from "@/lib/doc-templates/resume";

export const runtime = "nodejs";

// Catálogo do Estúdio → Documentos, para a Nina (whatsapp-service).
//
// O serviço do WhatsApp é um projeto Node separado e não consegue importar o
// código do app. Em vez de duplicar a lista lá (e ela desencontrar na primeira
// mudança), ele lê daqui. Quando um modelo novo entra no registry, a Nina passa
// a saber oferecê-lo e quais perguntas fazer, sem mexer no código dela.
//
// Só metadados públicos (nome, descrição, perguntas, formatação) — nada de dado
// de empresa —, por isso é aberto e cacheável.
// Formato exato do campo `dados` de cada modelo. A Nina precisa disto para
// mandar o conteúdo já redigido por ela em /api/studio/render — sem o formato
// ela chutaria os nomes dos campos e o documento sairia vazio.
const FORMATO: Record<string, string> = {
  curriculo: `{"name":"","title":"","phone":"","email":"","location":"","about":"","skills":[],"keywords":[],"experiences":[{"role":"","company":"","period":"","description":""}],"education":[{"degree":"","institution":"","period":""}],"theme":"executive","accent":"#4f46e5"}`,
  monografia: `{"norma":"abnt","capa":{"universidade":"","faculdade":"","carreira":"","titulo":"","disciplina":"","professor":"","estudante":"","cidade":"","ano":""},"secoes":[{"id":"introducao","label":"Introdução","html":"<p>…</p>"}]}`,
  trabalho: `{"norma":"abnt","capa":{"universidade":"","carreira":"","titulo":"","professor":"","estudante":"","cidade":"","ano":""},"secoes":[{"id":"introducao","label":"Introdução","html":"<p>…</p>"}]}`,
  contrato: `{"numero":"","cidade":"","data":"","objeto":"","contratante":{"nome":"","doc":"","endereco":"","rep":""},"contratada":{"nome":"","doc":"","endereco":"","rep":""},"valor":"","pagamento":"","prazo":"","vigencia":"","clausulas":[{"titulo":"","texto":""}],"foro":"","testemunhas":[]}`,
  orcamento: `{"numero":"","data":"","validade":"","moeda":"R$","cliente":{"nome":"","doc":"","endereco":"","rep":""},"itens":[{"descricao":"","quant":"1","unidade":"un","valor":"0,00"}],"desconto":"","pagamento":"","prazoEntrega":"","observacoes":""}`,
  questionario: `{"titulo":"","disciplina":"","professor":"","turma":"","data":"","instrucoes":"","gabarito":false,"questoes":[{"enunciado":"","tipo":"objetiva","alternativas":["","","",""],"resposta":"a","valor":"1,0"}]}`,
  resumo: `{"titulo":"","materia":"","autor":"","data":"","topicos":[{"titulo":"","conteudo":"","destaque":""}]}`,
  resumao: `{"titulo":"","materia":"","autor":"","data":"","topicos":[{"titulo":"","conteudo":"","destaque":""}],"conceitos":[{"termo":"","definicao":""}],"maisCai":[""]}`,
};

export async function GET() {
  const modelos = DOC_MODELS
    .filter((m) => m.status === "pronto" && m.id !== "livre")
    .map((m) => ({
      id: m.id,
      nome: m.label,
      descricao: m.desc,
      grupo: m.group,
      // O que a Nina precisa perguntar, um campo por vez, na ordem.
      perguntas: m.fields.map((f) => ({
        id: f.id,
        rotulo: f.label,
        pergunta: f.question,
        obrigatorio: !!f.required,
        opcoes: f.options,
        padrao: f.default,
      })),
      formatacao: { papel: m.page.paper, margens: m.page.margins, fonte: m.page.fontSize },
      formato: FORMATO[m.id],
      // Variações que a pessoa escolhe antes de gerar.
      variacoes:
        m.id === "curriculo" ? RESUME_THEMES.map((t) => ({ id: t.id, nome: t.label, descricao: t.desc }))
        : (m.id === "monografia" || m.id === "trabalho") ? NORM_TEMPLATES.map((n) => ({ id: n.id, nome: n.nome, descricao: n.descricao }))
        : [],
    }));

  return NextResponse.json({ modelos }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
