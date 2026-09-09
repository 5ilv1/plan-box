/**
 * Poser les traits d'union des nombres écrits en toutes lettres.
 *
 * `REGLE_NOMBRES_EN_LETTRES` demande la graphie rectifiée de 1990 dans les 16
 * routes de génération, et le modèle l'applique… la plupart du temps. Une
 * consigne de prompt est une intention, pas une garantie : « trois cent
 * quarante-cinq » ressortait un jour sur deux, et l'enseignant remettait les
 * traits d'union à la main.
 *
 * Le prompt reste — il vaut mieux que le modèle écrive juste du premier coup —
 * mais il ne fait plus foi. Le texte généré est corrigé après coup, sans
 * appeler personne : c'est le même parti pris que `comparaison` et `rangement`,
 * où le signe et l'ordre sont recalculés côté serveur.
 *
 * PORTÉE — on ne corrige que là où c'est l'objet de l'exercice, c'est-à-dire
 * les champs qui SONT le nombre : la réponse attendue d'un « écris 345 en
 * lettres », l'énoncé d'une dictée de nombres, l'étiquette d'un rangement.
 * Une phrase qui contient un nombre au passage n'est pas corrigée — « Deux
 * millions de francs » dans un quiz de lecture reste tel quel, et les chapitres
 * de romans importés dans `exercice.contenu` avec.
 *
 * Ce qui est délibérément laissé tranquille :
 *  • les chiffres — la règle ne dit pas d'écrire les nombres en lettres,
 *    seulement comment les écrire quand ils le sont ;
 *  • un mot-nombre isolé (« trois ») : il n'y a rien à relier ;
 *  • toute prose, même quand elle contient un nombre en toutes lettres.
 */

import { evaluerNombreEnLettres } from "@/lib/comparaison-nombres";

/** Les mots dont un nombre en toutes lettres est fait. */
const MOTS_NOMBRES = new Set([
  "zero", "zéro",
  "un", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "vingt", "vingts", "trente", "quarante", "cinquante", "soixante",
  "cent", "cents", "mille", "milles",
  "million", "millions", "milliard", "milliards",
]);

/**
 * Le « et » n'appartient à un nombre que dans 21, 31, 41, 51, 61 et 71.
 *
 * Ailleurs il relie deux nombres distincts — « trois-cents et quatre-cents » —
 * et les souder inventerait un nombre qui n'existe pas.
 */
const AVANT_ET = new Set(["vingt", "trente", "quarante", "cinquante", "soixante"]);
const APRES_ET = new Set(["un", "une", "onze"]);

const clef = (mot: string) => mot.toLowerCase();
const estMotNombre = (mot: string) => MOTS_NOMBRES.has(clef(mot));

/**
 * Seules l'espace et le trait d'union relient les éléments d'un nombre.
 *
 * Un espace autour du tiret est toléré — « cinq -cent-cinquante-six » se lit
 * en base, le modèle ayant laissé traîner une frappe. C'est sans danger : la
 * série doit de toute façon se refermer sur elle-même (voir `estNombreEcrit`),
 * ce qui écarte « dix - cinq », qui vaut quinze et ne s'écrit pas « dix-cinq ».
 */
const estLiant = (separateur: string) =>
  separateur !== "" && /^[ \u00A0\u202F]*-?[ \u00A0\u202F]*$/.test(separateur);

// ── Écrire un nombre en toutes lettres, graphie rectifiée ────────────────────

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES: Record<number, string> = {
  20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante",
};

