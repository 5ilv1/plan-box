// ── Majuscules et élisions : détectées, pas devinées ────────────────────────
//
// Une majuscule oubliée en début de phrase, un « que on » pour « qu'on » : ces
// fautes obéissent à des règles, et une règle se programme. On ne demande donc
// rien au modèle — on détecte. Ce qu'il signale lui-même sur ces points est
// remplacé par ce que ce module trouve (`fusionnerTypographie()`).
//
// Toute la difficulté est dans les EXCEPTIONS, et c'est là qu'une détection
// naïve inventerait des fautes :
//  • le h aspiré — « le héros », « la hache » ne s'élident pas. On ne signale un
//    h que s'il est dans la liste des h muets ;
//  • les dialogues — « « Quoi ? » dit-il » : la minuscule après « ? » est juste ;
//  • les points de suspension — « Il hésita… puis partit » ;
//  • l'impératif et l'inversion — « prends-le avec toi », « ai-je raison » ;
//  • « si elle » ne s'élide pas, seul « si il » ; « ce arbre » se corrige en
//    « cet arbre », pas en « c'arbre » : il n'est pas signalé ici.
//
// Pur : aucun appel, aucune base.

export interface FauteTypo {
  mot: string;
  position: number;
  attendu: string;
  indice: string;
  nature: "majuscule" | "elision";
}

interface Jeton { mot: string; debut: number; fin: number }

/** Les mots du texte (lettres seules), avec leur place. */
function jetons(texte: string): Jeton[] {
  const out: Jeton[] = [];
  for (const m of texte.matchAll(/\p{L}+/gu)) {
    out.push({ mot: m[0], debut: m.index!, fin: m.index! + m[0].length });
  }
  return out;
}

const VOYELLES = /^[aeiouàâäéèêëîïôöùûüæœ]/i;

/**
 * Les h muets courants au cycle 3 : devant eux, on élide. Tout autre mot en h
 * est présumé aspiré — « le héros », « la hache », « le hibou » — et on se tait.
 */
export const H_MUETS: ReadonlySet<string> = new Set([
  "homme", "hommes", "heure", "heures", "hiver", "hivers", "histoire", "histoires", "herbe",
  "herbes", "hôpital", "hôpitaux", "hôtel", "hôtels", "habit", "habits", "habitude", "habitudes",
  "habitant", "habitants", "habite", "habites", "habitent", "habiter", "habitais", "habitait",
  "habille", "habillent", "habiller", "habillé", "huile", "humeur", "hélicoptère", "héroïne",
  "hier", "hirondelle", "hirondelles", "horloge", "horloges", "horizon", "humain", "humains",
  "hameçon", "harmonie", "hippopotame", "honneur", "horrible", "humide", "hygiène", "hôte",
  "hésite", "hésitent", "hésiter", "hésitais", "hésitait",
]);

/** Des mots qui commencent par une voyelle et refusent pourtant l'élision. */
const SANS_ELISION: ReadonlySet<string> = new Set(["onze", "onzième", "oui", "ouistiti", "ouate"]);

/** Le mot suivant commence-t-il par un son voyelle qui appelle l'élision ? */
function appelleElision(mot: string): boolean {
  const m = mot.toLowerCase();
  if (SANS_ELISION.has(m)) return false;
  if (m === "y") return true;                 // j'y vais, n'y pense pas
  if (m.startsWith("h")) return H_MUETS.has(m);
  if (m.startsWith("y")) return false;        // le yaourt, le yoga
  return VOYELLES.test(m);
}

/** Les mots qui s'élident devant n'importe quel mot à voyelle. */
const ELIDABLES: ReadonlySet<string> = new Set(["je", "me", "te", "se", "le", "la", "de", "ne", "que"]);

/** Les élisions qui ne se font que devant certains mots. */
const ELISIONS_RESTREINTES: Readonly<Record<string, ReadonlySet<string>>> = {
  si: new Set(["il", "ils"]),
  ce: new Set(["est", "était", "étaient", "étais", "en"]),
  lorsque: new Set(["il", "ils", "elle", "elles", "on", "un", "une"]),
  puisque: new Set(["il", "ils", "elle", "elles", "on", "un", "une"]),
  jusque: new Set(["à", "au", "aux", "en", "ici", "où", "alors"]),
};

/** « que » → « qu' », « le » → « l' »… en gardant la majuscule. */
function elider(mot: string): string {
  const court = mot.slice(0, -1);
  return court + "'";
}

/** Les lettres qui, seules, sont forcément une élision sans apostrophe. */
const LETTRES_ELIDEES: ReadonlySet<string> = new Set(["l", "d", "j", "m", "t", "s", "n", "c", "qu"]);

const INDICE_ELISION = (mot: string) =>
  `Devant un mot qui commence par une voyelle, « ${mot.toLowerCase()} » perd sa dernière lettre, ` +
  "remplacée par une apostrophe.";

/**
 * Les élisions manquantes : « que on », « le arbre », « je ai », et
 * l'apostrophe oubliée : « l école », « s appel ».
 *
 * Deux mots ne sont examinés que s'ils sont séparés par des espaces seules :
 * « jusqu'à » est déjà élidé, « prends-le avec » a un trait d'union.
 */
