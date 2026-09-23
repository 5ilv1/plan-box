/**
 * Mesure la vérification des homophones grammaticaux sur un corpus connu.
 *
 * Pour chacune des sept paires testées, une faute dans chaque sens et un emploi
 * juste — plus des phrases d'élèves réalistes : pas de majuscule, pas de point,
 * d'autres fautes dans la même phrase. Chaque phrase est analysée comme un texte
 * à part, parce qu'un élève écrit un texte et y met peu d'homophones.
 *
 * Ce script appelle le VRAI modèle (quelques centimes). Il ne lit ni n'écrit
 * rien en base. À relancer après toute modification de `lib/homophones.ts`, de
 * la partie homophones de `lib/ecriture-correction.ts`, ou de `poserTests()` :
 *
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/mesurer-homophones.ts
 *
 * Mesuré le 23/09/2026, trois passages : 14/14 fausses alertes écartées (aucune
 * faute inventée), 21/22 vraies fautes trouvées. La manquée est une phrase très
 * abîmée, où le vérificateur hésite — et se tait.
 *
 * Le chiffre qui compte est le premier : une faute inventée apprend la faute à
 * l'élève. Une faute manquée ne lui apprend rien de faux.
 */
import Anthropic from "@anthropic-ai/sdk";
import { verifierErreurs, questionsDeTest, appliquerTests, occurrences } from "../lib/ecriture-correction";
import { poserTests } from "../lib/ecriture-analyse";

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

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

// Une phrase = un texte, comme en vrai : un élève, un texte, peu d'homophones.
async function juger([phrase, mot, attendu, , occ]: [string, string, string, boolean, number?]) {
  const position = occurrences(phrase, mot)[occ ?? 0];
  const verifiees = verifierErreurs(phrase, [{ mot, attendu, position, type: "homophone" }], () => true);
  const questions = questionsDeTest(phrase, verifiees);
  const choix = questions.length ? await poserTests(anthropic, questions) : [];
  const gardee = appliquerTests(verifiees, questions, choix)[0];
  return { montree: !!gardee, attenduTest: gardee?.attendu ?? null, choix: choix[0] ?? null };
}

(async () => {
  const resultats: Awaited<ReturnType<typeof juger>>[] = [];
  for (let i = 0; i < CAS.length; i += 6) {
    resultats.push(...(await Promise.all(CAS.slice(i, i + 6).map(juger))));
  }
  let vraiesTrouvees = 0, vraies = 0, faussesEcartees = 0, fausses = 0;
  const inventees: string[] = [], ratees: string[] = [];
  CAS.forEach(([phrase, mot, attendu, juste, occ], i) => {
    phrase = occ === undefined ? phrase : `${phrase} (« ${mot} » nº ${occ + 1})`;
    const r = resultats[i];
    if (juste) { fausses++; if (!r.montree) faussesEcartees++; else inventees.push(phrase); }
    else {
      vraies++;
      if (r.montree && r.attenduTest?.toLowerCase() === attendu.toLowerCase()) vraiesTrouvees++;
      else ratees.push(`${phrase} [verdict ${r.choix}]`);
    }
  });
  console.log(`fausses alertes écartées : ${faussesEcartees}/${fausses}   vraies fautes trouvées : ${vraiesTrouvees}/${vraies}`);
  if (inventees.length) console.log("  ⚠️ faute INVENTÉE sur :", inventees.join(" | "));
  if (ratees.length) console.log("  manquée :", ratees.join(" | "));
  // Une faute inventée est un échec ; une faute manquée, non.
  process.exit(inventees.length > 0 ? 1 : 0);
})();
