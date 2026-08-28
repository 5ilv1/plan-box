/**
 * Fragments de prompt partagés par toutes les routes de génération de contenu.
 *
 * Injectés en `system` (ou concaténés au system existant) pour que la règle
 * s'applique de la même façon quel que soit le type d'exercice généré.
 */

/**
 * Orthographe rectifiée de 1990 : un nombre écrit en toutes lettres prend un
 * trait d'union entre TOUS ses éléments. La règle ne dit pas d'écrire les
 * nombres en lettres — seulement comment les écrire quand ils le sont.
 */
export const REGLE_NOMBRES_EN_LETTRES = `RÈGLE D'ORTHOGRAPHE OBLIGATOIRE — NOMBRES EN TOUTES LETTRES
Cette règle ne t'oblige PAS à écrire les nombres en lettres : les chiffres (322, 91, 2026) restent parfaitement acceptables et souvent préférables. Elle porte uniquement sur l'orthographe des nombres que tu choisis d'écrire en toutes lettres.
Quand un nombre est écrit en toutes lettres, il prend un trait d'union entre TOUS ses éléments (orthographe rectifiée de 1990), sans aucune exception :
- trois-cent-vingt-deux  (JAMAIS « trois cent vingt-deux »)
- quatre-vingt-onze, soixante-douze, cent-un
- mille-neuf-cent-quatre-vingt-dix, deux-mille-vingt-six
- un-million-deux-cent-mille
Les mots « millier », « million », « milliard » restent des noms et suivent la même règle de liaison.
Cette règle s'applique PARTOUT : énoncés, questions, options, réponses attendues, corrections, indices, titres et consignes.`;

/**
 * Extrait le premier objet JSON d'une réponse de modèle.
 *
 * Les modèles ajoutent régulièrement des backticks, une phrase d'introduction
 * ou un commentaire de vérification après l'objet : un `JSON.parse` sur la
 * réponse brute échoue alors sur « Unexpected non-whitespace character ».
 * On isole donc l'objet en suivant l'imbrication des accolades, en ignorant
 * celles qui se trouvent à l'intérieur d'une chaîne.
 */
export function extraireJSON(texte: string): unknown {
  const debut = texte.indexOf("{");
  if (debut === -1) throw new Error("Aucun objet JSON dans la réponse du modèle.");

  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;

  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];

    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }

    if (c === '"') dansChaine = true;
    else if (c === "{") profondeur++;
    else if (c === "}") {
      profondeur--;
      if (profondeur === 0) return JSON.parse(texte.slice(debut, i + 1));
    }
  }

  throw new Error("Objet JSON incomplet dans la réponse du modèle.");
}
