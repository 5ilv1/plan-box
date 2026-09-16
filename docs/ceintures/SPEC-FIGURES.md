# Figures — contrat de rendu

Après les droites graduées (`SPEC-DROITE-GRADUEE.md`), trois figures manquent :
le **cadran à aiguilles** et l'**angle** pour « Grandeurs et mesures », le
**polygone sur quadrillage** pour « Espace et géométrie ». Sans elles, trois
items de lecture de l'heure, un item d'angles et une quinzaine d'items de
géométrie ne sont pas écrivables — décrire un cadran ou une figure codée en
mots, c'est donner la réponse.

## Où la figure se déclare

Même principe que la droite : une **clé optionnelle `figure`** sur une question
de `exercice`, de `qcm` ou de `calcul_mental`, ou sur un problème de
`probleme_maths`. Le composant la dessine sous l'énoncé quand elle est
présente. Pas de nouveau type d'exercice, donc rien à changer dans
`creerMiniExercices()` : la figure survit à l'évaluation comme le reste de la
question.

```jsonc
{
  "id": 3,
  "question": "Quelle heure indique cette horloge ?",
  "options": ["3 h 25", "5 h 15", "3 h 05", "5 h 25"],
  "reponse_correcte": 0,
  "figure": { "type": "cadran", "heures": 3, "minutes": 25 }
}
```

## `cadran`

| Champ | Obligatoire | Rôle |
|---|---|---|
| `type` | oui | `"cadran"` |
| `heures` | oui | 1 à 12 |
| `minutes` | non, défaut 0 | 0 à 59 |
| `chiffres` | non, défaut `true` | `false` retire les chiffres et ne laisse que les graduations — c'est le cas difficile des ceintures hautes |

Règles de dessin, telles qu'on les attend en classe :

- Les **60 graduations** sont présentes, les cinq-minutes plus longues et plus
  épaisses. C'est avec elles que l'élève compte : sans elles, l'item n'a plus
  d'objet.
- **La petite aiguille avance avec les minutes.** À 3 h 25, elle n'est pas sur
  le 3 : elle est aux deux cinquièmes entre 3 et 4. C'est exactement ce qui
  distingue un élève qui lit d'un élève qui devine, et c'est le défaut le plus
  courant des cadrans dessinés à la main.
- Aiguille des heures courte et épaisse, aiguille des minutes longue et fine —
  la longueur est le seul indice qui les distingue.
- Taille fixe, environ 200 px : un cadran qui s'étire sur la largeur devient
  illisible sur tablette.

## `angle`

| Champ | Obligatoire | Rôle |
|---|---|---|
| `type` | oui | `"angle"` |
| `degres` | oui | 1 à 179 |
| `nom` | non | lettre du sommet, écrite à côté |

- Le sommet est en bas à gauche, un côté horizontal : c'est la position
  canonique du cahier, et elle rend les angles comparables entre eux.
- **Un angle droit se marque par le petit carré**, jamais par un arc — c'est le
  codage que l'élève doit reconnaître.
- Les autres angles portent un arc.
- Ne **jamais écrire la mesure** sur la figure : c'est ce qu'on demande de
  reconnaitre.

## `polygone`

La forme de tout le domaine « Espace et géométrie » : un quadrillage optionnel,
un ou plusieurs polygones, des segments libres, des points nommés.

| Champ | Obligatoire | Rôle |
|---|---|---|
| `type` | oui | `"polygone"` |
| `grille` | non | `{ "colonnes": 8, "lignes": 6 }` — omettre la clé retire le quadrillage (papier uni) |
| `polygones` | non | liste de polygones (voir ci-dessous) |
| `segments` | non | `[{ "de": [x,y], "a": [x,y], "pointille": true, "nom": "d1" }]` — droites, axes de symétrie, traits de construction |
| `points` | non | `[{ "at": [x,y], "nom": "A" }]` — points isolés, repérage |

Un polygone :

