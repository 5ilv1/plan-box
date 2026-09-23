/**
 * Mesure la correction automatique vérifiée sur des corpus connus.
 *
 *  • Homophones grammaticaux — test de substitution (a/à, et/est, son/sont…).
 *  • Homophones de sens — phrase à trou (vert/verre, mer/mère, ces/ses, se/ce),
 *    avec des phrases AMBIGUËS qui ne doivent jamais être corrigées.
 *  • Accords et temps — test des deux phrases, avec des pièges justes
 *    (« Chaque enfant a », « C'est moi qui ai », « les pommes que j'ai
 *    mangées ») et des cas où les deux formes se disent (présent de narration).
 *  • Deux corpus TÉMOINS, écrits sans servir à régler quoi que ce soit : ils
 *    disent si le réglage généralise ou s'il a seulement appris son corpus.
 *
 * Chaque phrase est analysée comme un texte à part : un élève écrit un texte
 * et y met peu de fautes de chaque sorte.
 *
 * Ce script appelle le VRAI modèle (quelques centimes). Il ne lit ni n'écrit
 * rien en base. À relancer après toute modification de `lib/homophones.ts`,
 * `lib/accords.ts`, `lib/ecriture-correction.ts` ou des appels de
 * `lib/ecriture-analyse.ts` :
 *
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/mesurer-correction.ts
 *
 * Mesuré le 23/09/2026 (fausses alertes écartées · vraies fautes trouvées) :
 *   homophones grammaticaux       14/14 · 21/22
 *   homophones de sens (réglage)  18/18 · 21/22
 *   homophones de sens (témoin)    9/9  · 13/15
 *   accords et temps              14/14 · 23/23
 *   accords et temps (témoin)     10/10 · 12/12
 * Aucune faute inventée. Les manquées sont des phrases très abîmées ou des cas
 * où le vérificateur est indulgent — il se tait.
 *
 * Le chiffre qui compte est le premier : une faute inventée apprend la faute à
 * l'élève. Une faute manquée ne lui apprend rien de faux. Le script échoue si
 * une faute est inventée.
 *
 * ⚠️ Ces corpus sont écrits à la main. Les compléter avec de vraies phrases
 * d'élèves dès que la classe aura écrit en ligne.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  verifierErreurs, questionsDeTest, questionsDeLecture, questionsDAccord, appliquerVerdicts,
  occurrences,
} from "../lib/ecriture-correction";
import { poserTests, poserLectures, poserAccords } from "../lib/ecriture-analyse";

// [phrase, mot écrit, mot supposé attendu, le mot écrit est-il JUSTE ?]
// Le 5e élément, facultatif : quelle occurrence du mot (0 = la première).
const CAS: Array<[string, string, string, boolean, number?]> = [
  // Textes d'élèves réalistes : pas de majuscule, pas de point, d'autres fautes.
  ["les enfant on manger des bonbon a la recré", "on", "ont", false],
  ["les enfant on manger des bonbon a la recré", "a", "à", false],
  ["il et partit a lecole ce matin et il et content", "et", "est", false, 0],
  ["il et partit a lecole ce matin et il et content", "et", "est", true, 1],
  ["il et partit a lecole ce matin et il et content", "et", "est", false, 2],
  ["hier on a jouer au foot et ont a gagner", "a", "à", true, 0],
  ["hier on a jouer au foot et ont a gagner", "ont", "on", false],
  ["mes copin son venu chez moi mes ma mere a dit non", "son", "sont", false],
  ["mes copin son venu chez moi mes ma mere a dit non", "mes", "mais", true, 0],
  ["mes copin son venu chez moi mes ma mere a dit non", "mes", "mais", false, 1],
  ["je sais pas ou est mon cartable sa me fait peur", "ou", "où", false],
  ["je sais pas ou est mon cartable sa me fait peur", "sa", "ça", false],
  ["Il à faim ce matin.", "à", "a", false],
  ["Nous allons à la piscine.", "à", "a", true],
  ["Mon frère a un vélo rouge.", "a", "à", true],
  ["Il et très content de venir.", "et", "est", false],
  ["Je mange du pain et du beurre.", "et", "est", true],
  ["Je veux du pain est du beurre.", "est", "et", false],
  ["Ils son partis en vacances.", "son", "sont", false],
  ["Il promène son chien au parc.", "son", "sont", true],
  ["Paul a perdu sont cartable.", "sont", "son", false],
  ["Ont va au cinéma ce soir.", "Ont", "On", false],
  ["Mes parents ont une voiture bleue.", "ont", "on", true],
  ["Les enfants on fini leurs devoirs.", "on", "ont", false],
  ["Je ne sais pas ou il habite.", "ou", "où", false],
  ["Tu veux du jus où de l'eau ?", "où", "ou", false],
  ["Tu préfères le chocolat ou la vanille ?", "ou", "où", true],
  ["La ville où je suis né est grande.", "où", "ou", true],
  ["Sa ne marche pas du tout.", "Sa", "Ça", false],
  ["Elle range ça trousse dans son sac.", "ça", "sa", false],
  ["Il a oublié sa veste à l'école.", "sa", "ça", true],
  ["Ça me fait plaisir de te voir.", "Ça", "Sa", true],
  ["J'ai faim mes je n'ai rien à manger.", "mes", "mais", false],
  ["Mais crayons sont tous cassés.", "Mais", "Mes", false],
  ["Je range mes affaires dans mon casier.", "mes", "mais", true],
  ["Il pleut, mais nous sortons quand même.", "mais", "mes", true],
];

// Étape 3 — homophones de sens, et ces/ses, se/ce. Des cas UNIVOQUES :
// « il a coupé du pin » peut désigner l'arbre, il n'a rien à faire ici.
const CAS_SENS: Array<[string, string, string, boolean, number?]> = [
  ["Je bois dans un vert d'eau.", "vert", "verre", false],
  ["Le vert de terre sort après la pluie.", "vert", "ver", false],
  ["Ma mer prépare le dîner.", "mer", "mère", false],
  ["Le mère de la ville a fait un discours.", "mère", "maire", false],
  ["Il s'est coupé et le sans a coulé.", "sans", "sang", false],
  ["Il a acheté du pin à la boulangerie.", "pin", "pain", false],
  ["Il a donné un coût de pied dans le ballon.", "coût", "coup", false],
  ["J'ai très fin, je veux manger.", "fin", "faim", false],
  ["Mon frère a vain ans.", "vain", "vingt", false],
  ["Le roi porte une chêne en or autour du cou.", "chêne", "chaîne", false],
  ["Ma tente habite à Lyon.", "tente", "tante", false],
  ["La reine tire le traîneau du père Noël.", "reine", "renne", false],
  ["Il a une tache à faire pour demain.", "tache", "tâche", false],
  ["Le vend souffle fort.", "vend", "vent", false],
  ["Il range ces affaires dans son sac.", "ces", "ses", false],
  ["Regarde ses nuages, ils sont gris.", "ses", "ces", false],
  ["Ils ce sont lavé les mains.", "ce", "se", false],
  ["Se chien est très gentil.", "Se", "Ce", false],
  ["Le vert est ma couleur préférée.", "vert", "verre", true],
  ["Je bois un verre de lait.", "verre", "vert", true],
  ["La mer est calme ce matin.", "mer", "mère", true],
  ["Il a perdu beaucoup de sang.", "sang", "sans", true],
  ["Il est parti sans son manteau.", "sans", "sang", true],
  ["Le pin est un arbre qui reste vert.", "pin", "pain", true],
  ["Il a reçu un coup sur la tête.", "coup", "cou", true],
  ["J'ai lu le livre jusqu'à la fin.", "fin", "faim", true],
  ["Ma tante habite à Lyon.", "tante", "tente", true],
  ["Il range ses affaires dans son sac.", "ses", "ces", true],
  ["Ce chien est très gentil.", "Ce", "Se", true],
  ["Ils se sont lavé les mains.", "se", "ce", true],
  ["Le vent souffle fort.", "vent", "vend", true],
  // AMBIGUS : les deux sens se disent. L'élève a peut-être raison — on ne
  // peut pas le savoir, donc on ne doit JAMAIS le corriger.
  ["Il a coupé du pin.", "pin", "pain", true],
  ["Il regarde la mer avec son chien.", "mer", "mère", true],
  ["Il a mal au cou.", "cou", "coup", true],
  // Textes d'élèves réalistes.
  ["ma mer ma dit de rangé ma chambre", "mer", "mère", false],
  ["on a vu la mer et on sai baigner", "mer", "mère", true],
  ["jai eu tres fin a la recré", "fin", "faim", false],
  ["il a pri un verre deau car il avait soif", "verre", "vert", true],
  ["mon pere a acheté du pin a la boulangerie", "pin", "pain", false],
  ["il ce lave les dent le soir", "ce", "se", false],
];

// TÉMOIN — écrit APRÈS le réglage de la consigne de lecture, et jamais utilisé
// pour la régler. C'est lui qui dit si le réglage généralise, ou s'il a
// seulement appris le corpus de réglage.
const CAS_TEMOIN: Array<[string, string, string, boolean, number?]> = [
  ["Il a rempli le sot d'eau.", "sot", "seau", false],
  ["Le champion a fait un seau de trois mètres.", "seau", "saut", false],
  ["Il monte sur la balance pour connaître son pois.", "pois", "poids", false],
  ["Mamie raconte un compte de fées.", "compte", "conte", false],
  ["Le fermier laboure son chant.", "chant", "champ", false],
  ["Le bateau entre dans le porc.", "porc", "port", false],
  ["La cane de grand-père l'aide à marcher.", "cane", "canne", false],
  ["Le bal est rond et rebondit.", "bal", "balle", false],
  ["Nous dansons au balle du village.", "balle", "bal", false],
  ["Mon verre est plaine.", "plaine", "pleine", false],
  ["Il met ses mains dent ses poches.", "dent", "dans", false],
  ["Ce monstre est très lait.", "lait", "laid", false],
  ["Il a mangé du foi de volaille.", "foi", "foie", false],
  ["Il était une foie un roi.", "foie", "fois", false],
  ["Il fait beau, le temps est chaud.", "temps", "tant", true],
  ["J'ai tant de devoirs ce soir.", "tant", "temps", true],
  ["La plaine est couverte de fleurs.", "plaine", "pleine", true],
  ["J'ai une dent qui bouge.", "dent", "dans", true],
  ["Le lait est chaud.", "lait", "laid", true],
  ["Nous jouons à la balle dans la cour.", "balle", "bal", true],
  ["Il a vu un ver.", "ver", "verre", true],
  ["Elle a acheté une tente.", "tente", "tante", true],
  ["Il regarde le port.", "port", "porc", true],
  ["mamie ma lu un compte avant de dormir", "compte", "conte", false],
];

// Accords et temps. Le texte peut compter deux phrases : la première sert de
// contexte au temps de la seconde.
const CAS_ACCORDS: Array<[string, string, string, boolean, number?]> = [
  // Accord sujet-verbe
  ["Les enfants jouait dans la cour.", "jouait", "jouaient", false],
  ["Ils mange à la cantine.", "mange", "mangent", false],
  ["Tu sera content de venir.", "sera", "seras", false],
  ["Nous va au cinéma ce soir.", "va", "allons", false],
  ["Les chiens aboie très fort.", "aboie", "aboient", false],
  ["Ils est partis tôt ce matin.", "est", "sont", false],
  ["Mes amis a gagné le match.", "a", "ont", false],
  ["Je finis mes devoirs et je vas jouer.", "vas", "vais", false],
  ["Les oiseaux chante le matin.", "chante", "chantent", false],
  // Accord dans le groupe nominal
  ["J'ai vu des petit chats.", "petit", "petits", false],
  ["Les fleurs sont belle.", "belle", "belles", false],
  ["Il a deux grand frères.", "grand", "grands", false],
  ["Ma sœur est content.", "content", "contente", false],
  ["Il y a trois cheval dans le pré.", "cheval", "chevaux", false],
  // -er / -é
  ["Il a manger une pomme.", "manger", "mangé", false],
  ["Je vais mangé une pomme.", "mangé", "manger", false],
  // Temps, avec le contexte
  ["Hier, nous sommes allés à la plage. Je nage dans la mer.", "nage", "nageais", false],
  ["Demain, je partais en vacances.", "partais", "partirai", false],
  ["L'année dernière, il habite à Paris.", "habite", "habitait", false],
  ["Quand j'étais petit, je joue avec mon chien.", "joue", "jouais", false],
  // Justes — dont des pièges classiques
  ["Les enfants jouaient dans la cour.", "jouaient", "jouait", true],
  ["Il mange à la cantine.", "mange", "mangent", true],
  ["Nous allons au cinéma ce soir.", "allons", "va", true],
  ["Ils sont partis tôt ce matin.", "sont", "est", true],
  ["La fleur est belle.", "belle", "belles", true],
  ["Il a mangé une pomme.", "mangé", "manger", true],
  ["Je vais manger une pomme.", "manger", "mangé", true],
  ["Aujourd'hui, je joue avec mon chien.", "joue", "jouais", true],
  ["Le chat et le chien dorment ensemble.", "dorment", "dort", true],
  ["Chaque enfant a un cahier.", "a", "ont", true],
  ["La plupart des élèves sont venus.", "sont", "est", true],
  ["C'est moi qui ai gagné la course.", "ai", "a", true],
  // Ambigus : les deux formes se disent — on ne doit PAS corriger
  ["Le groupe d'enfants joue dans le parc.", "joue", "jouent", true],
  ["Hier, je vais au marché et je rencontre Paul.", "vais", "allais", true],
  // Textes d'élèves réalistes
  ["les enfant mange a la cantine", "mange", "mangent", false],
  ["hier je joue au foot avec mes copain", "joue", "jouais", false],
  ["il ont mangé des bonbon", "ont", "a", false],
];

// TÉMOIN des accords — écrit avant de relancer la mesure, jamais utilisé pour
// régler quoi que ce soit.
const CAS_ACCORDS_TEMOIN: Array<[string, string, string, boolean, number?]> = [
  ["Les élèves écoute la maîtresse.", "écoute", "écoutent", false],
  ["Vous chantez et nous danse.", "danse", "dansons", false],
  ["Tu as fini ? Oui, j'ai finit.", "finit", "fini", false],
  ["Elles sont parti hier.", "parti", "parties", false],
  ["Le chat noir et blanc dorment.", "dorment", "dort", false],
  ["J'ai acheté des pommes vertes et des poire.", "poire", "poires", false],
  ["La semaine prochaine, nous visitions le musée.", "visitions", "visiterons", false],
  ["Autrefois, les gens marcheront beaucoup.", "marcheront", "marchaient", false],
  ["Ils peut venir demain.", "peut", "peuvent", false],
  ["Ma grand-mère et mon grand-père vient dimanche.", "vient", "viennent", false],
  ["mes copine sont gentille", "gentille", "gentilles", false],
  ["hier on a vu un film et on mange du pop-corn", "mange", "mangeait", false],
  ["Les élèves écoutent la maîtresse.", "écoutent", "écoute", true],
  ["Elle est partie hier.", "partie", "parti", true],
  ["Le chat noir dort.", "dort", "dorment", true],
  ["Toi et moi, nous dansons.", "dansons", "danse", true],
  ["Personne ne vient.", "vient", "viennent", true],
  ["L'équipe a gagné.", "a", "ont", true],
  ["Il faut que tu viennes.", "viennes", "viens", true],
  ["Les pommes que j'ai mangées étaient bonnes.", "mangées", "mangé", true],
  ["Une foule de gens attendait.", "attendait", "attendaient", true],
  ["Tout à coup, le loup sort du bois.", "sort", "sortit", true],
];

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// Une phrase = un texte, comme en vrai : un élève, un texte, peu d'homophones.
let TYPE_EN_COURS: "homophone" | "grammaire" = "homophone";

async function juger([phrase, mot, attendu, , occ]: [string, string, string, boolean, number?]) {
  const position = occurrences(phrase, mot)[occ ?? 0];
  const verifiees = verifierErreurs(phrase, [{ mot, attendu, position, type: TYPE_EN_COURS }], () => true);
  const tests = questionsDeTest(phrase, verifiees);
  const lectures = questionsDeLecture(phrase, verifiees);
  const accords = questionsDAccord(phrase, verifiees);
  const [choix, lus, acc] = await Promise.all([
    tests.length ? poserTests(anthropic, tests) : Promise.resolve([]),
    lectures.length ? poserLectures(anthropic, lectures) : Promise.resolve([]),
    accords.length ? poserAccords(anthropic, accords) : Promise.resolve([]),
  ]);
  const gardee = appliquerVerdicts(verifiees, tests, choix, lectures, lus, accords, acc)[0];
  const q = accords[0];
  const lu = acc[0]?.map((l) => (q && l === q.ecritEn ? "élève" : "corrigée")).join("+");
  return {
    montree: !!gardee,
    attenduTest: gardee?.attendu ?? null,
    choix: choix[0] ?? lus[0] ?? (acc.length ? (lu || "aucune") : null) ?? null,
  };
}

async function mesurer(nom: string, cas: typeof CAS) {
  const resultats: Awaited<ReturnType<typeof juger>>[] = [];
  for (let i = 0; i < cas.length; i += 6) {
    resultats.push(...(await Promise.all(cas.slice(i, i + 6).map(juger))));
  }
  let vraiesTrouvees = 0, vraies = 0, faussesEcartees = 0, fausses = 0;
  const inventees: string[] = [], ratees: string[] = [];
  cas.forEach(([phrase, mot, attendu, juste, occ], i) => {
    const r = resultats[i];
    const libelle = occ === undefined ? phrase : `${phrase} (« ${mot} » nº ${occ + 1})`;
    if (juste) { fausses++; if (!r.montree) faussesEcartees++; else inventees.push(libelle); }
    else {
      vraies++;
      if (r.montree && r.attenduTest?.toLowerCase() === attendu.toLowerCase()) vraiesTrouvees++;
      else ratees.push(`${libelle} [${r.choix}]`);
    }
  });
  console.log(`${nom}\n  fausses alertes écartées : ${faussesEcartees}/${fausses}   vraies fautes trouvées : ${vraiesTrouvees}/${vraies}`);
  if (inventees.length) console.log("  ⚠️ faute INVENTÉE sur :", inventees.join(" | "));
  if (ratees.length) console.log("  manquée :", ratees.join(" | "));
  return inventees.length;
}

(async () => {
  const inventees =
    (await mesurer("Étape 2 — test de substitution (a/à, et/est…)", CAS)) +
    (await mesurer("Étape 3 — phrase à trou (vert/verre, ces/ses…)", CAS_SENS)) +
    (await mesurer("Étape 3 — TÉMOIN, jamais vu pendant le réglage", CAS_TEMOIN)) +
    (await (async () => { TYPE_EN_COURS = "grammaire"; return mesurer("Accords et temps — test des deux phrases", CAS_ACCORDS); })()) +
    (await mesurer("Accords et temps — TÉMOIN", CAS_ACCORDS_TEMOIN));
  // Une faute inventée est un échec ; une faute manquée, non.
  process.exit(inventees > 0 ? 1 : 0);
})();
