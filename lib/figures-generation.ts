/**
 * Les figures des exercices de maths engendrés par l'IA.
 *
 * En géométrie et en grandeurs et mesures, certaines questions ne se posent
 * pas en mots : lire l'heure, reconnaître un angle droit, compter les carreaux
 * d'une aire. Décrire le cadran ou la figure, c'est donner la réponse. Le
 * modèle peut donc joindre à une question la clé `figure` de
 * `docs/ceintures/SPEC-FIGURES.md`, que `FigureGeo` dessine.
 *
 * **Quand c'est nécessaire**, et c'est la première règle de la consigne.
 * « Un rectangle de 7 cm sur 4 cm » se dit en mots sans rien perdre : il peut
 * être illustré **de temps en temps** (une ou deux questions d'un exercice au
 * plus), jamais systématiquement — une figure à chaque question ralentit la
 * lecture sans rien apprendre.
 *
 * **Le prompt ne fait pas foi**, comme ailleurs : une figure abîmée emporte sa
 * question (l'énoncé parle d'un dessin qui n'existe pas), et la réponse est
 * recalculée sur le dessin quand elle peut l'être — l'heure du cadran, la
 * nature de l'angle, l'aire et le périmètre comptés sur le quadrillage ou tirés
 * des longueurs écrites. Un désaccord écarte la question : le modèle a dessiné
 * une chose et répondu sur une autre.
 *
 * Module pur : aucun appel, testé par `docs/tests/test-figures-generation.mjs`.
 */

import type { Figure, FigurePolygone, PolygoneFigure } from "@/components/FigureGeo";
import type { Droite, PointDroite } from "@/components/DroiteGraduee";
import { lireHeure } from "@/lib/comparer-reponse";

/** Sous-domaines où une figure peut être nécessaire. */
const SOUS_DOMAINES_FIGURES = ["Géométrie", "Grandeurs et mesures"];

/**
 * Les maths CE2 n'ont pas de code de chapitre : leur sous-domaine est un
 * repli sur « Numération ». Le thème dit alors ce que le sous-domaine tait.
 */
const MOTS_FIGURES =
  /\b(aires?|p[ée]rim[èe]tres?|angles?|horloges?|cadrans?|l['’]heure|lire l['’]heure|polygones?|quadrilat[èe]res?|triangles?|rectangles?|carr[ée]s?|losanges?|cercles?|sym[ée]trie|sym[ée]triques?|quadrillage|parall[èe]les?|perpendiculaires?|g[ée]om[ée]tri\w*|figures?|gradu\w*)\b/i;

/** La génération doit-elle proposer des figures ? */
export function figuresPossibles(matiere: string, sousMatiere: string, ...textes: (string | undefined)[]): boolean {
  if (!/math/i.test(matiere ?? "")) return false;
  if (SOUS_DOMAINES_FIGURES.includes((sousMatiere ?? "").trim())) return true;
  return textes.some((t) => !!t && MOTS_FIGURES.test(t));
}

/** Questions demandées en plus : la vérification en écarte. */
export const MARGE_FIGURES = 2;

/**
 * La consigne ajoutée au prompt de génération. `cle` est le champ de la
 * question où se lit la réponse, pour l'exemple.
 */
