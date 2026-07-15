// Extrai o texto de um arquivo para virar "cérebro" do robô.
// - Texto (txt/md/csv/json...): lê direto no navegador.
// - PDF / Word (docx): manda pro /api/extract-text (Node) extrair.
// - Outros (imagem, zip...): retorna null.
export async function extractText(file: File, dataUrl: string): Promise<string | null> {
  const name = file.name.toLowerCase();
  const textLike = /\.(txt|md|csv|json|log|html?|xml|yml|yaml)$/i.test(name) || file.type.startsWith("text/");
  if (textLike && file.size <= 400_000) {
    try {
      return await file.text();
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
