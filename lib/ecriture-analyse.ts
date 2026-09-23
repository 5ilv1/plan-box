// ── Analyse d'un texte d'élève : le pipeline complet ─────────────────────────
//
// Sorti de la route pour pouvoir être exécuté tel quel — avec le vrai modèle et
// le vrai dictionnaire — sans passer par une session HTTP : une route Next.js
// ne peut exporter que ses méthodes.
//
//   1. le modèle signale ;
//   2. le dictionnaire et le texte vérifient (`lib/ecriture-correction.ts`) ;
//   3. les homophones grammaticaux passent le test de substitution
//      (`lib/homophones.ts`), par une seconde question fermée ;
//   4. on publie sans les champs internes.
//
// Une panne n'est jamais un sans-faute : elle rend `{ echec }`, et la route
// répond 502.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REFERENCE_CYCLE3 } from "./ecriture-reference-cycle3";
import {
  motsAVerifier, verifierErreurs, questionsDeTest, appliquerTests, publier,
  type ErreurCorrection, type QuestionTest,
} from "./ecriture-correction";

export type Niveau = "CE2" | "CM1" | "CM2";

export async function analyserTexte(args: {
  texte: string;
  sujet?: string;
  niveau: Niveau;
  erreursPrecedentes?: Array<{ mot: string; type: string; indice?: string; correction?: string }>;
  anthropic: Anthropic;
  admin: SupabaseClient;
}): Promise<{ erreurs: ErreurCorrection[]; niveau: Niveau } | { echec: string }> {
  const { texte, sujet, niveau, erreursPrecedentes, anthropic, admin } = args;

  let contextePrecedent = "";
  if (erreursPrecedentes && erreursPrecedentes.length > 0) {
    contextePrecedent =
      "\n\nERREURS DÉJÀ SIGNALÉES PRÉCÉDEMMENT (si encore présentes, mets la correction dans le champ 'correction') :\n" +
      erreursPrecedentes
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
4. "homophone" : le mot EXISTE mais ce n'est pas le bon — "a" pour "à", "et" pour "est", "son" pour "sont", "on" pour "ont", "ou" pour "où", "ce" pour "se", "sa" pour "ça", "mes" pour "mais", "vert" pour "verre", "mer" pour "mère"… Utilise TOUJOURS ce type pour une confusion entre deux mots qui se prononcent pareil, jamais "orthographe" ni "grammaire".

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
- "type" : "orthographe" | "grammaire" | "syntaxe" | "homophone"
- "position" : index exact du premier caractère du mot
- "indice" : indice pédagogique adapté au niveau ${niveau}, SANS donner la réponse la 1re fois
- "attendu" : le mot juste, TOUJOURS (il n'est pas montré à l'élève : il sert à vérifier ta correction)
- "correction" : forme correcte (UNIQUEMENT si erreur déjà signalée auparavant et toujours présente)
${contextePrecedent}

Maximum 15 erreurs, priorise les plus pédagogiques.
Retourne UNIQUEMENT un JSON array, rien d'autre.`;

  try {
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
      return { echec: "Analyse illisible" };
    }

    // Le modèle propose, le dictionnaire dispose (`lib/ecriture-correction.ts`).
    const connus = await chargerMotsConnus(admin, motsAVerifier(brutes));
    const verifiees = verifierErreurs(texte, brutes, (cle) => connus.has(cle));

    // Les homophones grammaticaux passent le test de substitution appris en
    // classe (`lib/homophones.ts`) : une seconde question, fermée, dont la
    // réponse décide seule. Une faute non confirmée n'est pas montrée.
    const questions = questionsDeTest(texte, verifiees);
    const choix = questions.length > 0 ? await poserTests(anthropic, questions) : [];
    const erreurs = publier(appliquerTests(verifiees, questions, choix));

    const ecartees = Array.isArray(brutes) ? brutes.length - erreurs.length : 0;
    if (ecartees > 0) {
      console.info(
        `[ecriture/analyser] ${ecartees} signalement(s) écarté(s) sur ${brutes.length}` +
        (questions.length ? ` — ${questions.length} homophone(s) testé(s)` : ""),
      );
    }
    return { erreurs, niveau };
  } catch (err) {
    console.error("[ecriture/analyser]", err);
    return { echec: "Analyse indisponible" };
  }
}

