import { NextResponse } from "next/server";
import { startWhatsappSession } from "@/lib/whatsapp";

export async function POST() {
  const status = await startWhatsappSession();
  return NextResponse.json(status);
}
