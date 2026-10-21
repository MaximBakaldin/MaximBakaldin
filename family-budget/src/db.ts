import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
function initialize(): { client: SupabaseClient | null; error: boolean } {
  if (!url && !key) return { client: null, error: false };
  if (!url || !key || url.includes("YOUR_PROJECT"))
    return { client: null, error: true };
  try {
    return { client: createClient(url, key), error: false };
  } catch {
    return { client: null, error: true };
  }
}
const result = initialize();
export const supabase = result.client;
export const configured = Boolean(supabase);
export const configurationError = result.error;
export function client() {
  if (!supabase) throw new Error("Supabase не подключён");
  return supabase;
}
