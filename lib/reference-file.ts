"use client";

export type ReferenceMaterial = { name: string; text: string };

function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function extractReferenceFile(file: File): Promise<ReferenceMaterial> {
  const lower = file.name.toLowerCase();
  if (!/\.(pdf|docx|doc|txt|md|html?|csv)$/i.test(lower)) {
    throw new Error("Use PDF, Word, TXT, Markdown, HTML ou CSV como referência.");
  }

  if (/\.(txt|md|html?|csv)$/i.test(lower)) {
    const text = (await file.text()).trim();
    if (!text) throw new Error("O arquivo está vazio.");
    return { name: file.name, text: text.slice(0, 60000) };
  }

  const response = await fetch("/api/extract-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl: await asDataUrl(file), name: file.name }),
  });
  const data = await response.json();
  if (!response.ok || data.unsupported) throw new Error(data.error || "Não consegui ler esse arquivo. Salve-o como PDF ou .docx.");
  const text = String(data.text || "").trim();
  if (!text) throw new Error("Não encontrei texto legível nesse arquivo.");
  return { name: file.name, text: text.slice(0, 60000) };
}
