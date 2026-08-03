// Geração de trabalhos acadêmicos e apresentações para a Nina entregar pelo
// WhatsApp: usa a MESMA IA do bot (sem API externa) e monta .docx / .pdf / .pptx
// como Buffer, prontos para enviar.
import Anthropic from "@anthropic-ai/sdk";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
} from "docx";
import PDFDocument from "pdfkit";
import pptxgen from "pptxgenjs";

// ---- chamada de IA (mesmo provedor/chave do bot) que devolve texto ----
// `imagem` ({ b64, mime }) é opcional: quando vem, o modelo OLHA a imagem — é
// assim que a Nina lê a capa de um modelo fotografado ou printado.
async function askModel(provider, key, system, userMsg, imagem = null) {
  if (provider === "gemini") {
    const parts = [{ text: userMsg }];
    if (imagem) parts.push({ inline_data: { mime_type: imagem.mime, data: imagem.b64 } });
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }] }) }
    );
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ?? "";
  }
  if (provider === "openai") {
    const content = imagem
      ? [{ type: "text", text: userMsg }, { type: "image_url", image_url: { url: `data:${imagem.mime};base64,${imagem.b64}` } }]
      : userMsg;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: system }, { role: "user", content }] }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
  const anthropic = new Anthropic({ apiKey: key });
  const content = imagem
    ? [{ type: "image", source: { type: "base64", media_type: imagem.mime, data: imagem.b64 } }, { type: "text", text: userMsg }]
    : userMsg;
  const res = await anthropic.messages.create({ model: "claude-sonnet-5", max_tokens: 8000, system, messages: [{ role: "user", content }] });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function parseJson(text) {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) t = fence[1].trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch { return null; }
}

// ---- TRABALHO ACADÊMICO ----
export async function generateWork(provider, key, input) {
  const paginas = Math.min(Math.max(Number(input.paginas) || 8, 1), 60);
  const system =
    `Você é um redator acadêmico brasileiro. Escreva um trabalho COMPLETO em português${input.abnt === false ? "" : " seguindo normas ABNT"}, com profundidade de ~${paginas} páginas.\n` +
    `Estruture com Introdução, Desenvolvimento (seções numeradas) e Conclusão, cada seção com parágrafos reais e desenvolvidos. Referências plausíveis em ABNT.\n` +
    `Responda SOMENTE com JSON: {"titulo":"...","resumo":"...","palavras_chave":["..."],"secoes":[{"titulo":"1 INTRODUÇÃO","conteudo":"..."}],"referencias":["..."]}`;
  const userMsg =
    `Tema/título: ${input.tema}\n` +
    (input.curso ? `Curso: ${input.curso}\n` : "") + (input.nivel ? `Nível: ${input.nivel}\n` : "") +
    (input.instituicao ? `Instituição: ${input.instituicao}\n` : "") + (input.observacoes ? `Observações: ${input.observacoes}\n` : "") +
    `Tamanho: ${paginas} páginas.\nGere o trabalho no formato JSON pedido.`;
  const o = parseJson(await askModel(provider, key, system, userMsg));
  if (!o || !Array.isArray(o.secoes) || !o.secoes.length) return null;
  return {
    titulo: String(o.titulo || input.tema || "Trabalho"),
    resumo: String(o.resumo || ""),
    palavras_chave: Array.isArray(o.palavras_chave) ? o.palavras_chave.map(String) : [],
    secoes: o.secoes.map((s) => ({ titulo: String(s.titulo || ""), conteudo: String(s.conteudo || "") })),
    referencias: Array.isArray(o.referencias) ? o.referencias.map(String) : [],
  };
}

