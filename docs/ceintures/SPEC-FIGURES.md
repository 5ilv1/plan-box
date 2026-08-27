# Figures — contrat de rendu

Après les droites graduées (`SPEC-DROITE-GRADUEE.md`), deux figures manquent au
domaine « Grandeurs et mesures » : le **cadran à aiguilles** et l'**angle**.
Sans elles, trois items de lecture de l'heure et un item d'angles ne sont pas
écrivables — décrire un cadran en mots, c'est donner la réponse.

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

## Ce que ça permet

- GM10, GM14, GM18 — lire l'heure, des demi-heures jusqu'à la minute près, avec
  le cas sans chiffres en ceinture haute.
- GM21 — distinguer angle droit, aigu et obtus.

Les items de périmètre, d'aire et de pavage n'ont pas besoin de figure : « un
rectangle de 7 cm sur 4 cm », « une figure recouverte de 12 carreaux » se disent
en mots sans rien perdre. On s'arrête donc à ces deux formes.

## Vérification

Le banc d'essai implémente les deux (`svgCadran()`, `svgAngle()`), et six cas de
contrôle sont rendus dans `figures.html` : 3 h 25, 8 h 45 sans chiffres,
12 h 10, angle droit, angle aigu à 40°, angle obtus à 130°. Vérifier à l'œil,
une fois, sur mobile et en mode sombre.
