import { NextResponse } from "next/server";
import { getCompany, setCompany } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getCompany());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; logoDataUrl?: string };
  const company = setCompany({
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.logoDataUrl !== undefined ? { logoDataUrl: body.logoDataUrl } : {}),
  });
  return NextResponse.json(company);
}
