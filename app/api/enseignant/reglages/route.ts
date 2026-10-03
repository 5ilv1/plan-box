import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { NIVEAUX_IDS } from "@/lib/calcul-jour";
import {
  ACTIVITES_REGLAGE, CLE_REGLAGE_ACTIVITES, NIVEAUX_ACTIVITES,
  activiteAllumee, basculer, estNiveau, lireReglageActivites,
  type ActiviteReglage, type ActiviteTablette, type NiveauActivite,
} from "@/lib/activites-niveau";

// Réglages de classe (table `reglage`, une ligne par clé). Liste fermée :
// une clé inconnue est refusée, pour qu'une faute de frappe ne crée pas un
// réglage que personne ne lit.
const CLES = { deblocage_progressif: "boolean" } as const;
type Cle = keyof typeof CLES;

type Grille = Record<ActiviteTablette, Record<NiveauActivite, boolean | null>>;

// La grille « activités sur tablette » (lib/activites-niveau.ts). Le calcul du
// jour se lit dans `calcul_jour_config.actif` ; `null` = jamais configuré
// pour ce niveau, il faut passer par la page du calcul du jour.
async function lireGrille(admin: ReturnType<typeof createAdminClient>, valeurReglage: unknown): Promise<Grille> {
  const reglage = lireReglageActivites(valeurReglage);
  const { data: configs } = await admin.from("calcul_jour_config").select("niveau_id, actif, operations");
  const grille = {} as Grille;
  for (const activite of ACTIVITES_REGLAGE) {
    grille[activite] = {} as Record<NiveauActivite, boolean>;
    for (const niveau of NIVEAUX_ACTIVITES) grille[activite][niveau] = activiteAllumee(reglage, activite, niveau);
  }
  grille.calcul_du_jour = {} as Record<NiveauActivite, boolean | null>;
  for (const niveau of NIVEAUX_ACTIVITES) {
    const cfg = (configs ?? []).find((c) => c.niveau_id === NIVEAUX_IDS[niveau]);
    grille.calcul_du_jour[niveau] = cfg && (cfg.operations ?? []).length > 0 ? cfg.actif === true : null;
  }
  return grille;
}

// GET /api/enseignant/reglages → { deblocage_progressif: boolean, activites_tablette: Grille }
export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("reglage").select("cle, valeur");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  const reglages: Record<string, unknown> = { deblocage_progressif: false };
  for (const r of data ?? []) if (r.cle in CLES) reglages[r.cle] = r.valeur;
  reglages.activites_tablette = await lireGrille(admin, data?.find((r) => r.cle === CLE_REGLAGE_ACTIVITES)?.valeur);
  return NextResponse.json(reglages);
}

// PUT /api/enseignant/reglages  { cle, valeur }
//                            ou { cle: "activites_tablette", activite, niveau, allume }
export async function PUT(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const admin = createAdminClient();

  if (body?.cle === CLE_REGLAGE_ACTIVITES) {
    const { activite, niveau, allume } = body as { activite?: string; niveau?: string; allume?: unknown };
    if (!estNiveau(niveau) || typeof allume !== "boolean") {
      return NextResponse.json({ erreur: "Valeur invalide" }, { status: 400 });
    }
    if (activite === "calcul_du_jour") {
      // Le même interrupteur que la page du calcul du jour.
      const { data, error } = await admin.from("calcul_jour_config")
        .update({ actif: allume, updated_at: new Date().toISOString() })
        .eq("niveau_id", NIVEAUX_IDS[niveau])
        .select("niveau_id");
      if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
      if (!data?.length) {
        return NextResponse.json({ erreur: "Calcul du jour à configurer d'abord pour ce niveau" }, { status: 409 });
      }
    } else if ((ACTIVITES_REGLAGE as readonly string[]).includes(activite ?? "")) {
      const { data: actuel } = await admin.from("reglage").select("valeur").eq("cle", CLE_REGLAGE_ACTIVITES).maybeSingle();
      const valeur = basculer(lireReglageActivites(actuel?.valeur), activite as ActiviteReglage, niveau, allume);
      const { error } = await admin.from("reglage")
        .upsert({ cle: CLE_REGLAGE_ACTIVITES, valeur, maj_le: new Date().toISOString() }, { onConflict: "cle" });
      if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    } else {
      return NextResponse.json({ erreur: "Activité inconnue" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, activite, niveau, allume });
  }

  const cle = body?.cle as Cle | undefined;
  if (!cle || !(cle in CLES)) return NextResponse.json({ erreur: "Réglage inconnu" }, { status: 400 });
  if (typeof body.valeur !== CLES[cle]) return NextResponse.json({ erreur: "Valeur invalide" }, { status: 400 });
  const { error } = await admin
    .from("reglage")
    .upsert({ cle, valeur: body.valeur, maj_le: new Date().toISOString() }, { onConflict: "cle" });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, [cle]: body.valeur });
}
