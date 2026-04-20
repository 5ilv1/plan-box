import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * GET /api/admin/suivi-jour?date=YYYY-MM-DD
 *
 * Retourne la matrice élèves × blocs pour une date donnée, avec
 * statut, contenu complet (réponses, score) pour le drawer de détail.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const dateParam = new URL(req.url).searchParams.get("date");
  const date = dateParam ?? new Date().toISOString().split("T")[0];

  // 1. Tous les blocs du jour
  const { data: blocs } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, date_assignation, eleve_id, repetibox_eleve_id, chapitre_id, contenu")
    .eq("date_assignation", date)
    .order("created_at");

  if (!blocs?.length) {
    return NextResponse.json({ date, eleves: [], blocsUniques: [] });
  }

  // 2. Identifier les élèves concernés
  const pbIds = [...new Set(blocs.map((b) => b.eleve_id).filter(Boolean))] as string[];
  const rbIds = [...new Set(blocs.map((b) => b.repetibox_eleve_id).filter((n) => n != null))] as number[];

  const [pbRes, rbRes] = await Promise.all([
    pbIds.length
      ? admin.from("eleves").select("id, prenom, nom, niveaux(nom)").in("id", pbIds)
      : Promise.resolve({ data: [] }),
    rbIds.length
      ? admin.from("eleve").select("id, prenom, nom").in("id", rbIds)
      : Promise.resolve({ data: [] }),
  ]);

  // 3. Récupérer les groupes (pour les niveaux des élèves RB)
  const { data: egData } = rbIds.length
    ? await admin.from("eleve_groupe").select("repetibox_eleve_id, groupes(nom)").in("repetibox_eleve_id", rbIds)
    : { data: [] };

  const niveauParRb = new Map<number, string>();
  const NIVEAUX_VALIDES = new Set(["CE2", "CM1", "CM2"]);
  for (const eg of egData ?? []) {
    const nom = ((eg as Record<string, unknown>).groupes as { nom?: string })?.nom ?? "";
    if (NIVEAUX_VALIDES.has(nom)) {
      niveauParRb.set((eg as { repetibox_eleve_id: number }).repetibox_eleve_id, nom);
    }
  }

  type EleveInfo = { id: string; source: "planbox" | "repetibox"; prenom: string; nom: string; niveau: string };
  const elevesMap = new Map<string, EleveInfo>();

  for (const e of pbRes.data ?? []) {
    const niveau = ((e as Record<string, unknown>).niveaux as { nom?: string })?.nom ?? "—";
    elevesMap.set(`pb_${e.id}`, {
      id: `pb_${e.id}`,
      source: "planbox",
      prenom: (e as { prenom: string }).prenom,
      nom: (e as { nom: string }).nom,
      niveau,
    });
  }
  for (const e of rbRes.data ?? []) {
    const rbId = (e as { id: number }).id;
    elevesMap.set(`rb_${rbId}`, {
      id: `rb_${rbId}`,
      source: "repetibox",
      prenom: (e as { prenom: string }).prenom,
      nom: (e as { nom: string }).nom,
      niveau: niveauParRb.get(rbId) ?? "—",
    });
  }

  // 4. Grouper les blocs par élève
  type BlocMin = {
    id: string; type: string; titre: string; statut: string;
    contenu: unknown; chapitre_id: string | null;
  };
  const blocsParEleve = new Map<string, BlocMin[]>();
  for (const b of blocs) {
    const eleveKey = b.eleve_id ? `pb_${b.eleve_id}` : `rb_${b.repetibox_eleve_id}`;
    if (!blocsParEleve.has(eleveKey)) blocsParEleve.set(eleveKey, []);
    blocsParEleve.get(eleveKey)!.push({
      id: b.id as string,
      type: b.type as string,
      titre: b.titre as string,
      statut: b.statut as string,
      contenu: b.contenu,
      chapitre_id: (b.chapitre_id as string) ?? null,
    });
  }

  // 5. Blocs uniques (colonnes) : regroupés par (type, titre, chapitre_id)
  const colMap = new Map<string, { cle: string; type: string; titre: string; chapitre_id: string | null; nbEleves: number }>();
  for (const b of blocs) {
    const cle = `${b.type}::${b.titre}::${b.chapitre_id ?? ""}`;
    const ex = colMap.get(cle);
    if (ex) ex.nbEleves++;
    else colMap.set(cle, {
      cle,
      type: b.type as string,
      titre: b.titre as string,
      chapitre_id: (b.chapitre_id as string) ?? null,
      nbEleves: 1,
    });
  }

  // 6. Ordre d'affichage des types (mêmes que vue-jour)
  const ORDRE_TYPES: Record<string, number> = {
    dictee: 1, mots: 2, calcul_mental: 3, exercice: 4, qcm: 5, texte_a_trous: 6,
    classement: 7, analyse_phrase: 8, lecture: 9, revision: 10,
    ecriture_contrainte: 11, ecriture: 12, lecon_copier: 13, fichier_maths: 14,
    ressource: 15, ceinture_multiplication: 16,
  };
  const blocsUniques = [...colMap.values()].sort((a, b) => {
    const oa = ORDRE_TYPES[a.type] ?? 99;
    const ob = ORDRE_TYPES[b.type] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.titre.localeCompare(b.titre, "fr");
  });

  // 7. Construire la liste finale d'élèves, triés par niveau puis prénom
  const ORDRE_NIVEAUX: Record<string, number> = { CE2: 1, CM1: 2, CM2: 3 };
  const eleves = [...elevesMap.values()]
    .map((e) => ({
      ...e,
      blocs: blocsParEleve.get(e.id) ?? [],
    }))
    .sort((a, b) => {
      const oa = ORDRE_NIVEAUX[a.niveau] ?? 99;
      const ob = ORDRE_NIVEAUX[b.niveau] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.prenom.localeCompare(b.prenom, "fr");
    });

  return NextResponse.json({ date, eleves, blocsUniques });
}