export function consigneFigures(format: "exercice" | "qcm"): string {
  const exemple =
    format === "qcm"
      ? `{ "question": "Quelle est l'aire de cette figure ?", "options": ["10 carreaux", "12 carreaux", "14 carreaux", "7 carreaux"], "reponse_correcte": 1, "explication": "…", "figure": { "type": "polygone", "grille": { "colonnes": 7, "lignes": 5 }, "polygones": [{ "sommets": [[1,1],[5,1],[5,4],[1,4]] }] } }`
      : `{ "id": 1, "enonce": "Quelle est l'aire de cette figure, en carreaux ?", "reponse_attendue": "12 carreaux", "figure": { "type": "polygone", "grille": { "colonnes": 7, "lignes": 5 }, "polygones": [{ "sommets": [[1,1],[5,1],[5,4],[1,4]] }] } }`;

  return `FIGURES — UNIQUEMENT QUAND ELLES SONT NÉCESSAIRES
Une question peut porter une clé "figure" : un dessin affiché sous l'énoncé.
Ajoute une figure SEULEMENT si la question est impossible sans elle : lire l'heure sur une horloge, reconnaître ou nommer un angle (droit, aigu, obtus), compter les carreaux d'une aire ou d'un périmètre sur quadrillage, reconnaître une figure codée (angles droits, côtés égaux), repérer un axe de symétrie, des droites parallèles ou perpendiculaires, lire un nombre repéré sur une droite graduée.
Quand l'énoncé se suffit (« un rectangle de 7 cm sur 4 cm », un calcul de durée, une conversion d'unités, un problème rédigé), pas de figure en règle générale. Tu PEUX, de temps en temps, illustrer une telle question — une ou deux questions de l'exercice au plus, jamais toutes, et aucune si rien ne s'y prête : la figure reprend alors exactement les données de l'énoncé (le rectangle avec ses longueurs écrites) et n'ajoute aucune information. La plupart des questions n'ont pas de figure. Sans figure, n'écris jamais « cette figure », « ci-dessous », « le dessin ».
Avec une figure, l'énoncé y renvoie (« cette horloge », « cette figure ») et ne la décrit pas : la décrire donnerait la réponse.

Formes disponibles (et aucune autre) :
- Horloge : { "type": "cadran", "heures": 1 à 12, "minutes": 0 à 59 }   (ajoute "chiffres": false pour un cadran sans chiffres)
- Angle : { "type": "angle", "degres": 1 à 179 }   — jamais entre 76 et 104 sauf 90 exactement : un angle presque droit ne se distingue pas à l'œil.
- Figure plane : { "type": "polygone", "grille": { "colonnes": C, "lignes": L }, "polygones": [ { "sommets": [[x,y], …], "nom": "ABCD", "angles_droits": [indices des sommets], "cotes_egaux": [[indice du côté, nombre de traits], …], "longueurs": [[indice du côté, "5 cm"], …] } ], "segments": [ { "de": [x,y], "a": [x,y], "pointille": true } ], "points": [ { "at": [x,y], "nom": "A" } ] }
  · coordonnées en carreaux : entières pour les sommets des polygones, demi-carreaux permis pour segments et points (axe en x = 2.5), origine en bas à gauche, y vers le haut ; x de 0 à 11, y de 0 à 9 ;
  · le côté i va du sommet i au sommet suivant ;
  · "grille" seulement si l'élève doit compter des carreaux ou se repérer ; sans "grille", papier uni ;
  · "longueurs" seulement si l'élève calcule à partir des mesures écrites — alors pas de grille, et dessine en respectant les proportions ;
  · pour une aire ou un périmètre sur quadrillage, des côtés sur les lignes du quadrillage, et la réponse en carreaux (aire) ou en côtés de carreau (périmètre).
- Droite graduée : { "type": "droite", "origine": 0, "pas": 10, "intervalles": 1 à 20, "divisions": 1 à 10, "etiquettes": "toutes" | "bornes" | [valeurs écrites], "points": [ { "valeur": 70, "nom": "A" } ] }
  · "origine" : valeur du premier repère, à gauche (jamais négative) ; "pas" : écart entre deux grands repères ; "divisions" : petits intervalles dans chaque grand (1 = aucun petit trait) ;
  · la droite va de "origine" à origine + pas × intervalles : aucune valeur écrite ni aucun point au-delà ;
  · un petit trait vaut pas ÷ divisions : chaque point tombe exactement sur un trait, grand ou petit (point à 140 sur une droite de 100 en 100 ⇒ "divisions": 5, des traits de 20 en 20) ; au plus 4 points, nommés par une lettre majuscule différente ;
  · au moins deux valeurs écrites sous la droite, et JAMAIS celle d'un point : l'élève la retrouve en comptant les intervalles ;
  · l'élève ne peut pas dessiner sur la droite : il lit la valeur d'un point (« Quel nombre est repéré par le point A ? », réponse : le nombre seul), ou dit quelle lettre est sur un nombre donné.

Exemple :
${exemple}`;
}

/* ── Assainir ce que le modèle a dessiné ─────────────────────────────────── */

const MAX_X = 11;
const MAX_Y = 9;

const entier = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/**
 * Un point du dessin. Les sommets d'un polygone sont entiers (ses carreaux se
 * comptent) ; un segment ou un point peut tomber au milieu d'un carreau — un
 * axe de symétrie passe souvent en x = 2,5.
 */
