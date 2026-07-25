import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Diz ao cliente se a cobrança (Mercado Pago) está configurada. Quando NÃO está
// (ambiente de teste), a tela de planos libera na hora com os 3 dias grátis.
// Quando está, o acesso só abre depois do pagamento confirmado.
export async function GET() {
  return NextResponse.json({ configured: !!process.env.MERCADOPAGO_ACCESS_TOKEN });
}
