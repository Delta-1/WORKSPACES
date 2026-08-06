"use client";

export type MindMapNode = {
  id: string; x: number; y: number; w: number; h: number;
  text: string; color: string; kind: "box" | "text" | "sticky" | "ellipse" | "diamond";
};
export type MindMapEdge = { id: string; from: string; to: string; color?: string; dashed?: boolean };
export type MindMapStroke = { id: string; color: string; width: number; pts: number[][] };
export type MindMapScene = { nodes: MindMapNode[]; edges: MindMapEdge[]; strokes: MindMapStroke[] };
export type MindMapExportFormat = "png" | "pdf" | "gif";

const BG = "#f8fafc";

function safeName(title: string) {
  return (title || "mapa-mental").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "mapa-mental";
}

function bounds(scene: MindMapScene) {
  const pts = [
    ...scene.nodes.flatMap((n) => [[n.x, n.y], [n.x + n.w, n.y + n.h]]),
    ...scene.strokes.flatMap((s) => s.pts),
  ].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return { minX: -400, minY: -240, maxX: 400, maxY: 240 };
  return {
    minX: Math.min(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])), maxY: Math.max(...pts.map((p) => p[1])),
  };
}

function center(node: MindMapNode) { return { x: node.x + node.w / 2, y: node.y + node.h / 2 }; }
function curve(a: MindMapNode, b: MindMapNode) {
  const p0 = center(a); const p3 = center(b);
  const bend = Math.max(70, Math.abs(p3.x - p0.x) * .48);
  const dir = p3.x >= p0.x ? 1 : -1;
  return { p0, p1: { x: p0.x + bend * dir, y: p0.y }, p2: { x: p3.x - bend * dir, y: p3.y }, p3 };
}
function bezier(p: ReturnType<typeof curve>, t: number) {
  const u = 1 - t;
  return {
    x: u ** 3 * p.p0.x + 3 * u ** 2 * t * p.p1.x + 3 * u * t ** 2 * p.p2.x + t ** 3 * p.p3.x,
    y: u ** 3 * p.p0.y + 3 * u ** 2 * t * p.p1.y + 3 * u * t ** 2 * p.p2.y + t ** 3 * p.p3.y,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 18) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

function drawScene(ctx: CanvasRenderingContext2D, scene: MindMapScene, width: number, height: number, phase = 0, animate = false) {
  ctx.fillStyle = BG; ctx.fillRect(0, 0, width, height);
  const b = bounds(scene); const pad = 56;
  const scale = Math.min((width - pad * 2) / Math.max(1, b.maxX - b.minX), (height - pad * 2) / Math.max(1, b.maxY - b.minY));
  const offsetX = (width - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
  const offsetY = (height - (b.maxY - b.minY) * scale) / 2 - b.minY * scale;
  ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);

  for (const edge of scene.edges) {
    const from = scene.nodes.find((n) => n.id === edge.from); const to = scene.nodes.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    const p = curve(from, to); const color = edge.color || from.color || "#64748b";
    ctx.beginPath(); ctx.moveTo(p.p0.x, p.p0.y); ctx.bezierCurveTo(p.p1.x, p.p1.y, p.p2.x, p.p2.y, p.p3.x, p.p3.y);
    ctx.strokeStyle = color; ctx.lineWidth = 3 / Math.max(.7, scale); ctx.setLineDash(edge.dashed ? [9, 7] : []); ctx.stroke(); ctx.setLineDash([]);
    const tip = bezier(p, .98); const before = bezier(p, .94); const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - 12 * Math.cos(angle - .55), tip.y - 12 * Math.sin(angle - .55)); ctx.lineTo(tip.x - 12 * Math.cos(angle + .55), tip.y - 12 * Math.sin(angle + .55)); ctx.closePath(); ctx.fill();
    if (animate) {
      for (let i = 0; i < 4; i++) {
        const dot = bezier(p, (phase + i / 4) % 1);
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = color; ctx.lineWidth = 2 / Math.max(.7, scale);
        ctx.beginPath(); ctx.arc(dot.x, dot.y, 5 / Math.max(.8, scale), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  }

  for (const stroke of scene.strokes) {
    if (stroke.pts.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(stroke.pts[0][0], stroke.pts[0][1]);
    for (const point of stroke.pts.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.strokeStyle = stroke.color || "#334155"; ctx.lineWidth = Math.max(1, stroke.width); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  }

  for (const node of scene.nodes) {
    ctx.save(); const c = center(node);
    if (node.kind === "diamond") { ctx.translate(c.x, c.y); ctx.rotate(Math.PI / 4); ctx.translate(-c.x, -c.y); }
    ctx.fillStyle = node.kind === "sticky" ? node.color : `${node.color}22`;
    ctx.strokeStyle = node.kind === "text" ? "transparent" : node.color; ctx.lineWidth = 3;
    if (node.kind === "ellipse") { ctx.beginPath(); ctx.ellipse(c.x, c.y, node.w / 2, node.h / 2, 0, 0, Math.PI * 2); }
    else roundedRect(ctx, node.x, node.y, node.w, node.h, node.kind === "sticky" ? 8 : 18);
    if (node.kind !== "text") { ctx.fill(); ctx.stroke(); }
    ctx.restore();

    ctx.fillStyle = node.kind === "sticky" ? "#111827" : "#0f172a";
    ctx.font = `600 ${Math.max(12, Math.min(18, node.h / 5))}px Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lines = wrapText(ctx, node.text, Math.max(60, node.w - 24)); const lineHeight = Math.max(16, Math.min(23, node.h / Math.max(2, lines.length + 1)));
    lines.forEach((line, index) => ctx.fillText(line, c.x, c.y + (index - (lines.length - 1) / 2) * lineHeight));
  }
  ctx.restore();
}

function canvasFor(scene: MindMapScene, format: MindMapExportFormat, phase = 0) {
  const b = bounds(scene); const ratio = Math.max(.7, Math.min(2, (b.maxX - b.minX) / Math.max(1, b.maxY - b.minY)));
  const width = format === "gif" ? 960 : 1600; const height = Math.round(width / ratio);
  const limitedHeight = Math.max(format === "gif" ? 540 : 900, Math.min(format === "gif" ? 760 : 1300, height));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = limitedHeight;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas indisponível.");
  drawScene(ctx, scene, width, limitedHeight, phase, format === "gif");
  return canvas;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportMindMap(scene: MindMapScene, title: string, format: MindMapExportFormat) {
  if (!scene.nodes.length && !scene.strokes.length) throw new Error("Adicione algum conteúdo antes de exportar.");
  const name = safeName(title);
  if (format === "png") {
    const canvas = canvasFor(scene, format);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .96));
    if (!blob) throw new Error("Não consegui criar a imagem."); download(blob, `${name}.png`); return;
  }
  if (format === "pdf") {
    const canvas = canvasFor(scene, format); const { jsPDF } = await import("jspdf");
    const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height], hotfixes: ["px_scaling"] });
    pdf.addImage(canvas.toDataURL("image/png", .95), "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
    pdf.save(`${name}.pdf`); return;
  }

  const { GIFEncoder, quantize, applyPalette } = await import("gifenc"); const gif = GIFEncoder();
  for (let frame = 0; frame < 18; frame++) {
    const canvas = canvasFor(scene, "gif", frame / 18); const ctx = canvas.getContext("2d");
    if (!ctx) continue; const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(image.data, 128, { format: "rgb444" }); const index = applyPalette(image.data, palette, "rgb444");
    gif.writeFrame(index, canvas.width, canvas.height, { palette, delay: 85, repeat: 0 });
  }
  gif.finish();
  const encoded = gif.bytes(); const buffer = new ArrayBuffer(encoded.byteLength); new Uint8Array(buffer).set(encoded);
  download(new Blob([buffer], { type: "image/gif" }), `${name}.gif`);
}
