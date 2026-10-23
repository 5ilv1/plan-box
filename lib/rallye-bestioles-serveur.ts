/**
 * Rallye Bestioles — côté serveur : les fiches (avec leurs réponses) et la
 * lecture des parties en base. À n'importer QUE depuis les routes API.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import donnees from "./rallye-bestioles.json";
export { rallyeActif } from "./rallye-reglage";
import { classer, type EleveCourantRallye, type FicheRallye, type LigneClassement } from "./rallye-bestioles";

export const FICHES = donnees as FicheRallye[];
const PAR_NUMERO = new Map(FICHES.map((f) => [f.numero, f]));

export function fiche(numero: number): FicheRallye | undefined {
  return PAR_NUMERO.get(numero);
}

export function cleEleve(e: EleveCourantRallye): string {
  return e.eleveId ? `pb_${e.eleveId}` : `rb_${e.rbEleveId}`;
}

export function filtreEleveRallye(e: EleveCourantRallye): [string, string | number] {
  return e.eleveId ? ["eleve_id", e.eleveId] : ["rb_eleve_id", e.rbEleveId as number];
}

/**
 * L'élève derrière la session, avec son nom (départager deux prénoms dans le
 * classement). Rien n'est accepté du client.
 */
export async function resoudreEleveRallye(admin: SupabaseClient, userId: string): Promise<EleveCourantRallye | null> {
  const { data: pb } = await admin.from("eleves").select("id, prenom, nom").eq("id", userId).maybeSingle();
  if (pb) return { eleveId: pb.id as string, rbEleveId: null, prenom: (pb.prenom as string) ?? "", nom: (pb.nom as string) ?? "" };

  const { data: rb } = await admin.from("eleve").select("id, prenom, nom").eq("auth_id", userId).maybeSingle();
  if (rb) return { eleveId: null, rbEleveId: Number(rb.id), prenom: (rb.prenom as string) ?? "", nom: (rb.nom as string) ?? "" };

  return null;
}

export interface PartieRallye {
  id: string;
  fiche: number;
  date: string;
  reponses: Array<number | null>;
  score: number;
  total: number;
  termine: boolean;
}

export async function partiesDeLEleve(admin: SupabaseClient, e: EleveCourantRallye): Promise<PartieRallye[]> {
  const [col, val] = filtreEleveRallye(e);
  const { data, error } = await admin
    .from("rallye_partie")
    .select("id, fiche, date, reponses, score, total, termine")
    .eq(col, val)
    .order("cree_le", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...p, reponses: Array.isArray(p.reponses) ? p.reponses : [] })) as PartieRallye[];
}

/** Classement de toute la classe (élèves qui ont terminé au moins un podcast). */
export async function classementClasse(admin: SupabaseClient): Promise<LigneClassement[]> {
  const lignes: Array<{ eleve_id: string | null; rb_eleve_id: number | null; prenom: string; nom: string; score: number; termine: boolean }> = [];
  // PostgREST plafonne une lecture à 1000 lignes : on pagine.
  for (let depuis = 0; ; depuis += 1000) {
    const { data, error } = await admin
      .from("rallye_partie")
      .select("eleve_id, rb_eleve_id, prenom, nom, score, termine")
      .eq("termine", true)
      .order("id")
      .range(depuis, depuis + 999);
    if (error) throw new Error(error.message);
    lignes.push(...((data ?? []) as typeof lignes));
    if (!data || data.length < 1000) break;
  }
  return classer(lignes.map((l) => ({
    cle: l.eleve_id ? `pb_${l.eleve_id}` : `rb_${l.rb_eleve_id}`,
    prenom: l.prenom,
    nom: l.nom,
    score: l.score,
    termine: l.termine,
  })));
}
