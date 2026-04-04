import Anthropic from "@anthropic-ai/sdk";

/**
 * Valide et corrige les réponses attendues d'un exercice généré par l'IA.
 * Appelle Haiku pour détecter et corriger les fautes d'orthographe,
 * de conjugaison ou de grammaire dans les réponses.
 *
 * En cas d'échec (réseau, JSON invalide…), retourne le contenu inchangé.
 */
export async function validerReponsesExercice(
  contenu: Record<string, unknown>,
  type: string,
  anthropic: Anthropic,
): Promise<Record<string, unknown>> {
  try {
    // ── Extraire les réponses selon le type ─────────────────────────────────
    let items: { id: number | string; reponse: string }[] = [];

    if (type === "exercice") {
      const questions = contenu.questions as { id: number; reponse_attendue: string }[] | undefined;
      if (!questions?.length) return contenu;
      items = questions.map((q) => ({ id: q.id, reponse: q.reponse_attendue }));
    } else if (type === "calcul_mental") {
      const calculs = contenu.calculs as { id: number; enonce: string; reponse: string }[] | undefined;
      if (!calculs?.length) return contenu;
      items = calculs.map((c) => ({ id: c.id, reponse: `${c.enonce} → ${c.reponse}` }));
    } else if (type === "texte_a_trous") {
      const trous = contenu.trous as { position: number; mot: string }[] | undefined;
      if (!trous?.length) return contenu;
      items = trous.map((t, i) => ({ id: i, reponse: t.mot }));
    } else {
      // qcm, classement, analyse_phrase, ecriture_contrainte : pas de texte à valider
      return contenu;
    }

    if (items.length === 0) return contenu;

    // ── Appel Haiku pour validation ─────────────────────────────────────────
    const isCalcul = type === "calcul_mental";

    const prompt = `Tu es un correcteur orthographique pour des exercices scolaires français (CE2-CM2).
Voici une liste de réponses attendues au format JSON.
${isCalcul
  ? `Chaque item contient un calcul et sa réponse (format "énoncé → réponse"). Vérifie que le résultat mathématique est correct. Si le résultat est faux, corrige-le. Renvoie UNIQUEMENT la réponse corrigée (sans l'énoncé).`
  : `Corrige UNIQUEMENT les fautes d'orthographe, de conjugaison ou de grammaire.
Ne reformule PAS, ne change PAS le sens, ne modifie PAS la ponctuation.
Si une réponse contient plusieurs mots séparés par " / ", vérifie chaque mot indépendamment.
Si une réponse est déjà correcte, renvoie-la à l'identique.`}

Entrée :
${JSON.stringify(items)}

Réponds UNIQUEMENT en JSON valide (un tableau), sans markdown :
[{"id": 1, "reponse": "la réponse corrigée"}]`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const corrections: { id: number | string; reponse: string }[] = JSON.parse(json);

    // ── Patcher les corrections ─────────────────────────────────────────────
    const corrMap = new Map(corrections.map((c) => [c.id, c.reponse]));
    let nbCorrections = 0;

    if (type === "exercice") {
      const questions = contenu.questions as { id: number; reponse_attendue: string }[];
      for (const q of questions) {
        const corr = corrMap.get(q.id);
        if (corr && corr !== q.reponse_attendue) {
          console.log(`[valider-reponses] exercice q${q.id}: "${q.reponse_attendue}" → "${corr}"`);
          q.reponse_attendue = corr;
          nbCorrections++;
        }
      }
    } else if (type === "calcul_mental") {
      const calculs = contenu.calculs as { id: number; reponse: string }[];
      for (const c of calculs) {
        const corr = corrMap.get(c.id);
        if (corr && corr !== c.reponse) {
          console.log(`[valider-reponses] calcul q${c.id}: "${c.reponse}" → "${corr}"`);
          c.reponse = corr;
          nbCorrections++;
        }
      }
    } else if (type === "texte_a_trous") {
      const trous = contenu.trous as { position: number; mot: string }[];
      const texteComplet = contenu.texte_complet as string;
      let nouveauTexte = texteComplet;

      for (let i = 0; i < trous.length; i++) {
        const corr = corrMap.get(i);
        if (corr && corr !== trous[i].mot) {
          console.log(`[valider-reponses] trou ${i}: "${trous[i].mot}" → "${corr}"`);
          // Sync avec texte_complet : remplacer l'ancien mot par le nouveau
          const ancienMot = trous[i].mot;
          // Remplacer la première occurrence restante dans le texte
          nouveauTexte = nouveauTexte.replace(ancienMot, corr);
          trous[i].mot = corr;
          nbCorrections++;
        }
      }

      if (nbCorrections > 0) {
        contenu.texte_complet = nouveauTexte;
      }
    }

    if (nbCorrections > 0) {
      console.log(`[valider-reponses] ${nbCorrections} correction(s) appliquée(s) sur ${type}`);
    }

    return contenu;
  } catch (err) {
    console.warn("[valider-reponses] Échec de la validation, contenu retourné tel quel:", err);
    return contenu;
  }
}
