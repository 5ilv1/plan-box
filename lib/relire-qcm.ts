import Anthropic from "@anthropic-ai/sdk";

/**
 * Relecture d'un QCM généré : chaque question doit avoir UNE bonne option, et
 * ce doit être celle que le générateur a désignée.
 *
 * Le 13/10, un QCM de CM1 proposait « es / êtes / sommes / suis » pour « Ma
 * sœur … très courageuse » — la bonne réponse n'y était pas, et le QCM
 * attendait « es » — et une autre question avait deux phrases déclaratives
 * parmi ses options, une seule acceptée. Le prompt disait pourtant « une seule
 * bonne réponse » : comme partout ailleurs, **le prompt ne fait pas foi**.
 *
 * - Le relecteur **ne voit pas** la réponse attendue : il dit lui-même quelles
 *   options sont justes. Montrée, il la confirmerait.
 * - Il **répond d'abord lui-même**, puis juge les options (`ta_reponse`). Sans
 *   cette étape, dans un QCM de dix questions, il acceptait « es » pour « Ma
 *   sœur … courageuse » : l'option la plus proche, faute de mieux. Seule, la
 *   même question était bien écartée.
 * - Il **recopie le texte** des options, pas un numéro (même leçon que les
 *   homophones, `lib/ecriture-analyse.ts`) : un texte qui n'est pas une des
 *   options trahit un verdict décalé ; un numéro, non.
 * - Une question sans bonne option, avec plusieurs, ou dont la bonne option
 *   n'est pas celle du générateur est **écartée** : on ne sait pas laquelle
 *   des deux lectures a raison, et une question écartée coûte moins qu'une
 *   question qui compte faux un élève qui a juste. Les routes demandent deux
 *   questions de marge et coupent au nombre voulu (`couperQcm()`).
 * - Une question **dessinée** (`figure`, `options_figures`, `droite`) n'est pas
 *   relue : le relecteur ne voit pas le dessin, et il écartait tout un QCM de
 *   fractions en images (« aucune option juste » : il lisait « Figure A »).
 *   Ces questions-là sont calculées, pas écrites par le modèle.
 * - Une relecture en panne ou illisible **ne bloque pas** la génération : la
 *   question est gardée, comme avant. L'enseignant relit de toute façon.
 *
 * Contrat : `npx tsx docs/tests/test-relire-qcm.mjs`.
 */

export interface QuestionQcm {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
  [cle: string]: unknown;
}

export type Raison = "aucune" | "plusieurs" | "autre";

export interface Ecartee {
  question: string;
  raison: Raison;
}

/** Ce que le relecteur a rendu pour une question ; `null` = illisible. */
export type Verdict = string[] | null;

/** Une question qui s'appuie sur un dessin : le relecteur ne la voit pas. */
export function estDessinee(q: QuestionQcm): boolean {
  return q.figure != null || q.options_figures != null || q.droite != null;
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Pure : garde les questions dont la seule option juste est celle attendue.
 * `verdicts[i]` porte sur `questions[i]`.
 */
export function trancherQcm(
  questions: QuestionQcm[],
  verdicts: Verdict[],
): { questions: QuestionQcm[]; ecartees: Ecartee[] } {
  const gardees: QuestionQcm[] = [];
  const ecartees: Ecartee[] = [];

  questions.forEach((q, i) => {
    const v = verdicts[i];
    if (!v || estDessinee(q)) { gardees.push(q); return; }

    const options = q.options.map(norm);
    const justes = new Set<number>();
    for (const texte of v) {
      const k = options.indexOf(norm(texte));
      // Un texte qui n'est pas une option : verdict décalé, on ne s'y fie pas.
      if (k < 0) { gardees.push(q); return; }
      justes.add(k);
    }

    if (justes.size === 0) ecartees.push({ question: q.question, raison: "aucune" });
    else if (justes.size > 1) ecartees.push({ question: q.question, raison: "plusieurs" });
    else if (!justes.has(q.reponse_correcte)) ecartees.push({ question: q.question, raison: "autre" });
    else gardees.push(q);
  });

  return { questions: gardees, ecartees };
}

/** Coupe au nombre demandé, une fois les questions douteuses écartées. */
export function couperQcm<T>(questions: T[], nb: number): T[] {
  return questions.slice(0, Math.max(0, nb));
}

/** Pure : lit la sortie de l'outil, un verdict par question (`null` si absent). */
export function lireVerdicts(brut: unknown, nb: number): Verdict[] {
  const verdicts: Verdict[] = Array.from({ length: nb }, () => null);
  if (!Array.isArray(brut)) return verdicts;
  const vus = new Set<number>();
  for (const v of brut) {
    const n = (v as { question?: unknown })?.question;
    const justes = (v as { options_justes?: unknown })?.options_justes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > nb) continue;
    if (!Array.isArray(justes) || !justes.every((t) => typeof t === "string")) continue;
    // Deux verdicts pour la même question : contradictoires, on n'en croit aucun.
    if (vus.has(n)) { verdicts[n - 1] = null; continue; }
    vus.add(n);
    verdicts[n - 1] = justes as string[];
  }
  return verdicts;
}

