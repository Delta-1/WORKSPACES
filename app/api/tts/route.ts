import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Voz do Orb via ElevenLabs. Usa a chave/voz do chatbot da empresa; se não
// houver, tenta a do ambiente; se nada, responde 404 e o Orb fala pelo navegador.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // voz multilíngue padrão

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  const { text } = (await request.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "sem texto" }, { status: 400 });

  let key: string | null = process.env.ELEVENLABS_API_KEY ?? null;
  let voice: string | null = process.env.ELEVENLABS_VOICE_ID ?? null;
  if (client) {
    const { data } = await client
      .from("chatbots")
      .select("elevenlabs_key, elevenlabs_voice_id")
      .not("elevenlabs_key", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.elevenlabs_key) {
      key = data.elevenlabs_key;
      voice = data.elevenlabs_voice_id || voice;
    }
  }
  if (!key) return NextResponse.json({ error: "sem chave elevenlabs" }, { status: 404 });

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice || DEFAULT_VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, 800), model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) return NextResponse.json({ error: "falha elevenlabs" }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "erro" }, { status: 502 });
  }
}
