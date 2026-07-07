import { supabase, supabaseConfigured } from "./supabase-client";
import type { CompanySettingsRow } from "./types";

export type CompanyInfo = {
  name: string;
  logoDataUrl: string | null;
  tvLogoCorner: CompanySettingsRow["tv_logo_corner"];
};

export async function fetchCompany(): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.from("company_settings").select("*").eq("id", true).maybeSingle();
    if (data) {
      return { name: data.name, logoDataUrl: data.logo_url, tvLogoCorner: data.tv_logo_corner };
    }
  }
  const res = await fetch("/api/company");
  const json = await res.json();
  return { name: json.name, logoDataUrl: json.logoDataUrl, tvLogoCorner: "top-left" };
}

export async function updateCompany(update: Partial<CompanyInfo>): Promise<CompanyInfo> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase
      .from("company_settings")
      .update({
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.logoDataUrl !== undefined ? { logo_url: update.logoDataUrl } : {}),
        ...(update.tvLogoCorner !== undefined ? { tv_logo_corner: update.tvLogoCorner } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("*")
      .single();
    if (data) {
      return { name: data.name, logoDataUrl: data.logo_url, tvLogoCorner: data.tv_logo_corner };
    }
  }
  const res = await fetch("/api/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: update.name, logoDataUrl: update.logoDataUrl }),
  });
  const json = await res.json();
  return { name: json.name, logoDataUrl: json.logoDataUrl, tvLogoCorner: "top-left" };
}
