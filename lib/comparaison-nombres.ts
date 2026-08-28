/**
 * Évaluation des écritures de nombres manipulées par les exercices de
 * comparaison et de rangement.
 *
 * Sert à recalculer le signe (< > =) et l'ordre côté serveur plutôt que de
 * faire confiance à l'IA : un modèle se trompe sur « 0,9 vs 0,15 » ou
 * « 3/4 vs 5/8 » bien plus souvent qu'un parseur.
 */

type Token = number | "+" | "-" | "*" | "/" | "(" | ")";

const PRIORITE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/** Normalise l'écriture française : espaces de milliers, virgule décimale, × ÷ */
function normaliser(txt: string): string {
  return txt
    .replace(/[   \s]/g, "") // espaces (dont insécables) : séparateurs de milliers
    .replace(/,/g, ".")
    .replace(/[×x✕]/gi, "*")
    .replace(/[÷:]/g, "/")
    .replace(/−/g, "-"); // signe moins typographique
}

function tokeniser(txt: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < txt.length) {
    const c = txt[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < txt.length && /[0-9.]/.test(txt[j])) j++;
      const n = Number(txt.slice(i, j));
      if (!Number.isFinite(n)) return null;
      tokens.push(n);
      i = j;
      continue;
    }
    if (c === "+" || c === "*" || c === "/" || c === "(" || c === ")") {
      tokens.push(c);
      i++;
      continue;
    }
    if (c === "-") {
      // moins unaire : début d'expression ou après un opérateur / une parenthèse ouvrante
      const prec = tokens[tokens.length - 1];
      if (prec === undefined || prec === "(" || (typeof prec === "string" && prec !== ")")) {
        tokens.push(0);
      }
      tokens.push("-");
      i++;
      continue;
    }
    return null; // caractère non numérique : ce n'est pas un nombre évaluable
  }
  return tokens.length ? tokens : null;
}

/** Shunting-yard puis évaluation de la RPN. */
function evaluerTokens(tokens: Token[]): number | null {
  const sortie: (number | string)[] = [];
  const ops: string[] = [];

  for (const t of tokens) {
    if (typeof t === "number") {
      sortie.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") sortie.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
    } else {
      while (ops.length && ops[ops.length - 1] !== "(" && PRIORITE[ops[ops.length - 1]] >= PRIORITE[t]) {
        sortie.push(ops.pop()!);
      }
      ops.push(t);
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(") return null;
    sortie.push(op);
  }

  const pile: number[] = [];
  for (const s of sortie) {
    if (typeof s === "number") {
      pile.push(s);
      continue;
    }
    const b = pile.pop();
    const a = pile.pop();
    if (a === undefined || b === undefined) return null;
    if (s === "+") pile.push(a + b);
    else if (s === "-") pile.push(a - b);
    else if (s === "*") pile.push(a * b);
    else if (s === "/") {
      if (b === 0) return null;
      pile.push(a / b);
    }
  }
  return pile.length === 1 && Number.isFinite(pile[0]) ? pile[0] : null;
}

// ── Nombres écrits en toutes lettres ─────────────────────────────────────────

const MOTS_NOMBRES: Record<string, number> = {
  zero: 0, "zéro": 0,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  cent: 100, cents: 100,
  mille: 1000, milles: 1000,
  million: 1e6, millions: 1e6,
  milliard: 1e9, milliards: 1e9,
};

/**
 * Valeur d'un nombre écrit en toutes lettres : « trois-cent-vingt-deux »,
 * « quatre-vingt-dix-neuf », « un-million-deux-cent-mille ».
 *
 * Accepte les traits d'union comme les espaces, et le « et » de « vingt-et-un ».
 * Retourne null dès qu'un mot n'est pas un mot-nombre : « une pomme » n'est pas
 * un nombre, et il vaut mieux ne rien conclure que conclure faux.
 */
export function evaluerNombreEnLettres(txt: string): number | null {
  const mots = txt
    .toLowerCase()
    .trim()
    .split(/[\s-]+/)
    .filter((m) => m && m !== "et");

  if (!mots.length) return null;

  let total = 0;
  let courant = 0;
  let precedent = 0;

  for (const mot of mots) {
    const v = MOTS_NOMBRES[mot];
    if (v === undefined) return null;

    if (v === 100) {
      courant = (courant === 0 ? 1 : courant) * 100;
    } else if (v >= 1000) {
      total += (courant === 0 ? 1 : courant) * v;
      courant = 0;
    } else if (v === 20 && precedent === 4) {
      // « quatre-vingt » : le vingt multiplie le quatre au lieu de s'y ajouter
      courant = courant - 4 + 80;
    } else {
      courant += v;
    }
    precedent = v;
  }

  return total + courant;
}

/**
 * Valeur numérique d'une écriture : « 3 220 », « 12,5 », « 3/4 », « 3 × 4 »,
 * ou « trois-cent-vingt-deux ».
 * Retourne null si l'écriture n'est pas évaluable (unité, mot ordinaire, etc.).
 */
export function evaluerNombre(txt: string): number | null {
  if (typeof txt !== "string" || !txt.trim()) return null;
  const tokens = tokeniser(normaliser(txt));
  const chiffres = tokens ? evaluerTokens(tokens) : null;
  if (chiffres !== null) return chiffres;
  return evaluerNombreEnLettres(txt);
}

/** Tolérance sur les flottants : 0,1 + 0,2 ne doit pas être « > » 0,3. */
const EPSILON = 1e-9;

/** Signe qui va entre deux écritures, ou null si l'une n'est pas évaluable. */
export function signeEntre(gauche: string, droite: string): "<" | ">" | "=" | null {
  const g = evaluerNombre(gauche);
  const d = evaluerNombre(droite);
  if (g === null || d === null) return null;
  if (Math.abs(g - d) < EPSILON) return "=";
  return g < d ? "<" : ">";
}
