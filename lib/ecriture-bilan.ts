// ── Le bilan d'un texte corrigé, pour l'enseignant ──────────────────────────
//
// Deux textes : le PREMIER JET — ce que l'élève avait écrit seul, au premier
// « Corriger mon texte » — et le texte RENDU. Entre les deux : ses retouches, et
// les fautes que la correction lui avait signalées.
//
//  • `diffMots()` — ce qui a été retiré, ajouté, gardé, mot à mot ;
//  • `bilanCorrections()` — pour chaque faute signalée : corrigée (remplacée
//    par le mot attendu), modifiée autrement, ou laissée.
//
// Pur : aucun appel, aucune base.

export type Segment = { type: "egal" | "ajout" | "retrait"; texte: string };

export interface FauteSignalee {
  mot: string;
  position: number;
  type: string;
  attendu?: string;
}

export interface BilanFaute extends FauteSignalee {
  statut: "corrigee" | "modifiee" | "laissee";
  /** Ce que l'élève a mis à la place, quand il a touché au mot. */
  remplacement?: string;
}

/**
 * Un mot ou un signe de ponctuation, AVEC l'espace qui le précède.
 *
 * ⚠️ Les espaces ne sont pas des jetons à part : identiques partout, ils
 * servaient de repères au diff, qui alignait alors des mots sans rapport —
 * « ~~loup~~et ~~touch~~au ~~touch~~loup » au lieu de « **et au** loup ~~touch
 * touch~~ **touche-touche** ». Collés au mot qui suit, ils ne comptent plus :
 * seuls les mots servent de repères (`cle`).
 */
interface Jeton { texte: string; cle: string; debut: number }

function jetons(texte: string): Jeton[] {
  const out: Jeton[] = [];
  for (const m of texte.matchAll(/\s*(?:[\p{L}\p{N}'’-]+|[^\p{L}\p{N}\s'’-])/gu)) {
    const cle = m[0].trim();
    out.push({ texte: m[0], cle, debut: m.index! + (m[0].length - m[0].trimStart().length) });
  }
  return out;
}

type Op = { op: "=" | "-" | "+"; a?: number; b?: number };

/** Plus longue sous-suite commune, jeton à jeton. Les textes d'élèves sont courts. */
function operations(a: Jeton[], b: Jeton[]): Op[] {
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i].cle === b[j].cle ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].cle === b[j].cle) { ops.push({ op: "=", a: i++, b: j++ }); }
    else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ op: "-", a: i++ }); }
    else { ops.push({ op: "+", b: j++ }); }
  }
  while (i < n) ops.push({ op: "-", a: i++ });
  while (j < m) ops.push({ op: "+", b: j++ });
  return ops;
}

/** Ce qui a été retiré, ajouté, gardé, entre `avant` et `apres`. */
export function diffMots(avant: string, apres: string): Segment[] {
  const a = jetons(avant), b = jetons(apres);
  const segments: Segment[] = [];
  for (const o of operations(a, b)) {
    const type = o.op === "=" ? "egal" : o.op === "-" ? "retrait" : "ajout";
    const texte = o.op === "-" ? a[o.a!].texte : b[o.b!].texte;
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.type === type) dernier.texte += texte;
    else segments.push({ type, texte });
  }
  return segments;
}

const net = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Le sort de chaque faute signalée dans le premier jet.
 *
 *  • aucun de ses mots n'a bougé ⇒ laissée ;
 *  • l'élève l'a remplacée par le mot attendu ⇒ corrigée ;
 *  • il l'a changée en autre chose, ou supprimée ⇒ modifiée (avec ce qu'il a
 *    mis à la place).
 */
export function bilanCorrections(
  premierJet: string,
  fautes: FauteSignalee[],
  final: string,
): BilanFaute[] {
  const a = jetons(premierJet), b = jetons(final);
  const ops = operations(a, b);

  return fautes.map((f) => {
    const fin = f.position + f.mot.length;
    const touches = ops
      .map((o, k) => ({ o, k }))
      .filter(({ o }) => o.op !== "+" && a[o.a!].debut < fin && a[o.a!].debut + a[o.a!].cle.length > f.position);
    if (touches.length === 0 || touches.every(({ o }) => o.op === "=")) {
      return { ...f, statut: "laissee" as const };
    }

    // Le bloc de retouches autour de la faute : tout ce qui n'est pas gardé,
    // d'un bord à l'autre. Les ajouts de ce bloc sont ce que l'élève a mis.
    let debut = touches.find(({ o }) => o.op === "-")!.k;
    let finK = debut;
    while (debut > 0 && ops[debut - 1].op !== "=") debut--;
    while (finK < ops.length - 1 && ops[finK + 1].op !== "=") finK++;
    const remplacement = ops.slice(debut, finK + 1)
      .filter((o) => o.op === "+")
      .map((o) => b[o.b!].texte)
      .join("")
      .trim();

    // Corrigée si le mot attendu figure, mot pour mot, dans ce que l'élève a mis.
    // Pas « égal à » : deux fautes voisines — « la court » → « La cour » —
    // forment un seul bloc de retouche, qui ne vaut ni « La » ni « cour » seul.
    // Et la ponctuation voisine ne compte pas : « récréation, » vaut
    // « récréation ».
    const mots = (t: string) =>
      net(t.replace(/[^\p{L}\p{N}'’\s-]/gu, " ")).split(" ").filter(Boolean);
    const contient = (botte: string[], aiguille: string[]) =>
      aiguille.length > 0 &&
      botte.some((_, i) => aiguille.every((m, k) => botte[i + k] === m));
    const corrigee = !!f.attendu && contient(mots(remplacement), mots(f.attendu));
    return { ...f, statut: corrigee ? "corrigee" as const : "modifiee" as const, remplacement };
  });
}
