import { PAPER, type PageSetup } from "@/lib/doc-templates/types";

// PDF do Estúdio — o arquivo que carrega o DESIGN.
//
// O .docx é o editável, mas a conversão HTML→docx é uma aproximação: cores de
// fundo, colunas e espaçamentos finos se perdem. O PDF não aproxima nada — é o
// MESMO HTML que o site mostra na prévia, impresso por um Chromium de verdade.
// É o arquivo que a Yumi manda para a pessoa ver bonito; o .docx vai junto para
// quem quiser mexer.
//
// O Chromium vem de dois lugares:
//   • na Vercel — @sparticuz/chromium, o binário compactado feito para
//     serverless (o playwright puro não roda lá: o executável não é implantado);
//   • em dev/servidor próprio — o Chromium local, apontado por
//     PLAYWRIGHT_CHROMIUM_PATH ou resolvido pelo playwright instalado.

async function acharChromium(): Promise<{ executablePath: string; args: string[] }> {
  const local = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (local) return { executablePath: local, args: [] };

  // Serverless (Vercel/Lambda): o binário do @sparticuz é extraído em /tmp.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await chromium.executablePath(), args: chromium.args };
  }

  // Dev: usa o Chromium do playwright completo, se existir.
  try {
    const { chromium } = await import("playwright");
    return { executablePath: chromium.executablePath(), args: [] };
  } catch {
    const chromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await chromium.executablePath(), args: chromium.args };
  }
}

/**
 * Imprime o HTML de um modelo no formato exato da página (papel, margens em cm,
 * fonte e entrelinha do PageSetup). Devolve os bytes do PDF.
 */
export async function htmlParaPdf(html: string, page: PageSetup): Promise<Buffer> {
  const { chromium: pw } = await import("playwright-core");
  const { executablePath, args } = await acharChromium();

  const papel = PAPER[page.paper] ?? PAPER.a4;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    /* A folha é o viewport: as margens ficam por conta do print(), para o
       conteúdo dos modelos (que já traz o próprio <style>) não somar margem
       duas vezes. */
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${page.font || "'Times New Roman', serif"};
      font-size: ${page.fontSize || "12pt"};
      line-height: ${page.lineHeight || 1.5};
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  </style></head><body>${html}</body></html>`;

  const browser = await pw.launch({
    executablePath,
    args: [...args, "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const pagina = await browser.newPage();
    await pagina.setContent(doc, { waitUntil: "networkidle", timeout: 30_000 });
    const pdf = await pagina.pdf({
      width: `${papel.w}cm`,
      height: `${papel.h}cm`,
      margin: {
        top: `${page.margins.mt}cm`,
        bottom: `${page.margins.mb}cm`,
        left: `${page.margins.ml}cm`,
        right: `${page.margins.mr}cm`,
      },
      printBackground: true, // sem isto os fundos coloridos dos modelos somem
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
