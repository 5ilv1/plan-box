// ── Homophones : les fautes que le dictionnaire ne voit pas ─────────────────
//
// « vert » pour « verre », « a » pour « à » : le mot écrit EXISTE. Le
// dictionnaire le confirme, et c'est justement ce qui le rend aveugle. On ne
// peut donc pas vérifier ces fautes comme les autres — mais on peut refuser de
// croire le modèle sur parole :
//
//  1. **Une liste fermée de familles.** Une faute d'homophone n'est montrée que
//     si le mot écrit et le mot attendu sont de la même famille. Le modèle ne
//     peut plus « corriger » un mot en un autre qui n'a rien à voir.
//  2. **Le test de substitution appris en classe**, pour les homophones
//     grammaticaux : « a » se remplace par « avait », « est » par « était »…
//     On ne demande plus au modèle « y a-t-il une faute ? » — question ouverte,
//     où il se trompe — mais « cette phrase est-elle correcte ? », sur la phrase
//     où l'on a fait la substitution. Question fermée, réponse oui ou non, et
//     la décision se déduit de la réponse sans rien laisser au jugement.
//
// Le module est pur : aucun appel au modèle ici. La route pose les questions,
// `trancher()` décide.

/** Une paire grammaticale et son test : la forme qui se remplace, et par quoi. */
export interface TestSubstitution {
  /** La forme qui accepte la substitution (« a »). */
  forme: string;
  /** Ce par quoi on la remplace en classe (« avait »). */
  substitut: string;
  /** L'autre forme de la paire (« à »). */
  autre: string;
  /** L'indice donné à l'élève : le test lui-même, pas la réponse. */
  indice: string;
}

/**
 * Les paires grammaticales du cycle 3 dont le test de substitution est
 * **grammaticalement décisif** : la substitution donne une phrase correcte
 * pour une forme, et une phrase impossible pour l'autre.
 *
 * Deux paires n'y sont pas, et c'est voulu — leur test ne tranche pas :
 *  • `ces`/`ses` : « ces enfants » → « mes enfants » reste correct, le test y
 *    est sémantique ;
 *  • `se`/`ce` : « se » → « me » ne marche qu'en changeant aussi le sujet
 *    (« je me suis baigné »). Sur « ils se sont baignés », la substitution
 *    donne « ils me sont baignés », incorrect alors que « se » est juste : le
 *    test aurait condamné un mot juste. Les deux gardent le contrôle de
 *    famille (`FAMILLES_LEXICALES`).
 */
export const PAIRES: readonly TestSubstitution[] = [
  { forme: "a", substitut: "avait", autre: "à",
    indice: "Essaie de remplacer ce mot par « avait » : est-ce que la phrase se dit encore ?" },
  { forme: "est", substitut: "était", autre: "et",
    indice: "Essaie de remplacer ce mot par « était » : est-ce que la phrase se dit encore ?" },
  { forme: "sont", substitut: "étaient", autre: "son",
    indice: "Essaie de remplacer ce mot par « étaient » : est-ce que la phrase se dit encore ?" },
  { forme: "ont", substitut: "avaient", autre: "on",
    indice: "Essaie de remplacer ce mot par « avaient » : est-ce que la phrase se dit encore ?" },
  { forme: "ou", substitut: "ou bien", autre: "où",
    indice: "Essaie de remplacer ce mot par « ou bien » : est-ce que la phrase se dit encore ?" },
  { forme: "ça", substitut: "cela", autre: "sa",
    indice: "Essaie de remplacer ce mot par « cela » : est-ce que la phrase se dit encore ?" },
  { forme: "mais", substitut: "pourtant", autre: "mes",
    indice: "Essaie de remplacer ce mot par « pourtant » : est-ce que la phrase se dit encore ?" },
];

/**
 * Les familles d'homophones de sens les plus fréquentes au cycle 3. Pas de test
 * ici : seul le sens tranche, et aucune règle ne le vérifie. La famille
 * empêche seulement le modèle d'inventer une correction sans rapport.
 */
export const FAMILLES_LEXICALES: readonly (readonly string[])[] = [
  ["ver", "vers", "vert", "verre"],
  ["mer", "mère", "maire"],
  ["cent", "sans", "sang"],
  ["pain", "pin", "peint"],
  ["point", "poing"],
  ["sel", "selle", "celle"],
  ["cou", "coup", "coût"],
  ["faim", "fin"],
  ["vin", "vingt", "vain"],
  ["mot", "maux"],
  ["pot", "peau"],
  ["pois", "poids"],
  ["conte", "compte", "comte"],
  ["chant", "champ"],
  ["temps", "tant", "tend"],
  ["père", "paire", "perd"],
  ["voie", "voix", "vois", "voit"],
  ["fois", "foie", "foi"],
  ["air", "aire", "ère"],
  ["cour", "cours", "court"],
  ["sot", "seau", "saut", "sceau"],
  ["mais", "mes", "met", "mets"],
  ["la", "là"],
  ["peu", "peut", "peux"],
  ["quand", "quant"],
  ["ces", "ses"],
  ["se", "ce"],
  ["leur", "leurs"],
  ["dans", "dent"],
  ["son", "sont", "sons"],
  ["tente", "tante"],
  ["porc", "port", "pore"],
  ["mur", "mûr", "mûre"],
  ["bal", "balle"],
  ["cane", "canne"],
  ["chêne", "chaîne"],
  ["lait", "les", "laid"],
  ["mai", "mais", "mets"],
  ["plaine", "pleine"],
  ["reine", "renne", "rêne"],
  ["tâche", "tache"],
  ["vent", "vend", "van"],
];

