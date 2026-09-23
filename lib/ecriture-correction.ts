// ── Vérification de la correction automatique d'un texte d'élève ─────────────
//
// Le modèle propose, ce module dispose. Même principe que `recalerGroupes()`
// pour l'analyse de phrase (piège nº 8) et que le recalcul des signes pour
// `comparaison` : sur ce qui est vérifiable, **on ne fait pas confiance à
// l'IA**.
//
// Ce qui se vérifie ici, et qui ne l'était pas :
//  • le mot signalé est-il vraiment dans le texte, à cet endroit ? La route
//    renvoyait la position annoncée par le modèle, et le composant la
//    rattrapait à ±5 caractères puis par un `indexOf` — donc en surlignant
//    parfois un autre mot que celui qui est fauté ;
//  • le mot est-il vraiment fauté ? Un mot présent dans le dictionnaire de
//    336 000 formes accentuées (`lexique_francais`) n'est pas une faute
//    d'orthographe ;
//  • la correction proposée est-elle un mot français ? Sinon on la retire.
//
// ⚠️ **En cas de doute, on se tait.** Un élève de CE2 qui « corrige » un mot
// juste apprend la faute : une erreur ratée coûte moins cher qu'une erreur
// inventée.

import {
  memeFamille, paireDe, memeForme, trancher, variantesDuTest,
  optionsDeLecture, phraseATrou, trancherLecture,
} from "./homophones";

export type TypeErreur = "orthographe" | "grammaire" | "syntaxe" | "homophone";

export interface ErreurCorrection {
  mot: string;
  type: TypeErreur;
  /** Index du premier caractère du mot dans le texte — **recalculé**, jamais celui du modèle. */
  position: number;
  indice?: string;
  correction?: string;
  /**
   * Interne — jamais envoyé à l'élève (`publier()`). Le mot que le modèle croit
   * juste : il sert à vérifier une faute d'homophone, pas à la corriger.
   */
  attendu?: string;
  /** Interne — la faute attend le verdict du test de substitution. */
  aTester?: boolean;
  /** Interne — la faute attend la seconde lecture, sur la phrase à trou. */
  aLire?: boolean;
}

const TYPES: ReadonlySet<string> = new Set(["orthographe", "grammaire", "syntaxe", "homophone"]);

/** Plafond d'erreurs rendues : au-delà, un élève ne corrige plus, il abandonne. */
export const MAX_ERREURS = 15;

/**
 * La clé de recherche dans `lexique_francais` : la forme exacte, en minuscules.
 *
 * ⚠️ **Les accents ne sont pas retirés**, et c'est tout l'intérêt : « trés » et
 * « très » doivent se distinguer, sinon la correction est aveugle là où les
 * élèves se trompent le plus. C'est pourquoi le lexique du Motus
 * (`motus_lexique`, majuscules sans accents) ne convient pas ici.
 */
export function cleLexique(mot: string): string {
  const brut = (mot ?? "").toLowerCase().trim();
  return /^[\p{L}]+$/u.test(brut) ? brut : "";
}

/**
 * Les élisions françaises, que le dictionnaire ne contient pas : il n'a aucune
 * forme apostrophée. Sans cette liste, « qu'il » et « aujourd'hui » seraient
 * signalés comme des mots inconnus.
 */
const ELISIONS: ReadonlySet<string> = new Set([
  "l", "d", "j", "n", "m", "t", "s", "c", "qu", "jusqu", "lorsqu", "puisqu",
  "quoiqu", "quelqu", "aujourd", "presqu", "entr",
]);