const point = (v: unknown, demi = false): [number, number] | null => {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const coord = (c: unknown, max: number) =>
    demi && typeof c === "number" ? (entier(c * 2, 0, max * 2) === null ? null : c) : entier(c, 0, max);
  const x = coord(v[0], MAX_X), y = coord(v[1], MAX_Y);
  return x === null || y === null ? null : [x, y];
};

const nomCourt = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : undefined;

function polygoneSain(p: unknown): PolygoneFigure | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (!Array.isArray(o.sommets) || o.sommets.length < 3 || o.sommets.length > 10) return null;
  const sommets = o.sommets.map((v) => point(v));
  if (sommets.some((s) => s === null)) return null;
  const S = sommets as [number, number][];
  // Une aire nulle n'est pas une figure : trois points alignés. Un sommet
  // répété ou deux côtés qui se croisent dessinent un nœud, pas un polygone —
  // et son aire ne se compte plus (essai du 23/10 : un rectangle « refermé »
  // par sa diagonale).
  if (aire(S) === 0 || !polygoneSimple(S)) return null;
  const n = S.length;
  const indice = (v: unknown) => entier(v, 0, n - 1);

  const res: PolygoneFigure = { sommets: S };
  const nom = nomCourt(o.nom, 10);
  if (nom && nom.length === n) res.nom = nom;
  if (Array.isArray(o.angles_droits)) {
    const a = o.angles_droits.map(indice).filter((i): i is number => i !== null);
    if (a.length) res.angles_droits = a;
  }
  if (Array.isArray(o.cotes_egaux)) {
    const c = o.cotes_egaux
      .filter((e): e is unknown[] => Array.isArray(e) && e.length === 2)
      .map((e) => [indice(e[0]), entier(e[1], 1, 3)] as const)
      .filter((e): e is readonly [number, number] => e[0] !== null && e[1] !== null)
      .map(([i, k]) => [i, k] as [number, number]);
    if (c.length) res.cotes_egaux = c;
  }
  if (Array.isArray(o.longueurs)) {
    const l = o.longueurs
      .filter((e): e is unknown[] => Array.isArray(e) && e.length === 2)
      .map((e) => [indice(e[0]), nomCourt(e[1], 12)] as const)
      .filter((e): e is readonly [number, string] => e[0] !== null && !!e[1])
      .map(([i, t]) => [i, t] as [number, string]);
    if (l.length) res.longueurs = l;
  }
  if (o.plein === false) res.plein = false;
  return res;
}

/**
 * La figure telle qu'on peut la dessiner, ou `null` si elle est abîmée.
 * Les champs inconnus sont retirés ; une partie illisible rend tout illisible
 * — un polygone à moitié dessiné serait une autre figure.
 */
export function assainirFigure(f: unknown): Figure | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;

  if (o.type === "cadran") {
    const heures = entier(o.heures, 1, 12);
    const minutes = o.minutes === undefined ? 0 : entier(o.minutes, 0, 59);
    if (heures === null || minutes === null) return null;
    return { type: "cadran", heures, minutes, ...(o.chiffres === false ? { chiffres: false } : {}) };
  }

  if (o.type === "angle") {
    const degres = entier(o.degres, 1, 179);
    if (degres === null) return null;
    const nom = nomCourt(o.nom, 2);
    return { type: "angle", degres, ...(nom ? { nom } : {}) };
  }

  if (o.type === "polygone") {
    const res: FigurePolygone = { type: "polygone" };
    if (o.grille !== undefined) {
      const g = o.grille as Record<string, unknown> | null;
      const colonnes = entier(g?.colonnes, 1, MAX_X + 1), lignes = entier(g?.lignes, 1, MAX_Y + 1);
      if (colonnes === null || lignes === null) return null;
      res.grille = { colonnes, lignes };
    }
    if (o.polygones !== undefined) {
      if (!Array.isArray(o.polygones) || o.polygones.length > 4) return null;
      const p = o.polygones.map(polygoneSain);
      if (p.some((x) => x === null)) return null;
      if (p.length) res.polygones = p as PolygoneFigure[];
    }
    if (o.segments !== undefined) {
      if (!Array.isArray(o.segments) || o.segments.length > 8) return null;
      const s = o.segments.map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        const de = point(r.de, true), a = point(r.a, true);
        if (!de || !a || (de[0] === a[0] && de[1] === a[1])) return null;
        const nom = nomCourt(r.nom, 3);
        return { de, a, ...(r.pointille === true ? { pointille: true } : {}), ...(nom ? { nom } : {}) };
      });
      if (s.some((x) => x === null)) return null;
      if (s.length) res.segments = s as NonNullable<FigurePolygone["segments"]>;
    }
    if (o.points !== undefined) {
      if (!Array.isArray(o.points) || o.points.length > 12) return null;
      const pts = o.points.map((x) => {
        const r = (x ?? {}) as Record<string, unknown>;
        const at = point(r.at, true);
        if (!at) return null;
        const nom = nomCourt(r.nom, 3);
        return { at, ...(nom ? { nom } : {}) };
      });
      if (pts.some((x) => x === null)) return null;
      if (pts.length) res.points = pts as NonNullable<FigurePolygone["points"]>;
    }
    if (!res.polygones && !res.segments && !res.points) return null;
    return res.grille ? res : recentrer(res);
  }

  // `fraction_aire` a son propre générateur, calculé (lib/fractions-aires.ts) ;
  // tout autre type est inconnu de FigureGeo.
  return null;
}

