import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TAILLE_MAX_MO = 25;

interface ChapitreExtrait {
  ordre: number;
  titre: string;
  texte: string;
  nb_mots: number;
}

/**
 * Détecte les chapitres dans un texte libre extrait d'un PDF.
 * Cherche des marqueurs au début de ligne : "Chapitre 1", "CHAPITRE I",
 * "Chapter 1", "Prologue", "Épilogue", chiffres romains/arabes.
 */
function detecterChapitres(texteBrut: string): ChapitreExtrait[] {
  // Normaliser les retours à la ligne
  const texte = texteBrut.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Regex : au début d'une ligne (après saut de ligne ou début),
  // accepte Chapitre/Chapter/CHAPITRE suivi d'un nombre ou chiffre romain,
  // OU Prologue/Épilogue/Préface.
  // Les lignes sont parfois entourées de lignes vides (ce qui marque bien
  // les titres de chapitres).
  const patterns = [
    // "Chapitre 1", "Chapitre premier", "CHAPITRE 12"
    /^\s*(chapitre|chapter)\s+([\dIVXLCDM]+(?:er)?|premier|première|deuxième|troisième|quatrième|cinquième|sixième|septième|huitième|neuvième|dixième)([\s\-–—:.]+[^\n]{0,120})?$/gim,
    // "Prologue", "Épilogue", "Préface", "Avant-propos"
    /^\s*(prologue|épilogue|epilogue|préface|preface|avant[\s-]propos|postface)([\s\-–—:.]+[^\n]{0,120})?$/gim,
  ];

  // Trouver toutes les positions des marqueurs
  const marqueurs: Array<{ start: number; end: number; titre: string }> = [];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(texte)) !== null) {
      const titreLigne = match[0].trim().replace(/\s+/g, " ");
      // Ignorer les mentions trop longues (ex: "Chapitre d'avant dans la foret sombre...")
      if (titreLigne.length > 140) continue;
      marqueurs.push({
        start: match.index,
        end: match.index + match[0].length,
        titre: titreLigne,
      });
    }
  }

  // Dédupliquer et trier par position
  marqueurs.sort((a, b) => a.start - b.start);
  const uniques: typeof marqueurs = [];
  for (const m of marqueurs) {
    if (uniques.length === 0 || m.start - uniques[uniques.length - 1].start > 30) {
      uniques.push(m);
    }
  }

  // Découper le texte en tranches entre marqueurs
  const chapitres: ChapitreExtrait[] = [];
  for (let i = 0; i < uniques.length; i++) {
    const debut = uniques[i].end;
    const fin = i + 1 < uniques.length ? uniques[i + 1].start : texte.length;
    const contenu = texte.slice(debut, fin).trim();
    const nbMots = contenu.split(/\s+/).filter(Boolean).length;

    // Ignorer les chapitres trop courts (< 80 mots, probablement une mention en préambule)
    if (nbMots < 80) continue;

    chapitres.push({
      ordre: chapitres.length + 1,
      titre: uniques[i].titre,
      texte: contenu,
      nb_mots: nbMots,
    });
  }

  return chapitres;
}

/**
 * Fallback IA : utilisé si la détection locale échoue ou si le PDF est scanné.
 */
async function extraireViaIA(pdfBase64: string): Promise<ChapitreExtrait[]> {
  const systemPrompt = `Tu es un expert en analyse de livres jeunesse.

À partir du PDF fourni, identifie TOUS les chapitres et extrais leur texte intégral.
Ignore les pages de garde, table des matières, remerciements.
Inclus prologue et épilogue en tant que chapitres.
NE PAS résumer — texte intégral.

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "chapitres": [
    { "ordre": 1, "titre": "Chapitre 1 — Le départ", "texte": "Texte complet..." }
  ]
}`;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 64000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Extrais tous les chapitres avec texte intégral." },
        ],
      },
    ],
  });

  const finalMessage = await stream.finalMessage();
  const text = (finalMessage.content[0] as { type: "text"; text: string }).text;
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const chapitres = (parsed.chapitres ?? []) as ChapitreExtrait[];
  return chapitres.map((c, i) => ({
    ordre: i + 1,
    titre: c.titre,
    texte: c.texte,
    nb_mots: (c.texte ?? "").split(/\s+/).filter(Boolean).length,
  }));
}

