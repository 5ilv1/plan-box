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
  motsAVerifier, verifierErreurs, questionsDeTest, questionsDeLecture, questionsDAccord,
  appliquerVerdicts, fusionnerTypographie, publier,
  type ErreurCorrection, type QuestionTest, type QuestionLecture, type QuestionAccord,
} from "./ecriture-correction";

export type Niveau = "CE2" | "CM1" | "CM2";

export async function analyserTexte(args: {
  texte: string;
  sujet?: string;
  niveau: Niveau;
  erreursPrecedentes?: Array<{ mot: string; type: string; indice?: string; correction?: string }>;
  anthropic: Anthropic;
  admin: SupabaseClient;
}): Promise<
  | {
      erreurs: ErreurCorrection[];
      niveau: Niveau;
      /** Les mêmes, AVEC le mot attendu : pour le retour enseignant, jamais pour l'élève. */
      completes: ErreurCorrection[];
    }
  | { echec: string }
> {
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

    // Les homophones sont vérifiés à part (`lib/homophones.ts`), et une faute
    // non confirmée n'est pas montrée :
    //  • les grammaticaux par le test de substitution appris en classe ;
    //  • les autres — vert/verre, ces/ses — par une seconde lecture de la
    //    phrase à trou, qui ne voit ni le mot de l'élève ni le premier avis.
    // Les deux appels sont indépendants : ils partent ensemble.
    //  • les accords et les temps par le test des deux phrases (`lib/accords.ts`).
    const questions = questionsDeTest(texte, verifiees);
    const lectures = questionsDeLecture(texte, verifiees);
    const accords = questionsDAccord(texte, verifiees);
    const [choix, lus, acceptables] = await Promise.all([
      questions.length > 0 ? poserTests(anthropic, questions) : Promise.resolve([]),
      lectures.length > 0 ? poserLectures(anthropic, lectures) : Promise.resolve([]),
      accords.length > 0 ? poserAccords(anthropic, accords) : Promise.resolve([]),
    ]);
    // Enfin les majuscules et les élisions, détectées par programme et non plus
    // devinées (`lib/typographie.ts`). Après les verdicts : ceux-ci décident par
    // index sur la liste d'origine, qu'il ne faut pas bouger avant eux.
    const completes = fusionnerTypographie(
      texte,
      appliquerVerdicts(verifiees, questions, choix, lectures, lus, accords, acceptables),
      (cle) => connus.has(cle),
    );
    const erreurs = publier(completes);

    const ecartees = Array.isArray(brutes) ? brutes.length - erreurs.length : 0;
    if (ecartees > 0) {
      console.info(
        `[ecriture/analyser] ${ecartees} signalement(s) écarté(s) sur ${brutes.length}` +
        (questions.length ? ` — ${questions.length} homophone(s) testé(s)` : "") +
        (lectures.length ? ` — ${lectures.length} relu(s)` : "") +
        (accords.length ? ` — ${accords.length} accord(s) testé(s)` : ""),
      );
    }
    return { erreurs, niveau, completes };
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
 * La seconde lecture des homophones de sens : pour chaque phrase à trou, le
 * mot qui convient parmi la famille.
 *
 * Le lecteur ne voit ni le mot de l'élève ni l'avis du premier modèle : c'est
 * ce qui en fait un second avis, et non une confirmation. Mêmes précautions
 * qu'aux tests de substitution — sortie imposée, numéro de phrase, mot
 * recopié — et tout ce qui n'est pas l'une des options vaut `null`.
 */
export async function poserLectures(
  anthropic: Anthropic,
  questions: QuestionLecture[],
): Promise<Array<string[] | null>> {
  const rien = questions.map(() => null);
  try {
    const reponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      temperature: 0,
      // ⚠️ Le critère a été calibré sur le corpus de mesure, dans les deux sens :
      // « le mot qui convient le mieux » inventait des fautes sur les phrases
      // ambiguës (« Il a coupé du pin ») ; « tout mot qui a un sens, même peu
      // courant » acceptait « Je bois dans un vert d'eau » et ne trouvait plus
      // que 6 fautes sur 22. Le juste milieu : un adulte comprendrait-il sans
      // hésiter, dans un sens réel du mot ? Les exemples ne sont PAS tirés du
      // corpus, sinon la mesure ne vaudrait rien.
      system:
        "Tu lis des phrases écrites par un élève de primaire. Dans chacune, un mot a été remplacé " +
        "par « ___ ». Pour chaque mot proposé, demande-toi : si l'élève avait écrit ce mot, un adulte " +
        "comprendrait-il la phrase sans hésiter, dans un sens réel et normal de ce mot ? Donne TOUS " +
        "les mots pour lesquels la réponse est oui. N'inclus pas un mot seulement parce que la phrase " +
        "reste grammaticale : il faut qu'elle ait un sens réel.\n\n" +
        "Exemples :\n" +
        "- « Elle a trouvé un ___ dans le jardin » (ver, verre, vers, vert) → ver, verre : un ver de " +
        "terre, ou un verre oublié. « vers » et « vert » n'y ont pas de sens.\n" +
        "- « Je mets du ___ sur mes frites » (celle, sel, selle) → sel seulement.\n" +
        "- « Il pose la ___ sur le dos du cheval » (celle, sel, selle) → selle seulement.\n\n" +
        "Ignore les autres fautes de la phrase (orthographe, accords, ponctuation) : elles ne te " +
        "concernent pas. Si aucun mot n'a de sens, donne une liste vide.",
      tools: [{
        name: "rendre_lectures",
        description: "Rend, pour chaque phrase, tous les mots qui ont un sens dans le trou.",
        input_schema: {
          type: "object",
          properties: {
            lectures: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phrase: { type: "integer", description: "Le numéro de la phrase." },
                  mots: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tous les mots proposés qui donnent une phrase qui a du sens, recopiés.",
                  },
                },
                required: ["phrase", "mots"],
              },
            },
          },
          required: ["lectures"],
        },
      }],
      tool_choice: { type: "tool", name: "rendre_lectures" },
      messages: [{
        role: "user",
        content: questions
          .map((q, i) =>
            `Phrase ${i + 1} — ${q.options.map((o) => `« ${o} »`).join(", ")} ?\n« ${q.phrase} »`)
          .join("\n\n"),
      }],
    });
    const appel = reponse.content.find((c) => c.type === "tool_use");
    const lectures = appel?.type === "tool_use"
      ? (appel.input as { lectures?: unknown }).lectures
      : undefined;
    if (!Array.isArray(lectures)) {
      console.error("[ecriture/analyser] lectures illisibles :", JSON.stringify(lectures)?.slice(0, 200));
      return rien;
    }
    return questions.map((q, i) => lireLecture(lectures, i + 1, q.options));
  } catch (err) {
    console.error("[ecriture/analyser] seconde lecture", err);
    return rien;
  }
}