/**
 * Sans quadrillage, la position n'a pas de sens : on décale la figure pour
 * laisser un carreau de marge en bas et à gauche. Collée au bord, une
 * longueur ou un nom de sommet écrit à l'extérieur sortirait du dessin.
 */
function recentrer(f: FigurePolygone): FigurePolygone {
  const tous = [
    ...(f.polygones ?? []).flatMap((p) => p.sommets),
    ...(f.segments ?? []).flatMap((s) => [s.de, s.a]),
    ...(f.points ?? []).map((p) => p.at),
  ];
  const dx = 1 - Math.min(...tous.map((p) => p[0]));
  const dy = 1 - Math.min(...tous.map((p) => p[1]));
  if (dx === 0 && dy === 0) return f;
  const t = ([x, y]: [number, number]): [number, number] => [x + dx, y + dy];
  return {
    ...f,
    ...(f.polygones ? { polygones: f.polygones.map((p) => ({ ...p, sommets: p.sommets.map(t) })) } : {}),
    ...(f.segments ? { segments: f.segments.map((s) => ({ ...s, de: t(s.de), a: t(s.a) })) } : {}),
    ...(f.points ? { points: f.points.map((p) => ({ ...p, at: t(p.at) })) } : {}),
  };
}

/* ── La droite graduée ───────────────────────────────────────────────────
 * Elle ne vit pas dans `figure` : les pages élève la lisent dans la clé
 * `droite` de la question (SPEC-DROITE-GRADUEE.md). Le modèle l'écrit en
 * `figure: { type: "droite" }`, une seule consigne pour tous les dessins, et
 * `filtrerFigures()` la range à sa place.
 */

const arrondir = (v: number) => Math.round(v * 1e6) / 1e6;
const egal = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Les valeurs que l'élève lit écrites sous la droite — même règle que `DroiteGraduee`. */
export function valeursEcrites(d: Droite): number[] {
  const principaux = Array.from({ length: d.intervalles + 1 }, (_, i) => arrondir(d.origine + i * d.pas));
  const bornes = [principaux[0], principaux[d.intervalles]];
  const e = d.etiquettes ?? "toutes";
  if (e === "aucune") return [];
  if (e === "bornes") return bornes;
  if (Array.isArray(e)) return e;
  return d.intervalles + 1 > 12 ? bornes : principaux;
}

/** Petits traits qu'un élève sait lire : on n'en invente pas d'autres. */
const DIVISIONS_USUELLES = [2, 4, 5, 10];

/**
 * La droite telle qu'on peut la dessiner et la lire, ou `null`. Refusée aussi
 * quand elle ne se lit pas (moins de deux valeurs écrites) ou qu'elle donne la
 * réponse (un point posé sur une valeur écrite).
 *
 * Le modèle se trompe surtout en dessinant : un point à 140 sur une droite de
 * 100 en 100 sans petits traits, une étiquette 700 au bout d'une droite qui
 * s'arrête à 600 (essai du 29/10 : 8 droites de QCM sur 8). Sa valeur, elle,
 * est juste, et ses options sont bâties autour. On **ajuste donc le dessin** :
 * des petits traits (2, 4, 5 ou 10, multiples de ceux demandés) et des
 * intervalles en plus. Jamais quand l'énoncé parle des intervalles ou des
 * traits — « chaque intervalle est découpé en 5 » deviendrait faux.
 */
