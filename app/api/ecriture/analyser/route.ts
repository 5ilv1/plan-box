import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";
import { niveauEleveDepuisBloc } from "@/lib/ecriture-niveau-eleve";
import { getServerUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { motsAVerifier, verifierErreurs } from "@/lib/ecriture-correction";

/**
 * POST /api/ecriture/analyser
 *
 * Analyse le texte de l'élève et retourne la liste des erreurs détectées.
 *
 * Body : {
 *   texte: string,
 *   sujet?: string,
 *   blocId?: string,                // pour récupérer le niveau de l'élève
 *   erreurs_precedentes?: Erreur[], // rétro-compat
 *   jour?: number                   // rétro-compat (ignoré dans le nouveau flux)
 * }
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
  }
  const limited = rateLimit(req, { key: "ecriture-analyser", max: 30, windowSec: 60, identifier: user.id });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  const texte = body.texte as string;
  const sujet = body.sujet as string | undefined;
  const blocId = body.blocId as string | undefined;
  const erreurs_precedentes = body.erreurs_precedentes as Array<{ mot: string; type: string; indice?: string; correction?: string }> | undefined;

  if (!texte?.trim()) {
    return NextResponse.json({ erreurs: [] }, { status: 400 });
  }

  // Récupérer le niveau de l'élève (CE2 / CM1 / CM2) si on a le bloc
  let niveau: "CE2" | "CM1" | "CM2" = "CM1";
  if (blocId) {
    try {
      niveau = await niveauEleveDepuisBloc(createAdminClient(), blocId);
    } catch {}
  }

  let contextePrecedent = "";
  if (erreurs_precedentes && erreurs_precedentes.length > 0) {
    contextePrecedent =
      "\n\nERREURS DÉJÀ SIGNALÉES PRÉCÉDEMMENT (si encore présentes, mets la correction dans le champ 'correction') :\n" +
      erreurs_precedentes
        .map(
          (e, i) =>
            `${i + 1}. [${e.type}] "${e.mot}"${e.indice ? ` — Indice : "${e.indice}"` : ""}${e.correction ? ` — Correction : "${e.correction}"` : ""}`
        )
        .join("\n");
  }

  const systemDynamique = `Tu es un correcteur de français pour un élève de ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans). Sois INDULGENT et reste sur les bases.

PÉRIMÈTRE STRICT — Tu signales UNIQUEMENT :
1. "orthographe" : mots clairement mal orthographiés (le mot n'existe pas en français, ou la graphie est manifestement fausse). Inclut les anglicismes.
2. "grammaire" : accords sujet-verbe évidents (ex: "ils mange"), accords nom-adjectif simples (ex: "des petit chats"), conjugaisons mal foutues au niveau ${niveau}.
3. "syntaxe" : majuscule oubliée en début de phrase, point final manquant, "qu'il" au lieu de "quil", etc. — UNIQUEMENT les cas évidents.

NE SIGNALE JAMAIS :
- Les espaces avant/après la ponctuation (typographie pointue)
- Les apostrophes droites vs typographiques
- Les guillemets français vs droits
- Les espaces insécables manquants
- Les majuscules accentuées manquantes (É, À…)
- Les nuances stylistiques, choix de mots, registres de langue
- Les répétitions de mots (sauf si vraiment massives)
- Tout ce qui dépasse le programme de ${niveau}
- Un mot dont tu n'es pas SÛR qu'il soit fautif → en cas de doute, NE SIGNALE PAS

RÈGLE CRITIQUE — POSITIONS EXACTES :
- Signale CHAQUE occurrence séparément si un mot erroné apparaît plusieurs fois
- "position" = index EXACT du premier caractère du mot dans le texte (commence à 0)
- texte.substring(position, position + mot.length).toLowerCase() doit être égal au mot signalé (en minuscule)

Pour CHAQUE erreur, retourne un objet JSON :
- "mot" : le mot erroné tel qu'il apparaît dans le texte
- "type" : "orthographe" | "grammaire" | "syntaxe"
- "position" : index exact du premier caractère du mot
- "indice" : indice pédagogique adapté au niveau ${niveau}, SANS donner la réponse la 1re fois
- "correction" : forme correcte (UNIQUEMENT si erreur déjà signalée auparavant et toujours présente)
${contextePrecedent}

Maximum 15 erreurs, priorise les plus pédagogiques.
Retourne UNIQUEMENT un JSON array, rien d'autre.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: REFERENCE_CYCLE3,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemDynamique,
        },
      ],
      messages: [
        {
          role: "user",
          content: `${sujet ? `Sujet : "${sujet}"\n\n` : ""}Niveau : ${niveau}\n\nTexte à corriger :\n\n${texte}`,
        },
      ],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text;
    const brutes = lireTableauJSON(rawText);
    if (brutes === null) {
      // ⚠️ Jamais `{ erreurs: [] }` ici : le composant l'afficherait comme
      // « Bravo ! Je n'ai trouvé aucune erreur ». Une panne ne doit pas se
      // déguiser en sans-faute.
      console.error("[ecriture/analyser] réponse illisible :", rawText.slice(0, 300));
      return NextResponse.json({ erreur: "Analyse illisible" }, { status: 502 });
    }

    // Le modèle propose, le dictionnaire dispose (`lib/ecriture-correction.ts`).
    const connus = await chargerMotsConnus(motsAVerifier(brutes));
    const erreurs = verifierErreurs(texte, brutes, (cle) => connus.has(cle));

    const ecartees = Array.isArray(brutes) ? brutes.length - erreurs.length : 0;
    if (ecartees > 0) {
      console.info(`[ecriture/analyser] ${ecartees} signalement(s) écarté(s) sur ${brutes.length}`);
    }
    return NextResponse.json({ erreurs, niveau });
  } catch (err) {
    console.error("[ecriture/analyser]", err);
    return NextResponse.json({ erreur: "Analyse indisponible" }, { status: 502 });
  }
}

/**
 * Le premier tableau JSON de la réponse, en suivant l'imbrication des
 * crochets — les modèles ajoutent souvent une phrase après, qui peut elle-même
 * contenir un crochet. `null` si rien de lisible.
 */
function lireTableauJSON(brut: string): unknown[] | null {
  const debut = brut.indexOf("[");
  if (debut === -1) return null;
  let profondeur = 0;
  let dansChaine = false;
  for (let i = debut; i < brut.length; i++) {
    const c = brut[i];
    if (dansChaine) {
      if (c === "\\") i++;
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') dansChaine = true;
    else if (c === "[") profondeur++;
    else if (c === "]" && --profondeur === 0) {
      try {
        const v = JSON.parse(brut.slice(debut, i + 1));
        return Array.isArray(v) ? v : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Les mots attestés parmi `cles`, en une requête.
 *
 * Dictionnaire injoignable ⇒ ensemble vide : `verifierErreurs()` laisse alors
 * passer les erreurs comme avant. Mieux vaut une correction non filtrée qu'une
 * correction qui disparaît sans prévenir.
 */
async function chargerMotsConnus(cles: string[]): Promise<Set<string>> {
  if (cles.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("lexique_francais")
    .select("mot")
    .in("mot", cles);
  if (error) {
    console.error("[ecriture/analyser] lexique_francais :", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { mot: string }) => r.mot));
}
