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

Le banc d'essai implémente les trois (`svgCadran()`, `svgAngle()`,
`svgPolygone()`). Six cas de contrôle sont rendus dans `figures.html` : 3 h 25,
8 h 45 sans chiffres, 12 h 10, angle droit, angle aigu à 40°, angle obtus à
130°. Six autres dans `figures-geometrie.html` : carré codé sur quadrillage,
rectangle à deux paires de côtés égaux, triangle rectangle sans quadrillage,
pentagone quelconque, deux droites parallèles avec un point, axe de symétrie sur
quadrillage. Vérifier à l'œil, une fois, sur mobile et en mode sombre.
