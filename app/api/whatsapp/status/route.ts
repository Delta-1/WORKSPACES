import { NextResponse } from "next/server";
import { getWaStatus } from "@/lib/whatsapp";
import { getWhatsappMessages } from "@/lib/store";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function GET() {
  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/status");
    return NextResponse.json(data, { status });
  }
  return NextResponse.json({ ...getWaStatus(), messages: getWhatsappMessages() });
}
