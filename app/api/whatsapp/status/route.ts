import { NextResponse } from "next/server";
import { getWaStatus } from "@/lib/whatsapp";
import { getWhatsappMessages } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ ...getWaStatus(), messages: getWhatsappMessages() });
}
