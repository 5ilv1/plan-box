# Domaine « Grandeurs et mesures » — décisions de type, item par item

29 items, 9 ceintures. **26 en validation automatique, 3 en validation
enseignant** (GM13 peser, GM31 reproduire un angle au gabarit, GM36 tracer au
rapporteur) : ceux-là supposent du matériel et une main, ils restent des items
d'entraînement que l'élève fait en classe.

## La règle qui commande tout : l'unité

`components/ProblemeMathsEleve.tsx` normalise le résultat avant de comparer. Il
unifie **heures → h, minutes → min, euros → eur, mètres → m, centimètres → cm,
kilos et kilogrammes → kg, grammes → g**, retire les accents, remplace la
virgule par un point, et compare avec et sans les espaces.

Ce qu'il **ne connaît pas**, et qui est justement le cœur de ce domaine :
litres, décilitres, centilitres, millilitres, kilomètres, millimètres,
décimètres, tonnes, secondes, siècles, cm², m², km², m³.

D'où la règle, sans exception :

> **Le résultat attendu est un nombre nu. L'unité est dans la question.**
> « Combien de **litres** contient la citerne ? » → `450`, et non `450 L`.

Les seules réponses qui gardent leur unité sont les **durées composées**
(`2 h 35 min`) et les **sommes d'argent** (`12 eur`, `12 €`, `12 euros` — les
trois passent), parce que le moteur sait les unifier. Partout ailleurs, l'unité
dans la réponse est un piège : un élève qui écrit « 45 dL » quand on attend
« 45 dl » est compté faux.

Même règle pour les `exercice` de conversion, qui sont le gros du domaine :
« 3 m 40 cm = … cm » → `340`. L'unité de la réponse est dans l'énoncé.

## Deux figures nouvelles

Trois items de lecture de l'heure et un item d'angles ont besoin d'être
**dessinés** : voir `handoff/SPEC-FIGURES.md`, clé `figure` avec `cadran` et
`angle`. Décrire un cadran en mots reviendrait à donner la réponse.

Les items de périmètre, d'aire et de pavage n'en ont pas besoin : « un rectangle
de 7 cm sur 4 cm », « une figure recouverte de 12 carreaux » se disent sans rien
perdre.

## Décisions de type

| Ceinture | Item | Référentiel | Type retenu | Raison |
|---|---|---|---|---|
| 0 | GM10 lire l'heure (entières et demies) | qcm | **qcm** + `figure: cadran` | inchangé ; le cadran est dessiné |
| 0 | GM11 utiliser la monnaie | probleme_maths | **probleme_maths** | l'euro est unifié par le moteur, la réponse peut garder son unité |
| 0 | GM37 comparer et ranger longueurs et masses | classement | **classement** | colonnes « plus léger que… » / « plus lourd que… », ou « plus court » / « plus long » |
| 1 | GM12 estimer une taille, une masse, une contenance | qcm | **qcm** | inchangé — l'estimation se choisit, elle ne se calcule pas |
| 1 | GM13 mesurer des masses, effectuer des pesées | exercice, enseignant | **exercice** (validation enseignant) | manipulation réelle ; l'exercice sert de trace, la validation reste à Sylvain |
| 1 | GM14 lire l'heure ① (heure, demie, quart) | qcm | **qcm** + `figure: cadran` | idem GM10 |
| 2 | GM15 unités de longueur (m, cm, mm) | qcm | **qcm** | inchangé |
| 2 | GM16 mesurer et choisir l'unité | exercice | **qcm** | « quelle unité convient ? » se choisit ; en saisie, « cm » et « centimètres » ne sont pas unifiés |
| 2 | GM17 unité appropriée à un ordre de grandeur | qcm | **qcm** | inchangé |
| 3 | GM18 lire l'heure ② (à la minute, matin/après-midi) | qcm | **qcm** + `figure: cadran` | le cas sans chiffres arrive ici (`chiffres: false`) |
| 3 | GM19 convertir des longueurs | exercice | **exercice** | réponse = nombre nu, unité dans l'énoncé |
| 3 | GM20 convertir des durées (h, min, s) | exercice | **exercice** | idem ; attention, la seconde n'est pas unifiée : nombre nu |
| 4 | GM22 convertir des durées (siècles, années, semaines, jours) | exercice | **exercice** | nombre nu |
| 4 | GM23 convertir des masses | exercice | **exercice** | nombre nu |
| 4 | GM38 convertir des contenances (L, dL, cL, mL) | exercice | **exercice** | nombre nu — aucune de ces unités n'est unifiée |
| 4 | GM21 angle droit, aigu, obtus | qcm | **qcm** + `figure: angle` | l'angle est dessiné |
| 5 | GM24 additionner des durées | probleme_maths | **probleme_maths** | les durées composées sont unifiées : `2 h 35 min` est accepté |
| 5 | GM25 mesurer le périmètre d'une figure | exercice | **exercice** | figure décrite en mots, réponse = nombre nu |
| 5 | GM26 le sens de l'aire : le pavage | exercice | **exercice** | « combien de carreaux ? » → nombre nu |
| 6 | GM27 calculer un périmètre | probleme_maths | **exercice** | un périmètre est un nombre, pas une situation : l'exercice évite la phrase réponse inutile |
| 6 | GM28 soustraire des durées, durée écoulée | probleme_maths | **probleme_maths** | durées composées unifiées |
| 6 | GM29 aire du carré et du rectangle | probleme_maths | **exercice** | cm² n'est pas unifié : nombre nu, unité dans la question |
| 6 | GM30 proportionnalité ① (recette) | probleme_maths | **probleme_maths** | inchangé |
| 7 | GM31 reproduire un angle au gabarit | exercice, enseignant | **exercice** (validation enseignant) | geste manuel |
| 7 | GM32 classer des mesures après conversion | classement | **classement** | inchangé — c'est le geste même de l'item |
| 7 | GM33 proportionnalité ② (échelle) | probleme_maths | **probleme_maths** | inchangé |
| 8 | GM34 volume du pavé droit | probleme_maths | **exercice** | m³ n'est pas unifié |
| 8 | GM35 périmètre du cercle, aire du triangle | probleme_maths | **exercice** | idem, et l'énoncé fixe l'arrondi (« arrondis au dixième ») |
| 8 | GM36 mesurer et tracer au rapporteur | exercice, enseignant | **exercice** (validation enseignant) | geste manuel |

## Les trois items « enseignant »

GM13, GM31, GM36 supposent une balance, un gabarit, un rapporteur. Ils gardent
le type `exercice`, avec des questions qui portent sur ce que l'élève **lit**
après avoir manipulé (« la balance indique 1 kg 250 g : combien de grammes ? »),
et non sur le geste lui-même. Leur validation reste enseignant dans le
référentiel : Sylvain les valide en voyant faire.

Conséquence à connaître : ces trois items **comptent dans l'évaluation de la
ceinture** puisqu'ils sont de type `exercice`. C'est voulu — les questions
posées sont bien auto-corrigeables ; c'est le geste manuel, lui, qui ne l'est
pas.

## Arrondis

Dès qu'une division ne tombe pas juste (aire d'un triangle, périmètre d'un
cercle), **l'arrondi est demandé dans l'énoncé** — « arrondis au dixième » — et
jamais laissé au comparateur, dont la tolérance est désormais l'égalité stricte.
Pour le cercle, π vaut 3,14 et l'énoncé le dit.

## Univers

Mesures de la vie de la classe et de la maison : la cour, le couloir, un trajet,
une recette, une bouteille, un colis, la journée d'école. Les ordres de grandeur
doivent être vrais — un cartable ne pèse pas 40 kg.
