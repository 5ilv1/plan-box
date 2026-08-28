import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { REGLE_NOMBRES_EN_LETTRES, extraireJSON } from "@/lib/prompts-communs";
import { signeEntre } from "@/lib/comparaison-nombres";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

const CONSIGNES_NOMBRES: Record<string, string> = {
  entiers: "des nombres entiers (jusqu'à 9 999 pour le CE2, jusqu'à 999 999 au-delà)",
  grands: "des grands nombres entiers (centaines de mille, millions), écrits en chiffres OU en toutes lettres",
  decimaux: "des nombres décimaux (dixièmes, centièmes, millièmes), avec le piège classique des zéros non significatifs (0,9 et 0,15)",
  fractions: "des fractions simples (demis, tiers, quarts, cinquièmes, dixièmes), écrites sous la forme 3/4",
  calculs: "de petits calculs à comparer (par exemple « 6 × 4 » et « 25 »), sans dépasser la table de 10",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { niveau, nbPaires, typeNombres, avecEgalite, description } = body;

    const nb = Math.min(Math.max(parseInt(nbPaires, 10) || 10, 4), 20);
    // On demande deux paires de plus que nécessaire : la vérification côté
    // serveur en écarte parfois une (égalité non voulue, écriture illisible),
    // et l'enseignant doit obtenir le nombre qu'il a saisi.
    const nbDemande = nb + 2;
    const genre = CONSIGNES_NOMBRES[typeNombres as string] ?? CONSIGNES_NOMBRES.entiers;
    const signes = avecEgalite ? "<, > ou =" : "< ou > (jamais =)";

    const systemPrompt = `Tu es un enseignant de cycle 3 (CE2/CM1/CM2) expert en mathématiques qui crée des exercices de comparaison de nombres.

L'élève doit placer le bon signe entre deux nombres.

Niveau : ${niveau}
Nombres à utiliser : ${genre}
Nombre de comparaisons : EXACTEMENT ${nbDemande}
Signes attendus : ${signes}
${description ? `Consigne de l'enseignant : ${description}` : ""}

RÈGLES STRICTES :
- Génère EXACTEMENT ${nbDemande} paires
- ${avecEgalite ? "Environ une paire sur cinq doit être une égalité (deux écritures différentes du même nombre)." : "Les deux nombres d'une paire doivent TOUJOURS être différents."}
- Alterne les sens : autant de « < » que de « > », dans un ordre mélangé
- Progresse en difficulté : les premières paires sont faciles, les dernières demandent de la réflexion
- Glisse des pièges pédagogiques utiles au niveau ${niveau} (nombre de chiffres trompeur, zéros intercalés, décimales de longueurs différentes)
- Écris les nombres tels qu'ils doivent s'afficher, sans texte autour (pas d'unité, pas de phrase)
- Le titre est court ; la consigne est claire pour un enfant

Réponds UNIQUEMENT en JSON valide, sans backticks :
{
  "titre": "Titre court",
  "consigne": "Consigne claire pour l'élève",
  "paires": [
    { "gauche": "322", "droite": "3 220", "signe": "<" },
    { "gauche": "1 508", "droite": "1 580", "signe": "<" }
  ]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `${systemPrompt}\n\n${REGLE_NOMBRES_EN_LETTRES}`,
      messages: [{
        role: "user",
        content: `Génère ${nbDemande} comparaisons de nombres pour le niveau ${niveau} avec ${genre}.${description ? ` ${description}` : ""}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const resultat = extraireJSON(text) as Record<string, unknown> & Record<string, any>;

    if (!Array.isArray(resultat.paires) || resultat.paires.length === 0) {
      return NextResponse.json({ erreur: "Format de réponse invalide." }, { status: 500 });
    }

    // Le signe n'est jamais celui annoncé par le modèle : on le recalcule dès que
    // les deux écritures sont évaluables. Une paire dont le signe reste douteux
    // (écriture en toutes lettres, unité…) est écartée plutôt que fausse.
    const paires: { gauche: string; droite: string; signe: string }[] = [];
    for (const p of resultat.paires) {
      if (typeof p?.gauche !== "string" || typeof p?.droite !== "string") continue;
      const gauche = p.gauche.trim();
      const droite = p.droite.trim();
      if (!gauche || !droite) continue;

      // Formes belges/suisses : hors programme en France, et illisibles pour le
      // vérificateur. On écarte plutôt que de servir un nombre non vérifié.
      if (/septante|huitante|octante|nonante/i.test(`${gauche} ${droite}`)) continue;

      const calcule = signeEntre(gauche, droite);
      const signe = calcule ?? (["<", ">", "="].includes(p.signe) ? p.signe : null);
      if (!signe) continue;
      if (signe === "=" && !avecEgalite) continue;

      paires.push({ gauche, droite, signe });
    }

    // Le surplus retenu est coupé : l'enseignant a demandé `nb` comparaisons.
    const retenues = paires.slice(0, nb);

    if (retenues.length < 3) {
      return NextResponse.json(
        { erreur: "Trop peu de comparaisons vérifiables ont été produites. Relance la génération." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      resultat: {
        titre: resultat.titre ?? "Comparer des nombres",
        consigne: resultat.consigne ?? "Place le bon signe entre les deux nombres.",
        avec_egalite: !!avecEgalite,
        paires: retenues,
      },
    });
  } catch (err: unknown) {
    console.error("[generer-comparaison]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
