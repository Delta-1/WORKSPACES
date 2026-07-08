import { NextResponse } from "next/server";
import { startWhatsappSession } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function POST() {
  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/connect", { method: "POST" });
    return NextResponse.json(data, { status });
  }
  const status = await startWhatsappSession();
  return NextResponse.json(status);
}
