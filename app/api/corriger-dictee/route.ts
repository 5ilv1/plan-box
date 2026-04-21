import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export const maxDuration = 120;

/**
 * POST /api/corriger-dictee
 * Body: { images: string[] (base64 data-urls), bloc_id: string }
 *
 * Pipeline en 2 étapes :
 *  1. ALIGNEMENT (Opus vision) : le modèle voit l'image ET le texte attendu,
 *     et rend un alignement mot-à-mot (correct / faux / oublié / en_trop).
 *     Grâce au guide du texte attendu, l'OCR n'invente pas d'erreurs
 *     fantômes d'alignement comme le faisait le Needleman-Wunsch aveugle.
 *  2. CLASSIFICATION (Sonnet) : classe chaque erreur (lettre muette,
 *     accord S/V, homophone…) et produit l'indice pédagogique.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TokenAligne =
  | { type: "correct"; attendu: string; ecrit: string }
  | { type: "faux";    attendu: string; ecrit: string }
  | { type: "oublie";  attendu: string }
  | { type: "en_trop"; ecrit: string };

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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function estPonct(t: string): boolean {
  return /^[.,;:!?…«»"()\-—]$/.test(t);
}

function motOuPonct(t: TokenAligne): string {
  return t.type === "en_trop" ? t.ecrit : t.attendu;
}

/** Construit erreurs + segments à partir de l'alignement IA. */
function construireSortie(tokens: TokenAligne[]): {
  erreurs: DiffErreur[];
  segments: Segment[];
  nb_corrects: number;
  nb_total: number;
} {
  const erreurs: DiffErreur[] = [];
  const segments: Segment[] = [];
  let nb_corrects = 0;
  let nb_total = 0;
  let posAtt = 0;

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];

    // Contexte : 3 mots autour, toutes catégories confondues
    const avant = tokens.slice(Math.max(0, k - 3), k).map(motOuPonct).filter(Boolean).join(" ");
    const apres = tokens.slice(k + 1, k + 4).map(motOuPonct).filter(Boolean).join(" ");
    const contexte = `${avant} …ICI… ${apres}`.trim();

    if (t.type === "correct") {
      if (!estPonct(t.attendu)) nb_total++;
      if (t.attendu === t.ecrit) {
        if (!estPonct(t.attendu)) nb_corrects++;
        segments.push({ type: "ok", text: t.ecrit, idx_erreur: -1 });
      } else {
        // Model a dit correct mais diffère : accent ou casse seulement.
        const memeStrip = stripAccents(t.attendu.toLowerCase()) === stripAccents(t.ecrit.toLowerCase());
        const idx = erreurs.length;
        erreurs.push({
          mot_eleve: t.ecrit,
          mot_attendu: t.attendu,
          kind: memeStrip ? "casse" : "sub",
          contexte,
          position: posAtt,
        });
        segments.push({ type: "err", text: t.ecrit, idx_erreur: idx });
      }
      posAtt++;
    } else if (t.type === "faux") {
      if (!estPonct(t.attendu)) nb_total++;
      const memeStrip = stripAccents(t.attendu.toLowerCase()) === stripAccents(t.ecrit.toLowerCase());
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: t.ecrit,
        mot_attendu: t.attendu,
        kind: estPonct(t.attendu) || estPonct(t.ecrit)
          ? "ponctuation"
          : memeStrip ? "casse" : "sub",
        contexte,
        position: posAtt,
      });
      segments.push({ type: "err", text: t.ecrit, idx_erreur: idx });
      posAtt++;
    } else if (t.type === "oublie") {
      if (!estPonct(t.attendu)) nb_total++;
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: "",
        mot_attendu: t.attendu,
        kind: estPonct(t.attendu) ? "ponctuation" : "del",
        contexte,
        position: posAtt,
      });
      segments.push({ type: "missing", text: t.attendu, idx_erreur: idx });
      posAtt++;
    } else {
      // en_trop
      const idx = erreurs.length;
      erreurs.push({
        mot_eleve: t.ecrit,
        mot_attendu: "",
        kind: estPonct(t.ecrit) ? "ponctuation" : "ins",
        contexte,
        position: -1,
      });
      segments.push({ type: "extra", text: t.ecrit, idx_erreur: idx });
    }
  }

  return { erreurs, segments, nb_corrects, nb_total };
}

