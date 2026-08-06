import { NextRequest, NextResponse } from "next/server";
import type { WorldEvent, WorldEventCategory, WorldFeed } from "@/lib/world-data";

const EONET_EVENTS = "https://eonet.gsfc.nasa.gov/api/v3/events";
const EONET_HOME = "https://eonet.gsfc.nasa.gov/";
const VALID_STATUS = new Set(["open", "closed", "all"]);

type EonetGeometry = {
  date?: string | null;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
  magnitudeDescription?: string | null;
};

type EonetEvent = {
  id?: string;
  title?: string;
  description?: string | null;
  closed?: string | null;
  categories?: Array<{ id?: string; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: EonetGeometry[];
};

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function findCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    const longitude = value[0];
    const latitude = value[1];
    return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
      ? [longitude, latitude]
      : null;
  }
  const pairs: [number, number][] = [];
  const collect = (item: unknown) => {
    if (!Array.isArray(item)) return;
    if (item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number") {
      if (item[0] >= -180 && item[0] <= 180 && item[1] >= -90 && item[1] <= 90) pairs.push([item[0], item[1]]);
      return;
    }
    item.forEach(collect);
  };
  collect(value);
  if (!pairs.length) return null;
  const longitude = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const latitude = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  return [longitude, latitude];
}

function normalizeEvent(raw: EonetEvent): WorldEvent | null {
  if (!raw.id || !raw.title) return null;
  const categories: WorldEventCategory[] = (raw.categories ?? [])
    .filter((category) => category.id)
    .map((category) => ({ id: category.id!, title: category.title || category.id! }));
  const geometries = (raw.geometry ?? []).filter((geometry) => geometry.date || geometry.coordinates);
  const geometry = geometries.at(-1) ?? null;
  const pair = findCoordinatePair(geometry?.coordinates);
  const magnitude = typeof geometry?.magnitudeValue === "number"
    ? { value: geometry.magnitudeValue, unit: geometry.magnitudeUnit ?? null, description: geometry.magnitudeDescription ?? null }
    : null;
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? null,
    status: raw.closed ? "closed" : "open",
    date: geometry?.date ?? null,
    closedAt: raw.closed ?? null,
    category: categories[0] ?? { id: "other", title: "Other" },
    categories,
    sources: (raw.sources ?? []).map((source) => ({ id: source.id || "Fonte", url: safeUrl(source.url) })),
    coordinates: pair ? { longitude: pair[0], latitude: pair[1] } : null,
    magnitude,
  };
}

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status") ?? "open";
  const status = (VALID_STATUS.has(statusParam) ? statusParam : "open") as "open" | "closed" | "all";
  const days = boundedInt(request.nextUrl.searchParams.get("days"), 30, 1, 365);
  const limit = boundedInt(request.nextUrl.searchParams.get("limit"), 60, 1, 100);
  const rawCategory = request.nextUrl.searchParams.get("category")?.trim() || null;
  const category = rawCategory && /^[a-zA-Z0-9,_-]{1,100}$/.test(rawCategory) ? rawCategory : null;

  const params = new URLSearchParams({ status, days: String(days), limit: String(limit) });
  if (category) params.set("category", category);

  try {
    const response = await fetch(`${EONET_EVENTS}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`NASA EONET respondeu HTTP ${response.status}`);
    const payload = (await response.json()) as { events?: EonetEvent[] };
    const events = (payload.events ?? []).map(normalizeEvent).filter((event): event is WorldEvent => !!event);
    const categoryCounts = new Map<string, WorldEventCategory & { count: number }>();
    events.forEach((event) => event.categories.forEach((item) => {
      const previous = categoryCounts.get(item.id);
      categoryCounts.set(item.id, { ...item, count: (previous?.count ?? 0) + 1 });
    }));

    const feed: WorldFeed = {
      source: { id: "nasa-eonet", name: "NASA EONET", url: EONET_HOME },
      generatedAt: new Date().toISOString(),
      filters: { status, days, category },
      summary: {
        total: events.length,
        active: events.filter((event) => event.status === "open").length,
        categories: categoryCounts.size,
        withLocation: events.filter((event) => event.coordinates).length,
      },
      categories: [...categoryCounts.values()].sort((a, b) => b.count - a.count),
      events,
    };

    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (error) {
    console.error("world/events:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar os dados mundiais agora.", source: "NASA EONET" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
