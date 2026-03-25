import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton : une seule instance partagée par tous les composants.
// Évite la compétition sur le lock auth quand plusieurs composants
// appellent createBrowserClient() simultanément (erreur "Lock broken by
// another request with the 'steal' option").
let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
