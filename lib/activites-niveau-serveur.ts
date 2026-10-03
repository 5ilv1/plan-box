import type { SupabaseClient } from "@supabase/supabase-js";
import { CLE_REGLAGE_ACTIVITES, lireReglageActivites, type ReglageActivites } from "./activites-niveau";

/**
 * Le réglage « activités sur tablette » (`lib/activites-niveau.ts`).
 * Illisible ⇒ tout allumé : le comportement d'avant.
 */
export async function chargerReglageActivites(admin: SupabaseClient): Promise<ReglageActivites> {
  try {
    const { data } = await admin.from("reglage").select("valeur").eq("cle", CLE_REGLAGE_ACTIVITES).maybeSingle();
    return lireReglageActivites(data?.valeur);
  } catch (err) {
    console.error("[activites-niveau] lecture du réglage :", err);
    return {};
  }
}
