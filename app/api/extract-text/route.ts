import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Extrai texto de PDF e Word (docx) para virar "cérebro" do robô.
// Recebe o arquivo em base64 (data URL) e devolve o texto.
export async function POST(request: Request) {
  const { dataUrl, name } = (await request.json()) as { dataUrl?: string; name?: string };
  if (!dataUrl) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });

  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const buffer = Buffer.from(base64, "base64");
  const lower = (name || "").toLowerCase();

  try {
    if (lower.endsWith(".pdf") || dataUrl.startsWith("data:application/pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return NextResponse.json({ text: (result.text || "").trim().slice(0, 200_000) });
    }
    if (lower.endsWith(".docx") || dataUrl.includes("officedocument.wordprocessingml")) {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: (res.value || "").trim().slice(0, 200_000) });
    }
    if (lower.endsWith(".doc")) {
      // .doc antigo (binário) não é suportado; peça para salvar como .docx ou PDF.
      return NextResponse.json({ text: "", unsupported: true });
    }
    // Texto simples
    return NextResponse.json({ text: buffer.toString("utf8").slice(0, 200_000) });
  } catch (err) {
    return NextResponse.json({ text: "", error: err instanceof Error ? err.message : "falha" });
  }
}
