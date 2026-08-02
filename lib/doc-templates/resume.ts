// Currículo — modelo de dados + os 4 temas visuais.
//
// Base: o projeto Curriculy (repo Delta-1/Curriculy), reescrito aqui com ESTILO
// INLINE em vez de classes Tailwind. Motivo: o mesmo HTML precisa renderizar
// idêntico em três lugares — prévia na tela, janela de impressão/PDF e conversão
// para .docx. Com classes, a janela de impressão saía sem estilo nenhum.
//
// O Curriculy exportava PDF via html2pdf (que fotografa a tela e rasteriza).
// Era a origem dos problemas de margem: a folha saía cortada ou com sobra,
// porque a medida vinha do zoom da tela, não da folha. Aqui a folha é declarada
// em cm com @page, então a margem é sempre exatamente a pedida.

import type { PageSetup } from "./types";

export type ResumeExperience = { role: string; company: string; period: string; description: string };
export type ResumeEducation = { degree: string; institution: string; period: string };

export type Resume = {
  name: string;
  title: string;
  phone: string;
  email: string;
  location: string;
  photo: string; // dataURL ou "" (sem foto)
  photoSize: number; // % (100 = tamanho padrão do tema)
  about: string;
  keywords: string[]; // palavras-chave para leitura por ATS
  skills: string[];
  experiences: ResumeExperience[];
  education: ResumeEducation[];
  theme: ResumeThemeId;
  accent: string;
};

export type ResumeThemeId = "executive" | "minimalist" | "creative" | "modern";

export const RESUME_THEMES: { id: ResumeThemeId; label: string; desc: string }[] = [
  { id: "executive", label: "Executivo", desc: "Clássico e sóbrio. Foto à direita, seções com linha divisória." },
  { id: "minimalist", label: "Mínimo", desc: "Nome grande e leve, contatos alinhados à direita. Muito espaço em branco." },
  { id: "creative", label: "Criativo", desc: "Faixa colorida no topo com foto redonda centralizada." },
  { id: "modern", label: "Moderno", desc: "Duas colunas: barra lateral com contato e habilidades." },
];

// Currículo é sempre A4 com margem enxuta — é o formato que RH espera.
export const RESUME_PAGE: PageSetup = {
  paper: "a4",
  margins: { mt: 1.4, mb: 1.4, ml: 1.4, mr: 1.4 },
  font: "'Inter', 'Segoe UI', Arial, Helvetica, sans-serif",
  fontSize: "10.5pt",
  lineHeight: 1.45,
  indent: 0,
};

export const EMPTY_RESUME = (name = "", accent = "#4f46e5"): Resume => ({
  name: name || "Seu nome",
  title: "Cargo desejado",
  phone: "",
  email: "",
  location: "",
  photo: "",
  photoSize: 100,
  about: "",
  keywords: [],
  skills: [],
  experiences: [],
  education: [],
  theme: "executive",
  accent,
});

