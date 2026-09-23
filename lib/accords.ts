// ── Accords et temps : vérifier une correction grammaticale ─────────────────
//
// « les enfants jouait » → « jouaient », « ils est » → « sont », « hier je
// bois » → « buvais ». Le mot écrit existe : le dictionnaire n'en dit rien. Ce
// module vérifie ce qui se vérifie, et laisse le reste au test des deux phrases
// (`lib/ecriture-analyse.ts`, `poserAccords()`) :
//
//  1. **Le même mot.** La correction doit être une autre forme du MÊME mot —
//     une terminaison qui change sur un radical commun (`jouait`/`jouaient`,
//     `petit`/`petits`, `mangé`/`manger`), ou deux formes de la table d'un
//     verbe irrégulier (`est`/`sont`, `bois`/`buvais`). Sinon le modèle ne
//     corrige pas un accord : il propose un autre mot, et on se tait.
//  2. **Les deux phrases.** Celle de l'élève et celle qu'on lui propose, qui ne
//     diffèrent que par ce mot. Le vérificateur dit LESQUELLES un adulte
//     écrirait. Si celle de l'élève en fait partie, il a peut-être raison — un
//     présent de narration n'est pas une faute — et on se tait.
//
// Pur : aucun appel, aucune base.

/**
 * Les verbes irréguliers dont les formes ne partagent pas de radical :
 * `est`/`sont`, `va`/`vont`, `bois`/`buvons`. Présent, imparfait, futur,
 * passé simple, participe passé, infinitif.
 *
 * Chaque forme est vérifiée contre le dictionnaire par le contrat
 * (`docs/tests/test-accords.mjs`) : une coquille ici ferait accepter une
 * correction qui n'existe pas.
 */
export const IRREGULIERS: Readonly<Record<string, readonly string[]>> = {
  être: ["être", "suis", "es", "est", "sommes", "êtes", "sont", "étais", "était", "étions", "étiez",
    "étaient", "serai", "seras", "sera", "serons", "serez", "seront", "fus", "fut", "fûmes", "furent",
    "été", "sois", "soit", "soient"],
  avoir: ["avoir", "ai", "as", "a", "avons", "avez", "ont", "avais", "avait", "avions", "aviez",
    "avaient", "aurai", "auras", "aura", "aurons", "aurez", "auront", "eus", "eut", "eurent", "eu",
    "aie", "ait", "aient"],
  aller: ["aller", "vais", "vas", "va", "allons", "allez", "vont", "allais", "allait", "allions",
    "alliez", "allaient", "irai", "iras", "ira", "irons", "irez", "iront", "alla", "allèrent", "allé",
    "allée", "allés", "allées"],
  faire: ["faire", "fais", "fait", "faisons", "faites", "font", "faisais", "faisait", "faisions",
    "faisiez", "faisaient", "ferai", "feras", "fera", "ferons", "ferez", "feront", "fit", "firent",
    "faits"],
  pouvoir: ["pouvoir", "peux", "peut", "pouvons", "pouvez", "peuvent", "pouvais", "pouvait",
    "pouvions", "pouviez", "pouvaient", "pourrai", "pourras", "pourra", "pourrons", "pourrez",
    "pourront", "put", "purent", "pu"],
  vouloir: ["vouloir", "veux", "veut", "voulons", "voulez", "veulent", "voulais", "voulait",
    "voulions", "vouliez", "voulaient", "voudrai", "voudras", "voudra", "voudrons", "voudrez",
    "voudront", "voulut", "voulurent", "voulu"],
  dire: ["dire", "dis", "dit", "disons", "dites", "disent", "disais", "disait", "disions", "disiez",
    "disaient", "dirai", "diras", "dira", "dirons", "direz", "diront", "dirent"],
  voir: ["voir", "vois", "voit", "voyons", "voyez", "voient", "voyais", "voyait", "voyions",
    "voyiez", "voyaient", "verrai", "verras", "verra", "verrons", "verrez", "verront", "vit",
    "virent", "vu", "vue", "vus", "vues"],
  prendre: ["prendre", "prends", "prend", "prenons", "prenez", "prennent", "prenais", "prenait",
    "prenions", "preniez", "prenaient", "prendrai", "prendras", "prendra", "prendrons", "prendrez",
    "prendront", "prit", "prirent", "pris", "prise", "prises"],
  venir: ["venir", "viens", "vient", "venons", "venez", "viennent", "venais", "venait", "venions",
    "veniez", "venaient", "viendrai", "viendras", "viendra", "viendrons", "viendrez", "viendront",
    "vint", "vinrent", "venu", "venue", "venus", "venues"],
  savoir: ["savoir", "sais", "sait", "savons", "savez", "savent", "savais", "savait", "savions",
    "saviez", "savaient", "saurai", "sauras", "saura", "saurons", "saurez", "sauront", "sut",
    "surent", "su"],
  devoir: ["devoir", "dois", "doit", "devons", "devez", "doivent", "devais", "devait", "devions",
    "deviez", "devaient", "devrai", "devras", "devra", "devrons", "devrez", "devront", "dut",
    "durent", "dû", "due"],
  mettre: ["mettre", "mets", "met", "mettons", "mettez", "mettent", "mettais", "mettait",
    "mettions", "mettiez", "mettaient", "mettrai", "mettras", "mettra", "mettrons", "mettrez",
    "mettront", "mit", "mirent", "mis", "mise", "mises"],
  boire: ["boire", "bois", "boit", "buvons", "buvez", "boivent", "buvais", "buvait", "buvions",
    "buviez", "buvaient", "boirai", "boiras", "boira", "boirons", "boirez", "boiront", "but",
    "burent", "bu", "bue", "bus", "bues"],
  lire: ["lire", "lis", "lit", "lisons", "lisez", "lisent", "lisais", "lisait", "lisions", "lisiez",
    "lisaient", "lirai", "liras", "lira", "lirons", "lirez", "liront", "lut", "lurent", "lu", "lue",
    "lus", "lues"],
  écrire: ["écrire", "écris", "écrit", "écrivons", "écrivez", "écrivent", "écrivais", "écrivait",
    "écrivions", "écriviez", "écrivaient", "écrirai", "écriras", "écrira", "écrirons", "écrirez",
    "écriront", "écrivit", "écrivirent", "écrite", "écrits", "écrites"],
};

