export type WorldEventCategory = {
  id: string;
  title: string;
};

export type WorldEventSource = {
  id: string;
  url: string | null;
};

export type WorldEvent = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "closed";
  date: string | null;
  closedAt: string | null;
  category: WorldEventCategory;
  categories: WorldEventCategory[];
  sources: WorldEventSource[];
  coordinates: { longitude: number; latitude: number } | null;
  magnitude: { value: number; unit: string | null; description: string | null } | null;
};

export type WorldFeed = {
  source: {
    id: "nasa-eonet";
    name: string;
    url: string;
  };
  generatedAt: string;
  filters: {
    status: "open" | "closed" | "all";
    days: number;
    category: string | null;
  };
  summary: {
    total: number;
    active: number;
    categories: number;
    withLocation: number;
  };
  categories: Array<WorldEventCategory & { count: number }>;
  events: WorldEvent[];
};

type CategoryMeta = { label: string; color: string; emoji: string };

const CATEGORY_META: Record<string, CategoryMeta> = {
  wildfires: { label: "Incêndios", color: "#fb7185", emoji: "🔥" },
  severeStorms: { label: "Tempestades", color: "#60a5fa", emoji: "🌀" },
  volcanoes: { label: "Vulcões", color: "#f97316", emoji: "🌋" },
  earthquakes: { label: "Terremotos", color: "#fbbf24", emoji: "〰️" },
  floods: { label: "Inundações", color: "#38bdf8", emoji: "🌊" },
  landslides: { label: "Deslizamentos", color: "#a78bfa", emoji: "⛰️" },
  drought: { label: "Secas", color: "#d6a36a", emoji: "☀️" },
  dustHaze: { label: "Poeira e névoa", color: "#cbd5e1", emoji: "🌫️" },
  seaLakeIce: { label: "Gelo", color: "#67e8f9", emoji: "🧊" },
  snow: { label: "Neve", color: "#e0f2fe", emoji: "❄️" },
  tempExtremes: { label: "Temperaturas extremas", color: "#f43f5e", emoji: "🌡️" },
  waterColor: { label: "Água e florações", color: "#2dd4bf", emoji: "🫧" },
  manmade: { label: "Eventos humanos", color: "#94a3b8", emoji: "🏭" },
};

export function worldCategoryMeta(category: WorldEventCategory | string | null | undefined): CategoryMeta {
  const id = typeof category === "string" ? category : category?.id;
  const title = typeof category === "string" ? category : category?.title;
  return CATEGORY_META[id ?? ""] ?? { label: title || "Outro evento", color: "#34d399", emoji: "●" };
}

export function formatWorldDate(value: string | null, long = false) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return date.toLocaleDateString("pt-BR", long
    ? { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" });
}

export function coordinateLabel(event: WorldEvent) {
  if (!event.coordinates) return "Localização não informada";
  const { latitude, longitude } = event.coordinates;
  const lat = `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? "L" : "O"}`;
  return `${lat}, ${lon}`;
}
