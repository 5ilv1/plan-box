import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { REFERENCE_CYCLE3 } from "@/lib/ecriture-reference-cycle3";
import {
  loggerErreurs,
  exemplesValidesPertinents,
  casRejetePertinents,
} from "@/lib/dictee-feedback";

export const maxDuration = 60;

/**
 * POST /api/corriger-dictee
 * Body: { transcription: string, bloc_id: string }
 *
 * Prend la transcription VALIDÉE PAR L'ÉLÈVE (après OCR via /transcrire)
 * et la compare au texte attendu. L'élève ayant relu la transcription
 * avant envoi, on a une base fiable → le diff algorithmique (Needleman-
 * Wunsch) produit des erreurs exactes, puis Sonnet les classe avec le
 * référentiel cycle 3 adapté au niveau de l'élève.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers diff
// ─────────────────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normaliserMot(t: string): string {
  return stripAccents(t.toLowerCase()).replace(/[.,;:!?«»"'()]+$/g, "").replace(/^[«»"'()]+/, "");
}

function tokenizer(s: string): string[] {
  const out: string[] = [];
  const normalise = s.replace(/[\u2018\u2019]/g, "'");
  const re = /[\p{L}\p{N}']+|[.,;:!?…«»"()]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalise)) !== null) out.push(m[0]);
  return out;
}

/** Réassemble les élisions séparées par une espace : « l eau » → « l'eau ». */
function reassemblerElisions(tokens: string[]): string[] {
  const elisions = new Set(["l", "d", "n", "j", "m", "s", "t", "c", "qu", "lorsqu", "puisqu", "quoiqu", "jusqu"]);
  const voyelleOuH = /^[aeiouhéèêàâîïôöüûyœæ]/i;
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cur = tokens[i];
    const next = tokens[i + 1];
    if (next && elisions.has(cur.toLowerCase()) && voyelleOuH.test(next)) {
      out.push(cur + "'" + next);
      i += 2;
    } else {
      out.push(cur);
      i++;
    }
  }
  return out;
}

type Op =
  | { type: "match"; expected: string; actual: string }
  | { type: "sub";   expected: string; actual: string }
  | { type: "del";   expected: string }
  | { type: "ins";   actual: string };

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
  position: number;
}

interface Segment {
  type: "ok" | "err" | "missing" | "extra";
  text: string;
  idx_erreur: number;
}

function estPonct(t: string): boolean {
  return /^[.,;:!?…«»"()]$/.test(t);
}

function construireErreurs(att: string[], eleve: string[]): {
  erreurs: DiffErreur[];
  segments: Segment[];
  nb_corrects: number;
  nb_total: number;
} {
  const opsRaw = aligner(att, eleve);
  const erreurs: DiffErreur[] = [];
  const segments: Segment[] = [];
  let nb_corrects = 0;
  const nb_total = att.filter((t) => !estPonct(t)).length;

  // Trimmer les "ins" isolés en tête/queue (titre, prénom, signature)
  const firstAnchor = opsRaw.findIndex((o) => o.type === "match" || o.type === "sub");
  let lastAnchor = -1;
  for (let i = opsRaw.length - 1; i >= 0; i--) {
    if (opsRaw[i].type === "match" || opsRaw[i].type === "sub") { lastAnchor = i; break; }
  }
  const ops = (firstAnchor < 0 || lastAnchor < 0)
    ? opsRaw
    : opsRaw
        .map((o, i) => (i < firstAnchor || i > lastAnchor) && o.type === "ins" ? null : o)
        .filter((o): o is Op => o !== null);

  let posAtt = 0;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const avant = ops.slice(Math.max(0, k - 3), k)
      .map((o) => o.type === "ins" ? o.actual : "expected" in o ? o.expected : "")
      .filter(Boolean).join(" ");
    const apres = ops.slice(k + 1, k + 4)
      .map((o) => o.type === "ins" ? o.actual : "expected" in o ? o.expected : "")
      .filter(Boolean).join(" ");
    const contexte = `${avant} …ICI… ${apres}`.trim();

    if (op.type === "match") {
      if (op.expected === op.actual) {
        if (!estPonct(op.expected)) nb_corrects++;
        segments.push({ type: "ok", text: op.actual, idx_erreur: -1 });
      } else {
        const memeStrip = stripAccents(op.expected.toLowerCase()) === stripAccents(op.actual.toLowerCase());
        const idx = erreurs.length;
        erreurs.push({
          mot_eleve: op.actual,
          mot_attendu: op.expected,
          kind: memeStrip ? "casse" : "sub",
          contexte,
          position: posAtt,
        });
        segments.push({ type: "err", text: op.actual, idx_erreur: idx });
      }
      posAtt++;
    } else if (op.type === "sub") {
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: op.actual,
        mot_attendu: op.expected,
        kind: estPonct(op.expected) || estPonct(op.actual) ? "ponctuation" : "sub",
        contexte,
        position: posAtt,
      });
      segments.push({ type: "err", text: op.actual, idx_erreur: idx });
      posAtt++;
    } else if (op.type === "del") {
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: "",
        mot_attendu: op.expected,
        kind: estPonct(op.expected) ? "ponctuation" : "del",
        contexte,
        position: posAtt,
      });
      segments.push({ type: "missing", text: op.expected, idx_erreur: idx });
      posAtt++;
    } else {
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: op.actual,
        mot_attendu: "",
        kind: estPonct(op.actual) ? "ponctuation" : "ins",
        contexte,
        position: -1,
      });
      segments.push({ type: "extra", text: op.actual, idx_erreur: idx });
    }
  }

  return { erreurs, segments, nb_corrects, nb_total };
}

