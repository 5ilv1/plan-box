// ── Fractions représentées par des aires ─────────────────────────────────────
//
// Un disque ou un rectangle partagé en parts égales, certaines coloriées :
// l'élève lit la fraction. Sert la séance « Représenter des fractions par des
// aires » (N3 · fiche 16).
//
// Le QCM est engendré PAR CALCUL, jamais par l'IA — même règle que
// `comparaison` et `rangement` : la bonne réponse est connue par construction,
// et les mauvaises aussi. C'est tout l'intérêt du QCM ici : chaque distracteur
// est une erreur d'élève identifiée, donc une réponse fausse qui dit quelque
// chose au lieu de compter un point en moins.
//
// Le dessin se déclare par la clé facultative `figure` d'une question de `qcm`
// (ou d'`exercice`) — pas de nouveau type d'exercice. Voir
// docs/ceintures/SPEC-FIGURES.md.

export type FormeFraction = "cercle" | "rectangle";

export interface FractionAire {
  type: "fraction_aire";
  forme: FormeFraction;
  /** Nombre de parts égales : le dénominateur du dessin. */
  parts: number;
  /**
   * Les parts coloriées, dans l'ordre du tracé (0 = en haut pour le disque, en
   * haut à gauche pour le rectangle). Un nombre `n` vaut « les n premières »,
   * pour écrire une banque à la main sans énumérer.
   */
  coloriees: number[] | number;
  /**
   * Rectangle : nombre de colonnes du quadrillage. Doit diviser `parts` ;
   * par défaut une seule ligne.
   */
  colonnes?: number;
}

/** Les indices des parts coloriées, quelle que soit l'écriture reçue. */
export function partsColoriees(f: FractionAire): number[] {
  const parts = Math.max(1, Math.round(Number(f.parts) || 1));
  const brut = Array.isArray(f.coloriees)
    ? f.coloriees
    : Array.from({ length: Math.max(0, Math.round(Number(f.coloriees) || 0)) }, (_, i) => i);
  const vus = new Set<number>();
  for (const i of brut) {
    const k = Math.round(Number(i));
    if (Number.isFinite(k) && k >= 0 && k < parts) vus.add(k);
  }
  return [...vus].sort((a, b) => a - b);
}

/**
 * Le quadrillage d'un rectangle de `parts` parts : le nombre de colonnes.
 *
 * Jusqu'à 6 parts, une seule ligne — c'est la bande de chocolat que les élèves
 * ont sous les yeux. Au-delà, un quadrillage aussi carré que possible, à
 * condition que le nombre de colonnes divise le nombre de parts : des parts
 * inégales feraient mentir le dessin. 7 et 11 restent donc en ligne.
 */
export function colonnesPour(parts: number): number {
  if (parts <= 6) return parts;
  let meilleur = parts;
  let ecart = Infinity;
  for (let c = 2; c <= 6; c++) {
    if (parts % c !== 0) continue;
    const e = Math.abs(c - parts / c);
    // À écart égal on prend le plus de colonnes : plus large que haut.
    if (e <= ecart) { ecart = e; meilleur = c; }
  }
  return meilleur;
}

/**
 * Les mauvaises réponses plausibles pour `n/d`, de la plus instructive à la
 * moins, sans doublon.
 *
 * Règle absolue : **aucune option ne doit valoir la bonne réponse**. Un disque
 * partagé en 4 dont 2 parts sont coloriées se lit `2/4` ; proposer `1/2` à
 * côté et le compter faux serait injuste — l'élève aurait raison.
 */
