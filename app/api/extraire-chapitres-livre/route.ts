import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

  // Fallback : si les patterns classiques ont peu/pas trouvé, chercher des
  // chapitres notés par un simple numéro isolé sur une ligne ("1", "2", "3"…).
  // On anti-faux-positif en ne gardant QUE les nombres qui forment une
  // séquence croissante 1, 2, 3, 4… (sinon c'est des numéros de page).
  if (marqueurs.length < 2) {
    const numeriques = detecterChapitresNumeriques(texte);
    marqueurs.push(...numeriques);
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
 * Détecte les chapitres notés par un simple numéro isolé sur une ligne
 * ("1", "2", "3"...). Filtre strictement par séquence croissante à partir
 * de 1 pour éviter de confondre avec les numéros de page.
 */
function detecterChapitresNumeriques(texte: string): Array<{ start: number; end: number; titre: string }> {
  // Toutes les lignes ne contenant qu'un nombre 1 à 3 chiffres (entourées de
  // sauts de ligne ou de sauts de page \f — fréquents dans les PDF où chaque
  // chapitre commence sur une nouvelle page sans ligne vide avant le titre).
  const pattern = /(?:^|[\n\f])[ \t\f]*(\d{1,3})[ \t]*(?=[\n\f])/g;
  const candidats: Array<{ start: number; end: number; numero: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(texte)) !== null) {
    const numero = parseInt(match[1], 10);
    if (numero < 1 || numero > 300) continue;
    candidats.push({
      start: match.index,
      end: match.index + match[0].length,
      numero,
    });
  }

  if (candidats.length < 2) return [];

  // Ne garder que la plus longue sous-séquence 1, 2, 3, 4...
  // (les candidats hors séquence sont des numéros de page)
  const sequence: Array<{ start: number; end: number; numero: number }> = [];
  let attendu = 1;
  for (const c of candidats) {
    if (c.numero === attendu) {
      sequence.push(c);
      attendu++;
    }
  }

  // Minimum 3 chapitres pour considérer que c'est une vraie table des matières
  if (sequence.length < 3) return [];

  return sequence.map((s) => ({
    start: s.start,
    end: s.end,
    titre: `Chapitre ${s.numero}`,
  }));
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
    // Trois modes d'entrée :
    //  1. JSON avec `texteBrut` (préféré : extraction PDF faite côté client via pdfjs)
    //  2. FormData avec `pdf` (PDF scanné → fallback IA)
    //  3. JSON avec `pdfBase64` (rétrocompat)
    const contentType = req.headers.get("content-type") ?? "";
    let texteBrut: string | undefined;
    let pdfBase64: string | undefined;

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
      const buffer = Buffer.from(await file.arrayBuffer());
      pdfBase64 = buffer.toString("base64");
    } else {
      const body = await req.json();
      texteBrut = body.texteBrut;
      pdfBase64 = body.pdfBase64;
    }

    // ── 1. Texte déjà extrait côté client : détection directe ─────────────
    if (texteBrut && typeof texteBrut === "string") {
      const texteNettoye = texteBrut.trim();
      const nbMotsTotal = texteNettoye.split(/\s+/).filter(Boolean).length;

      if (nbMotsTotal < 200) {
        return NextResponse.json(
          { erreur: "Le PDF semble être un scan (trop peu de texte extractible). Utilise le mode manuel chapitre par chapitre." },
          { status: 400 }
        );
      }

      const chapitresDetectes = detecterChapitres(texteNettoye);
      if (chapitresDetectes.length >= 1) {
        return NextResponse.json({
          resultat: { chapitres: chapitresDetectes, source: "local" },
        });
      }

      return NextResponse.json(
        {
          erreur:
            "Aucun chapitre détecté automatiquement (le livre n'a peut-être pas de marqueurs clairs). Utilise l'ajout manuel chapitre par chapitre.",
        },
        { status: 422 }
      );
    }

    // ── 2. PDF brut (fallback IA, uniquement pour PDFs scannés) ──────────
    if (pdfBase64) {
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

    return NextResponse.json({ erreur: "texteBrut ou PDF requis." }, { status: 400 });
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
