# Domaine « Espace et géométrie » — décisions de type, item par item

30 items, 9 ceintures. C'est le domaine le plus visuel des sept, et le seul où
la moitié des compétences se valident **la main sur le cahier** : 15 items sont
en `validation: enseignant` parce qu'ils supposent une règle, une équerre ou un
compas.

## La question de fond : tracer ne s'évalue pas dans un navigateur

Elle a déjà été tranchée dans « Grandeurs et mesures », sur GM31 (reproduire un
angle au gabarit). La réponse est le **patron « trace, puis constate »** :

> L'énoncé demande le tracé sur le cahier, et la question posée à l'écran porte
> sur ce que le tracé fait apparaitre — un nombre, un mot, un oui/non.

« Trace la perpendiculaire à (AB) passant par A, puis la perpendiculaire à (AB)
passant par B. Ces deux droites se coupent-elles ? » → `non`. Le geste reste
chez Sylvain, qui valide l'item en regardant le cahier ; l'écran vérifie que
l'élève a compris ce qu'il traçait. C'est honnête dans les deux sens : un élève
qui répond juste sans avoir tracé a quand même compris quelque chose, et un
élève qui a tracé sans comprendre est repéré.

Conséquence : **aucun item de ce domaine n'est vide à l'écran**, y compris les
15 items « enseignant ». Les neuf évaluations de ceinture sont donc toutes
composables.

## Deux changements de type par rapport au référentiel

| Item | Référentiel | Retenu | Raison |
|---|---|---|---|
| **EG32** je sais suivre un programme de construction | `exercice` | **`qcm`** | Suivre un programme, c'est aussi **vérifier** qu'une figure le respecte. On donne le programme et la figure obtenue, et on demande à quelle étape ça a dérapé. Entièrement à l'écran, et c'est la moitié de la compétence que le papier évalue le plus mal. |
| **EG33** je complète et je rédige un programme | `ecriture_contrainte` | **`texte_a_trous`** | `ecriture_contrainte` n'est pas géré par `creerMiniExercices()` : l'item disparaitrait de l'évaluation de la violet foncé. Et « je **complète** » est littéralement un texte à trous — on masque les mots du lexique (perpendiculaire, milieu, diagonale, sommet, parallèle, rayon). La rédaction libre reste la part de Sylvain, d'où `validation: enseignant`. |

Sur EG33, **ne jamais masquer un mot terminé par `é`** — *carré*, *tracé* — le
champ deviendrait un menu déroulant -er/-é. Le lexique masquable est donné plus
bas.

## Les figures

Le domaine repose sur la forme **`polygone`** de `handoff/SPEC-FIGURES.md`,
étendue ici d'une clé `cercles` :

```jsonc
"figure": {
  "type": "polygone",
  "grille": { "colonnes": 8, "lignes": 6 },
  "polygones": [{ "sommets": [[1,1],[5,1],[5,4],[1,4]], "nom": "ABCD",
                  "angles_droits": [0,1,2,3], "cotes_egaux": [[0,1],[2,1],[1,2],[3,2]] }],
  "segments":  [{ "de": [1,1], "a": [5,4], "pointille": true, "nom": "d" }],
  "points":    [{ "at": [7,2], "nom": "M" }],
  "cercles":   [{ "centre": [4,3], "rayon": 2, "nom": "C" }]
}
```

