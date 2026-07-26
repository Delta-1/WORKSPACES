// Monta o .pptx da apresentação no navegador com pptxgenjs.
import pptxgen from "pptxgenjs";

export type Slide = { titulo: string; topicos: string[]; nota?: string };
export type Deck = { titulo: string; tema?: string; slides: Slide[] };

// Temas de cores (fundo, título, texto, destaque).
export const DECK_THEMES: Record<string, { bg: string; title: string; text: string; accent: string }> = {
  azul: { bg: "0B1220", title: "FFFFFF", text: "CBD5E1", accent: "3B82F6" },
  claro: { bg: "FFFFFF", title: "0F172A", text: "334155", accent: "2563EB" },
  roxo: { bg: "1E1B4B", title: "FFFFFF", text: "DDD6FE", accent: "A78BFA" },
  verde: { bg: "052E24", title: "FFFFFF", text: "BBF7D0", accent: "10B981" },
  grafite: { bg: "111318", title: "FFFFFF", text: "D1D5DB", accent: "F59E0B" },
};

export async function buildPptxBlob(deck: Deck): Promise<Blob> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  const th = DECK_THEMES[deck.tema || "azul"] || DECK_THEMES.azul;

  deck.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: th.bg };
    // Barra de destaque no topo.
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.18, fill: { color: th.accent } });
    if (i === 0) {
      slide.addText(s.titulo || deck.titulo, { x: 0.6, y: 2.1, w: 8.8, h: 1.4, fontSize: 40, bold: true, color: th.title, align: "center" });
      if (s.topicos?.length) slide.addText(s.topicos.join("  •  "), { x: 0.6, y: 3.6, w: 8.8, h: 0.8, fontSize: 18, color: th.text, align: "center" });
    } else {
      slide.addText(s.titulo, { x: 0.6, y: 0.5, w: 8.8, h: 0.9, fontSize: 28, bold: true, color: th.title });
      const bullets = (s.topicos || []).map((t) => ({ text: t, options: { bullet: true, color: th.text, fontSize: 18, paraSpaceAfter: 8 } }));
      if (bullets.length) slide.addText(bullets, { x: 0.8, y: 1.6, w: 8.4, h: 4, valign: "top" });
    }
    if (s.nota) slide.addNotes(s.nota);
  });

  const out = (await pptx.write({ outputType: "blob" })) as Blob;
  return out;
}
