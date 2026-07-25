import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Voz do Orb/bots via ElevenLabs. Hierarquia de VOZ (cai para o próximo quando
// vazio): 1) voz do próprio bot; 2) voz padrão da empresa; 3) voz global do
// sistema (registrada pelo Admin Geral) / ambiente. A CHAVE segue: bot → ambiente.
// Sem chave, responde 404 e o Orb fala pelo navegador.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // voz multilíngue padrão

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  const { text, botId } = (await request.json()) as { text?: string; botId?: string };
  if (!text?.trim()) return NextResponse.json({ error: "sem texto" }, { status: 400 });

  let key: string | null = process.env.ELEVENLABS_API_KEY ?? null;
  const envVoice: string | null = process.env.ELEVENLABS_VOICE_ID ?? null;
  let botVoice: string | null = null;
  let companyVoice: string | null = null;
  let systemVoice: string | null = null;

  if (client) {
    // 1) Bot escolhido (ou qualquer bot da empresa com chave) → chave + voz do bot.
    const botQuery = client.from("chatbots").select("elevenlabs_key, elevenlabs_voice_id");
    const { data: bot } = botId
      ? await botQuery.eq("id", botId).maybeSingle()
      : await botQuery.not("elevenlabs_key", "is", null).limit(1).maybeSingle();
    if (bot?.elevenlabs_key) key = bot.elevenlabs_key;
    botVoice = bot?.elevenlabs_voice_id || null;

    // 2) Voz padrão da empresa.
    const { data: cs } = await client.from("company_settings").select("default_voice_id").limit(1).maybeSingle();
    companyVoice = cs?.default_voice_id || null;

    // 3) Voz global do sistema (registrada pelo Admin Geral), a mais recente.
    const { data: gv } = await client.from("global_voices").select("voice_id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    systemVoice = gv?.voice_id || null;
  }

  const voice = botVoice || companyVoice || systemVoice || envVoice || DEFAULT_VOICE;
  if (!key) return NextResponse.json({ error: "sem chave elevenlabs" }, { status: 404 });

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
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