| Champ | Rôle |
|---|---|
| `sommets` | `[[x,y], …]` dans l'ordre du tracé, coordonnées en **cases du quadrillage** |
| `nom` | `"ABCD"` — une lettre par sommet, écrite à l'extérieur de la figure |
| `angles_droits` | indices des sommets à marquer du petit carré — `[0, 1]` |
| `cotes_egaux` | `[[indice_du_côté, nb_de_traits], …]` — le côté `i` va du sommet `i` au suivant ; `[[0,1],[2,1],[1,2],[3,2]]` code un rectangle |
| `plein` | `false` pour ne pas remplir (figures superposées, figure complexe à décomposer) |

Règles de dessin :

- **L'origine est en bas à gauche**, l'axe des `y` monte. C'est le repère du
  cahier ; dessiner à l'envers ferait échouer tous les items de repérage.
- **Le codage se dessine dans la couleur de la ceinture**, le trait de la figure
  reste en `currentColor` : l'élève doit voir que la marque n'est pas un trait
  de la figure.
- Les traits d'égalité se posent **au milieu du côté**, perpendiculairement, et
  se multiplient (1 trait, 2 traits) pour distinguer deux paires de longueurs.
- L'angle droit est un **petit carré au sommet**, jamais un arc — c'est
  l'inverse de `angle`, où l'arc marque un angle quelconque.
- Une case fait 34 px, la figure est bornée à 420 px de large : au-delà, elle
  déborde sur téléphone.

## `fraction_aire`

Un disque ou un rectangle partagé en parts égales, certaines coloriées : l'élève
lit la fraction. Ajoutée après les trois autres, pour la séance « Représenter
des fractions par des aires » (N3 · fiche 16).

| Champ | Obligatoire | Rôle |
|---|---|---|
| `type` | oui | `"fraction_aire"` |
| `forme` | oui | `"cercle"` ou `"rectangle"` |
| `parts` | oui | le nombre de parts égales : le dénominateur du dessin |
| `coloriees` | oui | les indices des parts coloriées, ou un nombre `n` pour « les `n` premières » |
| `colonnes` | non | rectangle : les colonnes du quadrillage. Doit diviser `parts` |

```jsonc
{
  "question": "Quelle fraction de la figure est coloriée ?",
  "options": ["8/3", "3/8", "5/8", "3/5"],
  "reponse_correcte": 1,
  "figure": { "type": "fraction_aire", "forme": "cercle", "parts": 8, "coloriees": 3 }
}
```

Règles de dessin :

- **Les traits de partage vont jusqu'au bord et sont en `currentColor`.** C'est
  en les comptant que l'élève trouve le dénominateur : un dessin qui ne montre
  que la zone coloriée n'a plus d'objet.
- La première part est **en haut** pour le disque, **en haut à gauche** pour le
  rectangle, et le tracé tourne dans le sens des aiguilles.
- **Le quadrillage divise le nombre de parts.** Jusqu'à six parts, une seule
  ligne — la bande de chocolat. Au-delà, le quadrillage le plus carré possible
  parmi les diviseurs (8 → 4 × 2, 9 → 3 × 3, 12 → 4 × 3). 7 et 11 restent en
  ligne : mieux vaut une bande longue que des parts inégales.
- **Le texte de rechange reste vague**, comme pour l'angle : écrire « 3 parts
  sur 8 sont coloriées » donnerait la réponse.

Les parts coloriées peuvent être **dispersées** — c'est le vrai levier de
difficulté, bien plus que la taille du dénominateur : il faut compter au lieu de
regarder.

### Les questions ne sont pas écrites par l'IA

`lib/fractions-aires.ts` les calcule, comme `comparaison` et `rangement`. La
bonne réponse se déduit du dessin ; les trois mauvaises sont des erreurs d'élève
identifiées, dans cet ordre :

| Option, pour un disque en 8 parts dont 3 sont coloriées | Erreur |
|---|---|
| **3/8** | ✔ |
| 8/3 | numérateur et dénominateur inversés |
| 5/8 | a compté les parts blanches |
| 3/5 | rapporte les coloriées aux blanches au lieu du tout |

Puis, si l'une n'est pas disponible : une part de trop ou de moins, au
numérateur ou au dénominateur.

⚠️ **Aucune option ne doit valoir la bonne réponse.** Un disque partagé en 4
dont 2 parts sont coloriées se lit `2/4` ; proposer `1/2` à côté et le compter
faux serait injuste — l'élève aurait raison. Toute fraction égale en valeur est
écartée, pas seulement la forme simplifiée.