`grille` absente = papier uni. Origine en bas à gauche. Le codage (angles
droits, traits d'égalité) se dessine dans la couleur de la ceinture.

**Les solides ne sont pas dessinés** : un cube en perspective est un mauvais
SVG et un mauvais exercice. EG17, EG21, EG27 passent par les **propriétés**
(« quel solide a deux faces circulaires et une face courbe ? »), ce qui est
exactement la compétence.

## Le format des réponses, sans exception

Trois formats, et un seul par type de question. La consigne les rappelle
toujours, parce que l'évaluation retire les indices.

| On demande | Réponse attendue | Exemple |
|---|---|---|
| Un nombre (côtés, sommets, arêtes, axes, angles droits, une longueur) | **nombre nu**, l'unité est dans la question | `6` |
| Une case du quadrillage | **lettre + chiffre**, sans espace | `C3` |
| Un nœud du quadrillage, un point | **`(x;y)`** | `(4;2)` |

Jamais de nom de figure en saisie (*parallélogramme*, *quadrilatère* : trop
d'accents et de doublements de lettres) — ces réponses passent en `qcm`. Jamais
d'unité dans la réponse : `cm` est unifié par le moteur, mais `mm`, `dm` et
`cm²` ne le sont pas.

## Décisions de type, item par item

| Ceinture | Item | Réf. | Retenu | Note |
|---|---|---|---|---|
| 0 | EG10 point, droite, segment, milieu | qcm | **qcm** + figure | points et segments nommés sur la figure |
| 0 | EG11 carrés, rectangles, cercles sans quadrillage | qcm | **qcm** + figure | `grille` absente, un `cercles` parmi les polygones |
| 0 | EG12 reconnaitre les angles droits | exercice | **exercice** + figure | « combien d'angles droits ? » → nombre nu |
| 1 | EG13 reconnaitre les polygones | classement | **classement** | catégories *polygone* / *pas un polygone* ; figures décrites en mots (un rond, une ligne brisée ouverte, une figure fermée à 6 côtés droits) |
| 1 | EG14 axes de symétrie sur quadrillage | exercice | **exercice** + figure | « combien d'axes ? » → nombre nu ; l'axe proposé est en `segments` pointillés quand on demande oui/non |
| 1 | EG15 se repérer sur un quadrillage | exercice | **exercice** + figure | cases → `C3`, nœuds → `(4;2)` ; ne pas mélanger les deux dans une même variante |
| 2 | EG16 côté, sommet, angle | qcm | **qcm** + figure | |
| 2 | EG17 face, arête, sommet (solides) | qcm | **qcm** | par propriétés, sans dessin |
| 2 | EG18 reconnaitre et tracer deux perpendiculaires | exercice, ens. | **exercice** (ens.) | moitié reconnaissance sur figure, moitié « trace, puis constate » |
| 2 | EG19 tracer un cercle au compas | exercice, ens. | **exercice** (ens.) | rayon/diamètre → nombre nu ; figure `cercles` avec un rayon en `segments` |
| 3 | EG20 droites parallèles | qcm | **qcm** + figure | inclure le piège des droites sécantes à angle faible |
| 3 | EG21 reconnaitre les solides | qcm | **qcm** | par propriétés |
| 3 | EG22 quadrilatères et triangles dans une figure complexe | exercice | **exercice** + figure | polygones `plein: false` superposés + `segments` ; « combien de triangles ? » → nombre nu. Vérifier soi-même le compte, deux fois. |
| 3 | EG23 reproduire les quadrilatères particuliers et les triangles rectangles | exercice, ens. | **exercice** (ens.) | propriétés + « trace, puis constate » |
| 4 | EG24 patron de cube | exercice, ens. | **exercice** (ens.) | le patron se dessine : carrés adjacents sur `grille`. « ce patron se referme-t-il ? » → oui/non |
| 4 | EG25 perpendiculaires à l'équerre ② | exercice, ens. | **exercice** (ens.) | la difficulté d'EG25 par rapport à EG18 : droites **obliques**, jamais alignées sur le quadrillage |
| 4 | EG26 les trois triangles particuliers | qcm | **qcm** + figure | rectangle, isocèle, équilatéral ; codage sur la figure |
| 4 | EG39 décrire et coder un déplacement | exercice | **exercice** + figure | « depuis A : ↑ ↑ → → → . Sur quel nœud arrives-tu ? » → `(4;5)` |
| 5 | EG27 propriétés des solides (+ prisme droit) | exercice | **exercice** | nombre nu (faces, arêtes, sommets) |
| 5 | EG28 tracer deux droites parallèles | exercice, ens. | **exercice** (ens.) | « trace, puis constate » : écart constant, jamais de point commun |
| 5 | EG37 axes de symétrie sans quadrillage | exercice, ens. | **exercice** (ens.) | `grille` absente ; le parallélogramme quelconque (0 axe) est le contre-exemple obligatoire |
| 6 | EG29 reproduire des figures simples ou complexes | exercice, ens. | **exercice** (ens.) | figure codée non cotée → déduire une longueur ; puis « trace, puis constate » |
| 6 | EG30 construire une figure par symétrie axiale | exercice, ens. | **exercice** (ens.) | symétrique d'un point par rapport à un axe → `(8;3)` ; entièrement vérifiable à l'écran |
| 6 | EG38 lire et utiliser le codage | qcm | **qcm** + figure | c'est l'item qui justifie tout le codage des figures du domaine |
| 7 | EG31 construire d'après un schéma à main levée | exercice, ens. | **exercice** (ens.) | le schéma à main levée est **codé mais pas coté** : l'élève déduit les longueurs du codage |
| 7 | EG32 suivre un programme de construction | exercice, ens. | **qcm** (ens.) | programme + figure obtenue → « à quelle étape le tracé s'écarte-t-il du programme ? » |
| 7 | EG33 compléter et rédiger un programme | ecr. contrainte, ens. | **texte_a_trous** (ens.) | lexique masquable : *perpendiculaire, parallèle, milieu, diagonale, sommet, centre, rayon, diamètre, segment, cercle, angle, côtés*. Jamais *carré*, *tracé*, ni aucun mot en `é`. |
| 8 | EG34 patrons de cubes et de pavés droits | exercice, ens. | **exercice** (ens.) | le patron se dessine ; questions sur le nombre de faces, l'arête qui se recolle, l'aire du patron en carreaux |
| 8 | EG35 se repérer et se déplacer dans l'espace | exercice, ens. | **exercice** (ens.) | un **plan** (salle, cour, quartier) en `polygones` + `points` nommés ; itinéraire décrit → point d'arrivée, en lettre |
| 8 | EG36 règle, équerre et compas pour reproduire des triangles | exercice, ens. | **exercice** (ens.) | inclut l'inégalité triangulaire (« peut-on tracer un triangle de 3 cm, 4 cm et 9 cm ? » → `non`), qui est du CM2+ et se vérifie à l'écran |

## Le matériau, à ne pas partager entre items

Le domaine se répète très vite : le carré et le rectangle reviennent partout.
Réserver les figures pour éviter que deux items ne se confondent :

- **carré, rectangle, cercle** → EG11 (reconnaissance) et rien d'autre en
  reconnaissance pure
- **losange, parallélogramme, trapèze** → EG23 et EG38
- **triangle rectangle, isocèle, équilatéral** → EG26, puis EG36
- **cube, pavé droit** → EG17 (vocabulaire), EG21 (reconnaissance), EG24/EG34
  (patrons) ; **prisme droit, cône, pyramide, cylindre, boule** → EG21 et EG27
- **quadrillage de repérage** → EG15 (position), EG39 (déplacement), EG30
  (symétrie), EG35 (plan) : chacun avec une grille de dimensions différentes

## Le piège propre au domaine : compter juste

La moitié des réponses sont des comptages (côtés, sommets, arêtes, axes de
symétrie, triangles d'une figure complexe). Ce sont exactement les réponses
qu'on écrit de tête et qu'on rate.

- **Un axe de symétrie** : le rectangle non carré en a **2**, le carré **4**, le
  losange **2**, le parallélogramme quelconque **0**, le triangle équilatéral
  **3**, le triangle isocèle non équilatéral **1**, le cercle une infinité.
- **Les arêtes** : cube 12, pavé droit 12, pyramide à base carrée 8, prisme
  droit à base triangulaire 9, cylindre 2 (ou 0 selon la définition — **ne pas
  poser la question**), cône 0 ou 1 — **ne pas poser la question non plus**.
- **Les triangles d'une figure complexe** : les compter sur le dessin, un par
  un, en les listant par leurs sommets, puis recompter. Un rectangle avec ses
  deux diagonales contient **8** triangles, pas 4.

Chaque réponse chiffrée du domaine est recomptée par un agent indépendant avant
livraison, comme pour Nombres, Calcul et Grandeurs.