export async function POST(req: Request) {
  try {
    let pdfBuffer: Buffer;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("pdf");
      if (!(file instanceof File)) {
        return NextResponse.json({ erreur: "PDF manquant." }, { status: 400 });
      }
      if (file.size > TAILLE_MAX_MO * 1024 * 1024) {
        return NextResponse.json(
          { erreur: `PDF trop volumineux (${Math.round(file.size / 1024 / 1024)} MB). Max ${TAILLE_MAX_MO} MB.` },
          { status: 413 }
        );
      }
      pdfBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      // Rétrocompat : base64 via JSON
      const body = await req.json();
      if (!body.pdfBase64) {
        return NextResponse.json({ erreur: "PDF manquant." }, { status: 400 });
      }
      pdfBuffer = Buffer.from(body.pdfBase64, "base64");
    }

    // ── 1. Extraction locale du texte via pdf-parse ───────────────────────
    let texteBrut = "";
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
      const parsed = await parser.getText();
      texteBrut = parsed.text ?? "";
    } catch (err) {
      console.error("[extraire-chapitres-livre] pdf-parse échec :", err);
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }

    const texteNettoye = texteBrut.trim();
    const nbMotsTotal = texteNettoye.split(/\s+/).filter(Boolean).length;

    // Si le PDF semble être un scan (très peu de texte extractible)
    if (nbMotsTotal < 200) {
      console.log("[extraire-chapitres-livre] Peu de texte (", nbMotsTotal, "mots) — fallback IA");
      const pdfBase64 = pdfBuffer.toString("base64");
      try {
        const chapitresIA = await extraireViaIA(pdfBase64);
        if (chapitresIA.length === 0) {
          return NextResponse.json({ erreur: "Aucun chapitre détecté dans le PDF." }, { status: 500 });
        }
        return NextResponse.json({ resultat: { chapitres: chapitresIA, source: "ia" } });
      } catch (err) {
        return handleExtractionError(err);
      }
    }

    // ── 2. Détection des chapitres par regex ───────────────────────────────
    const chapitresDetectes = detecterChapitres(texteNettoye);

    if (chapitresDetectes.length >= 2) {
      return NextResponse.json({ resultat: { chapitres: chapitresDetectes, source: "local" } });
    }

    // ── 3. Fallback IA si détection locale n'a rien trouvé ────────────────
    console.log("[extraire-chapitres-livre] Détection locale :", chapitresDetectes.length, "chapitres — fallback IA");
    const pdfBase64 = pdfBuffer.toString("base64");
    try {
      const chapitresIA = await extraireViaIA(pdfBase64);
      if (chapitresIA.length === 0) {
        return NextResponse.json({ erreur: "Aucun chapitre détecté dans le PDF." }, { status: 500 });
      }
      return NextResponse.json({ resultat: { chapitres: chapitresIA, source: "ia" } });
    } catch (err) {
      // Si l'IA échoue ET qu'on a au moins 1 chapitre local, on le retourne
      if (chapitresDetectes.length === 1) {
        return NextResponse.json({ resultat: { chapitres: chapitresDetectes, source: "local_partiel" } });
      }
      return handleExtractionError(err);
    }
  } catch (err) {
    console.error("[extraire-chapitres-livre]", err);
    return handleExtractionError(err);
  }
}

function handleExtractionError(err: unknown): NextResponse {
  const isRateLimit =
    (err as { status?: number })?.status === 429 ||
    (err instanceof Error && /rate[_\s-]?limit|429/i.test(err.message));

  if (isRateLimit) {
    return NextResponse.json(
      {
        erreur:
          "Le livre dépasse la limite de tokens par minute de ton compte Anthropic (30 000 tokens/min au Tier 1). Utilise plutôt le mode « Ajouter un chapitre manuellement » pour traiter le livre chapitre par chapitre, ou divise le PDF en plusieurs parties plus courtes (~50 pages max).",
        code: "rate_limit",
      },
      { status: 429 }
    );
  }

  const message = err instanceof Error ? err.message : "Erreur interne";
  return NextResponse.json({ erreur: message }, { status: 500 });
}
