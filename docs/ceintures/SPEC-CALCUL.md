# Domaine « Calcul » — décisions de type, item par item

33 items, 9 ceintures, tous en validation automatique.

## Les quatre items de tables de multiplication

**C10, C17, C22 et C32 ne dupliquent pas le module existant.** PlanBox a déjà
ses « Ceintures de multiplication » (`lib/ceintures.ts`, `CeintureMultiplication.tsx`) :
12 couleurs de la blanche à la noire, chronométrées, tables et divisions. C'est
lui qui fait apprendre les tables ; il est déjà en service et il est meilleur
qu'un exercice de calcul mental pour ça.

Ces quatre items restent donc dans la grille de Calcul, mais :

- **leur leçon renvoie explicitement au module** : « Pour apprendre tes tables,
  entraîne-toi avec les ceintures de multiplication. Ici, on vérifie seulement
  que tu les sais. » ;
- **leur entraînement est un contrôle court**, pas un entraînement complet :
  8 calculs en `calcul_mental`, tirés uniquement des tables de l'item ;
- **le diagnostic suffit à valider l'item** pour un élève qui a déjà la ceinture
  de multiplication correspondante — c'est le cas normal, et c'est voulu.

Correspondance à mentionner dans chaque leçon :

| Item | Tables | Ceinture de multiplication correspondante |
|---|---|---|
| C10 | 0, 1, 2, 5, 10 | Jaune |
| C17 | 3, 4, 6 | Vert clair |
| C22 | 7, 8, 9 | Bleu foncé |
| C32 | division exacte | Mauve |

## Les pièges du moteur, rappel

Le comparateur de réponses a été corrigé (`lib/comparer-reponse.ts`) : les
espaces des milliers passent, les fractions se comparent terme à terme, et la
tolérance est l'égalité stricte. Restent deux règles :

- **`calcul_mental` compare des chaînes**, sans conversion : entiers uniquement,
  sans espace. Un décimal y serait refusé si l'élève tape un point.
  → tout item de calcul avec des décimaux (C25, C29, C28, C38) prend le type
  **`exercice`**, où la comparaison est numérique.
- **`probleme_maths`** attend `{ id, enonce, resultat_attendu,
  phrase_reponse_attendue, mots_cles[], indice }`. Vérifié dans
  `components/ProblemeMathsEleve.tsx` : **seul le résultat entre dans la note**,
  la phrase réponse est demandée et commentée mais jamais comptée. Le
  comparateur du résultat retire les accents, remplace la virgule par un point
  et unifie les unités courantes — `heures→h`, `euros→eur`, `mètres→m`,
  `centimètres→cm`, `kilos/kilogrammes→kg`, `grammes→g` — puis compare, avec et
  sans les espaces. Donc « 12 euros », « 12€ » et « 12 eur » sont équivalents,
  et un mot-clé accentué ne présente aucun risque.
  Deux conséquences pour la rédaction : le `resultat_attendu` doit porter son
  unité quand la question en appelle une, et une unité hors de cette liste
  (litres, kilomètres…) doit être écrite exactement comme l'élève l'écrira —
  ou mieux, demandée dans la question (« Réponds en litres »).

## Décisions de type

