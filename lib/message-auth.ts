import { supabase } from "./supabase-client";
export async function messageAuthHeaders(): Promise<Record<string,string>> {
 if (!supabase) return {};
 const {data} = await supabase.auth.getSession();
 return data.session ? {Authorization: `Bearer ${data.session.access_token}`} : {};
}
