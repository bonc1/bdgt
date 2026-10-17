import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ziopeltcopzvyyxsmvap.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_Cj3ZCMUcRPUkCIYDitH1eg_lnlTXMA-";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
