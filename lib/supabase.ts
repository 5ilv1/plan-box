import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton : une seule instance partagée par tous les composants.
// Évite la compétition sur le lock auth quand plusieurs composants
// appellent createBrowserClient() simultanément (erreur "Lock broken by
// another request with the 'steal' option").
let _client: SupabaseClient | null = null;

// Clé de cookie/stockage propre à Plan Box.
// Repetibox (leitner-app) partage le MÊME projet Supabase : sans clé distincte,
// les deux apps utilisent le cookie par défaut "sb-<ref>-auth-token" et leurs
// sessions s'écrasent mutuellement (notamment en dev sur localhost:3000).
// lib/server-auth.ts doit utiliser exactement le même nom.
export const PLANBOX_AUTH_COOKIE = "sb-planbox-auth";

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookieOptions: { name: PLANBOX_AUTH_COOKIE } }
    );
  }
  return _client;
}
