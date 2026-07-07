import { NextResponse } from "next/server";
import { disconnectWhatsapp, getWaStatus } from "@/lib/whatsapp";

export async function POST() {
  await disconnectWhatsapp();
  return NextResponse.json(getWaStatus());
}