### Le sens inverse : une fraction, quatre dessins

L'énoncé porte la fraction, les options sont des figures — clé
`options_figures`, un dessin par option, `options` ne portant plus que des
étiquettes de position (`"Figure A"`…). Un libellé qui décrirait le dessin
donnerait la réponse sans qu'on ait à le regarder.

```jsonc
{
  "question": "Quelle figure représente la fraction 3/5 ?",
  "options": ["Figure A", "Figure B", "Figure C", "Figure D"],
  "reponse_correcte": 1,
  "options_figures": [ /* 4 fraction_aire */ ]
}
```

- **Les quatre dessins ont la même forme.** Mélanger disque et rectangle
  ajouterait une comparaison qui n'est pas celle qu'on évalue.
- Les distracteurs écrits ne se dessinent pas : `8/3` n'est pas une part de
  disque. Ceux-ci sont donc des fractions propres — le complément `(d-n)/d`
  d'abord, puis un partage visiblement différent, puis deux parts d'écart.
- ⚠️ **Deux dessins doivent se distinguer d'au moins un dixième de l'aire.**
  C'est la leçon du premier rendu : `10/12` et `11/12` côte à côte sont le même
  disque presque plein, et l'élève ne choisit plus une figure — il compte douze
  secteurs fins sans droit à l'erreur. Le seuil couvre aussi le même
  dénominateur : à 12 parts il impose deux parts d'écart, à 4 parts une seule
  suffit et elle se voit.
- Le rendu compact (`<FigureGeo figure={…} compact />`) rétrécit avec sa case :
  dans une option de QCM le dessin est un élément de flex, et une largeur en
  dur débordait à largeur de téléphone.

**Quatre rendus** dessinent les options, et une modification de l'un doit être
vérifiée sur les quatre : `QCMEleve` (bloc du plan de travail, en grille 2 × 2
quand les options sont des dessins), `MiniQCM` (évaluation), la page
d'entraînement, et **l'aperçu enseignant** de `/enseignant/generer`.

## Ce qui ne sera pas dessiné : les solides

Un cube en perspective cavalière est un mauvais dessin SVG, et surtout un mauvais
exercice : reconnaitre un solide sur une vue 2D, c'est reconnaitre un
dessin. Les items de solides (EG17, EG21, EG27) passent donc par les
**propriétés** — « quel solide a deux faces circulaires et une face courbe ? » —
ce qui est exactement la compétence visée, et se dit en mots sans rien perdre.

## Ce que ça permet

- GM10, GM14, GM18 — lire l'heure, des demi-heures jusqu'à la minute près, avec
  le cas sans chiffres en ceinture haute.
- GM21 — distinguer angle droit, aigu et obtus.
- EG10 à EG38 — vocabulaire, reconnaissance de figures, angles droits, axes de
  symétrie, repérage sur quadrillage, droites parallèles et perpendiculaires,
  figures complexes, lecture du codage.

Les items de périmètre, d'aire et de pavage n'ont pas besoin de figure : « un
rectangle de 7 cm sur 4 cm », « une figure recouverte de 12 carreaux » se disent
en mots sans rien perdre.

## Vérification

`app/enseignant/(app)/admin/figures` rend tous les cas de contrôle, y compris les
six fractions (disque 3/8, disque 2/3, disque 5/6 dispersés, rectangle 3/4,
rectangle 5/12 en 4 × 3, rectangle 4/7 en ligne). Le contrat du générateur est
vérifié par `npx tsx docs/tests/test-fractions-aires.mjs` (31 cas) — à relancer
après toute modification de `lib/fractions-aires.ts`.

Le banc d'essai implémente les trois premières (`svgCadran()`, `svgAngle()`,
`svgPolygone()`). Six cas de contrôle sont rendus dans `figures.html` : 3 h 25,
8 h 45 sans chiffres, 12 h 10, angle droit, angle aigu à 40°, angle obtus à
130°. Six autres dans `figures-geometrie.html` : carré codé sur quadrillage,
rectangle à deux paires de côtés égaux, triangle rectangle sans quadrillage,
pentagone quelconque, deux droites parallèles avec un point, axe de symétrie sur
quadrillage. Vérifier à l'œil, une fois, sur mobile et en mode sombre.
