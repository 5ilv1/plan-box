import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 60;

// Types dont le contenu peut être régénéré par IA avec les mêmes paramètres
const TYPES_REGENERABLES = new Set([
  "exercice",
  "qcm",
  "texte_a_trous",
  "calcul_mental",
  "analyse_phrase",
  "classement",
  "ecriture_contrainte",
  "revision",
  "probleme_maths",
]);

/**
 * POST /api/admin/planning/dupliquer
 * Body: { blocIds: string[] }
 *
 * Duplique un groupe de blocs plan_travail (un par élève concerné) en
 * régénérant leur contenu via l'IA — même type, même titre, même date,
 * mêmes élèves, mais questions/items différents.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const blocIds = (body?.blocIds ?? []) as string[];
  if (!blocIds.length) {
    return NextResponse.json({ error: "blocIds requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Récupérer tous les blocs source (il peut y en avoir un par élève ou un seul avec groupe)
  const { data: sources, error: errSources } = await admin
    .from("plan_travail")
    .select("*")
    .in("id", blocIds);

  if (errSources || !sources?.length) {
    return NextResponse.json({ error: "Blocs source introuvables" }, { status: 404 });
  }

  const source = sources[0];
  const type = source.type as string;

  if (!TYPES_REGENERABLES.has(type)) {
    return NextResponse.json(
      { error: `Régénération non supportée pour le type "${type}".` },
      { status: 400 }
    );
  }

  // 2. Régénérer le contenu via Claude en conservant la structure exacte
  let nouveauContenu: unknown;
  try {
    nouveauContenu = await regenererContenu(type, source.titre as string, source.contenu);
  } catch (err) {
    console.error("[dupliquer] regen failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la régénération" },
      { status: 500 }
    );
  }

  // 3. Déterminer un titre unique — les contraintes UNIQUE sur
  //    (eleve_id/rb_eleve_id, date, type, titre) interdisent le doublon.
  //    On suffixe avec (2), (3)… selon ce qui existe déjà à la même date.
  const titreOriginal = (source.titre as string).replace(/\s+\(\d+\)\s*$/, "");
  const { data: dejaExistants } = await admin
    .from("plan_travail")
    .select("titre")
    .eq("date_assignation", source.date_assignation)
    .eq("type", source.type)
    .like("titre", `${titreOriginal}%`);

  const suffixesUtilises = new Set<number>();
  let originalExiste = false;
  for (const row of dejaExistants ?? []) {
    const t = row.titre as string;
    if (t === titreOriginal) originalExiste = true;
    const m = t.match(/\((\d+)\)\s*$/);
    if (m) suffixesUtilises.add(parseInt(m[1], 10));
  }
  let prochain = 2;
  while (suffixesUtilises.has(prochain)) prochain++;
  const nouveauTitre = originalExiste ? `${titreOriginal} (${prochain})` : titreOriginal;

  // 4. Créer un nouveau bloc pour chaque bloc source (mêmes élèves, même date)
  const nouveauxBlocs = sources.map((s) => ({
    eleve_id: s.eleve_id,
    repetibox_eleve_id: s.repetibox_eleve_id,
    titre: nouveauTitre,
    type: s.type,
    contenu: nouveauContenu,
    date_assignation: s.date_assignation,
    date_limite: s.date_limite,
    statut: "a_faire",
    chapitre_id: s.chapitre_id,
    periodicite: s.periodicite,
    groupe_label: s.groupe_label,
  }));

  const { data: inserts, error: errInsert } = await admin
    .from("plan_travail")
    .insert(nouveauxBlocs)
    .select("id");

  if (errInsert) {
    return NextResponse.json({ error: errInsert.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ids: (inserts ?? []).map((i) => i.id),
    nb_crees: inserts?.length ?? 0,
  });
}

async function regenererContenu(type: string, titre: string, contenu: unknown): Promise<unknown> {
  const prompt = `Tu es un assistant pédagogique pour une école primaire française (CE2-CM2).
L'enseignant veut UNE VARIANTE d'un exercice existant : même thème, même niveau, même structure,
mais avec des items/questions DIFFÉRENTS.

Type d'exercice : ${type}
Titre : ${titre}

Contenu actuel (à ne PAS répéter, juste comprendre la structure et le thème) :
${JSON.stringify(contenu, null, 2)}

INSTRUCTIONS :
- Génère une nouvelle variante avec le MÊME format JSON (mêmes champs, même nombre d'items)
- Le thème reste le même mais les questions/énoncés/items sont NOUVEAUX
- Adapte au niveau CE2-CM2 (8-11 ans)
- Ne répète AUCUNE des questions/items du contenu actuel

Réponds UNIQUEMENT avec le JSON complet de la variante, sans explication, sans backticks.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const texte = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = texte
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(json);
}
