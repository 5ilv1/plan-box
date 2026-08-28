/**
 * Critères de rangement des exercices « Ranger dans l'ordre », et calcul de
 * l'ordre de référence quand il est objectif (alphabet, valeur numérique).
 */
import { evaluerNombre } from "@/lib/comparaison-nombres";

export const CRITERES: Record<string, { label: string; consigne: string }> = {
  alphabetique:   { label: "Ordre alphabétique",        consigne: "des mots à ranger dans l'ordre alphabétique (pense aux mots qui commencent par les mêmes lettres)" },
  croissant:      { label: "Du plus petit au plus grand", consigne: "des nombres à ranger du plus petit au plus grand" },
  decroissant:    { label: "Du plus grand au plus petit", consigne: "des nombres à ranger du plus grand au plus petit" },
  chronologique:  { label: "Ordre chronologique",       consigne: "des étapes ou des événements à remettre dans l'ordre chronologique" },
  phrase:         { label: "Remettre la phrase dans l'ordre", consigne: "les mots d'une phrase à remettre dans l'ordre pour qu'elle ait du sens" },
};

/** Ordre de référence recalculé côté serveur quand le critère le permet. */
export function ordonner(elements: string[], critere: string): string[] | null {
  if (critere === "alphabetique") {
    return [...elements].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }
  if (critere === "croissant" || critere === "decroissant") {
    const valeurs = elements.map((e) => evaluerNombre(e));
    if (valeurs.some((v) => v === null)) return null;
    const paires = elements.map((e, i) => ({ e, v: valeurs[i]! }));
    paires.sort((a, b) => (critere === "croissant" ? a.v - b.v : b.v - a.v));
    return paires.map((p) => p.e);
  }
  return null; // chronologique / phrase : l'ordre est celui du sens, pas du calcul
}
