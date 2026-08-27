# Correctif — la comparaison des réponses chiffrées

**Fichiers** : `components/ExerciceStack.tsx`, `components/CalcMentalStack.tsx`
**Portée** : tous les exercices de type `exercice` et `calcul_mental` — les
ceintures de maths d'abord, mais aussi les exercices de maths existants.
**Gravité** : deux réponses justes comptées fausses, et une réponse fausse
comptée juste.

## Les trois défauts

`ExerciceStack.tsx`, dans `valider()` :

```ts
const numAttend = parseFloat(attendue.replace(",", "."));
const numDonne  = parseFloat(donnee.replace(",", "."));
const correct = donnee === attendue
  || (!isNaN(numAttend) && !isNaN(numDonne) && Math.abs(numAttend - numDonne) < 0.01);
```

**1. L'espace des milliers casse tout.** `parseFloat("3 000")` s'arrête au
premier caractère non numérique et vaut **3**. Donc, pour une réponse attendue
« 3 000 » : l'élève qui écrit `3000` est compté **faux**, et celui qui écrit
`3` est compté **juste**. Même chose avec l'espace fine insécable (U+202F) que
produisent les traitements de texte et certains claviers.

**2. Une fraction est réduite à son numérateur.** `parseFloat("1/2")` vaut
**1**. Pour une réponse attendue « 1/2 », l'élève qui écrit `1` est compté
juste. Un item de fractions est donc aujourd'hui inévaluable en saisie.

**3. La tolérance de 0,01 est trop large pour les décimaux du CM2.** Elle est
écrite `< 0.01`, et en virgule flottante `3,46 − 3,45` vaut 0,009999999999…
Résultat : **3,46 est accepté pour 3,45**. Tout l'intérêt de la ceinture violette
— comparer, intercaler, décomposer au centième — s'effondre. Même chose pour
2,499 accepté à la place de 2,5.

**4. `.replace(",", ".")` ne remplace que la première virgule.** Sans
conséquence sur un nombre isolé, mais fragile si la réponse en contient deux.

`CalcMentalStack.tsx` compare deux chaînes sans aucune conversion : `3.5`
n'y vaut pas `3,5`, et l'espace des milliers y est fatal de la même façon.

## Le correctif

Une seule fonction, partagée par les deux composants — la mettre dans
`lib/comparer-reponse.ts` et l'importer des deux côtés :

```ts
/**
 * Espaces de toutes sortes : ordinaire, insécable (U+00A0), fine insécable
 * (U+202F), et les autres qu'un traitement de texte peut glisser dans « 3 000 ».
 */
const ESP = "[\\s\\u00A0\\u202F\\u2007\\u2009\\u200B\\u3000]";

function normaliser(s: string): string {
  return s
    .trim()
    .toLowerCase()
    // « 3 000 » → « 3000 » : l'espace n'est retiré qu'ENTRE DEUX CHIFFRES.
    // Le retirer partout rendrait « lesenfants » acceptable pour « les enfants ».
    .replace(new RegExp(`(\\d)${ESP}+(?=\\d)`, "g"), "$1")
    // « 1 / 2 » → « 1/2 »
    .replace(new RegExp(`(\\d)${ESP}*/${ESP}*(\\d)`, "g"), "$1/$2")
    // le reste des espaces est simplement normalisé
    .replace(new RegExp(`${ESP}+`, "g"), " ")
    .replace(/,/g, "."); // toutes les virgules, pas seulement la première
}

const FRACTION = /^-?\d+\/\d+$/;

export function comparerReponse(attendue: string, donnee: string): boolean {
  const a = normaliser(attendue);
  const d = normaliser(donnee);
  if (a === d) return true;

  // Une fraction attendue n'accepte qu'une fraction : sans cela, « 1 » passe
  // pour « 1/2 » (parseFloat) et l'élève valide sans avoir écrit la fraction.
  if (FRACTION.test(a)) {
    if (!FRACTION.test(d)) return false;
    const [an, ad] = a.split("/").map(Number);
    const [dn, dd] = d.split("/").map(Number);
    return an === dn && ad === dd;      // strict : 2/4 ne vaut pas 1/2
  }
  if (FRACTION.test(d)) return false;

  const na = parseFloat(a), nd = parseFloat(d);
  return !isNaN(na) && !isNaN(nd) && Math.abs(na - nd) < 1e-9;
}
```

Puis, dans `ExerciceStack.tsx` :

```ts
const correct = comparerReponse(q.reponse_attendue, reponse);
```

et dans `CalcMentalStack.tsx` :

```ts
const correct = comparerReponse(calculsSession[index].reponse, reponse);
```

## Trois décisions à connaître

**L'espace n'est retiré qu'entre deux chiffres.** Une première version le
retirait partout : « lesenfants » devenait alors acceptable pour « les enfants »,
ce qui relâche les 51 réponses en plusieurs mots des banques de français. La
règle exacte est dans `normaliser()` ci-dessus.

**La tolérance passe de 0,01 à 1e-9**, c'est-à-dire à l'égalité stricte aux
erreurs d'arrondi près. `10` et `10,000` restent égaux, `3,45` et `3,46` ne le
sont plus. **Point de vigilance** : ce resserrement peut faire échouer des
exercices de maths déjà en base dont la réponse attendue était arrondie et qui
comptaient sur le jeu de 0,01. Avant de déployer, passer les banques de maths
existantes en revue et, là où une tolérance est légitime (division non exacte,
π), la porter dans l'énoncé — « arrondis au dixième » — plutôt que dans le
comparateur.

**Une fraction attendue n'accepte pas sa valeur décimale.** `0,5` est refusé
pour `1/2`. C'est voulu : quand on demande une fraction, on veut la fraction.
Si un item veut accepter les deux, il attend le décimal et propose la fraction
en QCM.

**La comparaison des fractions est stricte.** `2/4` ne vaut pas `1/2`, sinon
l'item « simplifie 2/4 » deviendrait impossible à évaluer. Un item qui veut
accepter les fractions égales le fait en QCM.

## Vérification

`docs/ceintures/test-comparer-reponse.mjs` couvre les cas ci-dessous. Il doit
sortir « 0 échec ».

| Attendu | Saisi | Attendu du test |
|---|---|---|
| `3 000` | `3000` | juste |
| `3 000` | `3 000` | juste |
| `3 000` | `3` | **faux** (c'est le bug nº 1) |
| `1250000` | `1 250 000` | juste |
| `1/2` | `1` | **faux** (bug nº 2) |
| `1/2` | `1/2` | juste |
| `1/2` | `0,5` | faux (décision assumée) |
| `1/2` | `2/4` | faux (décision assumée) |
| `3,5` | `3.5` | juste |
| `3,5` | `3,50` | juste |
| `3,45` | `3,46` | faux (impossible avant) |
| `2,5` | `2,499` | faux (impossible avant) |
| `10` | `10,000` | juste |
| `quarante` | `Quarante` | juste |
| `les enfants` | `lesenfants` | **faux** — l'espace ne se retire qu'entre deux chiffres |
| `les enfants` | `Les  enfants` | juste |
