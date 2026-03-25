import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé service_role.
 * Bypasse les RLS — À utiliser UNIQUEMENT dans les API routes (côté serveur).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}
