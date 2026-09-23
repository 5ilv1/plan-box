/**
 * Des paramètres d'un formulaire de génération au contenu d'un exercice.
 *
 * Vivait dans la page « Nouvel exercice », mêlé à son état. Il en est sorti
 * quand le panneau « Depuis ma programmation » a eu besoin de régénérer un
 * exercice à l'unité **avec les mêmes formulaires** : recopier ce répartiteur
 * aurait fait deux vérités sur dix types, chacun avec ses chemins propres —
 * modes manuels, fractions en images, calcul mental local ou par IA.
 *
 * Client uniquement (il appelle les routes `/api/generer-*`). Lève une `Error`
 * dont le message est prêt à être montré ; le dictée et la ressource, qui ont
 * leur propre cycle, restent dans la page.
 */
import { genererCarteCalcul, type TemplateCalcul, type Operation } from "@/lib/calcul";

export interface ContenuGenere {
  type: string;
  data: Record<string, unknown>;
}

/** Les types que ce module sait engendrer. */
export const TYPES_GENERABLES = [
  "exercice", "qcm", "texte_a_trous", "analyse_phrase", "lecture", "calcul_mental",
  "probleme_maths", "comparaison", "rangement", "classement",
] as const;

// ─── Calcul mental sans IA : des modèles, tirés localement ──────────────────

const SYMBOLE_VERS_OP: Record<string, Operation> = {
  "+": "addition",
  "-": "soustraction",
  "×": "multiplication",
  "÷": "division",
};

const PLAGES_DIFFICULTE: Record<
  "facile" | "moyen" | "difficile",
  { aMin: number; aMax: number; bMin: number; bMax: number }
> = {
  facile:    { aMin: 1, aMax: 20,  bMin: 1, bMax: 10 },
  moyen:     { aMin: 1, aMax: 50,  bMin: 1, bMax: 12 },
  difficile: { aMin: 10, aMax: 100, bMin: 2, bMax: 15 },
};

/** Construit les TemplateCalcul à partir des paramètres du formulaire */
export function buildModeles(params: {
  difficulte: "facile" | "moyen" | "difficile";
  table?: string;
  operations: string[];
  nbCalculs: number;
}): { modeles: TemplateCalcul[]; nbCalculs: number } {
  const { aMin, aMax, bMin, bMax } = PLAGES_DIFFICULTE[params.difficulte];
  const tableNum = params.table
    ? parseInt(params.table.replace(/[^0-9]/g, "")) || null
    : null;

  const modeles: TemplateCalcul[] = params.operations.map((sym) => ({
    operation: SYMBOLE_VERS_OP[sym] ?? "addition",
    variables: {
      a: { min: aMin, max: aMax },
      b: tableNum ? { min: tableNum, max: tableNum } : { min: bMin, max: bMax },
    },
  }));

  return { modeles, nbCalculs: params.nbCalculs };
}

/** Génère des calculs concrets depuis des modèles (pour l'aperçu) */
export function genererDepuisModeles(
  modeles: TemplateCalcul[],
  nb: number
): { id: number; enonce: string; reponse: string }[] {
  return Array.from({ length: nb }, (_, i) => {
    const tmpl = modeles[i % modeles.length];
    const carte = genererCarteCalcul(tmpl);
    return { id: i + 1, enonce: carte.recto, reponse: carte.bonneReponse };
  });
}

// ─── L'appel ─────────────────────────────────────────────────────────────────

async function appeler(route: string, corps: unknown): Promise<Record<string, any>> {
  const res = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const json = await res.json();
  if (!res.ok || json.erreur) throw new Error(json.erreur ?? "Erreur lors de la génération.");
  return json;
}