| Ceinture | Item | Référentiel | Type retenu | Raison |
|---|---|---|---|---|
| 0 | C10 tables 0,1,2,5,10 | calcul_mental | **calcul_mental** | contrôle court, renvoi au module |
| 0 | C11 addition posée avec retenue | calcul_mental | **calcul_mental** | entiers |
| 0 | C12 soustraction posée sans retenue | calcul_mental | **calcul_mental** | entiers |
| 0 | C13 soustraire en ligne ① | calcul_mental | **calcul_mental** | entiers |
| 1 | C14 sens de la multiplication | probleme_maths | **probleme_maths** | inchangé |
| 1 | C16 addition de plusieurs nombres | calcul_mental | **calcul_mental** | entiers |
| 1 | C15 multiplication par un chiffre | calcul_mental | **calcul_mental** | entiers |
| 1 | C41 calculer en ligne en décomposant | calcul_mental | **calcul_mental** | la réponse reste le résultat, pas la décomposition écrite |
| 2 | C17 tables 3,4,6 | calcul_mental | **calcul_mental** | contrôle court, renvoi au module |
| 2 | C18 soustraire en ligne ② | calcul_mental | **calcul_mental** | entiers |
| 2 | C19 multiplication par deux chiffres | calcul_mental | **calcul_mental** | entiers |
| 2 | C40 compléments à 10, 100, 1 000 | calcul_mental | **calcul_mental** | entiers |
| 3 | C22 tables 7,8,9 | calcul_mental | **calcul_mental** | contrôle court, renvoi au module |
| 3 | C20 soustraction avec retenue | calcul_mental | **calcul_mental** | entiers |
| 3 | C21 multiplier et diviser par 10, 100, 1 000 | calcul_mental | **calcul_mental** | entiers seulement à ce niveau ; les décimaux sont en C28 |
| 4 | C23 sens de la division | probleme_maths | **probleme_maths** | inchangé |
| 4 | C24 division posée par un chiffre | calcul_mental | **calcul_mental** | quotient entier ; si le reste est demandé, une question par grandeur |
| 4 | C39 division euclidienne, quotient et reste | probleme_maths | **exercice** | deux nombres à donner : une question pour le quotient, une pour le reste, réponses entières |
| 4 | C26 calculs avec parenthèses | calcul_mental | **calcul_mental** | entiers |
| 5 | C25 additionner deux décimaux de tête | calcul_mental | **exercice** | décimaux : le calcul mental compare des chaînes |
| 5 | C27 multiples de 25 et 50, diviseurs de 100 | calcul_mental | **calcul_mental** | entiers |
| 5 | C32 division exacte issue des tables | calcul_mental | **calcul_mental** | contrôle court, renvoi au module (ceinture Mauve) |
| 6 | C29 additions et soustractions de décimaux | calcul_mental | **exercice** | décimaux |
| 6 | C28 multiplier avec des décimaux | calcul_mental | **exercice** | décimaux |
| 6 | C30 identifier une situation de proportionnalité | probleme_maths | **qcm** | « est-ce proportionnel ? » se décide, il n'y a pas de résultat à calculer |
| 7 | C31 résoudre des problèmes de proportionnalité | probleme_maths | **probleme_maths** | inchangé |
| 7 | C34 divisibilité par 2, 5, 10 | qcm | **classement** | trier des nombres en « divisible par 2 » / « par 5 » / « par 10 » / « par aucun » est le geste même de l'item |
| 7 | C33 contrôler le résultat d'une calculatrice | calcul_mental | **qcm** | on juge un résultat, on ne le calcule pas |
| 7 | C38 division d'un décimal par un entier | calcul_mental | **exercice** | décimaux |
| 8 | C35 calculer un pourcentage | probleme_maths | **probleme_maths** | inchangé |
| 8 | C36 divisibilité par 3 et 9 | qcm | **qcm** | inchangé — la règle de la somme des chiffres se teste bien en QCM |
| 8 | C37 utiliser l'échelle d'un plan | probleme_maths | **probleme_maths** | inchangé |
| 8 | C42 choisir la procédure la plus efficace | probleme_maths | **qcm** | on choisit une procédure, on ne produit pas un résultat |

## Consignes types

- `calcul_mental` : énoncé = l'opération telle qu'on la dit en classe
  (« 47 + 28 », « 6 × 7 »), réponse = un entier collé.
- Pour les additions et soustractions **posées** (C11, C12, C16, C20), l'énoncé
  est l'opération en ligne : la pose est un geste de cahier, le moteur ne vérifie
  que le résultat. Le dire dans la consigne : « Pose l'opération sur ton cahier,
  puis écris le résultat. »
- `exercice` à réponse décimale : « Écris le résultat. Utilise la virgule. »

## Univers

Contextes de vie courante : prix, distances, recettes, sport, cour de
récréation. Les problèmes (`probleme_maths`) portent sur des situations que la
classe rencontre vraiment ; pas de contexte qui suppose une connaissance du
monde hors de portée d'un CM.