function fallbackType(e: DiffErreur): string {
  if (e.kind === "del") return "mot_oublie";
  if (e.kind === "ins") return "autre";
  if (e.kind === "ponctuation") return "ponctuation";
  if (e.kind === "casse") {
    return e.mot_attendu.toLowerCase() === e.mot_eleve.toLowerCase() ? "majuscule" : "accent";
  }
  return "orthographe";
}

// ─────────────────────────────────────────────────────────────────────────────
// Niveau de l'élève (CE2 / CM1 / CM2)
// ─────────────────────────────────────────────────────────────────────────────

async function niveauDepuisBloc(
  admin: ReturnType<typeof createAdminClient>,
  eleve_id: string | null,
  contenu: { niveau_etoiles?: number } | null,
): Promise<"CE2" | "CM1" | "CM2"> {
  if (eleve_id) {
    try {
      const { data } = await admin
        .from("eleves")
        .select("niveaux(nom)")
        .eq("id", eleve_id)
        .single();
      const nom = (data as unknown as { niveaux?: { nom?: string } })?.niveaux?.nom;
      if (nom === "CE2" || nom === "CM1" || nom === "CM2") return nom;
    } catch {}
  }
  const etoiles = contenu?.niveau_etoiles;
  if (etoiles === 1) return "CE2";
  if (etoiles === 4) return "CM2";
  return "CM1";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route POST
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const limited = rateLimit(req, { key: "corriger-dictee", max: 10, windowSec: 60, identifier: user.id });
  if (limited) return limited;

  const body = await req.json();
  const bloc_id: string | undefined = body.bloc_id;
  const transcription: string = String(body.transcription ?? "").trim();

  if (!transcription || !bloc_id) {
    return NextResponse.json({ error: "transcription et bloc_id requis" }, { status: 400 });
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

  if (bloc.eleve_id && user.id !== bloc.eleve_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  if (bloc.repetibox_eleve_id != null) {
    const { data: eleveRow } = await admin
      .from("eleve")
      .select("auth_id")
      .eq("id", bloc.repetibox_eleve_id)
      .maybeSingle();
    if (!eleveRow || eleveRow.auth_id !== user.id) {
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
    niveau_etoiles?: number;
  };

  const estMots = bloc.type === "mots";
  const texteAttendu = estMots
    ? (contenu.mots ?? []).map((m) => m.pronom ? `${m.pronom} ${m.mot}` : m.mot).join("\n")
    : contenu.texte || contenu.phrases?.map((p) => p.texte).join(" ") || "";

  if (!texteAttendu) {
    return NextResponse.json({ error: "Contenu de référence introuvable" }, { status: 400 });
  }

  // ── Diff algorithmique ────────────────────────────────────────────────────
  const tokensAttendus = tokenizer(texteAttendu);
  const tokensEleve    = reassemblerElisions(tokenizer(transcription));
  const { erreurs, segments, nb_corrects, nb_total } = construireErreurs(tokensAttendus, tokensEleve);

  if (erreurs.length === 0) {
    return NextResponse.json({
      transcription,
      texte_attendu: texteAttendu,
      segments,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: [],
    });
  }

  // ── Classification IA (Sonnet + REFERENCE_CYCLE3 + niveau élève) ──────────
  const niveau = await niveauDepuisBloc(admin, bloc.eleve_id, contenu);
  const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

  // Few-shot : exemples que l'enseignant a déjà validés / corrigés / rejetés
  // sur des mots similaires. L'IA apprend au fil des revues hebdomadaires.
  const motsAttendus = erreurs.map((e) => e.mot_attendu).filter((s): s is string => !!s);
  const [exemplesValides, casRejetes] = await Promise.all([
    exemplesValidesPertinents(admin, { motsAttendus, niveau, limite: 15 }),
    casRejetePertinents(admin, { motsAttendus, niveau, limite: 8 }),
  ]);

  const blocExemples = exemplesValides.length > 0
    ? `\n\nEXEMPLES DE CLASSIFICATIONS DÉJÀ VALIDÉES PAR L'ENSEIGNANT (applique la même logique si le cas revient) :\n${exemplesValides
        .map((e, i) =>
          `${i + 1}. attendu="${e.mot_attendu}" écrit="${e.mot_eleve}" → type="${e.type_erreur}" — indice="${e.indice}"${e.statut === "corrige" ? " [corrigé manuellement]" : ""}`,
        )
        .join("\n")}`
    : "";

  const blocRejetes = casRejetes.length > 0
    ? `\n\n⚠️ CAS DÉJÀ REJETÉS PAR L'ENSEIGNANT (ce n'étaient PAS des fautes — évite de re-signaler des cas identiques, ou classe "autre" avec un indice neutre) :\n${casRejetes
        .map((r, i) =>
          `${i + 1}. attendu="${r.mot_attendu}" écrit="${r.mot_eleve}"${r.commentaire ? ` — raison: "${r.commentaire}"` : ""}`,
        )
        .join("\n")}`
    : "";

  const systemDynamique = `Tu es un enseignant de français bienveillant en ${niveau} (${niveau === "CE2" ? "8-9" : niveau === "CM1" ? "9-10" : "10-11"} ans). Tu t'appuies sur le référentiel cycle 3 fourni en amont.

Pour chaque erreur de dictée détectée automatiquement par le diff, tu dois :
1. Classer le TYPE d'erreur parmi : lettre_muette | accord_sujet_verbe | accord_adjectif | conjugaison | homophone | mot_oublie | orthographe | majuscule | ponctuation | accent | lettre_doublee | autre
2. Donner un INDICE pédagogique court (max 15 mots) adapté au niveau ${niveau}, qui met l'élève sur la voie SANS donner la réponse.

⚠️ RÈGLES STRICTES DE CLASSIFICATION :

• lettre_muette UNIQUEMENT si la lettre finale manquante est LEXICALE (dictionnaire au singulier).
  Valides : "canar" vs "canard", "peti" vs "petit", "souri" vs "souris" (souris s'écrit avec s au singulier).
  ⚠️ NE PAS confondre avec un ACCORD de pluriel :
    - "canard" vs "canards" → -s pluriel → accord_adjectif.
    - "brillant" vs "brillants" → -s pluriel → accord_adjectif.

• accord_sujet_verbe si la désinence verbale est en cause (ent, s/x final verbe, ai/a/as…). Ex : "ils mange" vs "ils mangent".

• accord_adjectif si un adjectif/nom change de genre/nombre (pluriel manquant, féminin manquant).

• conjugaison si le radical ou le temps du verbe est faux (ex : "courure" vs "coururent").

• homophone pour a/à, et/est, ou/où, son/sont, on/ont, ce/se, ces/ses, mais/mes, leur/leurs, la/là.

• accent UNIQUEMENT si le mot est identique SAUF un accent (é/è/ê/à/ô).

• lettre_doublee pour consonne doublée/dédoublée à tort (ll/l, tt/t, mm/m).

• majuscule si la seule différence est la casse.

• mot_oublie pour les MOT OUBLIÉ.

• orthographe pour tout le reste (différence interne, confusion de lettres).

⚠️ ADAPTATION AU NIVEAU ${niveau} : sois cohérent avec le référentiel. Ne pénalise pas sur une notion qui dépasse le programme (pas de subjonctif pour un CE2, etc.). Reformule l'indice avec un vocabulaire simple et encourageant.

Indices types (adapte au contexte) :
- Lettre muette → "Mets le mot au féminin ou au pluriel pour entendre la lettre cachée."
- Accord S/V → "Qui fait l'action ? Singulier ou pluriel ?"
- Accord adjectif → "Cet adjectif s'accorde avec quel nom ? Genre ? Nombre ?"
- Conjugaison → "À quel temps est le verbe ? Comment se conjugue-t-il avec ce sujet ?"
- Homophone → "Astuce : peux-tu remplacer par un autre mot pour vérifier ?"
- Mot oublié → "Relis ta phrase : il manque un petit mot ici."
- Orthographe → "Regarde bien ce mot lettre par lettre."
- Majuscule → "Début de phrase ou nom propre : quelle lettre utiliser ?"
- Ponctuation → "Vérifie la ponctuation ici."
- Accent → "Écoute la voyelle : aigu, grave ou circonflexe ?"
- Lettre doublée → "Cette consonne est-elle doublée ? Écoute le son."

Réponds UNIQUEMENT avec ce JSON (une entrée par erreur, même ordre) :
{
  "classifications": [
    { "index": 0, "type_erreur": "...", "indice": "..." }
  ]
}`;

  const userContent = `TEXTE ATTENDU :
"""
${texteAttendu}
"""

TRANSCRIPTION DE L'ÉLÈVE (validée par lui après OCR) :
"""
${transcription}
"""

ERREURS DÉTECTÉES (index, étiquette algorithmique, mot attendu → mot écrit, contexte) :
${erreurs.map((e, i) => {
  const label = e.kind === "del" ? "MOT OUBLIÉ"
              : e.kind === "ins" ? "MOT EN TROP"
              : e.kind === "casse" ? "CASSE/ACCENT"
              : e.kind === "ponctuation" ? "PONCTUATION"
              : "DIFFÉRENT";
  return `${i}. [${label}] attendu="${e.mot_attendu}" écrit="${e.mot_eleve}" contexte="${e.contexte}"`;
}).join("\n")}${blocExemples}${blocRejetes}`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: [
        { type: "text", text: REFERENCE_CYCLE3, cache_control: { type: "ephemeral" } },
        { type: "text", text: systemDynamique },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const texte = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = texte.match(/\{[\s\S]*\}/);
    const classifications: { index: number; type_erreur: string; indice: string }[] =
      jsonMatch ? (JSON.parse(jsonMatch[0]).classifications ?? []) : [];

    const classifParIndex = new Map<number, { type_erreur: string; indice: string }>();
    for (const c of classifications) classifParIndex.set(c.index, c);

    const erreursFinales = erreurs.map((e, i) => {
      const c = classifParIndex.get(i);
      return {
        mot_eleve: e.mot_eleve,
        mot_attendu: e.mot_attendu,
        position: e.position,
        kind: e.kind,
        type_erreur: c?.type_erreur ?? fallbackType(e),
        indice: c?.indice ?? "Regarde bien ce mot et compare avec ce que tu as écrit.",
      };
    });

    // Log pour la revue hebdomadaire enseignant (statut=null → en attente)
    await loggerErreurs(admin, {
      bloc_id,
      eleve_id: bloc.eleve_id,
      repetibox_eleve_id: bloc.repetibox_eleve_id,
      niveau,
      erreurs: erreursFinales.map((e, i) => ({
        mot_attendu: e.mot_attendu,
        mot_eleve: e.mot_eleve,
        contexte: erreurs[i].contexte,
        kind: e.kind,
        type_erreur_ia: e.type_erreur,
        indice_ia: e.indice,
      })),
    });

    return NextResponse.json({
      transcription,
      texte_attendu: texteAttendu,
      niveau,
      segments,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFinales,
    });
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur classification:", err);
    const erreursFallback = erreurs.map((e) => ({
      mot_eleve: e.mot_eleve,
      mot_attendu: e.mot_attendu,
      position: e.position,
      kind: e.kind,
      type_erreur: fallbackType(e),
      indice: "Regarde bien ce mot et compare avec ce que tu as écrit.",
    }));

    await loggerErreurs(admin, {
      bloc_id,
      eleve_id: bloc.eleve_id,
      repetibox_eleve_id: bloc.repetibox_eleve_id,
      niveau,
      erreurs: erreursFallback.map((e, i) => ({
        mot_attendu: e.mot_attendu,
        mot_eleve: e.mot_eleve,
        contexte: erreurs[i].contexte,
        kind: e.kind,
        type_erreur_ia: e.type_erreur,
        indice_ia: e.indice,
      })),
    });

    return NextResponse.json({
      transcription,
      texte_attendu: texteAttendu,
      niveau,
      segments,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFallback,
    });
  }
}