/**
 * Relit le QCM avec le modèle. `contexte` : le texte ou la transcription sur
 * lequel portent les questions, s'il y en a un.
 */
export async function relireQcm(
  questions: QuestionQcm[],
  anthropic: Anthropic,
  options: { niveau?: string; contexte?: string } = {},
): Promise<{ questions: QuestionQcm[]; ecartees: Ecartee[] }> {
  if (questions.length === 0 || questions.every(estDessinee)) return { questions, ecartees: [] };
  try {
    const reponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `Tu relis un QCM destiné à des élèves de primaire${options.niveau ? ` (${options.niveau})` : ""}, avant qu'il leur soit donné.
Pour CHAQUE question :
1. Réponds d'abord toi-même à la question, sans regarder les options (champ « ta_reponse »).
2. Puis indique TOUTES les options qui sont des réponses justes — aucune, une ou plusieurs. Ne suppose pas qu'il y en a exactement une : c'est justement ce que tu vérifies. Si la bonne réponse ne figure pas parmi les options, la liste est VIDE : une option « presque juste » (mauvaise personne, mauvais accord, autre temps) n'est pas juste.
Une option est juste si un enseignant l'accepterait comme bonne réponse à la question telle qu'elle est posée, en français de France correct.${options.contexte ? "\nLes questions portent sur le texte fourni : juge d'après ce texte." : ""}
Recopie chaque option juste EXACTEMENT comme elle est écrite.`,
      tools: [{
        name: "rendre_verdicts",
        description: "Rend, pour chaque question, la liste des options qui sont des réponses justes.",
        input_schema: {
          type: "object",
          properties: {
            verdicts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "integer", description: "Le numéro de la question." },
                  ta_reponse: {
                    type: "string",
                    description: "Ta propre réponse à la question, écrite AVANT de regarder les options.",
                  },
                  options_justes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Le texte exact de chaque option juste ; vide si aucune ne l'est.",
                  },
                },
                required: ["question", "ta_reponse", "options_justes"],
              },
            },
          },
          required: ["verdicts"],
        },
      }],
      tool_choice: { type: "tool", name: "rendre_verdicts" },
      messages: [{
        role: "user",
        content: (options.contexte ? `TEXTE :\n${options.contexte.trim()}\n\n` : "") +
          questions
            .map((q, i) => `Question ${i + 1} — ${q.question}\n${q.options.map((o) => `- ${o}`).join("\n")}`)
            .join("\n\n"),
      }],
    });

    const appel = reponse.content.find((c) => c.type === "tool_use");
    const brut = appel?.type === "tool_use" ? (appel.input as { verdicts?: unknown }).verdicts : undefined;
    const resultat = trancherQcm(questions, lireVerdicts(brut, questions.length));
    for (const e of resultat.ecartees) {
      console.log(`[relire-qcm] écartée (${e.raison}) : ${e.question}`);
    }
    return resultat;
  } catch (err) {
    console.warn("[relire-qcm] relecture impossible, QCM gardé tel quel :", err);
    return { questions, ecartees: [] };
  }
}
