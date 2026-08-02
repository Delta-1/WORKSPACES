// Monta o .pptx da apresentação no navegador com pptxgenjs.
//
// Os tipos e os temas moram em lib/doc-templates/deck.ts — assim a aba de
// slides consegue desenhar a prévia sem arrastar o pptxgenjs para o bundle.
import pptxgen from "pptxgenjs";
import { layoutOf, themeOf, type Deck, type DeckTheme, type Slide } from "./doc-templates/deck";

export type { Deck, Slide } from "./doc-templates/deck";
export { DECK_THEMES, themeOf } from "./doc-templates/deck";

// Slide 16:9 do pptxgenjs: 10 x 5.625 polegadas.
const W = 10;
const H = 5.625;

/** Decoração do tema, desenhada como formas nativas do PowerPoint. */
function addDeco(pptx: pptxgen, slide: pptxgen.Slide, t: DeckTheme) {
  const fill = { color: t.accent };
  if (t.deco === "bar") slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill });
  else if (t.deco === "side") slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.14, h: H, fill });
  else if (t.deco === "block") slide.addShape(pptx.ShapeType.rect, { x: W - 2.2, y: H - 1.45, w: 2.2, h: 1.45, fill: { color: t.bg2 ?? t.accent } });
  else if (t.deco === "frame") slide.addShape(pptx.ShapeType.rect, { x: 0.22, y: 0.2, w: W - 0.44, h: H - 0.4, fill: { type: "none" }, line: { color: t.accent, width: 0.75 } });
}

export async function buildPptxBlob(deck: Deck): Promise<Blob> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  const t = themeOf(deck.tema);
  const face = t.serif ? "Georgia" : "Segoe UI";

  deck.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: t.bg };
    addDeco(pptx, slide, t);
    const lay = layoutOf(s as Slide, i);

    if (lay === "capa") {
      slide.addText(s.titulo || deck.titulo, { x: 0.6, y: 1.9, w: W - 1.2, h: 1.5, fontSize: 40, bold: true, color: t.title, align: "center", fontFace: face });
      if (s.topicos?.length) slide.addText(s.topicos.join("  •  "), { x: 0.6, y: 3.4, w: W - 1.2, h: 0.8, fontSize: 17, color: t.text, align: "center", fontFace: face });
    } else if (lay === "secao") {
      slide.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.45, y: 2.2, w: 0.9, h: 0.05, fill: { color: t.accent } });
      slide.addText(s.titulo, { x: 0.6, y: 2.45, w: W - 1.2, h: 1.1, fontSize: 34, bold: true, color: t.title, align: "center", fontFace: face });
    } else if (lay === "citacao") {
      slide.addText(s.titulo, { x: 1.0, y: 1.8, w: W - 2.0, h: 2.0, fontSize: 24, italic: true, color: t.title, align: "center", valign: "middle", fontFace: face });
      if (s.topicos?.length) slide.addText(`— ${s.topicos[0]}`, { x: 1.0, y: 3.9, w: W - 2.0, h: 0.5, fontSize: 15, color: t.text, align: "center", fontFace: face });
    } else if (lay === "final") {
      slide.addText(s.titulo, { x: 0.6, y: 2.1, w: W - 1.2, h: 1.2, fontSize: 36, bold: true, color: t.title, align: "center", fontFace: face });
      if (s.topicos?.length) slide.addText(s.topicos.join("   ·   "), { x: 0.6, y: 3.3, w: W - 1.2, h: 0.6, fontSize: 16, color: t.text, align: "center", fontFace: face });
    } else if (lay === "duas") {
      slide.addText(s.titulo, { x: 0.7, y: 0.5, w: W - 1.4, h: 0.85, fontSize: 26, bold: true, color: t.title, fontFace: face });
      const items = s.topicos ?? [];
      const half = Math.ceil(items.length / 2);
      const col = (arr: string[]) => arr.map((x) => ({ text: x, options: { bullet: true, color: t.text, fontSize: 15, paraSpaceAfter: 7, fontFace: face } }));
      if (half) slide.addText(col(items.slice(0, half)), { x: 0.85, y: 1.6, w: (W - 2.2) / 2, h: 3.4, valign: "top" });
      if (items.length > half) slide.addText(col(items.slice(half)), { x: 0.85 + (W - 2.2) / 2 + 0.5, y: 1.6, w: (W - 2.2) / 2, h: 3.4, valign: "top" });
    } else {
      slide.addText(s.titulo, { x: 0.7, y: 0.5, w: W - 1.4, h: 0.9, fontSize: 28, bold: true, color: t.title, fontFace: face });
      const bullets = (s.topicos ?? []).map((x) => ({ text: x, options: { bullet: true, color: t.text, fontSize: 17, paraSpaceAfter: 8, fontFace: face } }));
      if (bullets.length) slide.addText(bullets, { x: 0.9, y: 1.6, w: W - 1.8, h: 3.5, valign: "top" });
    }

    if (s.nota) slide.addNotes(s.nota);
  });

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