/** Les segments d'un mot composé : « aujourd'hui » → [aujourd, hui]. */
export function segments(mot: string): string[] {
  return (mot ?? "")
    .split(/['\u2019-]/)
    .map(cleLexique)
    .filter((s) => s.length > 0);
}

/**
 * Le mot est-il attesté ? Un mot composé l'est quand **chacun** de ses segments
 * l'est — une élision comptant pour un segment attesté.
 */
export function motAtteste(mot: string, connu: (cle: string) => boolean): boolean {
  const entier = cleLexique(mot);
  if (entier && connu(entier)) return true;
  const parts = segments(mot);
  if (parts.length < 2) return false;
  return parts.every((p) => ELISIONS.has(p) || connu(p));
}

/**
 * Un nom propre, que le dictionnaire ne peut pas confirmer : il ne contient
 * aucune majuscule.
 *
 * Les textes d'élèves sont pleins de prénoms de camarades et de noms inventés.
 * Signaler « Léa » comme une faute d'orthographe est le pire des faux positifs,
 * et c'est celui qu'on ne peut pas vérifier — donc on se tait.
 */
export function estNomPropre(texte: string, position: number, mot: string): boolean {
  if (!/^\p{Lu}/u.test(mot)) return false;
  // Une majuscule de début de phrase ne dit rien : on remonte au premier
  // caractère qui n'est ni une espace ni un guillemet.
  let i = position - 1;
  while (i >= 0 && /[\s"«»'\u2019]/.test(texte[i])) i--;
  if (i < 0) return false;            // début du texte
  return !/[.!?:;]/.test(texte[i]);   // après un point : c'est une phrase, pas un nom propre
}

/** Tous les mots dont le dictionnaire doit être interrogé, sans doublon. */
export function motsAVerifier(erreurs: unknown): string[] {
  const cles = new Set<string>();
  for (const e of Array.isArray(erreurs) ? erreurs : []) {
    const err = e as Partial<ErreurCorrection>;
    for (const s of segments(String(err?.mot ?? ""))) cles.add(s);
    for (const s of segments(String(err?.correction ?? ""))) cles.add(s);
  }
  return [...cles];
}

/** Une lettre au sens de la délimitation d'un mot (apostrophes et tirets compris). */
function estLettre(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}'’\-]/u.test(c);
}

/**
 * Toutes les occurrences de `mot` dans `texte`, en mot entier.
 *
 * La casse est ignorée — un mot en début de phrase porte une majuscule — mais
 * **pas les accents** : l'accent fait partie de l'orthographe, et confondre
 * « ou » et « où » rendrait la correction fausse là où elle est le plus utile.
 */
export function occurrences(texte: string, mot: string): number[] {
  const found: number[] = [];
  if (!mot) return found;
  const t = texte.toLowerCase();
  const m = mot.toLowerCase();
  let i = t.indexOf(m);
  while (i !== -1) {
    const avant = texte[i - 1];
    const apres = texte[i + m.length];
    if (!estLettre(avant) && !estLettre(apres)) found.push(i);
    i = t.indexOf(m, i + 1);
  }
  return found;
}

/**
 * Les erreurs qu'on accepte de montrer à l'élève.
 *
 * `connu` répond « ce mot existe-t-il en français ? » pour une clé de
 * `cleLexique()`. Le module reste pur : la route lui passe ce qu'elle a lu en
 * base, en une seule requête.
 *
 * Dictionnaire injoignable ⇒ `connu` doit répondre `false` partout : on garde
 * alors le comportement d'avant (les erreurs passent), plutôt que de tout
 * effacer et de laisser l'élève sans correction.
 */
export function verifierErreurs(
  texte: string,
  brutes: unknown,
  connu: (cle: string) => boolean,
): ErreurCorrection[] {
  const retenues: ErreurCorrection[] = [];
  const prises = new Set<number>();

  for (const e of Array.isArray(brutes) ? brutes : []) {
    const err = e as Partial<ErreurCorrection>;
    const mot = typeof err?.mot === "string" ? err.mot.trim() : "";
    const type = String(err?.type ?? "");
    if (!mot || !TYPES.has(type)) continue;

    // 1. Le mot est-il dans le texte ? Sinon il n'y a rien à surligner.
    const places = occurrences(texte, mot);
    if (places.length === 0) continue;

    // 2. L'occurrence la plus proche de ce qu'annonce le modèle — et si deux
    //    occurrences sont déjà prises, la première encore libre.
    const annoncee = typeof err.position === "number" && err.position >= 0 ? err.position : 0;
    const libres = places.filter((p) => !prises.has(p));
    if (libres.length === 0) continue;
    const position = libres.reduce((a, b) =>
      Math.abs(b - annoncee) < Math.abs(a - annoncee) ? b : a,
    );

    const ecrit = texte.slice(position, position + mot.length);

    // 3. Homophones : le mot existe, ce n'est pas le bon. On ne croit le modèle
    //    que si le mot qu'il attend est de la MÊME FAMILLE (`lib/homophones.ts`).
    //    ⚠️ C'est l'attendu qui décide, pas l'étiquette : le modèle range
    //    « a » pour « à » tantôt en grammaire, tantôt en orthographe — et le
    //    dictionnaire effaçait la seconde, la première passait sans contrôle.
    const attendu = [err.attendu, err.correction]
      .find((v): v is string => typeof v === "string" && v.trim().length > 0)?.trim() ?? "";
    if (attendu && memeFamille(ecrit, attendu)) {
      const paire = paireDe(ecrit);
      // Le test ne tranche qu'entre les deux formes de SA paire : « est » pour
      // « sont » (un accord) n'est pas une confusion et/est.
      const testable = !!paire && [paire.forme, paire.autre].some((f) => memeForme(attendu, f));
      const indice = testable
        ? paire!.indice
        : typeof err.indice === "string" && err.indice.trim() ? err.indice.trim() : undefined;
      prises.add(position);
      retenues.push({
        mot: ecrit,
        type: "homophone",
        position,
        attendu,
        // Grammaticale et testable ⇒ test de substitution (étape 2). Sinon —
        // vert/verre, ces/ses, se/ce — la phrase à trou (étape 3).
        ...(testable ? { aTester: true } : { aLire: true }),
        ...(indice ? { indice } : {}),
      });
      continue;
    }
    // Une confusion annoncée sans attendu vérifiable : on se tait.
    if (type === "homophone") continue;

    // 4. Un mot attesté n'est pas une faute d'orthographe, et un nom propre ne
    //    se vérifie pas. Les autres types (accord, conjugaison, majuscule)
    //    portent sur des mots qui existent : le dictionnaire n'a rien à en dire.
    if (type === "orthographe") {
      if (motAtteste(mot, connu)) continue;
      if (estNomPropre(texte, position, ecrit)) continue;
    }

    // 5. Une correction qui n'est pas un mot français n'est pas une correction.
    let correction = typeof err.correction === "string" ? err.correction.trim() : "";
    if (correction) {
      const identique = correction.toLowerCase() === mot.toLowerCase();
      if (identique || !motAtteste(correction, connu)) correction = "";
    }

    prises.add(position);
    retenues.push({
      mot: ecrit,
      type: type as TypeErreur,
      position,
      ...(typeof err.indice === "string" && err.indice.trim() ? { indice: err.indice.trim() } : {}),
      ...(correction ? { correction } : {}),
    });
  }

  return retenues.sort((a, b) => a.position - b.position).slice(0, MAX_ERREURS);
}

/* ────────────────────────────────────────────────────────────────────────────
   Test de substitution des homophones grammaticaux
   ──────────────────────────────────────────────────────────────────────────── */

export interface QuestionTest {
  /** Index de l'erreur dans la liste passée à `questionsDeTest()`. */
  index: number;
  A: string;
  B: string;
  /** Laquelle des deux porte le substitut (« avait ») : l'ordre alterne. */
  substitutEn: "A" | "B";
  /** Le mot qui distingue chaque phrase : le vérificateur répond par lui. */
  motA: string;
  motB: string;
}

/**
 * Les questions à poser au vérificateur : pour chaque faute à tester, deux
 * phrases qui ne diffèrent que par le mot. L'ordre alterne d'une question à
 * l'autre — un modèle a une légère préférence pour la première réponse, et
 * elle ne doit pas décider à sa place.
 */
export function questionsDeTest(texte: string, erreurs: ErreurCorrection[]): QuestionTest[] {
  const questions: QuestionTest[] = [];
  erreurs.forEach((e, index) => {
    if (!e.aTester) return;
    const paire = paireDe(e.mot);
    if (!paire) return;
    const { avecSubstitut, avecAutre } = variantesDuTest(texte, e.position, e.mot, paire);
    const substitutEn = questions.length % 2 === 0 ? "A" : "B";
    questions.push(
      substitutEn === "A"
        ? { index, A: avecSubstitut, B: avecAutre, substitutEn, motA: paire.substitut, motB: paire.autre }
        : { index, A: avecAutre, B: avecSubstitut, substitutEn, motA: paire.autre, motB: paire.substitut },
    );
  });
  return questions;
}

/**
 * Applique les verdicts. `choix[i]` répond à `questions[i]` : « A », « B », ou
 * `null` si la réponse n'a pas pu être lue.
 *
 * Une faute confirmée garde son attendu — celui du TEST, pas celui du modèle.
 * Une faute démentie disparaît. Un verdict illisible la fait disparaître aussi :
 * une faute non confirmée n'est pas montrée.
 */
export function appliquerTests(
  erreurs: ErreurCorrection[],
  questions: QuestionTest[],
  choix: Array<"A" | "B" | null>,
): ErreurCorrection[] {
  return composer(erreurs, decisionsTests(erreurs, questions, choix));
}

/**
 * Chaque étape DÉCIDE sur la liste d'origine, par index ; on compose à la fin.
 * Appliquer une étape puis l'autre décalerait les index : la seconde lirait le
 * verdict d'une autre faute.
 */
type Decisions = Map<number, ErreurCorrection | null>;

function decisionsTests(
  erreurs: ErreurCorrection[],
  questions: QuestionTest[],
  choix: Array<"A" | "B" | null>,
): Decisions {
  const decisions: Decisions = new Map();
  erreurs.forEach((e, index) => {
    if (!e.aTester) return;
    const paire = paireDe(e.mot);
    const i = questions.findIndex((x) => x.index === index);
    const c = i >= 0 ? choix[i] ?? null : null;
    if (!paire || i < 0 || c === null) { decisions.set(index, null); return; }
    const resultat = trancher(e.mot, paire, c === questions[i].substitutEn);
    decisions.set(index, resultat.faute === true
      ? { ...e, attendu: resultat.attendu, aTester: false }
      : null);
  });
  return decisions;
}

function composer(erreurs: ErreurCorrection[], decisions: Decisions): ErreurCorrection[] {
  return erreurs.flatMap((e, i) => {
    if (!decisions.has(i)) return [e];
    const d = decisions.get(i);
    return d ? [d] : [];
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Étape 3 — la seconde lecture, sur la phrase à trou
   ──────────────────────────────────────────────────────────────────────────── */

export interface QuestionLecture {
  /** Index de l'erreur dans la liste passée à `questionsDeLecture()`. */
  index: number;
  /** La phrase de l'élève, le mot remplacé par « ___ ». */
  phrase: string;
  /** Toute la famille, triée : le lecteur ne sait pas lequel était écrit. */
  options: string[];
}

export function questionsDeLecture(texte: string, erreurs: ErreurCorrection[]): QuestionLecture[] {
  const questions: QuestionLecture[] = [];
  erreurs.forEach((e, index) => {
    if (!e.aLire || !e.attendu) return;
    const options = optionsDeLecture(e.mot, e.attendu);
    if (options.length < 2) return;
    questions.push({ index, phrase: phraseATrou(texte, e.position, e.mot.length), options });
  });
  return questions;
}

function decisionsLectures(
  erreurs: ErreurCorrection[],
  questions: QuestionLecture[],
  choix: Array<string[] | null>,
): Decisions {
  const decisions: Decisions = new Map();
  erreurs.forEach((e, index) => {
    if (!e.aLire) return;
    const i = questions.findIndex((x) => x.index === index);
    const c = i >= 0 ? choix[i] ?? null : null;
    if (i < 0 || !e.attendu) { decisions.set(index, null); return; }
    const resultat = trancherLecture(e.mot, e.attendu, c);
    decisions.set(index, resultat.faute === true
      ? { ...e, attendu: resultat.attendu, aLire: false }
      : null);
  });
  return decisions;
}

export function appliquerLectures(
  erreurs: ErreurCorrection[],
  questions: QuestionLecture[],
  choix: Array<string[] | null>,
): ErreurCorrection[] {
  return composer(erreurs, decisionsLectures(erreurs, questions, choix));
}

/** Les deux étapes à la fois, décidées sur la même liste d'origine. */
export function appliquerVerdicts(
  erreurs: ErreurCorrection[],
  tests: QuestionTest[],
  choixTests: Array<"A" | "B" | null>,
  lectures: QuestionLecture[],
  choixLectures: Array<string[] | null>,
): ErreurCorrection[] {
  return composer(erreurs, new Map([
    ...decisionsTests(erreurs, tests, choixTests),
    ...decisionsLectures(erreurs, lectures, choixLectures),
  ]));
}

/** Ce que reçoit l'élève : sans les champs internes de la vérification. */
export function publier(erreurs: ErreurCorrection[]): ErreurCorrection[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return erreurs.map(({ attendu, aTester, aLire, ...visible }) => visible);
}

/* ────────────────────────────────────────────────────────────────────────────
   Suivre les erreurs pendant que l'élève écrit
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Déplace les erreurs pour suivre une modification du texte — sans jamais
 * chercher le mot ailleurs.
 *
 * L'ancien affichage, quand la position ne correspondait plus, se rabattait sur
 * `indexOf` : la première occurrence du mot dans tout le texte, et pas en mot
 * entier. Il suffisait que l'élève tape une lettre en début de texte pour que
 * « mange », fautif en phrase 3, se surligne en phrase 1 où il est juste — et
 * que « Corriger » remplace le mauvais mot.
 *
 * Ici on localise la retouche (préfixe et suffixe communs) :
 *  • une erreur entièrement avant reste où elle est ;
 *  • une erreur entièrement après se décale de la différence de longueur ;
 *  • une erreur que la retouche touche **disparaît** : l'élève a modifié ce
 *    mot, on ne sait plus ce qu'il est devenu, et on ne devine pas.
 */
export function reporterErreurs<E extends { mot: string; position: number }>(
  ancien: string,
  nouveau: string,
  erreurs: E[],
): E[] {
  if (ancien === nouveau || erreurs.length === 0) return erreurs;

  let prefixe = 0;
  const max = Math.min(ancien.length, nouveau.length);
  while (prefixe < max && ancien[prefixe] === nouveau[prefixe]) prefixe++;

  let suffixe = 0;
  while (
    suffixe < max - prefixe &&
    ancien[ancien.length - 1 - suffixe] === nouveau[nouveau.length - 1 - suffixe]
  ) suffixe++;

  const finRetouche = ancien.length - suffixe;   // dans l'ancien texte
  const decalage = nouveau.length - ancien.length;

  const suivies: E[] = [];
  for (const e of erreurs) {
    const debut = e.position;
    const fin = debut + e.mot.length;
    // Une insertion collée au mot (juste avant ou juste après) le modifie aussi :
    // « mange » + « nt » donne « mangent », qui n'est plus le mot signalé.
    const touche = debut <= finRetouche && fin >= prefixe;
    if (touche) continue;
    const position = debut >= finRetouche ? debut + decalage : debut;
    if (nouveau.slice(position, position + e.mot.length) !== e.mot) continue; // filet
    suivies.push({ ...e, position });
  }
  return suivies;
}
