import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Récupère le niveau (CE2 / CM1 / CM2) d'un élève à partir d'un blocId plan_travail.
 * Gère les deux sources (Planbox via eleves.niveaux, Repetibox via
 * eleve_groupe → groupes).
 * Retourne "CM1" par défaut si introuvable (niveau médian du cycle 3).
 */
export async function niveauEleveDepuisBloc(
  admin: SupabaseClient,
  blocId: string
): Promise<"CE2" | "CM1" | "CM2"> {
  const { data: bloc } = await admin
    .from("plan_travail")
    .select("eleve_id, repetibox_eleve_id")
    .eq("id", blocId)
    .single();

  if (!bloc) return "CM1";

  // Planbox : eleves.niveaux.nom
  if (bloc.eleve_id) {
    const { data } = await admin
      .from("eleves")
      .select("niveaux(nom)")
      .eq("id", bloc.eleve_id)
      .single();
    const nom = (data as unknown as { niveaux?: { nom?: string } })?.niveaux?.nom;
    if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
  }

  // Repetibox : via eleve_groupe → groupes.nom
  if (bloc.repetibox_eleve_id) {
    const { data } = await admin
      .from("eleve_groupe")
      .select("groupes(nom)")
      .eq("repetibox_eleve_id", bloc.repetibox_eleve_id)
      .limit(1);
    const nom = (data?.[0] as unknown as { groupes?: { nom?: string } })?.groupes?.nom;
    if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
  }

  return "CM1";
}