function sousCent(n: number): string {
  if (n < 20) return UNITES[n];

  if (n < 70) {
    const d = Math.floor(n / 10) * 10;
    const u = n % 10;
    if (u === 0) return DIZAINES[d];
    if (u === 1) return `${DIZAINES[d]}-et-un`;
    return `${DIZAINES[d]}-${UNITES[u]}`;
  }

  // 70-79 : soixante-dix … soixante-dix-neuf, avec « soixante-et-onze »
  if (n < 80) return n === 71 ? "soixante-et-onze" : `soixante-${UNITES[n - 60]}`;

  // 80-99 : quatre-vingts prend son s seul ; pas de « et » ici
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${UNITES[n - 80]}`;
}

function sousMille(n: number): string {
  if (n < 100) return sousCent(n);
  const centaines = Math.floor(n / 100);
  const reste = n % 100;
  const tete = centaines === 1 ? "cent" : `${UNITES[centaines]}-cent`;
  if (reste === 0) return centaines === 1 ? "cent" : `${UNITES[centaines]}-cents`;
  return `${tete}-${sousCent(reste)}`;
}

/**
 * Un entier en toutes lettres, tous éléments reliés (« trois-cent-quarante-cinq »).
 *
 * `mille` est invariable, `vingt` et `cent` ne prennent leur s que multipliés et
 * en fin de nombre, `million` et `milliard` sont des noms et s'accordent.
 */
export function nombreEnLettres(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) return null;
  if (n === 0) return "zéro";

  const morceaux: string[] = [];
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1000);
  const reste = n % 1000;

  if (milliards) morceaux.push(`${sousMille(milliards)}-milliard${milliards > 1 ? "s" : ""}`);
  if (millions) morceaux.push(`${sousMille(millions)}-million${millions > 1 ? "s" : ""}`);
  if (milliers) morceaux.push(milliers === 1 ? "mille" : `${sousMille(milliers)}-mille`);
  if (reste) morceaux.push(sousMille(reste));

  return morceaux.join("-");
}

/** Même mot à l'accord près : « cents » = « cent », « une » = « un ». */
function motComparable(mot: string): string {
  const m = mot.toLowerCase();
  if (m === "une") return "un";
  if (/^(?:vingts|cents|milles|millions|milliards)$/.test(m)) return m.slice(0, -1);
  return m;
}

const decouper = (txt: string) => txt.toLowerCase().split(/[\s-]+/).filter(Boolean);

/**
 * La série est-elle vraiment un nombre, et non deux mots qui se suivent ?
 *
 * `evaluerNombreEnLettres` est trop accueillant pour trancher : il donne 1 pour
 * « un zéro » et 4 pour « les trois une chanson ». On fait donc l'aller-retour —
 * la série doit se réécrire à l'identique depuis sa valeur. « un zéro » vaut 1,
 * qui s'écrit « un » : la série ne se referme pas, on n'y touche pas.
 */
function estNombreEcrit(serie: string): boolean {
  const valeur = evaluerNombreEnLettres(serie);
  if (valeur === null) return false;

  const canonique = nombreEnLettres(valeur);
  if (canonique === null) return false;

  const a = decouper(serie).map(motComparable);
  const b = decouper(canonique).map(motComparable);
  return a.length === b.length && a.every((mot, i) => mot === b[i]);
}

/** Relie par des traits d'union tous les nombres écrits en toutes lettres d'un texte. */
export function traitsUnionNombres(texte: string): string {
  if (typeof texte !== "string" || !texte) return texte;

  // Découpage en mots et séparateurs : les mots tombent aux index impairs.
  const morceaux = texte.split(/(\p{L}[\p{L}\p{M}]*)/u);

  let i = 1;
  while (i < morceaux.length) {
    if (!estMotNombre(morceaux[i])) { i += 2; continue; }

    let fin = i;
    let j = i + 2;
    while (j < morceaux.length && estLiant(morceaux[j - 1])) {
      const mot = morceaux[j];

      if (estMotNombre(mot)) { fin = j; j += 2; continue; }

      // « vingt et un » : le « et » ne se garde que s'il est bien celui-là.
      if (
        clef(mot) === "et" &&
        estLiant(morceaux[j + 1] ?? "") &&
        AVANT_ET.has(clef(morceaux[fin])) &&
        APRES_ET.has(clef(morceaux[j + 2] ?? ""))
      ) {
        fin = j + 2;
        j = fin + 2;
        continue;
      }

      break;
    }

    if (fin > i) {
      // Dernier garde-fou : la série doit être un nombre, pas deux mots voisins.
      const serie = morceaux.slice(i, fin + 1).join("");
      if (estNombreEcrit(serie)) {
        for (let k = i + 1; k < fin; k += 2) morceaux[k] = "-";
      }
    }

    i = fin + 2;
  }

  return morceaux.join("");
}

/**
 * Relie le champ s'il est un nombre en toutes lettres, et le laisse sinon.
 *
 * C'est ce test qui donne sa portée à tout le module : un champ entièrement
 * occupé par un nombre, c'est un exercice où l'on écrit le nombre en lettres —
 * et c'est là, et là seulement, que le trait d'union se joue. Dès qu'il reste
 * un mot autour, on est dans une phrase, et on n'y touche pas.
 */
export function traitsUnionSiNombre(champ: string): string {
  if (typeof champ !== "string") return champ;

  // Les espaces et le point final ne font pas partie du nombre. Un champ qui
  // contient un retour à la ligne ne correspond pas : c'est de la prose.
  const bornes = champ.match(/^(\s*)(.*?)([.\s]*)$/);
  if (!bornes) return champ;

  const [, avant, coeur, apres] = bornes;
  if (!coeur || !estNombreEcrit(coeur)) return champ;

  return avant + traitsUnionNombres(coeur) + apres;
}

/**
 * Applique la règle à toutes les chaînes d'un contenu généré, en profondeur.
 *
 * Le tri se fait chaîne par chaîne : réponses attendues, énoncés de dictée de
 * nombres et étiquettes sont corrigés parce qu'ils SONT des nombres ; tout le
 * reste passe sans être touché.
 */
export function normaliserNombresEnLettres<T>(valeur: T): T {
  if (typeof valeur === "string") return traitsUnionSiNombre(valeur) as unknown as T;
  if (Array.isArray(valeur)) return valeur.map(normaliserNombresEnLettres) as unknown as T;
  if (valeur && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      sortie[cle] = normaliserNombresEnLettres(v);
    }
    return sortie as unknown as T;
  }
  return valeur;
}
