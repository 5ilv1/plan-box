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
  /** Le dessin de l'énoncé — sens « lire » seulement. */
  figure?: FractionAire;
  /**
   * Un dessin par option — sens « reconnaître ». Même longueur qu'`options`,
   * qui ne porte alors que des étiquettes neutres (« Figure A »…) : un libellé
   * qui décrirait le dessin donnerait la réponse sans le regarder.
   */
  options_figures?: FractionAire[];
}

/**
 * Les deux sens de lecture, qui ne travaillent pas la même chose :
 *  • `lire` — un dessin, quatre fractions : lire ce qu'on voit ;
 *  • `reconnaitre` — une fraction, quatre dessins : se représenter ce qu'on lit.
 * Le second est plus dur, et c'est celui qui débusque l'élève qui « lit » en
 * comptant machinalement des parts coloriées sans se figurer le tout.
 */
export type SensFraction = "lire" | "reconnaitre";

export interface OptionsFractions {
  nb?: number;
  /** `les_deux` alterne une question sur deux. */
  sens?: SensFraction | "les_deux";
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
export const ENONCE_INVERSE = (f: string) => `Quelle figure représente la fraction ${f} ?`;

/** Les étiquettes des options quand ce sont des dessins. */
export const LETTRES = ["Figure A", "Figure B", "Figure C", "Figure D"];

/** Au-delà, les parts deviennent trop fines pour être comptées. */
const PARTS_MAX = 12;

/**
 * Deux dessins doivent se distinguer d'un coup d'œil : au moins un dixième de
 * l'aire d'écart.
 *
 * C'est la leçon du premier rendu : `10/12` et `11/12` dessinés côte à côte
 * sont le même disque presque plein. L'élève ne choisit plus une figure, il
 * compte douze secteurs fins sans droit à l'erreur — ce n'est pas la
 * compétence visée, et c'est perdu d'avance sur une tablette.
 *
 * Le seuil couvre aussi le cas du même dénominateur : à 12 parts, il impose
 * deux parts d'écart ; à 4 parts, une seule suffit, et elle se voit.
 */
const ECART_MIN = 0.1;

/**
 * Les trois fractions à DESSINER à côté de `n/d`, pour le sens inverse.
 *
 * Elles ne peuvent pas être les mêmes que les distracteurs écrits : `8/3` ne se
 * dessine pas. Ce sont donc des fractions propres, dans cet ordre :
 *  • le complément `(d-n)/d` — a colorié les parts qu'il ne fallait pas ;
 *  • le bon numérateur sur un partage visiblement différent ;
 *  • deux parts coloriées de trop ou de moins.
 *
 * Les mêmes interdits que pour les options écrites : jamais un dessin qui vaut
 * la bonne réponse, et jamais deux dessins de même valeur dans une question.
 */
export function fractionsDistractrices(n: number, d: number): [number, number][] {
  const candidats: [number, number][] = [
    [d - n, d],
    [n, d + 2],
    [n, d - 2],
    [n + 2, d],
    [n - 2, d],
    [n + 2, d + 2],
    [n, d + 3],
    [n + 3, d],
  ];

  const sortie: [number, number][] = [];
  const retenir = ([a, b]: [number, number]): boolean => {
    if (sortie.length >= 3) return false;
    if (b < 2 || b > PARTS_MAX) return false;        // dessinable
    if (a < 1 || a >= b) return false;               // propre : au moins une part blanche
    if (Math.abs(a / b - n / d) < ECART_MIN) return false;  // indiscernable de la bonne
    if (sortie.some(([x, y]) => Math.abs(x / y - a / b) < ECART_MIN)) return false; // indiscernables entre eux
    sortie.push([a, b]);
    return true;
  };

  for (const c of candidats) retenir(c);

  // Filet : près des bords — 10/12, 1/12 — les candidats ci-dessus tombent
  // presque tous sous le seuil. On balaie alors toutes les fractions
  // dessinables, en préférant le même dénominateur (il faut compter les parts
  // coloriées, pas seulement jauger l'aire), puis les plus proches en valeur —
  // une option trop lointaine ne se choisit jamais et ne fait pas un vrai
  // distracteur.
  if (sortie.length < 3) {
    const reste: [number, number][] = [];
    for (let b = 2; b <= PARTS_MAX; b++) for (let a = 1; a < b; a++) reste.push([a, b]);
    reste.sort((u, v) => {
      const rang = ([, b]: [number, number]) => (b === d ? 0 : 1);
      if (rang(u) !== rang(v)) return rang(u) - rang(v);
      return Math.abs(u[0] / u[1] - n / d) - Math.abs(v[0] / v[1] - n / d);
    });
    for (const c of reste) retenir(c);
  }

  return sortie;
}

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

/** Le dessin d'une fraction, prêt à être servi. */
function dessiner(
  n: number, d: number, forme: FormeFraction, dispersees: boolean, alea: () => number,
): FractionAire {
  return {
    type: "fraction_aire",
    forme,
    parts: d,
    coloriees: choisirParts(n, d, dispersees, alea),
    ...(forme === "rectangle" ? { colonnes: colonnesPour(d) } : {}),
  };
}

/** Un dessin, quatre fractions écrites. */
function questionLire(
  n: number, d: number, forme: FormeFraction, dispersees: boolean, alea: () => number,
): QuestionFraction {
  const bonne = `${n}/${d}`;
  const options = melanger([bonne, ...distracteurs(n, d).slice(0, 3)], alea);
  return {
    question: ENONCE,
    options,
    reponse_correcte: options.indexOf(bonne),
    explication:
      `La figure est partagée en ${d} parts égales — c'est le dénominateur. ` +
      `${n} ${n > 1 ? "sont coloriées" : "est coloriée"} — c'est le numérateur. On lit ${bonne}.`,
    figure: dessiner(n, d, forme, dispersees, alea),
  };
}

/**
 * Une fraction écrite, quatre dessins.
 *
 * Les quatre dessins ont la MÊME forme : mélanger disque et rectangle
 * ajouterait une comparaison qui n'est pas celle qu'on évalue.
 */
function questionReconnaitre(
  n: number, d: number, forme: FormeFraction, dispersees: boolean, alea: () => number,
): QuestionFraction {
  const bonne = dessiner(n, d, forme, dispersees, alea);
  const dessins = melanger(
    [bonne, ...fractionsDistractrices(n, d).map(([a, b]) => dessiner(a, b, forme, dispersees, alea))],
    alea,
  );
  const idx = dessins.indexOf(bonne);

  return {
    question: ENONCE_INVERSE(`${n}/${d}`),
    // Étiquettes neutres : « un disque en 4 parts dont 3 coloriées » donnerait
    // la réponse en toutes lettres, sans avoir à regarder les dessins.
    options: LETTRES.slice(0, dessins.length),
    reponse_correcte: idx,
    explication:
      `${n}/${d}, c'est ${n} ${n > 1 ? "parts coloriées" : "part coloriée"} sur ${d} parts égales : ` +
      `la ${LETTRES[idx].toLowerCase()}.`,
    options_figures: dessins,
  };
}

/**
 * Le QCM complet. La bonne réponse et les trois mauvaises sont calculées, puis
 * leur position est mélangée.
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

  const sens = o.sens ?? "lire";
  const dispersees = !!o.dispersees;

  return Array.from({ length: nb }, (_, i) => {
    const { forme, d, n } = tirage[i % tirage.length];
    // `les_deux` alterne, plutôt que de tirer au sort : sur dix questions, un
    // tirage laisse passer des lots de huit dans le même sens.
    const s = sens === "les_deux" ? (i % 2 === 0 ? "lire" : "reconnaitre") : sens;
    return s === "reconnaitre"
      ? questionReconnaitre(n, d, forme, dispersees, alea)
      : questionLire(n, d, forme, dispersees, alea);
  });
}
