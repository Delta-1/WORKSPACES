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
  address: string | null;
  addressLink: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  reviewLink: string | null;
  photoUrl: string | null;
  autoCloseMinutes: number;
  description: string | null;
  remoteAgentUrl: string | null;
};

const DEFAULT_THEME = "#10b981";
const DEFAULT_ICON = "#10b981";
const DEFAULT_LOGO_SIZE = 36;
const DEFAULT_STYLE = "aurora";
const CONTACT_DEFAULTS = {
  address: null,
  addressLink: null,
  phone: null,
  email: null,
  website: null,
  reviewLink: null,
  photoUrl: null,
  autoCloseMinutes: 0,
  description: null,
  remoteAgentUrl: null,
};

export async function fetchCompany(): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    // RLS já filtra para a MINHA empresa (company_id = my_company()), então a
    // linha certa (e só ela) volta. Cada empresa tem seu nome/logo/config.
    const { data } = await supabase.from("company_settings").select("*").maybeSingle();
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
        address: data.address ?? null,
        addressLink: data.address_link ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        website: data.website ?? null,
        reviewLink: data.review_link ?? null,
        photoUrl: data.photo_url ?? null,
        autoCloseMinutes: data.auto_close_minutes ?? 0,
        description: data.description ?? null,
        remoteAgentUrl: data.remote_agent_download_url ?? null,
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
    ...CONTACT_DEFAULTS,
  };
}

export async function updateCompany(update: Partial<CompanyInfo>, companyId?: string | null): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    let q = supabase
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
        ...(update.address !== undefined ? { address: update.address } : {}),
        ...(update.addressLink !== undefined ? { address_link: update.addressLink } : {}),
        ...(update.phone !== undefined ? { phone: update.phone } : {}),
        ...(update.email !== undefined ? { email: update.email } : {}),
        ...(update.website !== undefined ? { website: update.website } : {}),
        ...(update.reviewLink !== undefined ? { review_link: update.reviewLink } : {}),
        ...(update.photoUrl !== undefined ? { photo_url: update.photoUrl } : {}),
        ...(update.autoCloseMinutes !== undefined ? { auto_close_minutes: update.autoCloseMinutes } : {}),
        ...(update.description !== undefined ? { description: update.description } : {}),
        ...(update.remoteAgentUrl !== undefined ? { remote_agent_download_url: update.remoteAgentUrl } : {}),
        updated_at: new Date().toISOString(),
      })
      .select("*");
    // Escopo por empresa (a linha da MINHA empresa). Com RLS, sem companyId
    // ainda atinge só a minha linha, mas passamos por segurança/clareza.
    if (companyId) q = q.eq("company_id", companyId);
    const { data: rows } = await q;
    const data = Array.isArray(rows) ? rows[0] : rows;
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
        address: data.address ?? null,
        addressLink: data.address_link ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        website: data.website ?? null,
        reviewLink: data.review_link ?? null,
        photoUrl: data.photo_url ?? null,
        autoCloseMinutes: data.auto_close_minutes ?? 0,
        description: data.description ?? null,
        remoteAgentUrl: data.remote_agent_download_url ?? null,
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
    ...CONTACT_DEFAULTS,
  };
}