/**
 * Engendre le contenu d'un exercice. Lève une `Error` au message affichable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executerGeneration(params: Record<string, any>): Promise<ContenuGenere> {
  const p = params;

  switch (p.type) {
    // ── Calcul mental ──────────────────────────────────────────────────────
    case "calcul_mental": {
      // Chemin IA : consignes spéciales (structure libre)
      if (p.consignesSpeciales?.trim()) {
        const json = await appeler("/api/generer-calcul-mental-ia", {
          consignes: p.consignesSpeciales,
          nbCalculs: p.nbCalculs,
          niveauNom: p.niveauNom,
        });
        return {
          type: "calcul_mental",
          data: { calculs: json.calculs, nb_calculs: p.nbCalculs, operations: p.operations, genere_par_ia: true },
        };
      }
      // Chemin local : templates classiques
      const { modeles, nbCalculs } = buildModeles(p as Parameters<typeof buildModeles>[0]);
      return {
        type: "calcul_mental",
        data: {
          calculs: genererDepuisModeles(modeles, nbCalculs),
          modeles: modeles as unknown as Record<string, unknown>[],
          nb_calculs: nbCalculs,
          operations: p.operations,
        },
      };
    }

    // ── Texte à trous ──────────────────────────────────────────────────────
    case "texte_a_trous": {
      // Mode manuel : parser les [mot] du texte
      if (p.mode === "manuel" && p.texteManuel) {
        const regex = /\[([^\]]+)\]/g;
        const texteComplet = p.texteManuel.replace(regex, "$1");
        const trous: { position: number; mot: string }[] = [];
        let motIdx = 0;
        const parts = p.texteManuel.split(/(\[[^\]]+\])/);
        for (const part of parts) {
          if (part.startsWith("[") && part.endsWith("]")) {
            trous.push({ position: motIdx, mot: part.slice(1, -1) });
            motIdx++;
          } else {
            motIdx += part.trim().split(/\s+/).filter(Boolean).length;
          }
        }
        return {
          type: "texte_a_trous",
          data: { titre: "Texte à trous", consigne: "Complète les mots manquants.", texte_complet: texteComplet, trous },
        };
      }
      const json = await appeler("/api/generer-texte-a-trous", p);
      return { type: "texte_a_trous", data: json.resultat };
    }

    // ── Analyse de phrase ──────────────────────────────────────────────────
    case "analyse_phrase": {
      // Mode manuel : parser les [groupe|Fonction] ou envoyer à l'IA
      if (p.mode === "manuel" && p.texteManuel) {
        const lignes = p.texteManuel.split("\n").filter((l: string) => l.trim());
        const phrases = lignes.map((ligne: string) => {
          const groupes: { mots: string; fonction: string; debut: number; fin: number }[] = [];
          const texteComplet = ligne.replace(/\[([^|]+)\|([^\]]+)\]/g, "$1");
          const mots = texteComplet.split(/\s+/);
          let match;
          const regexCopy = /\[([^|]+)\|([^\]]+)\]/g;
          while ((match = regexCopy.exec(ligne)) !== null) {
            const motsDuGroupe = match[1].trim();
            const fonction = match[2].trim();
            const debut = mots.findIndex((_m: string, i: number) => mots.slice(i, i + motsDuGroupe.split(/\s+/).length).join(" ").replace(/[.,;:!?]/g, "") === motsDuGroupe.replace(/[.,;:!?]/g, ""));
            if (debut >= 0) {
              groupes.push({ mots: motsDuGroupe, fonction, debut, fin: debut + motsDuGroupe.split(/\s+/).length - 1 });
            }
          }
          return { texte: texteComplet, groupes };
        });

        // Aucune annotation trouvée : on confie les phrases brutes à l'IA.
        if (phrases.every((ph: { groupes: unknown[] }) => ph.groupes.length === 0)) {
          const json = await appeler("/api/generer-analyse-phrase", { ...p, description: `Analyse ces phrases : ${p.texteManuel}` });
          return { type: "analyse_phrase", data: json.resultat };
        }
        return {
          type: "analyse_phrase",
          data: { titre: "Analyse grammaticale", consigne: "Identifie les fonctions des groupes de mots.", phrases },
        };
      }
      const json = await appeler("/api/generer-analyse-phrase", p);
      return { type: "analyse_phrase", data: json.resultat };
    }

    // ── Classement ─────────────────────────────────────────────────────────
    case "classement": {
      if (p.mode === "manuel" && p.texteManuel) {
        const lignes = p.texteManuel.split("\n").filter((l: string) => l.trim());
        const itemsManuels = lignes.map((l: string) => {
          const [texte, categorie] = l.split("|").map((s: string) => s.trim());
          return { texte: texte || l.trim(), categorie: categorie || "" };
        }).filter((i: { texte: string; categorie: string }) => i.texte && i.categorie);

        if (itemsManuels.length === 0) throw new Error("Format invalide. Utilise : élément | catégorie");
        return {
          type: "classement",
          data: { titre: "Classement", consigne: "Classe chaque élément dans la bonne catégorie.", categories: p.categories, items: itemsManuels },
        };
      }
      const json = await appeler("/api/generer-classement", p);
      return { type: "classement", data: json.resultat };
    }

    // ── QCM ────────────────────────────────────────────────────────────────
    case "qcm": {
      // Les fractions en images ne passent pas par l'IA : la bonne réponse et
      // les trois mauvaises se calculent à partir du dessin.
      const route = p.source === "fractions" ? "/api/generer-fractions-aires" : "/api/generer-qcm-theme";
      const json = await appeler(route, p);
      return { type: "qcm", data: json.resultat };
    }

    case "lecture":
      return { type: "lecture", data: (await appeler("/api/generer-lecture", p)).resultat };
    case "probleme_maths":
      return { type: "probleme_maths", data: (await appeler("/api/generer-probleme-maths", p)).resultat };
    case "comparaison":
      return { type: "comparaison", data: (await appeler("/api/generer-comparaison", p)).resultat };
    case "rangement":
      return { type: "rangement", data: (await appeler("/api/generer-rangement", p)).resultat };

    // ── Exercice : le cas par défaut, comme dans la page d'origine ─────────
    default:
      return { type: "exercice", data: (await appeler("/api/generer-exercice", p)).resultat };
  }
}
