import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const revalidate = 300;

// Áreas e matérias com a contagem de cada uma — o mapa da estante.
//
// Rota própria porque a home precisa disto ANTES de qualquer busca: sem os
// números, "Exatas" e "Direito" parecem do mesmo tamanho e a pessoa clica no
// escuro. Cacheada por 5 min: o acervo não muda de minuto a minuto.

export async function GET() {
  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const { data, error } = await svc.from("library_books").select("area, materia");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapa = new Map<string, Map<string, number>>();
  for (const l of (data ?? []) as { area: string | null; materia: string | null }[]) {
    const area = l.area || "Outros";
    const materia = l.materia || "Outros";
    if (!mapa.has(area)) mapa.set(area, new Map());
    const m = mapa.get(area)!;
    m.set(materia, (m.get(materia) ?? 0) + 1);
  }

  const areas = [...mapa.entries()]
    .map(([nome, materias]) => ({
      nome,
      total: [...materias.values()].reduce((s, n) => s + n, 0),
      materias: [...materias.entries()]
        .map(([m, total]) => ({ nome: m, total }))
        .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt")),
    }))
    // Maior primeiro: a estante mais cheia é a que mais gente procura.
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ total: (data ?? []).length, areas });
}
