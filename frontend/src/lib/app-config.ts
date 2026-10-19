const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const mode = import.meta.env.VITE_APP_MODE ?? "local-demo";

if (mode === "cloud" && !apiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is required when VITE_APP_MODE=cloud.");
}

if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured together.");
}

export const appConfig = {
  mode,
  apiBaseUrl: apiBaseUrl || "http://localhost:3001",
  supabase:
    supabaseUrl && supabaseAnonKey ? { url: supabaseUrl, anonKey: supabaseAnonKey } : undefined,
  paypalClientId: import.meta.env.VITE_PAYPAL_CLIENT_ID?.trim() || undefined,
} as const;
