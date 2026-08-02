// Impressão / PDF de um documento montado.
//
// Abre uma janela com a folha declarada em @page (tamanho e margens em cm) e
// dispara o print — o "Salvar como PDF" do navegador então gera um PDF com
// margem EXATA e texto de verdade (selecionável), não uma foto da tela.

import type { PageSetup } from "./types";
import { pageCss } from "./types";

export function printDocument(innerHtml: string, page: PageSetup, title: string) {
  const safeTitle = String(title || "documento").replace(/[<>]/g, "");
  // Documento com recuo de primeira linha (monografia/ABNT) é sempre justificado
  // — sem isto o PDF saía com o texto solto à esquerda e sem parágrafo marcado,
  // que é justamente o que o manual da instituição cobra. A capa fica de fora,
  // porque lá o texto é centralizado e sem recuo.
  const corrido = page.indent > 0
    ? `p{margin:0 0 .5em;text-indent:${page.indent}cm;text-align:justify}
.cover p,.cover div{text-indent:0;text-align:inherit}`
    : `p{margin:0 0 .5em}`;
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
${pageCss(page)}
*{box-sizing:border-box}
img{max-width:100%}
h1,h2,h3{page-break-after:avoid;break-after:avoid}
table{border-collapse:collapse;width:100%}
.pgbreak{page-break-after:always;break-after:page}
${corrido}
</style></head><body>${innerHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    alert("O navegador bloqueou a janela de impressão. Libere os pop-ups deste site e tente de novo.");
    return;
  }
  w.document.write(html);
  w.document.close();
}