export function elisionsManquantes(texte: string): FauteTypo[] {
  const t = jetons(texte);
  const fautes: FauteTypo[] = [];
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i], b = t[i + 1];
    if (!/^\s+$/.test(texte.slice(a.fin, b.debut))) continue;
    // Impératif (« prends-le ») ou inversion (« ai-je ») : le mot est accroché
    // à celui d'avant par un trait d'union, il ne s'élide pas.
    const avant = texte[a.debut - 1];
    if (avant === "-" || avant === "'" || avant === "’") continue;

    const bas = a.mot.toLowerCase();
    const suivant = b.mot;
    const mot = texte.slice(a.debut, b.fin);

    // L'apostrophe oubliée : une lettre seule qui n'est pas un mot.
    if (LETTRES_ELIDEES.has(bas)) {
      fautes.push({
        mot, position: a.debut, attendu: `${a.mot}'${suivant}`, nature: "elision",
        indice: `« ${bas} » ne s'écrit jamais tout seul : il se colle au mot suivant avec une apostrophe.`,
      });
      continue;
    }

    const elide = ELIDABLES.has(bas)
      ? appelleElision(suivant)
      : !!ELISIONS_RESTREINTES[bas]?.has(suivant.toLowerCase());
    if (!elide) continue;
    fautes.push({
      mot, position: a.debut, attendu: `${elider(a.mot)}${suivant}`, nature: "elision",
      indice: INDICE_ELISION(a.mot),
    });
  }
  return fautes;
}

/** Des abréviations après lesquelles le point ne clôt pas la phrase. */
const ABREVIATIONS: ReadonlySet<string> = new Set(["etc", "ex", "cf", "p", "m", "mme", "mlle", "dr", "st"]);

/**
 * Les majuscules manquantes en début de phrase : le premier mot du texte, et
 * chaque mot qui suit « . », « ! » ou « ? ».
 *
 * On se tait après des points de suspension (« Il hésita… puis partit »), après
 * un « ? » ou un « ! » suivi d'un guillemet fermant (« « Quoi ? » dit-il »),
 * et après une abréviation (« etc. »). Un retour à la ligne sans point ne dit
 * rien : un poème, une liste.
 */
export function majusculesManquantes(texte: string): FauteTypo[] {
  const t = jetons(texte);
  const fautes: FauteTypo[] = [];
  t.forEach((j, i) => {
    if (!/^\p{Ll}/u.test(j.mot)) return;
    if (i === 0) {
      if (!/^[\s"«“]*$/.test(texte.slice(0, j.debut))) return;
    } else {
      const precedent = t[i - 1];
      const entre = texte.slice(precedent.fin, j.debut);
      if (!/[.!?]/.test(entre)) return;
      if (/\.\.|…/.test(entre)) return;
      if (/[?!]\s*[»"”]/.test(entre)) return;
      // La ponctuation forte doit être le dernier signe avant le mot (espaces
      // et guillemets ouvrants mis à part) : après « . - », « . ( »… on se tait.
      if (!/[.!?]$/.test(entre.replace(/[\s"«“]/g, ""))) return;
      if (entre.trim().startsWith(".") && ABREVIATIONS.has(precedent.mot.toLowerCase())) return;
    }
    fautes.push({
      mot: j.mot, position: j.debut, nature: "majuscule",
      attendu: j.mot.charAt(0).toUpperCase() + j.mot.slice(1),
      indice: "Une phrase commence toujours par une majuscule.",
    });
  });
  return fautes;
}

/**
 * Toutes les fautes de majuscule et d'élision du texte, sans chevauchement.
 * Quand une élision commence une phrase — « que il » en tête — elle porte la
 * majuscule dans son attendu (« Qu'il »), et la faute de majuscule seule
 * disparaît : un seul signalement pour un seul endroit.
 */
export function fautesTypographiques(texte: string): FauteTypo[] {
  const elisions = elisionsManquantes(texte);
  const majuscules = majusculesManquantes(texte);
  const enTete = new Set(majuscules.map((m) => m.position));
  const fusion: FauteTypo[] = elisions.map((e) =>
    enTete.has(e.position)
      ? {
          ...e,
          attendu: e.attendu.charAt(0).toUpperCase() + e.attendu.slice(1),
          indice: `${e.indice} Et une phrase commence par une majuscule.`,
        }
      : e);
  const prises = new Set(elisions.map((e) => e.position));
  for (const m of majuscules) if (!prises.has(m.position)) fusion.push(m);
  return fusion.sort((a, b) => a.position - b.position);
}

/** Le modèle annonce-t-il une majuscule ? (le même mot, capitalisé) */
export function estAnnonceMajuscule(ecrit: string, attendu: string): boolean {
  return !!attendu && ecrit !== attendu &&
    attendu === ecrit.charAt(0).toUpperCase() + ecrit.slice(1);
}

/** Le modèle annonce-t-il une élision ? (une apostrophe apparaît) */
export function estAnnonceElision(ecrit: string, attendu: string): boolean {
  return /['’]/.test(attendu) && !/['’]/.test(ecrit);
}