/**
 * Les lettres dont sont faites les terminaisons françaises — conjugaison et
 * accords : `-e`, `-es`, `-ent`, `-ons`, `-ez`, `-ais`, `-ait`, `-aient`,
 * `-rai`, `-é`, `-ée`, `-er`, `-s`, `-x`, `-aux`… Une consonne comme `g`, `c`
 * ou `h` n'est la terminaison de rien : « mange » et « manche » ne sont pas
 * deux formes du même mot.
 */
const LETTRES_TERMINAISON = /^[aeiouyéèêëâîïôûùrsntzxlm]*$/; // m : dort / dorment

function bas(m: string): string {
  return (m ?? "").toLowerCase().trim();
}

/**
 * Deux formes du même mot ?
 *
 *  • même verbe irrégulier (table) ;
 *  • ou même radical — au moins trois lettres, la plus grande partie du mot —
 *    suivi de deux terminaisons courtes faites de lettres de terminaison.
 *
 * C'est un garde-fou, pas un analyseur : il empêche le modèle de « corriger »
 * un accord en proposant un autre mot. Le test des deux phrases décide.
 */
export function memeMot(a: string, b: string): boolean {
  const x = bas(a), y = bas(b);
  if (!x || !y || x === y) return false;
  if (!/^\p{L}+$/u.test(x) || !/^\p{L}+$/u.test(y)) return false;

  for (const formes of Object.values(IRREGULIERS)) {
    if (formes.includes(x) && formes.includes(y)) return true;
  }

  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  const tx = x.slice(p), ty = y.slice(p);
  // Le radical peut être court devant de longues terminaisons : « part-ais » /
  // « part-irai », « march-eront » / « march-aient ». Ce qui empêche « mange »
  // / « manche », ce sont les LETTRES de terminaison, pas la longueur du radical.
  if (p < 3) return false;
  if (tx.length > 5 || ty.length > 5) return false;
  return LETTRES_TERMINAISON.test(tx) && LETTRES_TERMINAISON.test(ty);
}

/**
 * Ce que dit le test des deux phrases.
 *
 * `acceptables` : les phrases qu'un adulte écrirait — celle de l'élève
 * (`"ecrit"`), la corrigée (`"attendu"`), les deux, aucune. `null` si la
 * réponse est illisible.
 *
 *  • celle de l'élève est acceptable ⇒ pas de faute — il a peut-être raison ;
 *  • seule la corrigée l'est ⇒ faute confirmée ;
 *  • aucune, ou illisible ⇒ on se tait.
 */
export function trancherAccord(
  acceptables: ReadonlyArray<"ecrit" | "attendu"> | null,
): { faute: boolean | null } {
  if (acceptables === null) return { faute: null };
  if (acceptables.includes("ecrit")) return { faute: false };
  if (acceptables.includes("attendu")) return { faute: true };
  return { faute: null };
}
