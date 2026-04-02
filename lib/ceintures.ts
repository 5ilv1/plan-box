// ── Données des 12 ceintures de multiplications ──────────────────────────────

export interface CeintureDefinition {
  index: number;
  nom: string;
  couleur: string;       // code hex
  couleurFond: string;   // fond clair
  tables: number[];      // tables incluses (multiplications)
  nbCalculs: number;     // nombre de calculs à réussir
  tempsMs: number;       // temps imparti en millisecondes
  type: "multiplication" | "division" | "mixte";
}

export const CEINTURES: CeintureDefinition[] = [
  { index: 0,  nom: "Blanche",    couleur: "#9CA3AF", couleurFond: "#F3F4F6", tables: [2, 10],                     nbCalculs: 8,  tempsMs: 90_000, type: "multiplication" },
  { index: 1,  nom: "Jaune",      couleur: "#EAB308", couleurFond: "#FEF9C3", tables: [2, 5, 10],                  nbCalculs: 8,  tempsMs: 90_000, type: "multiplication" },
  { index: 2,  nom: "Orange",     couleur: "#F97316", couleurFond: "#FFF7ED", tables: [2, 3, 5, 10],               nbCalculs: 8,  tempsMs: 90_000, type: "multiplication" },
  { index: 3,  nom: "Rose",       couleur: "#EC4899", couleurFond: "#FDF2F8", tables: [2, 3, 4, 5, 10],            nbCalculs: 10, tempsMs: 90_000, type: "multiplication" },
  { index: 4,  nom: "Vert clair", couleur: "#22C55E", couleurFond: "#F0FDF4", tables: [2, 3, 4, 5, 6, 10],         nbCalculs: 12, tempsMs: 90_000, type: "multiplication" },
  { index: 5,  nom: "Vert foncé", couleur: "#16A34A", couleurFond: "#DCFCE7", tables: [2, 3, 4, 5, 6, 7, 10],      nbCalculs: 15, tempsMs: 90_000, type: "multiplication" },
  { index: 6,  nom: "Bleu clair", couleur: "#38BDF8", couleurFond: "#F0F9FF", tables: [2, 3, 4, 5, 6, 7, 8, 10],   nbCalculs: 18, tempsMs: 90_000, type: "multiplication" },
  { index: 7,  nom: "Bleu foncé", couleur: "#2563EB", couleurFond: "#EFF6FF", tables: [2, 3, 4, 5, 6, 7, 8, 9, 10], nbCalculs: 20, tempsMs: 90_000, type: "multiplication" },
  { index: 8,  nom: "Mauve",      couleur: "#A855F7", couleurFond: "#FAF5FF", tables: [2, 3, 4, 5, 6, 7, 8, 9, 10], nbCalculs: 10, tempsMs: 90_000, type: "division" },
  { index: 9,  nom: "Violette",   couleur: "#7C3AED", couleurFond: "#F5F3FF", tables: [2, 3, 4, 5, 6, 7, 8, 9, 10], nbCalculs: 6,  tempsMs: 90_000, type: "division" },
  { index: 10, nom: "Marron",     couleur: "#92400E", couleurFond: "#FFFBEB", tables: [2, 3, 4, 5, 6, 7, 8, 9, 10], nbCalculs: 8,  tempsMs: 90_000, type: "division" },
  { index: 11, nom: "Noire",      couleur: "#1F2937", couleurFond: "#F9FAFB", tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], nbCalculs: 20, tempsMs: 90_000, type: "mixte" },
];

export interface Calcul {
  id: number;
  enonce: string;   // ex: "7 × 8" ou "56 ÷ 8"
  reponse: number;
}

/** Mélange un tableau (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Description de l'objectif pour l'élève */
export function descriptionCeinture(c: CeintureDefinition): string {
  const temps = c.tempsMs / 1000;
  if (c.type === "division") {
    return `En ${temps}s, je réponds juste à ${c.nbCalculs} divisions`;
  }
  if (c.type === "mixte") {
    return `En ${temps}s, je réponds juste à ${c.nbCalculs} calculs (×  et ÷) sur les tables de 1 à 12`;
  }
  const tablesStr = c.tables.length <= 4
    ? c.tables.join(", ")
    : `${c.tables[0]} à ${c.tables[c.tables.length - 1]}`;
  return `En ${temps}s, je réponds juste à ${c.nbCalculs} calculs sur les tables de ${tablesStr}`;
}

/** Génère les calculs pour une ceinture donnée (ordre aléatoire garanti) */
export function genererCalculs(ceinture: CeintureDefinition): Calcul[] {
  const calculs: Calcul[] = [];
  const used = new Set<string>();

  while (calculs.length < ceinture.nbCalculs) {
    const table = ceinture.tables[Math.floor(Math.random() * ceinture.tables.length)];
    const facteur = Math.floor(Math.random() * 10) + 1; // 1-10

    if (ceinture.type === "multiplication") {
      const key = `${Math.min(table, facteur)}x${Math.max(table, facteur)}`;
      if (used.has(key) && used.size < ceinture.tables.length * 10) continue;
      used.add(key);
      // Ordre aléatoire des facteurs (parfois "2 × 7", parfois "7 × 2")
      const [a, b] = Math.random() > 0.5 ? [table, facteur] : [facteur, table];
      calculs.push({
        id: calculs.length,
        enonce: `${a} × ${b}`,
        reponse: table * facteur,
      });
    } else if (ceinture.type === "division") {
      const produit = table * facteur;
      const key = `${produit}/${table}`;
      if (used.has(key) && used.size < ceinture.tables.length * 10) continue;
      used.add(key);
      calculs.push({
        id: calculs.length,
        enonce: `${produit} ÷ ${table}`,
        reponse: facteur,
      });
    } else {
      // mixte : alternance multiplication/division
      const isMult = Math.random() > 0.5;
      if (isMult) {
        const key = `${Math.min(table, facteur)}x${Math.max(table, facteur)}`;
        if (used.has(key) && used.size < ceinture.tables.length * 20) continue;
        used.add(key);
        const [a, b] = Math.random() > 0.5 ? [table, facteur] : [facteur, table];
        calculs.push({
          id: calculs.length,
          enonce: `${a} × ${b}`,
          reponse: table * facteur,
        });
      } else {
        const produit = table * facteur;
        const key = `${produit}/${table}`;
        if (used.has(key) && used.size < ceinture.tables.length * 20) continue;
        used.add(key);
        calculs.push({
          id: calculs.length,
          enonce: `${produit} ÷ ${table}`,
          reponse: facteur,
        });
      }
    }
  }

  // Mélange final pour garantir un ordre différent à chaque session
  return shuffle(calculs).map((c, i) => ({ ...c, id: i }));
}

/** Seuil pour débloquer l'évaluation (90%) */
export const SEUIL_EVAL = 90;

/** Déduit la ceinture actuelle à partir des résultats d'évaluation réussis */
export function ceintureActuelle(evaluationsReussies: { ceinture_index: number }[]): number {
  let max = -1;
  for (const e of evaluationsReussies) {
    if (e.ceinture_index > max) max = e.ceinture_index;
  }
  return Math.min(max + 1, CEINTURES.length - 1);
}
