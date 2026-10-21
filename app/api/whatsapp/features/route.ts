import { NextResponse } from "next/server";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function GET() {
  if (!whatsappServiceConfigured) return NextResponse.json({ messageMutations: { ready: false, version: 0 } });
  try {
    const { data } = await callWhatsappService("/health");
    return NextResponse.json({ messageMutations: data.messageMutations ?? { ready: false, version: 0 }, revision: data.revision ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ messageMutations: { ready: false, version: 0 } }, { status: 503 }); }
}