/**
 * Les mots possibles pour la phrase `numero`, restreints aux options — `null`
 * si la phrase manque, reçoit deux réponses, ou cite un mot hors des options
 * (le lecteur a alors mal lu la question : on ne se fie pas au reste).
 */
export function lireLecture(lectures: unknown[], numero: number, options: string[]): string[] | null {
  const net = (m: unknown) => String(m ?? "").toLowerCase().replace(/[«»"“”]/g, "").trim();
  const pour = lectures.filter((l) => (l as { phrase?: unknown })?.phrase === numero);
  if (pour.length !== 1) return null;
  const mots = (pour[0] as { mots?: unknown }).mots;
  if (!Array.isArray(mots)) return null;
  const possibles: string[] = [];
  for (const m of mots) {
    const o = options.find((x) => net(x) === net(m));
    if (!o) return null;
    if (!possibles.includes(o)) possibles.push(o);
  }
  return possibles;
}

/**
 * Le test des deux phrases, pour les accords et les temps : la phrase de
 * l'élève et la corrigée, qui ne diffèrent que par la forme d'un mot. Le
 * vérificateur dit LESQUELLES un adulte écrirait. Si celle de l'élève en fait
 * partie, il a peut-être raison, et on se tait (`trancherAccord()`).
 *
 * La phrase d'avant est donnée en contexte : un temps se juge dans le récit.
 */
export async function poserAccords(
  anthropic: Anthropic,
  questions: QuestionAccord[],
): Promise<Array<Array<"A" | "B"> | null>> {
  const rien = questions.map(() => null);
  try {
    const reponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      temperature: 0,
      system:
        "Tu relis des phrases écrites par un élève de primaire. Dans chaque paire, les deux phrases " +
        "ne diffèrent que par la forme d'UN mot : l'accord ou le temps d'un verbe, l'accord d'un nom " +
        "ou d'un adjectif. Pour chaque paire, dis LESQUELLES un adulte écrirait ainsi en français " +
        "correct : A, B, les deux, ou aucune.\n\n" +
        "- Juge seulement le mot qui diffère. Ignore les autres fautes de la phrase (orthographe, " +
        "ponctuation, majuscules, autres accords) : elles sont les mêmes dans les deux phrases.\n" +
        "- Le contexte, quand il est donné, est la phrase d'avant. Il ne change pas : sers-t'en pour " +
        "juger le temps dans le récit.\n" +
        "- Réponds « les deux » quand les deux formes sont correctes : un récit entièrement au " +
        "présent, un mot qui peut être au singulier comme au pluriel.\n" +
        "- Une phrase n'est pas correcte parce qu'on la comprend : « les enfants joue » se comprend, " +
        "mais un adulte ne l'écrirait pas.",
      tools: [{
        name: "rendre_accords",
        description: "Rend, pour chaque paire, les phrases qu'un adulte écrirait.",
        input_schema: {
          type: "object",
          properties: {
            verdicts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  paire: { type: "integer", description: "Le numéro de la paire." },
                  correctes: {
                    type: "array",
                    items: { type: "string", enum: ["A", "B"] },
                    description: "Les phrases correctes : [], [\"A\"], [\"B\"] ou [\"A\", \"B\"].",
                  },
                },
                required: ["paire", "correctes"],
              },
            },
          },
          required: ["verdicts"],
        },
      }],
      tool_choice: { type: "tool", name: "rendre_accords" },
      messages: [{
        role: "user",
        content: questions
          .map((q, i) =>
            `Paire ${i + 1}` +
            (q.contexte ? `\nContexte : « ${q.contexte} »` : "") +
            `\nA : « ${q.A} »\nB : « ${q.B} »`)
          .join("\n\n"),
      }],
    });
    const appel = reponse.content.find((c) => c.type === "tool_use");
    const verdicts = appel?.type === "tool_use"
      ? (appel.input as { verdicts?: unknown }).verdicts
      : undefined;
    if (!Array.isArray(verdicts)) {
      console.error("[ecriture/analyser] accords illisibles :", JSON.stringify(verdicts)?.slice(0, 200));
      return rien;
    }
    return questions.map((_, i) => lireAccord(verdicts, i + 1));
  } catch (err) {
    console.error("[ecriture/analyser] test des accords", err);
    return rien;
  }
}

/**
 * Les phrases jugées correctes pour la paire `numero` — `null` si la paire
 * manque, reçoit deux réponses, ou cite autre chose que A et B.
 */
export function lireAccord(verdicts: unknown[], numero: number): Array<"A" | "B"> | null {
  const pour = verdicts.filter((v) => (v as { paire?: unknown })?.paire === numero);
  if (pour.length !== 1) return null;
  const correctes = (pour[0] as { correctes?: unknown }).correctes;
  if (!Array.isArray(correctes)) return null;
  const lettres: Array<"A" | "B"> = [];
  for (const c of correctes) {
    if (c !== "A" && c !== "B") return null;
    if (!lettres.includes(c)) lettres.push(c);
  }
  return lettres;
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