/** Classification de repli si l'IA échoue : utilise kind + diff accent/casse. */
function fallbackType(e: DiffErreur): string {
  if (e.kind === "del") return "mot_oublie";
  if (e.kind === "ins") return "autre";
  if (e.kind === "ponctuation") return "ponctuation";
  if (e.kind === "casse") {
    const aMin = e.mot_attendu.toLowerCase();
    const eMin = e.mot_eleve.toLowerCase();
    return aMin === eMin ? "majuscule" : "accent";
  }
  return "orthographe";
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

  // Préparer les images (base64 data-urls)
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

  // ── Étape 1 : ALIGNEMENT IA (image + texte attendu → tokens alignés) ──────
  const promptAlign = estMots
    ? `Tu es correcteur de dictée pour un élève de primaire (CE2-CM2).

LISTE DE MOTS DICTÉE (ce qui DEVAIT être écrit) :
"""
${texteAttendu}
"""

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier.` : "Voici la photo d'un cahier."}

MISSION : pour chaque mot de la liste, regarde la photo et reporte ce que l'élève a RÉELLEMENT écrit.

⚠️ RÈGLE D'OR : tu regardes la PHOTO, pas la liste attendue. La liste sert juste de guide d'alignement (ordre et nombre de mots). Si l'élève a fait une faute, tu DOIS la reporter telle quelle — c'est tout l'intérêt de ton travail.

Pour chaque mot attendu, choisis UN seul type :
- "correct" — l'élève a écrit EXACTEMENT ce mot (mêmes lettres, mêmes accents, même casse).
- "faux"    — l'élève a écrit quelque chose de différent (faute, accent manquant, lettre ajoutée ou retirée…). Dans "ecrit", mets EXACTEMENT ce qu'il a tracé sur la page.
- "oublie"  — l'élève n'a rien écrit pour ce mot (ligne vide ou sautée).

Si l'élève a écrit un mot de plus qui n'est PAS dans la liste (ajout), insère un token "en_trop" à la bonne position.

⚠️ PIÈGES À ÉVITER (ton rôle est de VOIR les fautes, pas de les effacer) :

1. Accent AJOUTÉ à tort. Un "e" sans aucun trait visible au-dessus → écris "e", PAS "é" ni "è".
   "eleve" reste "eleve" si aucun accent visible.
   "leger" reste "leger" si rien au-dessus du e.
2. Lettre finale muette AJOUTÉE à tort. Si tu vois "peti" sans "t" à la fin → écris "peti", PAS "petit".
   "canar" sans "d" → "canar". "bor" sans "d" → "bor". "vert" ne devient pas "vers".
3. Consonne DOUBLÉE imaginée. "aler" reste "aler" si tu ne vois qu'un "l".
4. En cas d'hésitation entre 2 lectures, choisis la plus SIMPLE (celle qui ferait une faute) plutôt que la forme correcte. C'est normal qu'un élève fasse des fautes — c'est une dictée.

IGNORE : titre, prénom, nom, date, numérotation, en-tête, signature, notes à côté.

