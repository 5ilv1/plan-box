import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export const maxDuration = 60;

/**
 * POST /api/corriger-dictee
 * Body: { images: string[] (base64 data-urls), bloc_id: string }
 * Retourne: { transcription, nb_mots_corrects, nb_mots_total,
 *             erreurs: [{ mot_eleve, type_erreur, indice }] }
 *
 * Pipeline en 3 étapes :
 *  1. VISION (Opus) : transcription fidèle de la copie sans montrer le texte
 *     attendu (sinon le modèle « lit » le texte attendu et rate les fautes).
 *  2. DIFF ALGORITHMIQUE : on compare mot à mot transcription vs texte attendu
 *     avec un alignement Levenshtein. Aucune erreur ne peut être « oubliée ».
 *  3. CLASSIFICATION (Sonnet) : un unique appel IA classe les erreurs
 *     (lettre muette, accord S/V, homophone…) et produit l'indice pédagogique.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de diff
// ─────────────────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Clé de comparaison lâche : minuscules, sans accent, sans ponctuation de fin. */
function normaliserMot(t: string): string {
  return stripAccents(t.toLowerCase()).replace(/[.,;:!?«»"'()]+$/g, "").replace(/^[«»"'()]+/, "");
}

/** Tokenise en gardant la ponctuation comme tokens séparés (. , ; : ! ? " ' — …). */
function tokenizer(s: string): string[] {
  const out: string[] = [];
  // Sépare les mots de la ponctuation forte ; garde les apostrophes et tirets internes aux mots.
  const re = /[\p{L}\p{N}'\-]+|[.,;:!?…«»"()]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

type Op =
  | { type: "match"; expected: string; actual: string }
  | { type: "sub";   expected: string; actual: string }
  | { type: "del";   expected: string }   // oublié par l'élève
  | { type: "ins";   actual: string };    // en trop

/** Alignement Needleman-Wunsch sur des tokens, avec normalisation lâche. */
function aligner(att: string[], eleve: string[]): Op[] {
  const n = att.length, m = eleve.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = normaliserMot(att[i - 1]) === normaliserMot(eleve[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (same ? 0 : 1),
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }

  const ops: Op[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = normaliserMot(att[i - 1]) === normaliserMot(eleve[j - 1]);
      if (dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : 1)) {
        ops.push(same
          ? { type: "match", expected: att[i - 1], actual: eleve[j - 1] }
          : { type: "sub",   expected: att[i - 1], actual: eleve[j - 1] });
        i--; j--; continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "del", expected: att[i - 1] });
      i--; continue;
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.push({ type: "ins", actual: eleve[j - 1] });
      j--; continue;
    }
    break;
  }
  return ops.reverse();
}

interface DiffErreur {
  mot_eleve: string;
  mot_attendu: string;
  kind: "sub" | "del" | "ins" | "casse" | "ponctuation";
  contexte: string;
}

/** Construit la liste des erreurs exhaustives depuis l'alignement. */
function construireErreurs(att: string[], eleve: string[]): { erreurs: DiffErreur[]; nb_corrects: number; nb_total: number } {
  const ops = aligner(att, eleve);
  const erreurs: DiffErreur[] = [];
  let nb_corrects = 0;

  // Compter nb_total comme nombre de mots (hors ponctuation pure) du texte attendu
  const estPonct = (t: string) => /^[.,;:!?…«»"()]$/.test(t);
  const nb_total = att.filter((t) => !estPonct(t)).length;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const contexteAvant = ops.slice(Math.max(0, k - 3), k).map((o) =>
      o.type === "ins" ? o.actual : "expected" in o ? o.expected : ""
    ).filter(Boolean).join(" ");
    const contexteApres = ops.slice(k + 1, k + 4).map((o) =>
      o.type === "ins" ? o.actual : "expected" in o ? o.expected : ""
    ).filter(Boolean).join(" ");
    const contexte = `${contexteAvant} …ICI… ${contexteApres}`.trim();

    if (op.type === "match") {
      // Même mot en normalisé : vérifier la casse et les accents exacts
      if (op.expected === op.actual) {
        if (!estPonct(op.expected)) nb_corrects++;
      } else {
        // Différence uniquement de casse ou d'accent
        const memeStrip = stripAccents(op.expected.toLowerCase()) === stripAccents(op.actual.toLowerCase());
        erreurs.push({
          mot_eleve: op.actual,
          mot_attendu: op.expected,
          kind: memeStrip ? "casse" : "sub",
          contexte,
        });
      }
    } else if (op.type === "sub") {
      erreurs.push({
        mot_eleve: op.actual,
        mot_attendu: op.expected,
        kind: estPonct(op.expected) || estPonct(op.actual) ? "ponctuation" : "sub",
        contexte,
      });
    } else if (op.type === "del") {
      erreurs.push({
        mot_eleve: "",
        mot_attendu: op.expected,
        kind: estPonct(op.expected) ? "ponctuation" : "del",
        contexte,
      });
    } else if (op.type === "ins") {
      erreurs.push({
        mot_eleve: op.actual,
        mot_attendu: "",
        kind: estPonct(op.actual) ? "ponctuation" : "ins",
        contexte,
      });
    }
  }

  return { erreurs, nb_corrects, nb_total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route POST
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const bloc_id = body.bloc_id;
  const imageList: string[] = body.images ?? (body.image ? [body.image] : []);

  if (imageList.length === 0 || !bloc_id) {
    return NextResponse.json({ error: "image(s) et bloc_id requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("contenu, type, eleve_id, repetibox_eleve_id")
    .eq("id", bloc_id)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ error: "Bloc introuvable" }, { status: 404 });
  }

  if (bloc.eleve_id) {
    const user = await getServerUser();
    if (!user || user.id !== bloc.eleve_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  if (bloc.type !== "dictee" && bloc.type !== "mots") {
    return NextResponse.json({ error: "Ce bloc n'est pas une dictée ou une liste de mots" }, { status: 400 });
  }

  const contenu = bloc.contenu as {
    texte?: string;
    phrases?: { id: number; texte: string }[];
    mots?: { mot: string; definition: string; pronom?: string }[];
  };

  const estMots = bloc.type === "mots";
  const texteAttendu = estMots
    ? (contenu.mots ?? []).map((m) => m.pronom ? `${m.pronom} ${m.mot}` : m.mot).join("\n")
    : contenu.texte || contenu.phrases?.map((p) => p.texte).join(" ") || "";

  if (!texteAttendu) {
    return NextResponse.json({ error: "Contenu de référence introuvable" }, { status: 400 });
  }

  // Extraire les images (data-urls base64)
  const imageBlocks: { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } }[] = [];
  for (const img of imageList) {
    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Format image invalide" }, { status: 400 });
    }
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: match[2],
      },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
  const nbPages = imageBlocks.length;

  // ── Étape 1 : TRANSCRIPTION FIDÈLE (vision) ───────────────────────────────
  const promptTranscription = estMots
    ? `Tu es un OCR spécialisé dans l'écriture manuscrite d'enfants de primaire.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève a écrit une liste de mots.

MISSION : transcrire EXACTEMENT ce que l'élève a écrit, MÊME SI C'EST FAUX.

RÈGLES ABSOLUES :
- Ne CORRIGE JAMAIS les fautes. Reproduis toutes les erreurs : orthographe, accents, majuscules, lettres doublées ou manquantes.
- Si l'élève a écrit "mason", tu transcris "mason", pas "maison".
- Si un accent est absent, tu l'omets aussi.
- Un mot par ligne, dans l'ordre du cahier.
- Ignore les ratures barrées.

Réponds UNIQUEMENT avec ce JSON :
{ "transcription": "ligne1\\nligne2\\n..." }`
    : `Tu es un OCR spécialisé dans l'écriture manuscrite d'enfants de primaire.

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier` : "Voici la photo d'un cahier"} où un élève a écrit une dictée.

MISSION : transcrire EXACTEMENT ce que l'élève a écrit, mot pour mot, MÊME SI C'EST FAUX.

RÈGLES ABSOLUES :
- Ne CORRIGE JAMAIS les fautes : reproduis les erreurs d'orthographe, d'accord, d'accent, de majuscule, de ponctuation, de lettre doublée.
- Si l'élève a écrit "il mange" au lieu de "ils mangent", transcris "il mange".
- Si l'élève a oublié un mot, ne l'invente pas.
- Si l'élève a ajouté un mot en trop, garde-le.
- Conserve la ponctuation exacte et la casse.
- Une seule ligne continue, phrases séparées par leur ponctuation.
- Ignore les ratures barrées.

Réponds UNIQUEMENT avec ce JSON :
{ "transcription": "ce que l'élève a vraiment écrit, mot pour mot" }`;

  let transcription = "";
  try {
    const respVision = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: promptTranscription },
          ],
        },
      ],
    });

    const texteVision = respVision.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const matchVision = texteVision.match(/\{[\s\S]*\}/);
    if (!matchVision) {
      return NextResponse.json({ error: "Transcription IA invalide" }, { status: 500 });
    }
    transcription = String(JSON.parse(matchVision[0]).transcription ?? "").trim();
    if (!transcription) {
      return NextResponse.json({ error: "Transcription vide" }, { status: 500 });
    }
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur vision:", err);
    return NextResponse.json({ error: "Erreur lors de la lecture de la photo" }, { status: 500 });
  }

  // ── Étape 2 : DIFF ALGORITHMIQUE (aucune erreur oubliée) ───────────────────
  const tokensAttendus = tokenizer(texteAttendu);
  const tokensEleve    = tokenizer(transcription);
  const { erreurs, nb_corrects, nb_total } = construireErreurs(tokensAttendus, tokensEleve);

  // Pas d'erreurs → court-circuiter
  if (erreurs.length === 0) {
    return NextResponse.json({
      transcription,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: [],
    });
  }

  // ── Étape 3 : CLASSIFICATION IA des erreurs détectées ─────────────────────
  const promptClassif = `Tu es un enseignant bienveillant de primaire (CE2-CM2). Pour chaque erreur détectée automatiquement, tu dois :
1. Classer le TYPE d'erreur.
2. Donner un INDICE pédagogique court qui met l'élève sur la voie SANS donner la réponse.

TEXTE ATTENDU :
"""
${texteAttendu}
"""

TRANSCRIPTION DE L'ÉLÈVE :
"""
${transcription}
"""

ERREURS DÉTECTÉES (index, mot attendu → mot écrit, contexte) :
${erreurs.map((e, i) => {
  const label = e.kind === "del" ? "MOT OUBLIÉ"
              : e.kind === "ins" ? "MOT EN TROP"
              : e.kind === "casse" ? "CASSE/ACCENT"
              : e.kind === "ponctuation" ? "PONCTUATION"
              : "DIFFÉRENT";
  return `${i}. [${label}] attendu="${e.mot_attendu}" écrit="${e.mot_eleve}" contexte="${e.contexte}"`;
}).join("\n")}

Types possibles : lettre_muette | accord_sujet_verbe | accord_adjectif | conjugaison | homophone | mot_oublie | orthographe | majuscule | ponctuation | accent | lettre_doublee | autre

Indices selon l'erreur :
- Lettre muette → "Essaie de mettre le mot au féminin (ou au pluriel) pour entendre la lettre cachée."
- Accord S/V → "Qui fait l'action ? Singulier ou pluriel ?"
- Accord adjectif → "Cet adjectif s'accorde avec quel nom ? Genre ? Nombre ?"
- Conjugaison → "À quel temps est le verbe ? Comment se conjugue-t-il avec ce sujet ?"
- Homophone → "a/à, et/est, son/sont… Quelle astuce peux-tu utiliser pour vérifier ?"
- Mot oublié → "Relis ta phrase : il manque un petit mot entre deux mots."
- Orthographe → "Ce mot est difficile. Essaie de le visualiser lettre par lettre."
- Majuscule → "Début de phrase ou nom propre : quelle lettre utiliser ?"
- Ponctuation → "Vérifie la ponctuation ici."
- Accent → "Écoute la voyelle : aigu, grave ou circonflexe ?"
- Lettre doublée → "Cette consonne est-elle doublée ? Écoute le son."

Réponds UNIQUEMENT avec ce JSON (une entrée par erreur, dans le même ordre) :
{
  "classifications": [
    { "index": 0, "type_erreur": "...", "indice": "..." },
    { "index": 1, "type_erreur": "...", "indice": "..." }
  ]
}`;

  try {
    const respClassif = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: promptClassif }],
    });

    const texteClassif = respClassif.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = texteClassif.match(/\{[\s\S]*\}/);
    const classifications: { index: number; type_erreur: string; indice: string }[] =
      jsonMatch ? (JSON.parse(jsonMatch[0]).classifications ?? []) : [];

    const classifParIndex = new Map<number, { type_erreur: string; indice: string }>();
    for (const c of classifications) classifParIndex.set(c.index, c);

    // Retour final : une entrée par erreur du diff, même si Claude en a loupé une à la classification
    const erreursFinales = erreurs.map((e, i) => {
      const c = classifParIndex.get(i);
      const fallbackType =
        e.kind === "del" ? "mot_oublie" :
        e.kind === "ins" ? "autre" :
        e.kind === "casse" ? "majuscule" :
        e.kind === "ponctuation" ? "ponctuation" :
        "orthographe";
      return {
        mot_eleve: e.mot_eleve,
        type_erreur: c?.type_erreur ?? fallbackType,
        indice: c?.indice ?? "Regarde bien ce mot et compare avec ce que tu as écrit.",
      };
    });

    return NextResponse.json({
      transcription,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFinales,
    });
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur classification:", err);
    // Fallback : renvoyer les erreurs sans classification IA
    const erreursFallback = erreurs.map((e) => ({
      mot_eleve: e.mot_eleve,
      type_erreur:
        e.kind === "del" ? "mot_oublie" :
        e.kind === "ins" ? "autre" :
        e.kind === "casse" ? "majuscule" :
        e.kind === "ponctuation" ? "ponctuation" :
        "orthographe",
      indice: "Regarde bien ce mot et compare avec ce que tu as écrit.",
    }));
    return NextResponse.json({
      transcription,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFallback,
    });
  }
}
