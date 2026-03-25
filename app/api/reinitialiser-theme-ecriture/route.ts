import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// Option A : rotation déterministe sur 10 types
const TYPES_ECRITURE = [
  "récit à la 1re personne",
  "lettre",
  "description détaillée",
  "point de vue d'un objet ou d'un animal",
  "dialogue à inventer",
  "texte d'opinion argumenté",
  "suite de récit",
  "texte humoristique",
  "récit à la 3e personne",
  "texte imaginaire ou fantastique léger",
];

// POST /api/reinitialiser-theme-ecriture
// 1. Supprime les plan_travail du jour de type "ecriture"
// 2. Supprime le themes_ecriture du jour
// 3. Génère un nouveau thème via Claude (rotation déterministe du type)
// 4. Affecte automatiquement à tous les élèves
export async function POST() {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    // ── 1. Supprimer les blocs plan_travail du jour ───────────────────────
    await supabase
      .from("plan_travail")
      .delete()
      .eq("type", "ecriture")
      .eq("date_assignation", today);

    // ── 2. Supprimer le thème du jour ─────────────────────────────────────
    await supabase
      .from("themes_ecriture")
      .delete()
      .eq("date", today);

    // ── 3. Compter le total + récupérer les 50 derniers (Option A + B) ───
    const [{ count }, { data: derniers }] = await Promise.all([
      supabase.from("themes_ecriture").select("*", { count: "exact", head: true }),
      supabase
        .from("themes_ecriture")
        .select("sujet, type_ecriture")
        .order("date", { ascending: false })
        .limit(50),
    ]);

    // Option A : type imposé par rotation déterministe
    const total = count ?? 0;
    const typeImpose = TYPES_ECRITURE[total % TYPES_ECRITURE.length];

    // Option B : types utilisés récemment (pour contexte)
    const derniersTypes = (derniers ?? [])
      .slice(0, 6)
      .map((t: { type_ecriture: string | null }) => t.type_ecriture)
      .filter(Boolean)
      .join(", ");

    const listeSujets = (derniers ?? [])
      .map((t: { sujet: string }) => `- ${t.sujet}`)
      .join("\n");

    // ── 4. Générer un nouveau thème ───────────────────────────────────────
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: `Tu génères des sujets d'écriture créative variés pour des élèves de CE2/CM1/CM2 (7-11 ans) dans une école primaire française.

▶ TYPE D'ÉCRITURE IMPOSÉ : « ${typeImpose} »
Tu DOIS générer un sujet de CE type exact. Aucun autre type n'est accepté.
${derniersTypes ? `Types utilisés récemment (déjà vus, ne pas répéter) : ${derniersTypes}` : ""}

Sujets déjà utilisés — NE PAS reproduire ces thèmes ni des thèmes similaires :
${listeSujets || "(aucun)"}

RÈGLES STRICTES SUR LA LANGUE :
- Soigne ABSOLUMENT les accords en genre et en nombre : "ta grand-mère" (féminin), "ton grand-père" (masculin), "tes parents", etc. Aucune faute d'accord n'est tolérée.
- Langue française irréprochable : pas de fautes d'orthographe, de conjugaison ni de syntaxe.

RÈGLES STRICTES SUR LA FORME :
- INTERDIT de commencer par "Tu découvres", "Tu te réveilles", "Tu trouves", "Imagine que", "Si tu"
- Varier les structures : impératif ("Raconte...", "Décris...", "Écris..."), question ("Quel est le meilleur moment..."), situation directe ("Un matin, le facteur apporte un colis énorme..."), dialogue ("Ton meilleur ami te dit que...")

RÈGLES STRICTES SUR LE FOND :
- Thèmes : quotidien de l'école, famille, sport, nature, animaux réels, métiers, souvenirs, inventions, voyages, émotions
- ÉVITER : mondes magiques avec portes secrètes, pouvoirs surnaturels, trésors cachés, formules magiques
- Le sujet doit partir d'une situation concrète et réaliste ou légèrement décalée

Génère UN nouveau sujet d'écriture avec :
- Un sujet : 1 ou 2 phrases maximum. Plante le décor en 1 phrase (adapté au type « ${typeImpose} »), puis termine OBLIGATOIREMENT par une question courte ou une invitation directe à écrire.
- Une contrainte stylistique ou narrative concrète adaptée au type « ${typeImpose} » (sans mentionner le nombre de lignes)

Réponds UNIQUEMENT en JSON sans backticks :
{"sujet": "...", "contrainte": "..."}`,
      messages: [{ role: "user", content: "Génère un nouveau sujet d'écriture." }],
    });

    const texte = message.content[0].type === "text" ? message.content[0].text : "";
    const texteNettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(texteNettoye) as { sujet: string; contrainte: string };

    const { data: theme, error: errInsert } = await supabase
      .from("themes_ecriture")
      .insert({ date: today, sujet: parsed.sujet, contrainte: parsed.contrainte, type_ecriture: typeImpose, afficher_contrainte: true, affecte: false })
      .select("id, sujet, contrainte, affecte, afficher_contrainte")
      .single();

    if (errInsert || !theme) {
      return NextResponse.json({ erreur: errInsert?.message ?? "Insertion échouée" }, { status: 500 });
    }

    // ── 5. Récupérer tous les élèves via eleve_groupe ─────────────────────
    const { data: liaisons } = await supabase
      .from("eleve_groupe")
      .select("planbox_eleve_id, repetibox_eleve_id, groupe_id");

    if (!liaisons || liaisons.length === 0) {
      return NextResponse.json({ ok: true, theme, nb_eleves: 0 });
    }

    const groupeIds = [...new Set(liaisons.map((l: any) => l.groupe_id))];
    const { data: groupes } = await supabase
      .from("groupes")
      .select("id, nom")
      .in("id", groupeIds);

    const nomGroupe = new Map<string, string>(
      (groupes ?? []).map((g: { id: string; nom: string }) => [g.id, g.nom])
    );

    // ── 6. Construire et insérer les blocs plan_travail ───────────────────
    const vusRB = new Set<number>();
    const vusPB = new Set<string>();
    const blocs = [];
    const titreBloc = `Écriture — ${theme.sujet}`.substring(0, 50);

    for (const liaison of liaisons as { planbox_eleve_id: string | null; repetibox_eleve_id: number | null; groupe_id: string }[]) {
      const niveauNom = nomGroupe.get(liaison.groupe_id) ?? "";
      let contrainte = theme.contrainte;
      if (niveauNom === "CE2") contrainte += " · Au moins 3 lignes";
      else if (niveauNom === "CM1" || niveauNom === "CM2") contrainte += " · Au moins 5 lignes";

      const contenu = { sujet: theme.sujet, contrainte, instructions: "Écris ton texte sur ton cahier d'écrivain.", afficher_contrainte: true };

      if (liaison.repetibox_eleve_id && !vusRB.has(liaison.repetibox_eleve_id)) {
        vusRB.add(liaison.repetibox_eleve_id);
        blocs.push({ type: "ecriture", titre: titreBloc, contenu, date_assignation: today, statut: "a_faire", eleve_id: null, repetibox_eleve_id: liaison.repetibox_eleve_id, chapitre_id: null });
      } else if (liaison.planbox_eleve_id && !vusPB.has(liaison.planbox_eleve_id)) {
        vusPB.add(liaison.planbox_eleve_id);
        blocs.push({ type: "ecriture", titre: titreBloc, contenu, date_assignation: today, statut: "a_faire", eleve_id: liaison.planbox_eleve_id, repetibox_eleve_id: null, chapitre_id: null });
      }
    }

    const { error: errBlocs } = await supabase.from("plan_travail").insert(blocs);
    if (errBlocs) return NextResponse.json({ erreur: errBlocs.message }, { status: 500 });

    // ── 7. Marquer affecté + archiver dans banque_ressources ─────────────
    await supabase.from("themes_ecriture").update({ affecte: true }).eq("id", theme.id);
    await supabase.from("banque_ressources").insert({
      titre: theme.sujet, sous_type: "ecriture",
      contenu: { sujet: theme.sujet, contrainte: theme.contrainte, date: today },
    });

    return NextResponse.json({ ok: true, theme: { ...theme, affecte: true }, nb_eleves: blocs.length });

  } catch (err) {
    console.error("[reinitialiser-theme-ecriture]", err);
    return NextResponse.json({ erreur: String(err) }, { status: 500 });
  }
}