// ---- ARQUIVO-MODELO → NORMA SOB MEDIDA ----
//
// A pessoa manda o modelo da própria faculdade (o PDF do manual, um trabalho
// antigo, a foto da capa) e a formatação sai DELE, em vez de a Nina chutar uma
// norma parecida. O que o modelo devolve é só uma proposta: quem valida campo a
// campo é `resolveNorm` no app — margem, fonte e citação inventadas são
// descartadas lá, então uma leitura ruim nunca vira um documento fora de norma.
const NORMA_SYS =
  `Você analisa um MODELO de trabalho acadêmico (manual de normas, trabalho pronto ou foto da capa) e extrai a FORMATAÇÃO exigida.\n` +
  `Extraia SOMENTE o que estiver realmente visível/escrito no material. O que não der para saber, DEIXE DE FORA do JSON (não invente, não preencha com padrão).\n` +
  `Medidas de margem em CENTÍMETROS (número). fontSize no formato "12pt". lineHeight como número (1, 1.5, 2). indent = recuo da primeira linha do parágrafo, em cm.\n` +
  `norma_base: escolha a mais próxima entre "abnt" (Brasil/ABNT), "apa-upds" (UPDS Domingo Savio, citação APA), "upds-inv4" (UPDS trabalho de investigação, citação Vancouver) e "uap" (Universidad Amazónica de Pando).\n` +
  `capaMoldura = true só se a capa tiver uma BORDA/moldura desenhada em volta da página inteira.\n` +
  `Responda SOMENTE com JSON:\n` +
  `{"norma_base":"abnt","nome":"","citacao":"ABNT|APA|Vancouver","capaMoldura":false,"capaAlinhamento":"center|left","capaLinhaExtra":"",` +
  `"page":{"paper":"a4|carta","margins":{"mt":3,"mb":2,"ml":3,"mr":2},"fontSize":"12pt","lineHeight":1.5,"indent":1.25},` +
  `"capa":{"universidade":"","faculdade":"","carreira":"","disciplina":"","professor":"","cidade":""},` +
  `"tem_logo":false,"resumo_do_que_encontrei":"uma frase em português"}`;

const CITACOES = new Set(["APA", "Vancouver", "ABNT"]);
const NORMAS_BASE = new Set(["abnt", "apa-upds", "upds-inv4", "uap"]);
const soTexto = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const soNumero = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/**
 * @param {{ texto?: string, imagem?: { b64: string, mime: string }, nomeArquivo?: string }} fonte
 * @returns {Promise<null | { norma_base: string, custom: object, capa: object, tem_logo: boolean, resumo: string }>}
 */
export async function extractNorm(provider, key, fonte) {
  const texto = String(fonte?.texto || "").trim();
  if (!texto && !fonte?.imagem) return null;
  const userMsg = texto
    // O começo tem a capa e a folha de rosto; o fim costuma ter as referências,
    // que denunciam o estilo de citação.
    ? `Arquivo: ${fonte.nomeArquivo || "modelo"}\n\nCONTEÚDO:\n${texto.slice(0, 24000)}${texto.length > 30000 ? `\n\n[...]\n\nFINAL DO ARQUIVO:\n${texto.slice(-6000)}` : ""}\n\nExtraia a formatação no JSON pedido.`
    : `Esta imagem é o modelo (provavelmente a capa). Extraia a formatação no JSON pedido.`;

  const o = parseJson(await askModel(provider, key, NORMA_SYS, userMsg, fonte.imagem || null));
  if (!o) return null;

  const m = o.page?.margins ?? {};
  const custom = {
    nome: soTexto(o.nome),
    citacao: CITACOES.has(o.citacao) ? o.citacao : undefined,
    capaMoldura: typeof o.capaMoldura === "boolean" ? o.capaMoldura : undefined,
    capaAlinhamento: o.capaAlinhamento === "left" || o.capaAlinhamento === "center" ? o.capaAlinhamento : undefined,
    capaLinhaExtra: soTexto(o.capaLinhaExtra),
    page: {
      paper: o.page?.paper === "carta" || o.page?.paper === "a4" ? o.page.paper : undefined,
      fontSize: /^\d{1,2}(\.\d)?pt$/.test(String(o.page?.fontSize)) ? String(o.page.fontSize) : undefined,
      lineHeight: soNumero(o.page?.lineHeight),
      indent: soNumero(o.page?.indent),
      margins: { mt: soNumero(m.mt), mb: soNumero(m.mb), ml: soNumero(m.ml), mr: soNumero(m.mr) },
    },
  };
  const capa = {};
  for (const campo of ["universidade", "faculdade", "carreira", "disciplina", "professor", "cidade"]) {
    const v = soTexto(o.capa?.[campo]);
    if (v) capa[campo] = v;
  }
  return {
    norma_base: NORMAS_BASE.has(o.norma_base) ? o.norma_base : "abnt",
    custom,
    capa,
    tem_logo: !!o.tem_logo,
    resumo: soTexto(o.resumo_do_que_encontrei) || "Li o modelo e peguei a formatação que deu para identificar.",
  };
}

