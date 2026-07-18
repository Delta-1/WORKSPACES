import { supabase, supabaseConfigured } from "./supabase-client";
import type { CompanySettingsRow } from "./types";

export type CompanyInfo = {
  name: string;
  logoDataUrl: string | null;
  tvLogoCorner: CompanySettingsRow["tv_logo_corner"];
  googleDriveEnabled: boolean;
  themeColor: string;
  iconColor: string;
  logoSize: number;
  themeStyle: string;
};

const DEFAULT_THEME = "#10b981";
const DEFAULT_ICON = "#10b981";
const DEFAULT_LOGO_SIZE = 36;
const DEFAULT_STYLE = "aurora";

export async function fetchCompany(): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.from("company_settings").select("*").eq("id", true).maybeSingle();
    if (data) {
      return {
        name: data.name,
        logoDataUrl: data.logo_url,
        tvLogoCorner: data.tv_logo_corner,
        googleDriveEnabled: data.google_drive_enabled,
        themeColor: data.theme_color ?? DEFAULT_THEME,
        iconColor: data.icon_color ?? data.theme_color ?? DEFAULT_ICON,
        logoSize: data.logo_size ?? DEFAULT_LOGO_SIZE,
        themeStyle: data.theme_style ?? DEFAULT_STYLE,
      };
    }
  }
  const res = await fetch("/api/company");
  const json = await res.json();
  return {
    name: json.name,
    logoDataUrl: json.logoDataUrl,
    tvLogoCorner: "top-left",
    googleDriveEnabled: false,
    themeColor: DEFAULT_THEME,
    iconColor: DEFAULT_ICON,
    logoSize: DEFAULT_LOGO_SIZE,
    themeStyle: DEFAULT_STYLE,
  };
}

export async function updateCompany(update: Partial<CompanyInfo>): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase
      .from("company_settings")
      .update({
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.logoDataUrl !== undefined ? { logo_url: update.logoDataUrl } : {}),
        ...(update.tvLogoCorner !== undefined ? { tv_logo_corner: update.tvLogoCorner } : {}),
        ...(update.googleDriveEnabled !== undefined ? { google_drive_enabled: update.googleDriveEnabled } : {}),
        ...(update.themeColor !== undefined ? { theme_color: update.themeColor } : {}),
        ...(update.iconColor !== undefined ? { icon_color: update.iconColor } : {}),
        ...(update.logoSize !== undefined ? { logo_size: update.logoSize } : {}),
        ...(update.themeStyle !== undefined ? { theme_style: update.themeStyle } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("*")
      .single();
    if (data) {
      return {
        name: data.name,
        logoDataUrl: data.logo_url,
        tvLogoCorner: data.tv_logo_corner,
        googleDriveEnabled: data.google_drive_enabled,
        themeColor: data.theme_color ?? DEFAULT_THEME,
        iconColor: data.icon_color ?? data.theme_color ?? DEFAULT_ICON,
        logoSize: data.logo_size ?? DEFAULT_LOGO_SIZE,
        themeStyle: data.theme_style ?? DEFAULT_STYLE,
      };
    }
  }
  const res = await fetch("/api/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: update.name, logoDataUrl: update.logoDataUrl }),
  });
  const json = await res.json();
  return {
    name: json.name,
    logoDataUrl: json.logoDataUrl,
    tvLogoCorner: "top-left",
    googleDriveEnabled: false,
    themeColor: DEFAULT_THEME,
    iconColor: DEFAULT_ICON,
    logoSize: DEFAULT_LOGO_SIZE,
    themeStyle: DEFAULT_STYLE,
  };
}