export function distracteurs(n: number, d: number): string[] {
  const candidats: [number, number][] = [
    [d, n],       // numérateur et dénominateur inversés
    [d - n, d],   // a compté les parts blanches
    ...(d - n >= 2 ? ([[n, d - n]] as [number, number][]) : []), // coloriées sur blanches
    [n + 1, d],   // une part coloriée de trop
    [n - 1, d],   // une part coloriée de moins
    [n, d + 1],   // a compté une part de trop dans le tout
    [n, d - 1],   // une part de moins dans le tout
  ];

  const vus = new Set([`${n}/${d}`]);
  const sortie: string[] = [];
  for (const [a, b] of candidats) {
    if (a <= 0 || b <= 0) continue;
    if (a * d === n * b) continue; // vaudrait la bonne réponse
    const txt = `${a}/${b}`;
    if (vus.has(txt)) continue;
    vus.add(txt);
    sortie.push(txt);
  }
  // Filet : on ne sort jamais d'ici avec moins de trois mauvaises réponses.
  for (let k = 2; sortie.length < 3; k++) {
    const txt = `${n + k}/${d}`;
    if (!vus.has(txt)) { vus.add(txt); sortie.push(txt); }
  }
  return sortie;
}

export interface QuestionFraction {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication: string;
  figure: FractionAire;
}

export interface OptionsFractions {
  nb?: number;
  formes?: FormeFraction[];
  denominateurs?: number[];
  /** Parts coloriées non contiguës — nettement plus difficile à lire. */
  dispersees?: boolean;
  /** Injecté par les tests pour rendre le tirage reproductible. */
  alea?: () => number;
}

/**
 * Les dénominateurs du programme, par niveau. Le CE2 reste sur les partages
 * familiers ; le CM2 voit les neuvièmes et les douzièmes.
 */
export const DENOMINATEURS_PAR_NIVEAU: Record<string, number[]> = {
  CE2: [2, 3, 4, 6, 8],
  CM1: [2, 3, 4, 5, 6, 8, 10],
  CM2: [3, 4, 5, 6, 8, 9, 10, 12],
};

export const ENONCE = "Quelle fraction de la figure est coloriée ?";

function melanger<T>(t: T[], alea: () => number): T[] {
  const a = [...t];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Les `n` indices coloriés parmi `d` parts. */
function choisirParts(n: number, d: number, dispersees: boolean, alea: () => number): number[] {
  if (!dispersees) return Array.from({ length: n }, (_, i) => i);
  return melanger(Array.from({ length: d }, (_, i) => i), alea)
    .slice(0, n)
    .sort((a, b) => a - b);
}

/**
 * Le QCM complet. Chaque question porte son dessin ; la bonne réponse et les
 * trois mauvaises sont calculées, puis leur position est mélangée.
 */
export function genererQuestionsFractions(o: OptionsFractions = {}): QuestionFraction[] {
  const alea = o.alea ?? Math.random;
  const nb = Math.min(Math.max(Math.round(o.nb ?? 10), 1), 20);
  const formes = (o.formes?.length ? o.formes : ["cercle", "rectangle"]) as FormeFraction[];
  const denominateurs = (o.denominateurs?.length ? o.denominateurs : DENOMINATEURS_PAR_NIVEAU.CM1)
    .map((d) => Math.round(d))
    .filter((d) => d >= 2 && d <= 12);
  if (!denominateurs.length) denominateurs.push(4);

  // Toutes les fractions possibles, mélangées : on ne repose la même que si
  // l'enseignant en demande plus qu'il n'en existe.
  const pool: { forme: FormeFraction; d: number; n: number }[] = [];
  for (const forme of formes) {
    for (const d of denominateurs) {
      for (let n = 1; n < d; n++) pool.push({ forme, d, n });
    }
  }
  const tirage = melanger(pool, alea);

  return Array.from({ length: nb }, (_, i) => {
    const { forme, d, n } = tirage[i % tirage.length];
    const bonne = `${n}/${d}`;
    const options = melanger([bonne, ...distracteurs(n, d).slice(0, 3)], alea);

    const figure: FractionAire = {
      type: "fraction_aire",
      forme,
      parts: d,
      coloriees: choisirParts(n, d, !!o.dispersees, alea),
      ...(forme === "rectangle" ? { colonnes: colonnesPour(d) } : {}),
    };

    return {
      question: ENONCE,
      options,
      reponse_correcte: options.indexOf(bonne),
      explication:
        `La figure est partagée en ${d} parts égales — c'est le dénominateur. ` +
        `${n} ${n > 1 ? "sont coloriées" : "est coloriée"} — c'est le numérateur. On lit ${bonne}.`,
      figure,
    };
  });
}
