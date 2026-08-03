import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { modelById } from "@/lib/doc-templates";
import { EMPTY_RESUME, RESUME_PAGE, renderResumeHtml, type Resume } from "@/lib/doc-templates/resume";
import { buildResumeDocxBlob } from "@/lib/doc-templates/resume-docx";
import { normOf, renderAcademicHtml, type AcademicDoc } from "@/lib/doc-templates/academic";
import {
  BUSINESS_PAGE, EMPTY_CONTRATO, EMPTY_ORCAMENTO, EMPTY_QUESTIONARIO, EMPTY_RESUMO as EMPTY_RES,
  renderContratoHtml, renderOrcamentoHtml, renderQuestionarioHtml, renderResumoHtml,
  type Contrato, type DocCompany, type Orcamento, type Questionario, type Resumo,
} from "@/lib/doc-templates/business";
import { editorHtmlToDocxBlob } from "@/lib/studio-docx";
import type { PageSetup } from "@/lib/doc-templates/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Monta o .docx de qualquer modelo do Estúdio, no SERVIDOR.
//
// Existe para a Nina: o serviço do WhatsApp roda em Node puro, sem navegador,
// e portanto não consegue usar os construtores de documento (que dependem de
// DOM). Em vez de reescrever tudo lá — e ter duas versões para divergir —, ele
// chama esta rota e recebe o arquivo pronto.
//
// O DOM vem do linkedom (leve, sem binário nativo); os construtores são
// exatamente os mesmos que o site usa no navegador.

function docCompanyFrom(row: Record<string, unknown> | null): DocCompany {
  if (!row) return {};
  return {
    // O nome da EMPRESA vem primeiro. Antes isto preferia logistics_razao_social
    // (campo do TransLog) e vazava o nome da transportadora para contratos e
    // orçamentos de quem já tinha usado a Logística.
    nome: row.name as string, razao_social: row.name as string,
    cnpj: row.logistics_cnpj as string, ie: row.logistics_ie as string,
    endereco: row.address as string, phone: row.phone as string, email: row.email as string,
    logo_url: row.logo_url as string,
  };
}

// Baixa uma imagem e devolve como data URL. O construtor do .docx só embute
// bytes — um src http viraria um espaço em branco no arquivo entregue.
async function inlineImage(src: string): Promise<string | null> {
  const url = String(src || "").trim();
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const mime = resp.headers.get("content-type")?.split(";")[0] || "image/png";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    // Uma capa não precisa de imagem gigante, e o .docx vai por WhatsApp.
    if (buf.byteLength > 5_000_000) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Envolve o HTML num documento e devolve o <body> como raiz para o conversor. */
function bodyOf(html: string): HTMLElement {
  // O <style> é só para a tela/PDF; no .docx atrapalharia virando texto solto.
  const clean = html.replace(/<style>[\s\S]*?<\/style>/gi, "");
  const { document } = parseHTML(`<!doctype html><html><body>${clean}</body></html>`);
  return document.body as unknown as HTMLElement;
}

async function toBase64(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

export async function POST(request: Request) {
  const body = (await request.json()) as { model?: string; data?: Record<string, unknown>; titulo?: string; company_id?: string };
  const { model, data, titulo } = body;

  // Dois caminhos de entrada:
  // • navegador — token do usuário, RLS aplicada normalmente;
  // • serviço do WhatsApp (Nina) — segredo compartilhado + company_id explícito,
  //   porque lá não existe usuário logado. Sem o company_id o cabeçalho sairia
  //   com os dados de uma empresa qualquer, já que a service role vê todas.
  const secret = request.headers.get("x-service-secret");
  const isService = !!secret && !!process.env.WHATSAPP_SERVICE_SECRET && secret === process.env.WHATSAPP_SERVICE_SECRET;
  const client = isService ? supabaseService() : supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (isService && !body.company_id) return NextResponse.json({ error: "company_id é obrigatório na chamada de serviço." }, { status: 400 });

  const def = model ? modelById(model) : null;
  if (!def || def.status !== "pronto") return NextResponse.json({ error: "Modelo não suportado." }, { status: 400 });

  let q = client.from("company_settings").select("name, logo_url, address, phone, email, logistics_razao_social, logistics_cnpj, logistics_ie");
  if (body.company_id) q = q.eq("company_id", body.company_id);
  const { data: cs } = await q.maybeSingle();
  const empresa = docCompanyFrom(cs as Record<string, unknown> | null);

  const d = (data ?? {}) as Record<string, unknown>;
  let html = "";
  let page: PageSetup = def.page;
  let nome = titulo?.trim() || def.label;
  let docx: Blob | null = null;

  try {
    if (model === "curriculo") {
      const r: Resume = { ...EMPTY_RESUME(), ...(d as Partial<Resume>) } as Resume;
      html = renderResumeHtml(r);
      page = RESUME_PAGE;
      nome = titulo?.trim() || r.name || "Currículo";
      // O currículo tem construtor próprio (monta a partir dos dados, não do HTML).
      docx = await buildResumeDocxBlob(r);
    } else if (model === "monografia" || model === "trabalho") {
      const doc = d as unknown as AcademicDoc;
      // A logo da capa pode chegar como link (upload do site). O .docx só embute
      // bytes, então o link vira data URL antes de montar o documento.
      if (doc.capa?.logo_url) doc.capa = { ...doc.capa, logo_url: (await inlineImage(doc.capa.logo_url)) ?? "" };
      const norma = normOf(doc);
      html = renderAcademicHtml(doc);
      page = norma.page;
      nome = titulo?.trim() || doc.capa?.titulo || def.label;
    } else if (model === "contrato") {
      html = renderContratoHtml({ ...EMPTY_CONTRATO(), ...(d as Partial<Contrato>) } as Contrato, empresa);
      page = BUSINESS_PAGE;
    } else if (model === "orcamento") {
      html = renderOrcamentoHtml({ ...EMPTY_ORCAMENTO(), ...(d as Partial<Orcamento>) } as Orcamento, empresa);
      page = BUSINESS_PAGE;
    } else if (model === "questionario") {
      html = renderQuestionarioHtml({ ...EMPTY_QUESTIONARIO(), ...(d as Partial<Questionario>) } as Questionario, empresa);
      page = BUSINESS_PAGE;
    } else if (model === "resumo" || model === "resumao") {
      html = renderResumoHtml({ ...EMPTY_RES(), ...(d as Partial<Resumo>) } as Resumo, empresa, model === "resumao");
      page = BUSINESS_PAGE;
    } else {
      return NextResponse.json({ error: "Modelo não suportado." }, { status: 400 });
    }

    if (!docx) docx = await editorHtmlToDocxBlob(bodyOf(html), nome, page);
  } catch (err) {
    console.error("studio/render falhou:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao montar o documento." }, { status: 500 });
  }

  return NextResponse.json({
    nome,
    // O HTML volta junto para quem quiser gerar o PDF ou mostrar uma prévia.
    html,
    docx_base64: await toBase64(docx),
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
