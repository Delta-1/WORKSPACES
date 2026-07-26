// Monta o .docx do trabalho acadêmico no navegador (a lib `docx` é isomórfica).
// Formatação inspirada em ABNT: fonte 12, espaçamento 1,5, texto justificado,
// capa centralizada e títulos de seção em negrito.
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, LevelFormat,
} from "docx";
import type { AcademicWork, AcademicInput } from "@/lib/academic-meta";

const FONT = "Times New Roman";
const SIZE = 24; // 12pt (half-points)
const LINE = 360; // 1,5 (240 = simples)

function para(text: string, opts: { bold?: boolean; center?: boolean; size?: number; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { line: LINE, after: opts.spacingAfter ?? 120 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? SIZE, font: FONT })],
  });
}

// Quebra o conteúdo de uma seção em parágrafos reais (por linha em branco / \n).
function bodyParagraphs(content: string): Paragraph[] {
  return String(content || "")
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: LINE, after: 120 },
      indent: { firstLine: 708 }, // 1,25cm recuo de primeira linha
      children: [new TextRun({ text: p, size: SIZE, font: FONT })],
    }));
}

export async function buildAcademicDocxBlob(work: AcademicWork, meta: AcademicInput): Promise<Blob> {
  const ano = meta.ano || String(new Date().getFullYear());
  const cover: Paragraph[] = [
    para(meta.instituicao || "", { bold: true, center: true }),
    para(meta.curso || "", { center: true }),
    new Paragraph({ spacing: { after: 1200 }, children: [] }),
    para(meta.autor || "", { center: true }),
    new Paragraph({ spacing: { after: 2400 }, children: [] }),
    para(work.titulo, { bold: true, center: true, size: 28 }),
    new Paragraph({ spacing: { after: 3600 }, children: [] }),
    para(meta.cidade || "", { center: true }),
    para(ano, { center: true, spacingAfter: 0 }),
    new Paragraph({ pageBreakBefore: false, children: [], spacing: { after: 0 } }),
  ];

  const resumoBlocks: Paragraph[] = [];
  if (work.resumo) {
    resumoBlocks.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 200 }, children: [new TextRun({ text: "RESUMO", bold: true, size: SIZE, font: FONT })] }));
    resumoBlocks.push(...bodyParagraphs(work.resumo));
    if (work.palavras_chave?.length) resumoBlocks.push(para(`Palavras-chave: ${work.palavras_chave.join("; ")}.`, {}));
  }

  const sectionBlocks: Paragraph[] = [];
  work.secoes.forEach((s, i) => {
    sectionBlocks.push(new Paragraph({
      pageBreakBefore: i === 0,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 160, line: LINE },
      children: [new TextRun({ text: (s.titulo || `Seção ${i + 1}`).toUpperCase(), bold: true, size: SIZE, font: FONT })],
    }));
    sectionBlocks.push(...bodyParagraphs(s.conteudo));
  });

  const refBlocks: Paragraph[] = [];
  if (work.referencias?.length) {
    refBlocks.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 200, line: LINE }, children: [new TextRun({ text: "REFERÊNCIAS", bold: true, size: SIZE, font: FONT })] }));
    work.referencias.forEach((r) => refBlocks.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120, line: 240 }, children: [new TextRun({ text: r, size: SIZE, font: FONT })] })));
  }

  const doc = new Document({
    numbering: { config: [{ reference: "n", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 } } }, // ABNT: 3cm esq/sup, 2cm dir/inf
      children: [...cover, ...resumoBlocks, ...sectionBlocks, ...refBlocks],
    }],
  });
  return Packer.toBlob(doc);
}
