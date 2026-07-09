import { NextResponse } from "next/server";
import { disconnectWhatsapp, getWaStatus } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function POST(request: Request) {
  const { numberId } = (await request.json().catch(() => ({}))) as { numberId?: string };
  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/disconnect", {
      method: "POST",
      body: JSON.stringify({ numberId }),
    });
    return NextResponse.json(data, { status });
  }
  await disconnectWhatsapp();
  return NextResponse.json(getWaStatus());
}