/**
 * Pose les tests de substitution, tous en un appel.
 *
 * Chaque question oppose deux phrases qui ne diffèrent que par UN mot : le
 * vérificateur n'a qu'à choisir. Il a le droit de répondre « ? » — et une
 * réponse illisible, ou un appel qui échoue, vaut « ? » partout : la faute
 * n'est alors pas montrée. Jamais de verdict par défaut.
 */
export async function poserTests(
  anthropic: Anthropic,
  questions: QuestionTest[],
): Promise<Array<"A" | "B" | null>> {
  const rien = questions.map(() => null);
  try {
    const reponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      temperature: 0,
      system:
        "Tu compares des paires de phrases écrites par un élève de primaire. Dans chaque paire, " +
        "les deux phrases ne diffèrent que par UN seul mot. Dis laquelle est correcte À CET ENDROIT : " +
        "A ou B. Ignore toutes les autres fautes (orthographe, accords, ponctuation, majuscules) : " +
        "elles sont les mêmes dans les deux phrases et ne doivent pas influencer ton choix. Réponds " +
        "« ? » si AUCUNE ne convient, si LES DEUX se disent, ou si tu hésites.",
      // ⚠️ Une réponse STRUCTURÉE, pas un « réponds en JSON » : au premier essai
      // le modèle rendait un tableau, au second de la prose (« → **B** »), et
      // tous les verdicts devenaient illisibles — les vraies fautes avec. Un
      // outil imposé l'oblige à remplir le schéma.
      //
      // ⚠️ Et il NOMME le mot choisi, avec le numéro de la paire, au lieu de
      // rendre une lettre : sur vingt-quatre paires, il a répondu « B » pour
      // « Mon frère avait / à un vélo ». Une lettre se confond ou se décale
      // d'une ligne sans que rien ne le trahisse ; un mot qui n'est pas l'un
      // des deux de la paire, si — et le verdict est alors écarté.
      tools: [{
        name: "rendre_verdicts",
        description: "Rend un verdict par paire : le mot qui convient à l'endroit où les deux phrases diffèrent.",
        input_schema: {
          type: "object",
          properties: {
            verdicts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  paire: { type: "integer", description: "Le numéro de la paire." },
                  mot: {
                    type: "string",
                    description: "Le mot qui convient, recopié tel qu'il est proposé — ou « ? » en cas de doute.",
                  },
                },
                required: ["paire", "mot"],
              },
            },
          },
          required: ["verdicts"],
        },
      }],
      tool_choice: { type: "tool", name: "rendre_verdicts" },
      messages: [{
        role: "user",
        content: questions
          .map((q, i) =>
            `Paire ${i + 1} — « ${q.motA} » ou « ${q.motB} » ?\nA : « ${q.A} »\nB : « ${q.B} »`)
          .join("\n\n"),
      }],
    });

    const appel = reponse.content.find((c) => c.type === "tool_use");
    const verdicts = appel?.type === "tool_use"
      ? (appel.input as { verdicts?: unknown }).verdicts
      : undefined;
    if (!Array.isArray(verdicts)) {
      console.error("[ecriture/analyser] verdicts illisibles :", JSON.stringify(verdicts)?.slice(0, 200));
      return rien;
    }
    return questions.map((q, i) => lireVerdict(verdicts, i + 1, q));
  } catch (err) {
    console.error("[ecriture/analyser] tests de substitution", err);
    return rien;
  }
}

/**
 * Le verdict de la paire `numero` : « A » si le mot nommé est celui de la
 * phrase A, « B » pour la B, `null` pour tout le reste — mot hors de la paire,
 * doute, paire absente, ou deux réponses contradictoires pour la même paire.
 */
export function lireVerdict(
  verdicts: unknown[],
  numero: number,
  q: QuestionTest,
): "A" | "B" | null {
  const net = (m: unknown) =>
    String(m ?? "").toLowerCase().replace(/[«»"“”]/g, "").trim();
  const choix = new Set(
    verdicts
      .filter((v) => (v as { paire?: unknown })?.paire === numero)
      .map((v) => {
        const m = net((v as { mot?: unknown }).mot);
        return m === net(q.motA) ? "A" : m === net(q.motB) ? "B" : null;
      }),
  );
  if (choix.size !== 1) return null; // absente ou contradictoire
  return [...choix][0];
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
async function chargerMotsConnus(admin: SupabaseClient, cles: string[]): Promise<Set<string>> {
  if (cles.length === 0) return new Set();
  const { data, error } = await admin
    .from("lexique_francais")
    .select("mot")
    .in("mot", cles);
  if (error) {
    console.error("[ecriture/analyser] lexique_francais :", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { mot: string }) => r.mot));
}
