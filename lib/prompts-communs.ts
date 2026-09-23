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
FRANÇAIS DE FRANCE UNIQUEMENT : soixante-dix, quatre-vingts, quatre-vingt-dix. Les formes belges et suisses — septante, huitante, octante, nonante — sont INTERDITES.
Cette règle s'applique PARTOUT : énoncés, questions, options, réponses attendues, corrections, indices, titres et consignes.`;

/**
 * Extrait le premier objet (ou tableau) JSON d'une réponse de modèle.
 *
 * Les modèles ajoutent régulièrement des backticks, une phrase d'introduction
 * ou un commentaire de vérification autour du JSON : un `JSON.parse` sur la
 * réponse brute échoue alors sur « Unexpected non-whitespace character ».
 * On isole donc le JSON en suivant l'imbrication, en ignorant les accolades
 * et crochets qui se trouvent à l'intérieur d'une chaîne.
 *
 * `ouvrant` vaut `"{"` par défaut ; `"["` pour une réponse attendue en
 * tableau — le correcteur de réponses en renvoie un, et le parsait à la main :
 * un « Je vérifie… » en tête suffisait à sauter toute la validation.
 *
 * Si le premier candidat ne se lit pas (une accolade dans la phrase
 * d'introduction), on essaie le suivant. Un texte qui se lisait avant se lit
 * donc à l'identique : le premier candidat n'a pas changé.
 */
export function extraireJSON(texte: string, ouvrant: "{" | "[" = "{"): unknown {
  const fermant = ouvrant === "{" ? "}" : "]";
  let debut = texte.indexOf(ouvrant);
  if (debut === -1) {
    throw new Error(`Aucun ${ouvrant === "{" ? "objet" : "tableau"} JSON dans la réponse du modèle.`);
  }

  let derniereErreur: unknown = null;
  while (debut !== -1) {
    const fin = finDuBloc(texte, debut, ouvrant, fermant);
    if (fin === -1) break;
    try {
      return JSON.parse(texte.slice(debut, fin + 1));
    } catch (e) {
      derniereErreur = e;
      debut = texte.indexOf(ouvrant, debut + 1);
    }
  }

  throw derniereErreur ?? new Error("JSON incomplet dans la réponse du modèle.");
}

/** Position du caractère qui ferme le bloc ouvert en `debut`, ou -1. */
function finDuBloc(texte: string, debut: number, ouvrant: string, fermant: string): number {
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
    else if (c === ouvrant) profondeur++;
    else if (c === fermant) {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return -1;
}

/**
 * Le texte étudié dans la semaine, à donner au modèle comme matière première.
 *
 * Quand l'exercice est engendré depuis la programmation de l'enseignant
 * (`lib/seances-notion.ts`), la séance de français porte un « corpus de la
 * semaine » — le texte que la classe a réellement lu. Un exercice bâti dessus
 * vaut mieux qu'un exercice bâti sur un texte inventé : les élèves y
 * retrouvent leurs mots, et l'enseignant n'a pas à vérifier un contenu qu'il
 * ne connaît pas.
 *
 * La consigne est volontairement ferme (« n'en invente pas d'autre ») : sans
 * elle, le modèle s'inspire du corpus au lieu de s'y tenir.
 *
 * Renvoie une chaîne vide quand il n'y a pas de corpus, pour s'interpoler sans
 * laisser de trou dans le prompt.
 */
export function blocCorpus(corpus?: string | null): string {
  const texte = corpus?.trim();
  if (!texte) return "";
  return `

TEXTE ÉTUDIÉ CETTE SEMAINE EN CLASSE — appuie-toi dessus :
"""
${texte}
"""
Construis l'exercice à partir de ce texte : reprends-en les phrases, les mots et
les personnages. N'invente pas un autre texte, et ne t'en éloigne pas.`;
}
