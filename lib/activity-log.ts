import { supabase } from "@/lib/supabase-client";

// Registra uma ação no log (aparece no app "Log" e no arquivo log.txt).
export async function logAction(actor: string | null | undefined, action: string) {
  if (!supabase) return;
  try {
    await supabase.from("activity_log").insert({ actor: actor || "Sistema", action });
  } catch {
    /* nunca quebra a ação principal por causa do log */
  }
}