export function assainirDroite(f: unknown, enonce = ""): Droite | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  if (o.type !== "droite") return null;
  // Le modèle écrit parfois les étiquettes entre guillemets : « "100" ».
  const num = (v: unknown) => {
    const n = typeof v === "string" && /^\s*\d+(?:[.,]\d+)?\s*$/.test(v) ? parseFloat(v.replace(",", ".")) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const origine = num(o.origine);
  let pas = num(o.pas);
  let intervalles = entier(o.intervalles, 1, 20);
  let divisions = o.divisions === undefined ? 1 : entier(o.divisions, 1, 10);
  let etiquettesBrutes = o.etiquettes;
  // Relatifs hors programme.
  if (origine === null || origine < 0 || pas === null || pas <= 0 || intervalles === null || divisions === null) return null;
  // Un seul grand intervalle découpé (« de 0 à 100, 10 petits traits ») : le
  // modèle le dessine ainsi en QCM. C'est la même droite que 10 intervalles de
  // 10 dont seules les bornes sont écrites.
  if (intervalles === 1) {
    if (divisions < 2) return null;
    pas = pas / divisions;
    intervalles = divisions;
    divisions = 1;
    if (etiquettesBrutes === undefined || etiquettesBrutes === "toutes") etiquettesBrutes = "bornes";
  }

  let liste: number[] | null = null;
  let etiquettes: Droite["etiquettes"];
  if (etiquettesBrutes === "toutes" || etiquettesBrutes === "bornes" || etiquettesBrutes === "aucune") etiquettes = etiquettesBrutes;
  else if (Array.isArray(etiquettesBrutes)) {
    const l = etiquettesBrutes.map(num);
    if (l.some((v) => v === null)) return null;
    liste = [...new Set((l as number[]).map(arrondir))];
  } else if (etiquettesBrutes !== undefined) return null;

  let points: PointDroite[] = [];
  if (o.points !== undefined) {
    if (!Array.isArray(o.points) || o.points.length > 4) return null;
    const pts = o.points.map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const valeur = num(r.valeur), nom = nomCourt(r.nom, 2);
      return valeur === null || !nom ? null : { valeur: arrondir(valeur), nom };
    });
    if (pts.some((p) => p === null)) return null;
    points = pts as PointDroite[];
    if (new Set(points.map((p) => p.nom)).size !== points.length || new Set(points.map((p) => p.valeur)).size !== points.length) return null;
  }

  const placees = [...(liste ?? []), ...points.map((p) => p.valeur)];
  if (placees.some((v) => v < origine - 1e-9)) return null;
  const surRepere = (v: number, n: number, d: number) => {
    const k = (v - origine) / (pas / d);
    return Math.abs(k - Math.round(k)) < 1e-6 && Math.round(k) <= n * d;
  };
  const lisible = (n: number, d: number) => n * d <= 50 && placees.every((v) => surRepere(v, n, d));

  if (!lisible(intervalles, divisions)) {
    if (/\b(?:intervalles?|traits?|graduations?|parties|d[ée]coup\w*|subdivis\w*)\b/i.test(enonce)) return null;
    const n = Math.max(intervalles, Math.ceil((Math.max(origine, ...placees) - origine) / pas - 1e-9));
    const d0 = divisions;
    const d = [d0, ...DIVISIONS_USUELLES.filter((x) => x > d0 && x % d0 === 0)].find((x) => lisible(n, x));
    if (n > 20 || d === undefined) return null;
    intervalles = n;
    divisions = d;
  }

  const res: Droite = { origine, pas, intervalles, ...(divisions > 1 ? { divisions } : {}) };
  if (liste) res.etiquettes = liste;
  else if (etiquettes) res.etiquettes = etiquettes;
  if (points.length) res.points = points;

  const ecrites = valeursEcrites(res);
  if (new Set(ecrites).size < 2) return null;
  if (res.points?.some((p) => ecrites.some((v) => egal(v, p.valeur)))) return null;
  return res;
}

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Le point dont l'énoncé demande de lire la valeur, ou `null` si l'énoncé ne
 * demande pas une lecture directe — « quel nombre est 2 graduations après
 * A ? » attend autre chose que A.
 */