const FONT = "Times New Roman";
export async function buildDocx(work, meta = {}) {
  const P = (text, o = {}) => new Paragraph({ alignment: o.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED, spacing: { line: 360, after: 120 }, children: [new TextRun({ text, bold: o.bold, size: o.size || 24, font: FONT })] });
  const body = (c) => String(c || "").split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 360, after: 120 }, indent: { firstLine: 708 }, children: [new TextRun({ text: p, size: 24, font: FONT })] }));
  const ano = meta.ano || new Date().getFullYear();
  const children = [
    P(meta.instituicao || "", { bold: true, center: true }), P(meta.curso || "", { center: true }),
    new Paragraph({ spacing: { after: 1200 }, children: [] }), P(meta.autor || "", { center: true }),
    new Paragraph({ spacing: { after: 2400 }, children: [] }), P(work.titulo, { bold: true, center: true, size: 28 }),
    new Paragraph({ spacing: { after: 3600 }, children: [] }), P(meta.cidade || "", { center: true }), P(String(ano), { center: true }),
  ];
  if (work.resumo) { children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "RESUMO", bold: true, size: 24, font: FONT })] }), ...body(work.resumo)); if (work.palavras_chave?.length) children.push(P(`Palavras-chave: ${work.palavras_chave.join("; ")}.`)); }
  work.secoes.forEach((s, i) => { children.push(new Paragraph({ pageBreakBefore: i === 0, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 }, children: [new TextRun({ text: (s.titulo || "").toUpperCase(), bold: true, size: 24, font: FONT })] }), ...body(s.conteudo)); });
  if (work.referencias?.length) { children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "REFERÊNCIAS", bold: true, size: 24, font: FONT })] })); work.referencias.forEach((r) => children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: r, size: 24, font: FONT })] }))); }
  const doc = new Document({ styles: { default: { document: { run: { font: FONT, size: 24 } } } }, sections: [{ properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 } } }, children }] });
  return Packer.toBuffer(doc);
}

export function buildPdf(work, meta = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: 85, bottom: 57, left: 85, right: 57 } });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
      const ano = meta.ano || new Date().getFullYear();
      doc.font("Times-Bold").fontSize(12);
      doc.moveDown(2).text(meta.instituicao || "", { align: "center" });
      doc.font("Times-Roman").text(meta.curso || "", { align: "center" });
      doc.moveDown(6).text(meta.autor || "", { align: "center" });
      doc.moveDown(4).font("Times-Bold").fontSize(14).text(work.titulo, { align: "center" });
      doc.font("Times-Roman").fontSize(12);
      doc.moveDown(10).text(meta.cidade || "", { align: "center" }).text(String(ano), { align: "center" });
      if (work.resumo) { doc.addPage().font("Times-Bold").text("RESUMO", { align: "center" }).moveDown(); doc.font("Times-Roman").text(work.resumo, { align: "justify", lineGap: 4 }); if (work.palavras_chave?.length) doc.moveDown().text(`Palavras-chave: ${work.palavras_chave.join("; ")}.`); }
      work.secoes.forEach((s, i) => { if (i === 0) doc.addPage(); else doc.moveDown(1.2); doc.font("Times-Bold").fontSize(12).text((s.titulo || "").toUpperCase()); doc.moveDown(0.4).font("Times-Roman"); String(s.conteudo || "").split(/\n+/).filter(Boolean).forEach((p) => doc.text(p.trim(), { align: "justify", lineGap: 4, indent: 24 })); });
      if (work.referencias?.length) { doc.addPage().font("Times-Bold").text("REFERÊNCIAS", { align: "center" }).moveDown(); doc.font("Times-Roman"); work.referencias.forEach((r) => doc.text(r, { lineGap: 3 }).moveDown(0.3)); }
      doc.end();
    } catch (e) { reject(e); }
  });
}

// ---- APRESENTAÇÃO (slides) ----
export async function generateDeck(provider, key, input) {
  const n = Math.min(Math.max(Number(input.slides) || 8, 3), 20);
  const system =
    `Você cria apresentações claras em português. Gere ${n} slides sobre o tema; o 1º é a capa (título + subtítulo). Cada slide: título curto e 3 a 5 tópicos (frases curtas).\n` +
    `Responda SOMENTE com JSON: {"titulo":"...","slides":[{"titulo":"...","topicos":["..."],"nota":""}]}`;
  const o = parseJson(await askModel(provider, key, system, `Tema: ${input.tema}\nGere os ${n} slides em JSON.`));
  if (!o || !Array.isArray(o.slides) || !o.slides.length) return null;
  return { titulo: String(o.titulo || input.tema || "Apresentação"), slides: o.slides.map((s) => ({ titulo: String(s.titulo || ""), topicos: Array.isArray(s.topicos) ? s.topicos.map(String).slice(0, 8) : [], nota: String(s.nota || "") })) };
}

export async function buildPptx(deck) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  const th = { bg: "0B1220", title: "FFFFFF", text: "CBD5E1", accent: "3B82F6" };
  deck.slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: th.bg };
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
  return pptx.write({ outputType: "nodebuffer" });
}

const safe = (s) => String(s || "arquivo").replace(/[\\/:*?"<>|]+/g, "").slice(0, 50).trim() || "arquivo";
export const fileName = safe;
