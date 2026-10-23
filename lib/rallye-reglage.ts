import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Réglage de classe `rallye_bestioles` : tant qu'il est vrai, le Rallye
 * Bestioles prend la place des podcasts sur le tableau de bord élève.
 * Module à part : /api/eleve/chargement le lit sans charger les fiches du rallye.
 * Illisible ⇒ fermé : l'élève retrouve ses podcasts.
 */
export async function rallyeActif(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from("reglage").select("valeur").eq("cle", "rallye_bestioles").maybeSingle();
    return data?.valeur === true;
  } catch {
    return false;
  }
}
