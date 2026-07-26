// Converte o HTML do editor "Estúdio" (contenteditable, tipo Word) num .docx real
// no navegador, usando a lib `docx`. Cobre títulos, parágrafos, negrito/itálico/
// sublinhado/tachado, cor, tamanho, alinhamento, listas, imagens e quebra de página.
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, PageBreak,
} from "docx";

const FONT = "Times New Roman";
const BASE = 24; // 12pt

type RunStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; size?: number };

function pxToHalfPt(px: number): number { return Math.round((px * 72 / 96) * 2); }
function normColor(c: string): string | undefined {
  if (!c) return undefined;
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("");
  const h = c.match(/^#?([0-9a-f]{6})$/i);
  return h ? h[1] : undefined;
}

async function dataUrlToBytes(url: string): Promise<Uint8Array | null> {
  try { const r = await fetch(url); const b = await r.arrayBuffer(); return new Uint8Array(b); } catch { return null; }
}

// Extrai runs (texto + formatação) recursivamente de um nó de bloco.
function collectRuns(node: Node, inherited: RunStyle, out: (TextRun | ImageRun)[], images: { el: HTMLImageElement; style: RunStyle }[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || "";
      if (text) out.push(new TextRun({ text, bold: inherited.bold, italics: inherited.italic, underline: inherited.underline ? {} : undefined, strike: inherited.strike, color: inherited.color, size: inherited.size ?? BASE, font: FONT }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { out.push(new TextRun({ break: 1 })); return; }
    if (tag === "img") { images.push({ el: el as HTMLImageElement, style: inherited }); out.push(new TextRun({ text: "" })); return; }
    const st: RunStyle = { ...inherited };
    if (tag === "b" || tag === "strong") st.bold = true;
    if (tag === "i" || tag === "em") st.italic = true;
    if (tag === "u") st.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") st.strike = true;
    const cs = el.style;
    if (cs?.fontWeight && (cs.fontWeight === "bold" || Number(cs.fontWeight) >= 600)) st.bold = true;
    if (cs?.fontStyle === "italic") st.italic = true;
    if (cs?.textDecorationLine?.includes("underline") || cs?.textDecoration?.includes("underline")) st.underline = true;
    if (cs?.textDecorationLine?.includes("line-through") || cs?.textDecoration?.includes("line-through")) st.strike = true;
    if (cs?.color) { const c = normColor(cs.color); if (c) st.color = c; }
    if (cs?.fontSize) { const px = parseFloat(cs.fontSize); if (px) st.size = px > 40 ? Math.round(px * 2) : pxToHalfPt(px); }
    collectRuns(el, st, out, images);
  });
}

function alignOf(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const a = (el.style?.textAlign || "").toLowerCase();
  if (a === "center") return AlignmentType.CENTER;
  if (a === "right") return AlignmentType.RIGHT;
  if (a === "left") return AlignmentType.LEFT;
  return AlignmentType.JUSTIFIED;
}

async function blockToParagraphs(el: HTMLElement): Promise<Paragraph[]> {
  const tag = el.tagName.toLowerCase();
  if (tag === "hr" || el.getAttribute("data-pagebreak") === "1") {
    return [new Paragraph({ children: [new PageBreak()] })];
  }
  if (tag === "ul" || tag === "ol") {
    const items: Paragraph[] = [];
    for (const li of Array.from(el.children)) {
      const runs: (TextRun | ImageRun)[] = []; const imgs: { el: HTMLImageElement; style: RunStyle }[] = [];
      collectRuns(li, {}, runs, imgs);
      await appendImages(runs, imgs);
      items.push(new Paragraph({ children: runs, bullet: tag === "ul" ? { level: 0 } : undefined, numbering: tag === "ol" ? { reference: "num", level: 0 } : undefined, spacing: { line: 360, after: 60 } }));
    }
    return items;
  }
  const heading = tag === "h1" ? HeadingLevel.HEADING_1 : tag === "h2" ? HeadingLevel.HEADING_2 : tag === "h3" ? HeadingLevel.HEADING_3 : undefined;
  const runs: (TextRun | ImageRun)[] = []; const imgs: { el: HTMLImageElement; style: RunStyle }[] = [];
  collectRuns(el, heading ? { bold: true } : {}, runs, imgs);
  await appendImages(runs, imgs);
  if (!runs.length) return [new Paragraph({ children: [] })];
  return [new Paragraph({ children: runs, heading, alignment: alignOf(el), spacing: { line: 360, after: heading ? 120 : 120 }, indent: heading ? undefined : { firstLine: 708 } })];
}

async function appendImages(runs: (TextRun | ImageRun)[], imgs: { el: HTMLImageElement; style: RunStyle }[]) {
  for (const { el } of imgs) {
    const bytes = await dataUrlToBytes(el.src);
    if (!bytes) continue;
    const w = Math.min(el.naturalWidth || 400, 480);
    const h = Math.round((el.naturalHeight || 300) * (w / (el.naturalWidth || 400)));
    runs.push(new ImageRun({ data: bytes, transformation: { width: w, height: h }, type: "png" }));
  }
}

export async function editorHtmlToDocxBlob(root: HTMLElement, title: string): Promise<Blob> {
  const blocks = Array.from(root.children).filter((n) => n instanceof HTMLElement) as HTMLElement[];
  const children: Paragraph[] = [];
  if (blocks.length === 0) {
    // Sem blocos: trata o texto direto.
    const runs: (TextRun | ImageRun)[] = []; const imgs: { el: HTMLImageElement; style: RunStyle }[] = [];
    collectRuns(root, {}, runs, imgs); await appendImages(runs, imgs);
    children.push(new Paragraph({ children: runs, alignment: AlignmentType.JUSTIFIED }));
  } else {
    for (const b of blocks) children.push(...(await blockToParagraphs(b)));
  }

  const doc = new Document({
    numbering: { config: [{ reference: "num", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    styles: { default: { document: { run: { font: FONT, size: BASE } } } },
    sections: [{ properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 } } }, children }],
  });
  return Packer.toBlob(doc);
}