export function pointDemande(enonce: string, d: Droite): PointDroite | null {
  const pts = d.points ?? [];
  if (!pts.length) return null;
  const lecture = /\bquel(?:le)?s?\s+(?:est\s+(?:le|la)\s+)?(?:nombre|valeur)\b/i.test(enonce)
    || /\b(?:nombre|valeur)\s+(?:est\s+)?(?:rep[ée]r|indiqu|plac|montr|marqu|situ|correspond)/i.test(enonce);
  const calcul = /\b(?:apr[èe]s|avant|plus|moins|double|moiti[ée]|entre|suivant|pr[ée]c[ée]dent|arrondi\w*|encadr\w*|[ée]cart|distance|combien)\b/i;
  if (!lecture || calcul.test(enonce)) return null;
  const cites = pts.filter((p) =>
    new RegExp(`\\b(?:point|lettre|fl[èe]che|rep[èe]re)\\s+${echapper(p.nom)}(?![\\p{L}\\d])`, "iu").test(enonce));
  if (cites.length === 1) return cites[0];
  return cites.length === 0 && pts.length === 1 ? pts[0] : null;
}

/** Une réponse qui n'est qu'un nombre : « 70 », « 1 200 », « 2,5 ». */
const nombreSeul = (t: string) => /^\s*\d{1,3}(?:[\s\u00a0]?\d{3})*(?:[.,]\d+)?\s*$/.test(t);

/** Dans un QCM sur droite graduée, combien d'options valent le point lu ? */
export function nbOptionsJustesDroite(enonce: string, options: string[], d: Droite): number | null {
  const p = pointDemande(enonce, d);
  if (!p || !options.every(nombreSeul)) return null;
  return options.filter((o) => egal(premierNombre(o)!, p.valeur)).length;
}

/* ── Recalculer la réponse sur le dessin ─────────────────────────────────── */

type P = [number, number];
const orient = (a: P, b: P, c: P) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const surSegment = (a: P, b: P, c: P) =>
  Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);

/** Deux segments ont-ils un point commun ? (extrémités comprises) */
function seCoupent(a: P, b: P, c: P, d: P): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && surSegment(a, b, c)) || (o2 === 0 && surSegment(a, b, d))
    || (o3 === 0 && surSegment(c, d, a)) || (o4 === 0 && surSegment(c, d, b));
}

/** Pas de sommet répété, et deux côtés non voisins ne se touchent pas. */
export function polygoneSimple(S: P[]): boolean {
  const n = S.length;
  if (new Set(S.map(([x, y]) => `${x},${y}`)).size !== n) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // côtés voisins
      if (seCoupent(S[i], S[(i + 1) % n], S[j], S[(j + 1) % n])) return false;
    }
  }
  return true;
}

/**
 * Les carreaux se comptent-ils ? Côtés sur les lignes du quadrillage, ou en
 * diagonale exacte (des demi-carreaux) pour une aire. Un côté de pente 3/2
 * coupe les carreaux en morceaux que personne ne sait additionner.
 */
function comptable(S: P[], diagonalesPermises: boolean): boolean {
  return S.every((a, i) => {
    const b = S[(i + 1) % S.length];
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    return dx === 0 || dy === 0 || (diagonalesPermises && dx === dy);
  });
}

