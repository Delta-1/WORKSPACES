// Extrai o texto de um arquivo para virar "cérebro" do robô.
// - Texto (txt/md/csv/json...): lê direto no navegador.
// - PDF / Word (docx): manda pro /api/extract-text (Node) extrair.
// - Outros (imagem, zip...): retorna null.
export async function extractText(file: File, dataUrl: string): Promise<string | null> {
  const name = file.name.toLowerCase();
  const isHtml = /\.(html?)$/i.test(name) || file.type === "text/html";
  const textLike = /\.(txt|md|csv|json|log|html?|xml|yml|yaml)$/i.test(name) || file.type.startsWith("text/");
  if (textLike && file.size <= 2_000_000) {
    try {
      const raw = await file.text();
      // HTML: tira tags/scripts/estilos e deixa só o texto legível (o robô
      // aprende o CONTEÚDO do site, sem o código). Vira base de conhecimento.
      if (isHtml) return htmlToText(raw);
      return raw;
    } catch {
      return null;
    }
  }
  const isDoc = /\.(pdf|docx|doc)$/i.test(name) || file.type === "application/pdf";
  if (isDoc && file.size <= 8_000_000) {
    try {
      const res = await fetch("/api/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, name: file.name }),
      });
      const json = await res.json();
      return json.text || null;
    } catch {
      return null;
    }
  }
  return null;
}

// Converte HTML em texto limpo: remove script/style, transforma tags em quebras
// de linha e desescapa entidades básicas. Bom o bastante para virar conhecimento.
export function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 200_000);
}
