// Currículo → .docx REAL (não HTML renomeado).
//
// Monta o documento a partir dos DADOS estruturados, não do HTML da prévia.
// É o que garante um Word de verdade: cada bloco vira parágrafo nativo, então
// a pessoa abre no Word e edita normalmente, com a margem certa.

import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle, TabStopType,
} from "docx";
import type { Resume } from "./resume";
import { RESUME_PAGE } from "./resume";
import { cmToTwip } from "./types";

const FONT = "Calibri";
const hex = (c: string) => (/^#?([0-9a-f]{6})$/i.exec(String(c).trim())?.[1] ?? "4F46E5").toUpperCase();

// Sem depender de atob: este builder também roda no servidor (rota que a Nina
// usa para montar o currículo e entregar pelo WhatsApp).
function dataUrlToBytes(url: string): Uint8Array | null {
  try {
    const b64 = String(url).split(",")[1];
    if (!b64) return null;
    if (typeof atob === "function") {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

function heading(text: string, accent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9DEE5", space: 3 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: hex(accent), font: FONT, characterSpacing: 20 })],
  });
}
const body = (text: string, opts: { size?: number; color?: string; bold?: boolean; after?: number } = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 60, line: 280 },
    children: [new TextRun({ text, size: opts.size ?? 21, color: opts.color ?? "334155", bold: opts.bold, font: FONT })],
  });

export async function buildResumeDocxBlob(r: Resume): Promise<Blob> {
  const accent = hex(r.accent);
  const children: Paragraph[] = [];

  // Cabeçalho: foto (se houver) + nome + cargo + contatos.
  const photo = r.photo ? dataUrlToBytes(r.photo) : null;
  if (photo) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0 },
      children: [new ImageRun({ data: photo, transformation: { width: 90, height: 90 }, type: "png" })],
    }));
  }
  children.push(new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: r.name, bold: true, size: 42, color: "0F172A", font: FONT })],
  }));
  if (r.title) {
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: r.title.toUpperCase(), bold: true, size: 19, color: accent, font: FONT, characterSpacing: 20 })],
    }));
  }
  const contacts = [r.phone, r.email, r.location].filter(Boolean).join("  •  ");
  if (contacts) {
    children.push(new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9DEE5", space: 6 } },
      children: [new TextRun({ text: contacts, size: 18, color: "64748B", font: FONT })],
    }));
  }

  if (r.about.trim()) {
    children.push(heading("Resumo", accent));
    for (const p of r.about.split(/\n+/).filter(Boolean)) children.push(body(p));
  }

  if (r.experiences.length) {
    children.push(heading("Experiência", accent));
    for (const e of r.experiences) {
      children.push(new Paragraph({
        spacing: { before: 100, after: 10 },
        // Cargo à esquerda e período à direita, alinhados por tabulação.
        tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        children: [
          new TextRun({ text: e.role, bold: true, size: 22, color: "0F172A", font: FONT }),
          ...(e.period ? [new TextRun({ text: `\t${e.period}`, size: 18, color: "64748B", font: FONT })] : []),
        ],
      }));
      if (e.company) children.push(body(e.company, { size: 18, color: "64748B", after: 40 }));
      for (const p of (e.description || "").split(/\n+/).filter(Boolean)) children.push(body(p, { size: 20 }));
    }
  }

  if (r.education.length) {
    children.push(heading("Formação", accent));
    for (const e of r.education) {
      children.push(new Paragraph({
        spacing: { before: 80, after: 10 },
        tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        children: [
          new TextRun({ text: e.degree, bold: true, size: 21, color: "0F172A", font: FONT }),
          ...(e.period ? [new TextRun({ text: `\t${e.period}`, size: 18, color: "64748B", font: FONT })] : []),
        ],
      }));
      if (e.institution) children.push(body(e.institution, { size: 18, color: "64748B", after: 40 }));
    }
  }

  if (r.skills.length) {
    children.push(heading("Habilidades", accent));
    children.push(body(r.skills.join("  •  "), { size: 20 }));
  }
  if (r.keywords.length) {
    children.push(heading("Palavras-chave", accent));
    children.push(body(r.keywords.join("  •  "), { size: 19, color: "64748B" }));
  }

  const m = RESUME_PAGE.margins;
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { margin: { top: cmToTwip(m.mt), right: cmToTwip(m.mr), bottom: cmToTwip(m.mb), left: cmToTwip(m.ml) } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