// ── helpers ─────────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
/** Texto multilinha do usuário → HTML preservando as quebras. */
function multiline(v: string): string {
  return esc(v).replace(/\n/g, "<br>");
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { r: 79, g: 70, b: 229 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
/** Preto ou branco por cima da cor — mantém o texto legível em qualquer accent. */
function contrastOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 140 ? "#0f172a" : "#ffffff";
}
const soft = (hex: string, a: number) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

// Blocos que não devem ser partidos entre páginas na impressão.
const NOBREAK = "page-break-inside:avoid;break-inside:avoid";

function contactLine(r: Resume, sep = " • "): string {
  return [r.phone, r.email, r.location].filter(Boolean).map(esc).join(sep);
}

function photoTag(r: Resume, base: number, radius: string, border: string): string {
  if (!r.photo) return "";
  const s = Math.round(base * (r.photoSize || 100) / 100);
  return `<img src="${esc(r.photo)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:${radius};${border};flex-shrink:0" />`;
}

function sectionTitle(text: string, color: string, borderColor: string): string {
  return `<h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${color};margin:0 0 6px;padding-bottom:3px;border-bottom:1px solid ${borderColor}">${esc(text)}</h3>`;
}

function expItems(r: Resume, accent: string): string {
  return r.experiences.map((e) => `
    <div style="position:relative;padding-left:14px;margin-bottom:10px;${NOBREAK}">
      <span style="position:absolute;left:0;top:4px;width:6px;height:6px;border-radius:50%;background:${accent}"></span>
      <div style="font-size:10.5pt;font-weight:700;color:#0f172a">${esc(e.role)}</div>
      <div style="font-size:8.5pt;color:#64748b;font-weight:500">${[e.company, e.period].filter(Boolean).map(esc).join(" · ")}</div>
      ${e.description ? `<div style="font-size:9.5pt;color:#475569;margin-top:3px;line-height:1.5">${multiline(e.description)}</div>` : ""}
    </div>`).join("");
}

function eduItems(r: Resume, accent: string): string {
  return r.education.map((e) => `
    <div style="position:relative;padding-left:14px;margin-bottom:8px;${NOBREAK}">
      <span style="position:absolute;left:0;top:4px;width:6px;height:6px;border-radius:50%;background:${accent}"></span>
      <div style="font-size:9.5pt;font-weight:700;color:#0f172a">${esc(e.degree)}</div>
      <div style="font-size:8.5pt;color:#64748b">${[e.institution, e.period].filter(Boolean).map(esc).join(" · ")}</div>
    </div>`).join("");
}

function chips(items: string[], bg: string, fg: string, border: string): string {
  return items.map((s) => `<span style="display:inline-block;font-size:8.5pt;font-weight:600;padding:3px 8px;border-radius:4px;background:${bg};color:${fg};border:1px solid ${border};margin:0 5px 5px 0">${esc(s)}</span>`).join("");
}

// ── temas ───────────────────────────────────────────────────────────────────

function renderExecutive(r: Resume): string {
  const a = r.accent;
  return `
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:12px;border-bottom:1px solid #e2e8f0">
  <div>
    <div style="font-size:21pt;font-weight:700;color:#0f172a;line-height:1.15">${esc(r.name)}</div>
    <div style="font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${a};margin-top:3px">${esc(r.title)}</div>
    <div style="font-size:8.5pt;color:#64748b;margin-top:5px">${contactLine(r)}</div>
  </div>
  ${photoTag(r, 84, "10px", "border:1px solid #e2e8f0")}
</div>
${r.about ? `<div style="margin-top:14px">${sectionTitle("Resumo", "#0f172a", "#e2e8f0")}<div style="font-size:9.5pt;color:#475569;line-height:1.55">${multiline(r.about)}</div></div>` : ""}
${r.experiences.length ? `<div style="margin-top:14px">${sectionTitle("Experiência", "#0f172a", "#e2e8f0")}${expItems(r, "#cbd5e1")}</div>` : ""}
<div style="display:flex;gap:24px;margin-top:14px">
  ${r.education.length ? `<div style="flex:1">${sectionTitle("Formação", "#0f172a", "#e2e8f0")}${eduItems(r, "#cbd5e1")}</div>` : ""}
  ${r.skills.length ? `<div style="flex:1">${sectionTitle("Habilidades", "#0f172a", "#e2e8f0")}<div>${chips(r.skills, soft(a, 0.1), a, soft(a, 0.3))}</div></div>` : ""}
</div>
${r.keywords.length ? `<div style="margin-top:12px">${sectionTitle("Palavras-chave", "#0f172a", "#e2e8f0")}<div>${chips(r.keywords, "#f1f5f9", "#334155", "#e2e8f0")}</div></div>` : ""}`;
}

function renderMinimalist(r: Resume): string {
  const a = r.accent;
  return `
<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:10px;border-bottom:2px solid ${a}">
  <div>
    <div style="font-size:26pt;font-weight:300;text-transform:uppercase;letter-spacing:.02em;color:#0f172a;line-height:1.1">${esc(r.name)}</div>
    <div style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:${a};margin-top:4px">${esc(r.title)}</div>
  </div>
  <div style="text-align:right;font-size:8.5pt;color:#64748b;line-height:1.6">
    ${[r.phone, r.email, r.location].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("")}
  </div>
</div>
${r.about ? `<div style="margin-top:16px"><h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#0f172a;margin:0 0 5px">Resumo</h3><div style="font-size:9.5pt;color:#475569;line-height:1.55">${multiline(r.about)}</div></div>` : ""}
${r.experiences.length ? `<div style="margin-top:16px"><h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#0f172a;margin:0 0 8px">Experiência</h3>${expItems(r, a)}</div>` : ""}
${r.education.length ? `<div style="margin-top:16px"><h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#0f172a;margin:0 0 8px">Formação</h3>${eduItems(r, a)}</div>` : ""}
${r.skills.length ? `<div style="margin-top:16px"><h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#0f172a;margin:0 0 6px">Habilidades</h3><div style="font-size:9.5pt;color:#475569">${r.skills.map(esc).join(" &nbsp;·&nbsp; ")}</div></div>` : ""}
${r.keywords.length ? `<div style="margin-top:14px"><h3 style="font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#0f172a;margin:0 0 6px">Palavras-chave</h3><div>${chips(r.keywords, "#f8fafc", "#475569", "#e2e8f0")}</div></div>` : ""}`;
}

function renderCreative(r: Resume): string {
  const a = r.accent;
  const on = contrastOn(a);
  // A faixa sangra até a borda: compensa a margem da folha com margem negativa.
  return `
<div style="margin:-1.4cm -1.4cm 0;padding:22px 1.4cm 18px;background:${a};color:${on};text-align:center">
  ${r.photo ? `<div style="margin-bottom:10px">${photoTag(r, 92, "50%", `border:3px solid ${on === "#ffffff" ? "rgba(255,255,255,.6)" : "rgba(15,23,42,.2)"}`)}</div>` : ""}
  <div style="font-size:22pt;font-weight:700;line-height:1.15">${esc(r.name)}</div>
  <div style="font-size:9.5pt;font-weight:600;text-transform:uppercase;letter-spacing:.14em;opacity:.9;margin-top:4px">${esc(r.title)}</div>
  <div style="font-size:8.5pt;opacity:.85;margin-top:8px">${contactLine(r)}</div>
</div>
${r.about ? `<div style="margin-top:16px">${sectionTitle("Sobre mim", a, soft(a, 0.3))}<div style="font-size:9.5pt;color:#475569;line-height:1.55">${multiline(r.about)}</div></div>` : ""}
${r.experiences.length ? `<div style="margin-top:14px">${sectionTitle("Experiência", a, soft(a, 0.3))}${expItems(r, a)}</div>` : ""}
${r.education.length ? `<div style="margin-top:14px">${sectionTitle("Formação", a, soft(a, 0.3))}${eduItems(r, a)}</div>` : ""}
${r.skills.length ? `<div style="margin-top:14px">${sectionTitle("Habilidades", a, soft(a, 0.3))}<div>${chips(r.skills, soft(a, 0.1), a, soft(a, 0.3))}</div></div>` : ""}
${r.keywords.length ? `<div style="margin-top:12px">${sectionTitle("Palavras-chave", a, soft(a, 0.3))}<div>${chips(r.keywords, "#f1f5f9", "#334155", "#e2e8f0")}</div></div>` : ""}`;
}

function renderModern(r: Resume): string {
  const a = r.accent;
  const side = `
    ${r.photo ? `<div style="margin-bottom:14px;text-align:center">${photoTag(r, 78, "12px", "border:1px solid " + soft(a, 0.3))}</div>` : ""}
    ${[r.phone, r.email, r.location].filter(Boolean).length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:${a};margin-bottom:5px">Contato</div>
        ${[r.phone, r.email, r.location].filter(Boolean).map((x) => `<div style="font-size:8.5pt;color:#475569;margin-bottom:3px;word-break:break-word">${esc(x)}</div>`).join("")}
      </div>` : ""}
    ${r.skills.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:${a};margin-bottom:5px">Habilidades</div>
        ${r.skills.map((s) => `<div style="font-size:8.5pt;color:#475569;margin-bottom:3px">${esc(s)}</div>`).join("")}
      </div>` : ""}
    ${r.keywords.length ? `
      <div>
        <div style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:${a};margin-bottom:5px">Palavras-chave</div>
        <div>${chips(r.keywords, "#fff", "#475569", "#e2e8f0")}</div>
      </div>` : ""}`;
  return `
<div style="display:flex;gap:18px;align-items:flex-start">
  <div style="width:32%;flex-shrink:0;background:${soft(a, 0.07)};border-radius:10px;padding:14px">${side}</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:20pt;font-weight:700;color:#0f172a;line-height:1.15">${esc(r.name)}</div>
    <div style="font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${a};margin-top:3px">${esc(r.title)}</div>
    ${r.about ? `<div style="margin-top:12px">${sectionTitle("Perfil", "#0f172a", "#e2e8f0")}<div style="font-size:9.5pt;color:#475569;line-height:1.55">${multiline(r.about)}</div></div>` : ""}
    ${r.experiences.length ? `<div style="margin-top:14px">${sectionTitle("Experiência", "#0f172a", "#e2e8f0")}${expItems(r, a)}</div>` : ""}
    ${r.education.length ? `<div style="margin-top:14px">${sectionTitle("Formação", "#0f172a", "#e2e8f0")}${eduItems(r, a)}</div>` : ""}
  </div>
</div>`;
}

/** HTML do MIOLO do currículo (sem <html>/<body>) — usado na prévia e na impressão. */
export function renderResumeHtml(r: Resume): string {
  switch (r.theme) {
    case "minimalist": return renderMinimalist(r);
    case "creative": return renderCreative(r);
    case "modern": return renderModern(r);
    default: return renderExecutive(r);
  }
}
