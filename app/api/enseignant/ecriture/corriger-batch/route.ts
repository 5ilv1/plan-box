import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnseignant } from "@/lib/server-auth";

/**
 * POST /api/enseignant/ecriture/corriger-batch
 *
 * Corrige l'orthographe/grammaire de plusieurs textes d'élèves en un appel.
 * Pour chaque texte, renvoie :
 *   - texteCorrige : texte complet avec les mots modifiés entourés de ** pour
 *     marquer en gras dans le PDF (ex : "il **c'est** cassé" → "il **s'est** cassé")
 *   - nbCorrections : nombre de mots modifiés
 *   - nbMotsOrigine : nombre de mots du texte d'origine
 *   - pourcentageJuste : % de mots non modifiés
 *
 * Body : { blocs: [{ id, prenom, texte }] }
 */

interface BlocIn {
  id: string;
  prenom: string;
  texte: string;
}
interface Resultat {
  id: string;
  prenom: string;
  texteCorrige: string;
  nbCorrections: number;
  nbMotsOrigine: number;
  pourcentageJuste: number;
}

function compterMots(texte: string): number {
  const t = texte.trim();
  return t ? t.split(/\s+/).length : 0;
}

async function corrigerUn(
  anthropic: Anthropic,
  bloc: BlocIn
): Promise<Resultat> {
  const nbMotsOrigine = compterMots(bloc.texte);
  if (nbMotsOrigine === 0) {
    return {
      id: bloc.id,
      prenom: bloc.prenom,
      texteCorrige: bloc.texte,
      nbCorrections: 0,
      nbMotsOrigine: 0,
      pourcentageJuste: 100,
    };
  }

  const prompt = `Tu es un correcteur orthographique et grammatical pour un texte d'élève de primaire.

Règles :
- Corrige UNIQUEMENT les fautes d'orthographe, d'accord grammatical, de conjugaison et de ponctuation évidentes
- Respecte le style et la voix de l'élève : ne reformule pas, ne change pas de vocabulaire si ce n'est pas nécessaire
- Garde la structure et les sauts de ligne
- Entoure chaque mot que tu as MODIFIÉ avec ** (ex: "il **c'est** cassé" → "il **s'est** cassé")
- Les mots ajoutés ou modifiés doivent être entre **
- Ne marque PAS en ** les mots que tu n'as pas modifiés

Retourne UNIQUEMENT un JSON :
{
  "texte_corrige": "...",
  "nb_corrections": N
}

Texte à corriger :
${bloc.texte}`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { type: string; text: string }).text;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON introuvable");
    const parsed = JSON.parse(m[0]) as { texte_corrige?: string; nb_corrections?: number };
    const texteCorrige = parsed.texte_corrige ?? bloc.texte;
    // Compte les corrections réelles via les ** dans la sortie (plus fiable
    // que la valeur nb_corrections renvoyée par l'IA)
    const nbMarqueurs = (texteCorrige.match(/\*\*[^*]+\*\*/g) ?? []).length;
    const nbCorrections = nbMarqueurs || (parsed.nb_corrections ?? 0);
    const pourcentageJuste = Math.max(
      0,
      Math.round(((nbMotsOrigine - nbCorrections) / nbMotsOrigine) * 100)
    );
    return {
      id: bloc.id,
      prenom: bloc.prenom,
      texteCorrige,
      nbCorrections,
      nbMotsOrigine,
      pourcentageJuste,
    };
  } catch (err) {
    console.error("[corriger-batch] bloc", bloc.id, err);
    return {
      id: bloc.id,
      prenom: bloc.prenom,
      texteCorrige: bloc.texte,
      nbCorrections: 0,
      nbMotsOrigine,
      pourcentageJuste: 100,
    };
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { blocs } = (await req.json()) as { blocs?: BlocIn[] };
  if (!Array.isArray(blocs) || blocs.length === 0) {
    return NextResponse.json({ erreur: "blocs requis" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

  // Parallélise par lot de 5 pour éviter de saturer
  const resultats: Resultat[] = [];
  const taille = 5;
  for (let i = 0; i < blocs.length; i += taille) {
    const lot = blocs.slice(i, i + taille);
    const sortieLot = await Promise.all(lot.map((b) => corrigerUn(anthropic, b)));
    resultats.push(...sortieLot);
  }

  return NextResponse.json({ resultats });
}