Réponds UNIQUEMENT avec ce JSON (les tokens dans l'ordre de la liste dictée, "en_trop" insérés à la bonne place) :
{
  "tokens": [
    { "type": "correct", "attendu": "maison",  "ecrit": "maison" },
    { "type": "faux",    "attendu": "éléphant", "ecrit": "éléphan" },
    { "type": "oublie",  "attendu": "petit" },
    { "type": "en_trop", "ecrit": "chat" }
  ]
}`
    : `Tu es correcteur de dictée pour un élève de primaire (CE2-CM2).

TEXTE DICTÉ (ce qui DEVAIT être écrit) :
"""
${texteAttendu}
"""

${nbPages > 1 ? `Voici ${nbPages} pages d'un cahier.` : "Voici la photo d'un cahier."}

MISSION : pour chaque mot (et signe de ponctuation) du texte attendu, regarde la photo et reporte ce que l'élève a RÉELLEMENT écrit à cet emplacement.

⚠️ RÈGLE D'OR : tu regardes la PHOTO, pas le texte attendu. Le texte attendu sert uniquement de guide d'alignement (ordre des mots). Si l'élève a fait une faute, tu DOIS la reporter telle quelle — c'est tout l'intérêt de ton travail.

Pour chaque mot ou ponctuation attendu, choisis UN seul type :
- "correct" — l'élève a écrit EXACTEMENT ce mot (mêmes lettres, mêmes accents, même casse).
- "faux"    — l'élève a écrit quelque chose de différent (faute, conjugaison, accord, accent, homophone…). Dans "ecrit", mets EXACTEMENT ce qu'il a tracé.
- "oublie"  — l'élève a sauté ce mot (absent de sa copie).

Si l'élève a écrit un mot en plus qui n'est PAS dans le texte attendu, insère un token "en_trop" à la position où il l'a écrit.

⚠️ PIÈGES À ÉVITER (ton rôle est de VOIR les fautes, pas de les effacer) :

1. Accent AJOUTÉ à tort. Un "e" sans aucun trait visible → écris "e", PAS "é"/"è"/"ê".
   "eleve" reste "eleve" si aucun accent visible. "apres" reste "apres" si rien sur le e.
2. Accent RETIRÉ à tort. Un "é" avec un petit trait oblique visible → conserve l'accent.
3. Terminaison verbale AUTO-COMPLÉTÉE. "courure" sans "nt" final → "courure", PAS "coururent".
   "mangais" sans "e" après le g → "mangais", PAS "mangeais".
4. Lettre finale muette ajoutée fantôme. "vert" sans "s" final → "vert", PAS "vers".
5. Petit mot substitué. "Le" ne devient pas "Les" sans "s" visible. "l'o" ne devient pas "l'eau" sans "eau" visible.
6. En cas d'hésitation entre 2 lectures, choisis la plus SIMPLE (celle qui ferait une faute) plutôt que la forme correcte. C'est normal qu'un élève fasse des fautes.

Ponctuation : aligne chaque signe (, . ; : ! ? …) comme un token à part. Casse : respecte majuscules/minuscules de la photo.

IGNORE tout ce qui n'est pas la dictée : titre, prénom, nom, date, en-tête, signature, notes en marge. Commence au PREMIER MOT DE LA PREMIÈRE PHRASE DICTÉE, termine au dernier.

Réponds UNIQUEMENT avec ce JSON (tokens dans l'ordre strict du texte attendu, "en_trop" à l'emplacement exact) :
{
  "tokens": [
    { "type": "correct", "attendu": "Le",     "ecrit": "Le" },
    { "type": "correct", "attendu": "chat",   "ecrit": "chat" },
    { "type": "faux",    "attendu": "mange",  "ecrit": "mangent" },
    { "type": "oublie",  "attendu": "lentement" },
    { "type": "en_trop", "ecrit": "donc" },
    { "type": "correct", "attendu": ".",      "ecrit": "." }
  ]
}`;

  let tokens: TokenAligne[] = [];
  try {
    const respAlign = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: promptAlign },
          ],
        },
      ],
    });

    const texteAlign = respAlign.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const match = texteAlign.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[corriger-dictee] JSON introuvable dans la réponse d'alignement");
      return NextResponse.json({ error: "Alignement IA invalide" }, { status: 500 });
    }

    const parsed = JSON.parse(match[0]);
    const raw: unknown[] = Array.isArray(parsed.tokens) ? parsed.tokens : [];
    tokens = raw.filter((t): t is TokenAligne => {
      if (!t || typeof t !== "object") return false;
      const o = t as Record<string, unknown>;
      if (o.type === "correct" || o.type === "faux") {
        return typeof o.attendu === "string" && typeof o.ecrit === "string";
      }
      if (o.type === "oublie")  return typeof o.attendu === "string";
      if (o.type === "en_trop") return typeof o.ecrit === "string";
      return false;
    });

    if (tokens.length === 0) {
      return NextResponse.json({ error: "Alignement vide" }, { status: 500 });
    }
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur alignement:", err);
    return NextResponse.json({ error: "Erreur lors de la lecture de la photo" }, { status: 500 });
  }

  // ── Étape 2 : Construction erreurs + segments ─────────────────────────────
  const { erreurs, segments, nb_corrects, nb_total } = construireSortie(tokens);

  // Transcription reconstruite pour affichage (ce que l'élève a écrit)
  const transcription = tokens
    .map((t) => t.type === "oublie" ? "" : t.ecrit)
    .filter(Boolean)
    .join(" ");

  // Pas d'erreurs → court-circuiter
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

  // ── Étape 3 : CLASSIFICATION IA des erreurs détectées ─────────────────────
  const promptClassif = `Tu es un enseignant bienveillant de primaire (CE2-CM2). Pour chaque erreur détectée, tu dois :
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

⚠️ RÈGLES STRICTES DE CLASSIFICATION :

• lettre_muette UNIQUEMENT si la lettre finale manquante est une lettre LEXICALE
  du mot au singulier (dans le dictionnaire, pas un marqueur grammatical).
  Valides : "canar" vs "canard" (d lexical), "peti" vs "petit" (t lexical),
  "souri" vs "souris" (s lexical — souris s'écrit avec s au singulier).
  ⚠️ NE PAS confondre avec un ACCORD de pluriel :
    - "canard" vs "canards" → -s DU PLURIEL → accord_adjectif (ou accord).
    - "brillant" vs "brillants" → -s pluriel → accord_adjectif.
  Règle : si le SINGULIER s'écrit déjà avec -s/-x (souris, tapis, prix, nez) → lettre_muette.
          Si le -s/-x apparaît seulement au PLURIEL → accord_adjectif/accord.

• accord_sujet_verbe UNIQUEMENT si la désinence verbale est en cause
  (ent/ant, s/x final de verbe, ai/a/as…). Ex : "ils mange" vs "ils mangent".

• accord_adjectif si un adjectif OU un nom change de genre/nombre :
  pluriel manquant, féminin manquant, etc. Ex : "canard" vs "canards", "petit" vs "petite".

• conjugaison si c'est le radical ou le temps du verbe qui est faux
  (ex : "courure" vs "coururent" = radical+terminaison, donc conjugaison).

• homophone UNIQUEMENT pour paires classiques : a/à, et/est, ou/où, son/sont, on/ont,
  ce/se, ces/ses/c'est/s'est, mais/mes, leur/leurs, la/là.

• accent UNIQUEMENT si le mot est identique SAUF un accent (é/è/ê/à/ô).

• lettre_doublee si une consonne est doublée ou dédoublée à tort (ll/l, tt/t, mm/m).

• majuscule si la seule différence est la casse.

• mot_oublie pour les MOT OUBLIÉ.

• orthographe pour TOUT LE RESTE (différence interne, lettre ajoutée/retirée au milieu,
  confusion de lettres qui ne rentre dans aucune catégorie ci-dessus).

Indices (adapte au contexte) :
- Lettre muette → "Mets le mot au féminin ou au pluriel pour entendre la lettre cachée."
- Accord S/V → "Qui fait l'action ? Singulier ou pluriel ?"
- Accord adjectif → "Cet adjectif s'accorde avec quel nom ? Genre ? Nombre ?"
- Conjugaison → "À quel temps est le verbe ? Comment se conjugue-t-il avec ce sujet ?"
- Homophone → "a/à, et/est, son/sont… Quelle astuce peux-tu utiliser pour vérifier ?"
- Mot oublié → "Relis ta phrase : il manque un petit mot ici."
- Orthographe → "Regarde bien ce mot lettre par lettre, il y a une lettre qui cloche."
- Majuscule → "Début de phrase ou nom propre : quelle lettre utiliser ?"
- Ponctuation → "Vérifie la ponctuation ici."
- Accent → "Écoute la voyelle : aigu, grave ou circonflexe ?"
- Lettre doublée → "Cette consonne est-elle doublée ? Écoute le son."

Réponds UNIQUEMENT avec ce JSON (une entrée par erreur, même ordre) :
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

    return NextResponse.json({
      transcription,
      texte_attendu: texteAttendu,
      segments,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFinales,
    });
  } catch (err: unknown) {
    console.error("[corriger-dictee] Erreur classification:", err);
    // Fallback : renvoyer les erreurs sans classification IA
    const erreursFallback = erreurs.map((e) => ({
      mot_eleve: e.mot_eleve,
      mot_attendu: e.mot_attendu,
      position: e.position,
      kind: e.kind,
      type_erreur: fallbackType(e),
      indice: "Regarde bien ce mot et compare avec ce que tu as écrit.",
    }));
    return NextResponse.json({
      transcription,
      texte_attendu: texteAttendu,
      segments,
      nb_mots_corrects: nb_corrects,
      nb_mots_total: nb_total,
      erreurs: erreursFallback,
    });
  }
}
