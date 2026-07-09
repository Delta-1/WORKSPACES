import { NextResponse } from "next/server";
import { getWaStatus } from "@/lib/whatsapp";
import { getWhatsappMessages } from "@/lib/store";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function GET(request: Request) {
  const numberId = new URL(request.url).searchParams.get("numberId");
  if (whatsappServiceConfigured) {
    const path = numberId ? `/status?numberId=${encodeURIComponent(numberId)}` : "/status";
    const { status, data } = await callWhatsappService(path);
    return NextResponse.json(data, { status });
  }
  return NextResponse.json({ ...getWaStatus(), messages: getWhatsappMessages() });
}
