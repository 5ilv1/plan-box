import { SupabaseClient } from "@supabase/supabase-js";
import { AssignationSelecteur } from "@/types";

export interface EleveResolu {
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  uid: string; // "pb_UUID" ou "rb_5" — utile pour le débogage
}

/**
 * Résout une AssignationSelecteur en une liste d'élèves à qui assigner,
 * en fusionnant les membres des groupes et les élèves sélectionnés individuellement.
 *
 * Peut être utilisé côté client (supabase browser) ou serveur (supabase admin).
 */
export async function resoudreAssignation(
  supabase: SupabaseClient,
  assignation: AssignationSelecteur
): Promise<EleveResolu[]> {
  const uidsSet = new Set<string>();

  // 1. Résoudre les groupes → UIDs PB + RB
  if (assignation.groupeIds.length > 0) {
    // Table PlanBox (eleve_groupe)
    const { data: membresPB } = await supabase
      .from("eleve_groupe")
      .select("planbox_eleve_id, repetibox_eleve_id")
      .in("groupe_id", assignation.groupeIds);

    for (const m of membresPB ?? []) {
      if (m.planbox_eleve_id)   uidsSet.add(`pb_${m.planbox_eleve_id}`);
      if (m.repetibox_eleve_id) uidsSet.add(`rb_${m.repetibox_eleve_id}`);
    }

    // Table Repetibox (groupe_eleve) — contient eleve_id (int)
    const { data: membresRB } = await supabase
      .from("groupe_eleve")
      .select("eleve_id")
      .in("groupe_id", assignation.groupeIds);

    for (const m of membresRB ?? []) {
      if (m.eleve_id) uidsSet.add(`rb_${m.eleve_id}`);
    }
  }

  // 2. Ajouter les élèves sélectionnés individuellement
  for (const uid of assignation.eleveUids) {
    uidsSet.add(uid);
  }

  // 3. Parser chaque UID préfixé en champs Supabase
  return Array.from(uidsSet).map((uid): EleveResolu => {
    if (uid.startsWith("rb_")) {
      return {
        uid,
        eleve_id: null,
        repetibox_eleve_id: parseInt(uid.replace("rb_", ""), 10),
      };
    }
    return {
      uid,
      eleve_id: uid.replace("pb_", ""),
      repetibox_eleve_id: null,
    };
  });
}
