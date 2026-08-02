// Apresentações — temas e layouts de slide.
//
// Fica separado de studio-pptx.ts de propósito: a prévia na tela e o PDF só
// precisam disto, e importar de lá arrastaria o pptxgenjs (pesado) para dentro
// do bundle da aba, mesmo sem ninguém exportar .pptx.

export type SlideLayout = "capa" | "topicos" | "secao" | "duas" | "citacao" | "final";

export type Slide = {
  titulo: string;
  topicos: string[];
  nota?: string;
  layout?: SlideLayout;
};
export type Deck = { titulo: string; tema?: string; slides: Slide[] };

/** Decoração do slide — o que diferencia visualmente um tema do outro. */
export type DeckDeco = "bar" | "side" | "block" | "frame" | "minimal";

export type DeckTheme = {
  id: string;
  label: string;
  /** Cores em hex SEM "#": o pptxgenjs exige assim; a web recebe o "#" na hora. */
  bg: string;
  title: string;
  text: string;
  accent: string;
  deco: DeckDeco;
  serif?: boolean;
  /** Fundo mais claro/escuro usado por alguns temas em faixas e blocos. */
  bg2?: string;
};

export const DECK_THEMES: DeckTheme[] = [
  { id: "azul", label: "Azul", bg: "0B1220", title: "FFFFFF", text: "CBD5E1", accent: "3B82F6", deco: "bar" },
  { id: "claro", label: "Claro", bg: "FFFFFF", title: "0F172A", text: "334155", accent: "2563EB", deco: "bar" },
  { id: "roxo", label: "Roxo", bg: "1E1B4B", title: "FFFFFF", text: "DDD6FE", accent: "A78BFA", deco: "bar" },
  { id: "verde", label: "Verde", bg: "052E24", title: "FFFFFF", text: "BBF7D0", accent: "10B981", deco: "bar" },
  { id: "grafite", label: "Grafite", bg: "111318", title: "FFFFFF", text: "D1D5DB", accent: "F59E0B", deco: "bar" },
  { id: "oceano", label: "Oceano", bg: "042F42", title: "FFFFFF", text: "BAE6FD", accent: "06B6D4", deco: "side", bg2: "063B52" },
  { id: "coral", label: "Coral", bg: "FFF7F5", title: "431407", text: "7C2D12", accent: "F97316", deco: "side", bg2: "FFEDE5" },
  { id: "noturno", label: "Noturno", bg: "000000", title: "FFFFFF", text: "9CA3AF", accent: "FFFFFF", deco: "minimal" },
  { id: "papel", label: "Papel", bg: "FBF7EF", title: "1C1917", text: "44403C", accent: "A8A29E", deco: "frame", serif: true },
  { id: "menta", label: "Menta", bg: "F0FDF9", title: "064E3B", text: "115E59", accent: "14B8A6", deco: "block", bg2: "CCFBF1" },
  { id: "vinho", label: "Vinho", bg: "2B0B14", title: "FFF1F2", text: "FDA4AF", accent: "9F1239", deco: "frame", serif: true },
  { id: "solar", label: "Solar", bg: "1C1408", title: "FFFBEB", text: "FDE68A", accent: "F59E0B", deco: "block", bg2: "2A1E0C" },
];

export const themeOf = (id?: string): DeckTheme => DECK_THEMES.find((t) => t.id === id) ?? DECK_THEMES[0];

export const SLIDE_LAYOUTS: { id: SlideLayout; label: string; desc: string }[] = [
  { id: "capa", label: "Capa", desc: "Título grande centralizado com subtítulo." },
  { id: "topicos", label: "Tópicos", desc: "Título e lista de tópicos." },
  { id: "secao", label: "Divisória", desc: "Só um título grande, para abrir um bloco." },
  { id: "duas", label: "Duas colunas", desc: "Tópicos divididos em duas colunas." },
  { id: "citacao", label: "Citação", desc: "Uma frase em destaque, com autoria." },
  { id: "final", label: "Encerramento", desc: "Slide de agradecimento / contato." },
];

/** Layout efetivo: o 1º slide é capa por padrão, os demais são tópicos. */
export const layoutOf = (s: Slide, index: number): SlideLayout => s.layout ?? (index === 0 ? "capa" : "topicos");

const c = (hex: string) => `#${hex}`;
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x] as string));
}

