export type NewsMode = "local" | "pt";

export type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
};

export type CountryNewsFeed = {
  country: {
    code: string;
    name: string;
    flag: string;
  };
  mode: NewsMode;
  generatedAt: string;
  sources: Array<{ name: string; count: number }>;
  articles: NewsArticle[];
  partial: boolean;
};

export function countryFlag(code: string) {
  const normalized = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...[...normalized].map((letter) => 127397 + letter.charCodeAt(0)));
}

export function formatNewsTime(value: string | null) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Há ${days}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function sourceColor(source: string) {
  const palette = ["#22d3ee", "#34d399", "#60a5fa", "#a78bfa", "#fb7185", "#fbbf24", "#f97316"];
  const seed = [...source].reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return palette[seed % palette.length];
}
