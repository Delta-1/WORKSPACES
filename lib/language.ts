export const APP_LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)", shortLabel: "Português", flag: "🇧🇷", newsLocale: "pt", hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" },
  { code: "en-US", label: "English (United States)", shortLabel: "English", flag: "🇺🇸", newsLocale: "en", hl: "en-US", gl: "US", ceid: "US:en" },
  { code: "es-419", label: "Español (Latinoamérica)", shortLabel: "Español", flag: "🌎", newsLocale: "es", hl: "es-419", gl: "MX", ceid: "MX:es-419" },
  { code: "fr-FR", label: "Français (France)", shortLabel: "Français", flag: "🇫🇷", newsLocale: "fr", hl: "fr", gl: "FR", ceid: "FR:fr" },
  { code: "de-DE", label: "Deutsch (Deutschland)", shortLabel: "Deutsch", flag: "🇩🇪", newsLocale: "de", hl: "de", gl: "DE", ceid: "DE:de" },
  { code: "it-IT", label: "Italiano (Italia)", shortLabel: "Italiano", flag: "🇮🇹", newsLocale: "it", hl: "it", gl: "IT", ceid: "IT:it" },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]["code"];

export const DEFAULT_APP_LANGUAGE: AppLanguage = "pt-BR";

export function normalizeAppLanguage(value: string | null | undefined): AppLanguage {
  if (!value) return DEFAULT_APP_LANGUAGE;
  const normalized = value.trim().replace("_", "-").toLowerCase();
  const exact = APP_LANGUAGES.find((language) => language.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  if (normalized.startsWith("pt")) return "pt-BR";
  if (normalized.startsWith("es")) return "es-419";
  if (normalized.startsWith("fr")) return "fr-FR";
  if (normalized.startsWith("de")) return "de-DE";
  if (normalized.startsWith("it")) return "it-IT";
  if (normalized.startsWith("en")) return "en-US";
  return DEFAULT_APP_LANGUAGE;
}

export function languageConfig(value: string | null | undefined) {
  const language = normalizeAppLanguage(value);
  return APP_LANGUAGES.find((item) => item.code === language) ?? APP_LANGUAGES[0];
}

export function detectBrowserLanguage(): AppLanguage {
  if (typeof window === "undefined") return DEFAULT_APP_LANGUAGE;
  const stored = window.localStorage.getItem("workspace:language");
  return normalizeAppLanguage(stored || window.navigator.language);
}

export function rememberLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("workspace:language", language);
  document.documentElement.lang = language;
}
