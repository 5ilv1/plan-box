// ── Journal des tâches planifiées ────────────────────────────────────────────
//
// Les journaux Vercel du plan Hobby ne gardent qu'UNE HEURE. Un cron qui échoue
// à 8 h ne laisse plus rien à 10 h, quand l'enseignant découvre qu'aucun thème
// n'est affecté. Chaque passage écrit donc sa ligne dans `cron_journal` : quand,
// combien d'essais, ce qui a été fait, et l'erreur s'il y en a une.
//
// Un journal qui ne s'écrit pas ne doit jamais faire échouer la tâche : ses
// erreurs vont à la console, et la tâche continue.

import type { SupabaseClient } from "@supabase/supabase-js";

export type StatutCron = "ok" | "ignore" | "echec";

export async function ouvrirJournal(admin: SupabaseClient, tache: string): Promise<number | null> {
  try {
    const { data, error } = await admin.from("cron_journal").insert({ tache }).select("id").single();
    if (error) throw error;
    return data.id as number;
  } catch (err) {
    console.error(`[cron-journal] ouverture ${tache}`, err);
    return null;
  }
}

export async function clore(
  admin: SupabaseClient,
  id: number | null,
  statut: StatutCron,
  champs: { tentatives?: number; detail?: Record<string, unknown>; erreur?: string } = {},
): Promise<void> {
  if (id === null) return;
  try {
    const { error } = await admin
      .from("cron_journal")
      .update({ statut, fin: new Date().toISOString(), ...champs })
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error(`[cron-journal] clôture ${id}`, err);
  }
}
