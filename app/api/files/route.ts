import { NextResponse } from "next/server";
import { addFile, getFiles } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ files: getFiles() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    parentId?: string;
    uploadedBy?: string;
    dataUrl?: string;
  };
  if (!body.name || !body.parentId) {
    return NextResponse.json({ error: "Campos 'name' e 'parentId' são obrigatórios." }, { status: 400 });
  }
  const file = addFile({
    name: body.name,
    type: "file",
    parentId: body.parentId,
    uploadedBy: body.uploadedBy ?? "Você",
    dataUrl: body.dataUrl,
  });
  return NextResponse.json({ file });
}
