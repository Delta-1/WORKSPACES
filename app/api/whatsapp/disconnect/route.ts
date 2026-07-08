import { NextResponse } from "next/server";
import { disconnectWhatsapp, getWaStatus } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function POST() {
  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/disconnect", { method: "POST" });
    return NextResponse.json(data, { status });
  }
  await disconnectWhatsapp();
  return NextResponse.json(getWaStatus());
}