/** Minuscules, sans toucher aux accents. */
function bas(m: string): string {
  return (m ?? "").toLowerCase().trim();
}

/** La paire grammaticale d'un mot, s'il en a une. */
export function paireDe(mot: string): TestSubstitution | null {
  const m = bas(mot);
  return PAIRES.find((p) => p.forme === m || p.autre === m) ?? null;
}

/**
 * Deux mots sont-ils de la même famille d'homophones ? C'est la condition pour
 * qu'une faute d'homophone soit montrée : le modèle n'a pas le droit de
 * proposer « verre » à la place de « chat ».
 */
export function memeFamille(a: string, b: string): boolean {
  const x = bas(a), y = bas(b);
  if (!x || !y || x === y) return false;
  const p = paireDe(x);
  if (p && (p.forme === y || p.autre === y)) return true;
  return FAMILLES_LEXICALES.some((f) => f.includes(x) && f.includes(y));
}

/** Le mot appartient-il à une famille connue ? */
export function estHomophone(mot: string): boolean {
  const m = bas(mot);
  return !!paireDe(m) || FAMILLES_LEXICALES.some((f) => f.includes(m));
}

/**
 * La phrase qui contient la position, de la ponctuation forte précédente à la
 * suivante. C'est tout ce que le vérificateur voit : un texte entier ouvrirait
 * la porte aux remarques hors sujet.
 */
export function phraseAutour(texte: string, position: number): { debut: number; fin: number } {
  let debut = position;
  while (debut > 0 && !/[.!?\n]/.test(texte[debut - 1])) debut--;
  while (debut < position && /\s/.test(texte[debut])) debut++;
  let fin = position;
  while (fin < texte.length && !/[.!?\n]/.test(texte[fin])) fin++;
  if (fin < texte.length && /[.!?]/.test(texte[fin])) fin++;
  return { debut, fin };
}

/** Remplace le mot par `par`, en gardant la majuscule s'il en portait une. */
function remplacer(texte: string, position: number, longueur: number, par: string): string {
  const origine = texte.slice(position, position + longueur);
  const maj = /^\p{Lu}/u.test(origine);
  const nouveau = maj ? par.charAt(0).toUpperCase() + par.slice(1) : par;
  return texte.slice(0, position) + nouveau + texte.slice(position + longueur);
}

/**
 * La phrase soumise au vérificateur : celle de l'élève, le mot remplacé par le
 * substitut. Si elle est correcte, la forme juste est `paire.forme` ; sinon,
 * c'est `paire.autre`.
 */
export function phraseSubstituee(
  texte: string,
  position: number,
  mot: string,
  paire: TestSubstitution,
): string {
  const { debut, fin } = phraseAutour(texte, position);
  const phrase = texte.slice(debut, fin);
  return remplacer(phrase, position - debut, mot.length, paire.substitut).trim();
}

/**
 * Les deux variantes soumises au vérificateur : la phrase de l'élève avec le
 * substitut (« avait ») et avec l'autre forme (« à »).
 *
 * Pourquoi deux phrases et pas une : la phrase d'un élève contient souvent
 * d'AUTRES fautes. « Cette phrase est-elle correcte ? » sur « Les enfants
 * jouait avait la plage » ferait répondre non à cause de « jouait ». Deux
 * variantes qui ne diffèrent que par le mot testé portent les mêmes autres
 * fautes : elles ne pèsent plus sur le choix.
 */
export function variantesDuTest(
  texte: string,
  position: number,
  mot: string,
  paire: TestSubstitution,
): { avecSubstitut: string; avecAutre: string } {
  const { debut, fin } = phraseAutour(texte, position);
  const phrase = texte.slice(debut, fin);
  const local = position - debut;
  return {
    avecSubstitut: remplacer(phrase, local, mot.length, paire.substitut).trim(),
    avecAutre: remplacer(phrase, local, mot.length, paire.autre).trim(),
  };
}

/**
 * Deux écritures sont-elles la même forme ?
 *
 * Une majuscule sans accent vaut la forme accentuée — « A la plage » pour « À
 * la plage » : la consigne de correction ne signale jamais une majuscule
 * accentuée manquante, et le test ne doit pas le faire par la bande.
 */
export function memeForme(ecrit: string, attendu: string): boolean {
  if (bas(ecrit) === bas(attendu)) return true;
  if (!/^\p{Lu}/u.test(ecrit)) return false;
  const sansAccent = (s: string) =>
    s.charAt(0).normalize("NFD").replace(/[̀-ͯ]/g, "") + s.slice(1);
  return sansAccent(bas(ecrit)) === sansAccent(bas(attendu));
}

/**
 * Ce que dit le test, une fois le vérificateur interrogé.
 *
 * `substitutionCorrecte` : la phrase avec le substitut est-elle correcte ?
 * `null` quand la réponse n'a pas pu être lue — et alors on se tait : une
 * faute non confirmée n'est pas montrée.
 */
export function trancher(
  ecrit: string,
  paire: TestSubstitution,
  substitutionCorrecte: boolean | null,
): { faute: false } | { faute: true; attendu: string } | { faute: null } {
  if (substitutionCorrecte === null) return { faute: null };
  const juste = substitutionCorrecte ? paire.forme : paire.autre;
  return memeForme(ecrit, juste) ? { faute: false } : { faute: true, attendu: juste };
}