/** Aire d'un polygone en carreaux (formule du lacet). */
export function aire(S: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < S.length; i++) {
    const [x1, y1] = S[i], [x2, y2] = S[(i + 1) % S.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Périmètre en côtés de carreau, ou `null` si un côté n'est pas sur le quadrillage. */
export function perimetreQuadrillage(S: [number, number][]): number | null {
  let p = 0;
  for (let i = 0; i < S.length; i++) {
    const [x1, y1] = S[i], [x2, y2] = S[(i + 1) % S.length];
    if (x1 !== x2 && y1 !== y2) return null;
    p += Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  return p;
}

/** Le premier nombre d'un texte, écriture française comprise (« 12,5 »). */
export function premierNombre(t: string): number | null {
  const m = t.replace(/(\d)\s+(?=\d{3}\b)/g, "$1").match(/\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

export { lireHeure } from "@/lib/comparer-reponse";

const NATURES = ["droit", "aigu", "obtus"] as const;
const natureAngle = (d: number) => (d === 90 ? "droit" : d < 90 ? "aigu" : "obtus");

/** Un rectangle aux côtés sur les axes : ses deux longueurs, lues sur les étiquettes. */
function dimensionsEcrites(p: PolygoneFigure): [number, number] | null {
  const S = p.sommets;
  if (S.length !== 4 || perimetreQuadrillage(S) === null || !p.longueurs) return null;
  const unites = new Set<string>();
  const val = new Map<number, number>();
  for (const [i, t] of p.longueurs) {
    const v = premierNombre(t);
    if (v === null) return null;
    unites.add(t.replace(/[\d\s.,]/g, "").toLowerCase());
    val.set(i, v);
  }
  if (unites.size !== 1) return null;
  // Deux côtés consécutifs : une longueur, une largeur.
  for (let i = 0; i < 4; i++) {
    const a = val.get(i), b = val.get((i + 1) % 4);
    if (a !== undefined && b !== undefined) return [a, b];
  }
  return null;
}

export type RaisonFigure =
  | "figure-illisible" | "heure" | "angle" | "angle-ambigu" | "aire" | "perimetre" | "incomptable" | "droite";

/** Ce que l'énoncé demande de mesurer sur un polygone, s'il le dit sans ambiguïté. */
function grandeurDemandee(enonce: string): "aire" | "perimetre" | null {
  const e = enonce.toLowerCase();
  const veutAire = /\baire\b/.test(e);
  const veutPerimetre = /p[ée]rim[èe]tre/.test(e);
  return veutAire === veutPerimetre ? null : veutAire ? "aire" : "perimetre";
}

/**
 * L'aire ou le périmètre que montre le dessin — compté sur le quadrillage, ou
 * calculé sur les longueurs écrites d'un rectangle. `null` si l'énoncé ne
 * demande pas l'un des deux, ou si le dessin ne permet pas de le calculer.
 */
export function mesureDuDessin(enonce: string, figure: Figure): number | null {
  if (figure.type !== "polygone" || figure.polygones?.length !== 1) return null;
  const quoi = grandeurDemandee(enonce);
  if (!quoi) return null;
  const p = figure.polygones[0];
  const dims = dimensionsEcrites(p);
  if (dims) return quoi === "aire" ? dims[0] * dims[1] : 2 * (dims[0] + dims[1]);
  if (!figure.grille || p.longueurs) return null;
  if (quoi === "aire") return comptable(p.sommets, true) ? aire(p.sommets) : null;
  return perimetreQuadrillage(p.sommets);
}

/**
 * Le dessin et la réponse disent-ils la même chose ? Renvoie la raison du
 * désaccord, ou `null`. Ce qu'on ne sait pas recalculer passe : on ne
 * vérifie que ce qui se vérifie sans ambiguïté.
 */
export function desaccord(enonce: string, reponse: string, figure: Figure): RaisonFigure | null {
  const e = enonce.toLowerCase();

  if (figure.type === "cadran") {
    // « Quelle heure sera-t-il dans 15 minutes ? » attend une autre heure que
    // celle du cadran : seule la lecture directe se vérifie.
    const lecture = /quelle heure/.test(e) && !/\b(dans|après|apres|avant|plus tard|plus tôt|sera|était|etait|durée|duree)\b/.test(e);
    const lu = lecture ? lireHeure(reponse) : null;
    if (lu && (lu.h % 12 || 12) === figure.heures && lu.m === (figure.minutes ?? 0)) return null;
    if (lu) return "heure";
    return null;
  }

  if (figure.type === "angle") {
    const dit = NATURES.filter((n) => new RegExp(`\\b${n}`, "i").test(reponse));
    if (dit.length === 1) {
      if (figure.degres !== 90 && Math.abs(figure.degres - 90) <= 14) return "angle-ambigu";
      if (dit[0] !== natureAngle(figure.degres)) return "angle";
    }
    return null;
  }

  if (figure.type === "polygone" && figure.polygones?.length === 1) {
    const quoi = grandeurDemandee(enonce);
    if (!quoi) return null;
    const p = figure.polygones[0];
    // Sur quadrillage, l'élève compte : encore faut-il que ça se compte.
    if (figure.grille && !p.longueurs && !comptable(p.sommets, quoi === "aire")) return "incomptable";
    const n = premierNombre(reponse);
    const attendu = mesureDuDessin(enonce, figure);
    if (n === null || attendu === null) return null;
    return Math.abs(attendu - n) < 1e-9 ? null : quoi;
  }
  return null;
}

/* ── Le filtre, appliqué aux questions engendrées ────────────────────────── */

export interface EcarteeFigure {
  enonce: string;
  raison: RaisonFigure;
}

/** Remplace le premier nombre d'une réponse : « 8 carreaux » → « 10 carreaux ». */
export function remplacerNombre(reponse: string, valeur: number): string {
  const ecrit = String(valeur).replace(".", ",");
  return /\d/.test(reponse)
    ? reponse.replace(/\d+(?:[.,]\d+)?/, ecrit)
    : ecrit;
}

/**
 * Garde les questions dont la figure est saine et d'accord avec la réponse,
 * en remplaçant la figure par sa version assainie. Une question sans figure
 * passe telle quelle.
 *
 * `lire` dit où trouver l'énoncé et la réponse dans une question : ce n'est
 * pas le même champ pour un exercice et pour un QCM.
 *
 * `corriger`, facultatif : une aire ou un périmètre mal compté par le modèle
 * se recalcule sur le dessin — c'est lui que l'élève voit. Le modèle compte
 * mal les figures en L (8 carreaux pour 10, à l'essai). `corriger` reçoit la
 * bonne valeur et rend la question réparée, ou `null` s'il ne sait pas (un
 * QCM dont aucune option ne vaut la mesure) : elle est alors écartée.
 */
export function filtrerFigures<T extends { figure?: unknown }>(
  questions: T[],
  lire: (q: T) => { enonce: string; reponse: string },
  corriger?: (q: T, valeur: number) => T | null,
): { questions: T[]; ecartees: EcarteeFigure[]; corrigees: number } {
  const gardees: T[] = [];
  const ecartees: EcarteeFigure[] = [];
  let corrigees = 0;
  for (const q of questions) {
    if (q.figure === undefined || q.figure === null) {
      const { figure: _f, ...reste } = q as T & { figure?: unknown };
      gardees.push(reste as T);
      continue;
    }
    const { enonce, reponse } = lire(q);
    if ((q.figure as { type?: unknown }).type === "droite") {
      const droite = assainirDroite(q.figure, enonce);
      if (!droite) {
        ecartees.push({ enonce, raison: "figure-illisible" });
        continue;
      }
      const { figure: _f, ...reste } = q;
      const avecDroite = { ...reste, droite } as unknown as T;
      const p = pointDemande(enonce, droite);
      const n = p ? premierNombre(reponse) : null;
      if (!p || n === null || egal(n, p.valeur)) {
        gardees.push(avecDroite);
        continue;
      }
      // Le point dessiné fait foi, comme l'aire comptée : c'est lui que l'élève
      // voit. Seulement sur une réponse qui n'est qu'un nombre — « 7 dizaines »
      // ne se réécrit pas en « 70 dizaines ».
      const reparee = nombreSeul(reponse) && corriger ? corriger(avecDroite, p.valeur) : null;
      if (reparee) {
        gardees.push(reparee);
        corrigees++;
      } else {
        ecartees.push({ enonce, raison: "droite" });
      }
      continue;
    }
    const figure = assainirFigure(q.figure);
    if (!figure) {
      ecartees.push({ enonce, raison: "figure-illisible" });
      continue;
    }
    const raison = desaccord(enonce, reponse, figure);
    if (raison === "aire" || raison === "perimetre") {
      const valeur = mesureDuDessin(enonce, figure);
      const reparee = valeur !== null && corriger ? corriger({ ...q, figure }, valeur) : null;
      if (reparee) {
        gardees.push(reparee);
        corrigees++;
        continue;
      }
    }
    if (raison) {
      ecartees.push({ enonce, raison });
      continue;
    }
    gardees.push({ ...q, figure });
  }
  return { questions: gardees, ecartees, corrigees };
}

/**
 * Dans un QCM dessiné, combien d'options le dessin rend-il justes ? Le
 * relecteur de QCM ne voit pas les figures (lib/relire-qcm.ts) : c'est ici
 * qu'on refuse « 3 h 25 » et « 15 h 25 » côte à côte sous la même horloge.
 * `null` si le dessin ne permet pas de le dire.
 */
export function nbOptionsJustes(enonce: string, options: string[], figure: Figure): number | null {
  if (figure.type === "cadran") {
    if (!/quelle heure/i.test(enonce)) return null;
    const lues = options.map((o) => lireHeure(o));
    if (lues.some((l) => !l)) return null;
    return lues.filter((l) => (l!.h % 12 || 12) === figure.heures && l!.m === (figure.minutes ?? 0)).length;
  }
  const mesure = mesureDuDessin(enonce, figure);
  if (mesure === null) return null;
  return options.filter((o) => premierNombre(o) === mesure).length;
}
