# Droites graduées — contrat de rendu

Aujourd'hui le moteur n'affiche que du texte, et les items de droite graduée
(N38, N39, N31, et plus tard des items de Grandeurs et mesures) décrivent la
droite en mots : « une droite de 0 à 100, un repère tous les 10 ». C'est
lisible, mais ce n'est pas ce qu'on fait en classe, et l'élève doit imaginer ce
qu'il devrait voir.

Il faut donc **dessiner la droite**. Modèle de référence, que Sylvain utilise :
`micetf.fr/Fractions/generateur/#ligne` — quatre réglages, origine, pas, nombre
d'intervalles, nombre de divisions par intervalle.

## Où la droite se déclare

Pas de nouveau type d'exercice : une **clé optionnelle `droite`** sur une
question de `exercice` ou de `qcm`, ou sur le contenu d'un `texte_a_trous`. Le
composant la dessine au-dessus de l'énoncé quand elle est présente, et l'ignore
sinon. C'est important pour deux raisons : les types existants continuent de
fonctionner, et `creerMiniExercices()` recopie déjà les questions telles quelles
— la droite survit donc à l'évaluation de ceinture sans une ligne de code de
plus.

```jsonc
{
  "id": 3,
  "enonce": "Quel nombre est repéré par la flèche A ?",
  "reponse_attendue": "70",
  "indice": "Compte les repères depuis 0, de 10 en 10.",
  "droite": {
    "origine": 0,          // valeur du premier repère, à gauche
    "pas": 10,             // valeur d'un intervalle
    "intervalles": 10,     // nombre d'intervalles → la droite va de 0 à 100
    "divisions": 1,        // sous-graduations dans chaque intervalle (1 = aucune)
    "etiquettes": "bornes", // "toutes" | "bornes" | "aucune" | [0, 50, 100]
    "points": [ { "valeur": 70, "nom": "A" } ]
  }
}
```

### Les champs, un par un

| Champ | Obligatoire | Rôle |
|---|---|---|
| `origine` | oui | valeur du repère le plus à gauche |
| `pas` | oui | valeur d'un intervalle ; accepte un décimal (`0.1`) |
| `intervalles` | oui | nombre d'intervalles, de 2 à 20 |
| `divisions` | non, défaut 1 | sous-graduations par intervalle, jusqu'à 10. Les traits de subdivision sont plus courts |
| `etiquettes` | non, défaut `"toutes"` | quelles valeurs sont écrites sous la droite. `"bornes"` n'écrit que la première et la dernière — c'est ce qu'il faut quand l'élève doit compter |
| `fraction` | non | `{ "denominateur": 4 }` : les étiquettes sont écrites en fractions (`0`, `1/4`, `2/4`, `3/4`, `1`) au lieu de décimaux |
| `points` | non | flèches nommées sous la droite : `{ valeur, nom }`. Le nom peut être `"?"` pour le point cherché |
| `zones` | non | `[{ "de": 20, "a": 40 }]` : intervalle surligné, pour les items d'encadrement |

### Règles de dessin

- **SVG inline**, pas de canvas : il faut que ce soit net sur l'écran de la
  tablette et que ça s'imprime.
- `viewBox` fixe et largeur à 100 % : la droite s'adapte à la largeur
  disponible, sans jamais déborder.
- Couleurs par `currentColor` et par les variables de thème existantes, pour que
  le mode sombre suive.
- Les traits d'intervalle sont hauts, les subdivisions moitié moins.
- Les étiquettes sont centrées sous leur repère ; si elles se chevauchent au-delà
  de 12 étiquettes, n'écrire que celles demandées par `etiquettes`.
- **Quelles graduations sont étiquetées.** Par défaut, seules les graduations
  principales le sont. Deux exceptions, sans lesquelles le rendu est faux :
  1. **en mode `fraction`, les sous-graduations sont étiquetées aussi** — sinon
     une droite en quarts n'affiche que 0, 1 et 2, et l'item perd tout son sens ;
  2. **une valeur explicitement listée dans `etiquettes` est écrite même si elle
     tombe sur une sous-graduation** — c'est à cela que sert la liste.
- **Les fractions ne se simplifient pas** : sur une droite en quarts, on écrit
  `0, 1/4, 2/4, 3/4, 1`, et non `1/2` au deuxième repère. C'est la lecture des
  parts qu'on travaille, pas la simplification.
- Les flèches de `points` se dessinent **sous** la droite, pointe vers le haut,
  le nom au-dessus de la pointe.
- Une droite se termine par une pointe de flèche à droite, comme au tableau.

### Ce que ça permet d'écrire, et qu'on ne peut pas écrire aujourd'hui

- N38 « repérer un nombre sur une droite de 0 à 100 » : la flèche est dessinée,
  l'élève lit. Aujourd'hui il faut décrire la position en mots, ce qui revient à
  donner la réponse.
- N39 et N31 : fractions et décimaux placés sur une droite, avec
  `fraction.denominateur` pour l'étiquetage.
- Les items d'encadrement (N17, N37, N40) : `zones` montre l'intervalle
  cherché.

## Vérification

Un test de rendu suffit : générer les cas ci-dessous et vérifier à l'œil, une
fois, qu'ils sont justes et lisibles sur mobile.

| Cas | Réglages |
|---|---|
| entiers, repères tous les 10 | `origine 0, pas 10, intervalles 10, etiquettes "bornes"` |
| dizaines avec subdivisions | `origine 0, pas 10, intervalles 5, divisions 10` |
| fractions quarts | `origine 0, pas 1, intervalles 2, divisions 4, fraction {denominateur: 4}` |
| décimaux au dixième | `origine 3, pas 0.1, intervalles 10, etiquettes "bornes"` |
| encadrement | `origine 0, pas 100, intervalles 10, zones [{de: 300, a: 400}]` |

Le banc d'essai des ceintures implémente déjà ce rendu (`svgDroite()` dans
`banc-ceintures.html`) : il donne le résultat visuel attendu et peut servir de
point de départ.
