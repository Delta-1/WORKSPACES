// Impressão / PDF de um documento montado.
//
// Abre uma janela com a folha declarada em @page (tamanho e margens em cm) e
// dispara o print — o "Salvar como PDF" do navegador então gera um PDF com
// margem EXATA e texto de verdade (selecionável), não uma foto da tela.

import type { PageSetup } from "./types";
import { pageCss } from "./types";

export function printDocument(innerHtml: string, page: PageSetup, title: string) {
  const safeTitle = String(title || "documento").replace(/[<>]/g, "");
  const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
${pageCss(page)}
*{box-sizing:border-box}
img{max-width:100%}
h1,h2,h3{page-break-after:avoid;break-after:avoid}
table{border-collapse:collapse;width:100%}
.pgbreak{page-break-after:always;break-after:page}
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