/** Decoração do tema como HTML absoluto dentro do slide. */
function decoHtml(t: DeckTheme): string {
  switch (t.deco) {
    case "bar": return `<div style="position:absolute;top:0;left:0;right:0;height:1.6%;background:${c(t.accent)}"></div>`;
    case "side": return `<div style="position:absolute;top:0;bottom:0;left:0;width:1.4%;background:${c(t.accent)}"></div>`;
    case "block": return `<div style="position:absolute;bottom:0;right:0;width:22%;height:26%;background:${c(t.bg2 ?? t.accent)};border-top-left-radius:100%"></div>`;
    case "frame": return `<div style="position:absolute;inset:3.2%;border:1px solid ${c(t.accent)};opacity:.55;pointer-events:none"></div>`;
    default: return "";
  }
}

/**
 * Um slide como HTML. `scale` casa os tamanhos com o container: na prévia da
 * tela usamos unidades relativas ao próprio slide (cqw não é confiável em todo
 * navegador), então o texto é dimensionado em % da altura do slide.
 */
export function renderSlideHtml(s: Slide, index: number, t: DeckTheme, opts: { unit?: string } = {}): string {
  const u = opts.unit ?? "vh"; // "vh" na impressão (slide = tela cheia)
  const font = t.serif ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', Arial, Helvetica, sans-serif";
  const lay = layoutOf(s, index);
  const box = `position:relative;overflow:hidden;background:${c(t.bg)};color:${c(t.text)};font-family:${font};display:flex;flex-direction:column;justify-content:center;padding:7% 8%`;
  const h1 = `color:${c(t.title)};font-size:6${u};font-weight:700;margin:0;line-height:1.15`;
  const h2 = `color:${c(t.title)};font-size:4.4${u};font-weight:700;margin:0 0 3${u};line-height:1.2`;
  const li = `font-size:2.9${u};line-height:1.75;margin:0;padding-left:1.2em`;

  const bullets = (items: string[]) => `<ul style="${li}">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

  let inner = "";
  if (lay === "capa") {
    inner = `<div style="text-align:center">
      <h1 style="${h1}">${esc(s.titulo)}</h1>
      ${s.topicos?.length ? `<p style="font-size:2.6${u};margin:2.4${u} 0 0;opacity:.9">${esc(s.topicos.join("  •  "))}</p>` : ""}
    </div>`;
  } else if (lay === "secao") {
    inner = `<div style="text-align:center">
      <div style="width:9%;height:.5${u};background:${c(t.accent)};margin:0 auto 3${u}"></div>
      <h1 style="${h1};font-size:5.2${u}">${esc(s.titulo)}</h1>
    </div>`;
  } else if (lay === "citacao") {
    inner = `<div style="text-align:center;padding:0 6%">
      <div style="font-size:8${u};line-height:0;color:${c(t.accent)};opacity:.6">&ldquo;</div>
      <p style="font-size:3.6${u};line-height:1.5;color:${c(t.title)};font-style:italic;margin:1${u} 0 0">${esc(s.titulo)}</p>
      ${s.topicos?.length ? `<p style="font-size:2.3${u};margin-top:2.4${u};opacity:.85">— ${esc(s.topicos[0])}</p>` : ""}
    </div>`;
  } else if (lay === "final") {
    inner = `<div style="text-align:center">
      <h1 style="${h1};font-size:5.4${u}">${esc(s.titulo)}</h1>
      ${s.topicos?.length ? `<p style="font-size:2.7${u};margin-top:2.4${u};opacity:.9">${esc(s.topicos.join("  ·  "))}</p>` : ""}
      <div style="width:14%;height:.5${u};background:${c(t.accent)};margin:3.4${u} auto 0"></div>
    </div>`;
  } else if (lay === "duas") {
    const items = s.topicos ?? [];
    const half = Math.ceil(items.length / 2);
    inner = `<h2 style="${h2}">${esc(s.titulo)}</h2>
      <div style="display:flex;gap:6%">
        <div style="flex:1;min-width:0">${bullets(items.slice(0, half))}</div>
        <div style="flex:1;min-width:0">${bullets(items.slice(half))}</div>
      </div>`;
  } else {
    inner = `<h2 style="${h2}">${esc(s.titulo)}</h2>${s.topicos?.length ? bullets(s.topicos) : ""}`;
  }

  // O box carrega o tema (fundo, cor, fonte e respiro) — sem ele o slide sairia
  // sem estilo nenhum na prévia e no PDF.
  return `<div style="${box};width:100%;height:100%">${decoHtml(t)}${inner}</div>`;
}
