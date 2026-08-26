# Correctif — l'évaluation casse les exercices d'homophones

**Fichier** : `app/eleve/chapitre/[id]/evaluation/page.tsx`
**Portée** : tous les exercices `texte_a_trous` qui masquent des homophones —
les ceintures de compétences, **et Ma P'tite Règle**, qui utilise le même moteur.
**Gravité** : l'élève répond juste et est compté faux. Validation en tout ou
rien, donc l'exercice entier est perdu.

## Le mécanisme

Deux comportements corrects séparément, incompatibles ensemble.

1. **L'évaluation échantillonne les trous en les mélangeant.**
   `page.tsx` ligne 51 :
   ```ts
   function piocher<T>(arr: T[], n: number): T[] {
     return melanger(arr).slice(0, n);          // ← mélange PUIS coupe
   }
   ```
   appelée ligne 67 : `piocher(trous, Math.min(4, trous.length))`.
   Le sous-ensemble retenu n'est plus dans l'ordre du texte.

2. **La pose des trous cherche « le premier emplacement libre », accents
   ignorés.** `app/eleve/chapitre/[id]/exercice/[exerciceId]/page.tsx`, ~ligne
   300 : chaque mot masqué est comparé après suppression de la ponctuation
   **et des accents** (`normalize("NFD")`), et se cale sur la première position
   libre qui correspond.

Conséquence : « à » et « a » sont indiscernables à la pose. Si le tirage
présente le trou « à » avant le trou « a », le premier se pose sur le « a » du
texte. L'élève voit le menu déroulant a/à au mauvais endroit, choisit la forme
correcte pour la phrase affichée, et est compté faux.

Même chose pour et/est, son/sont, on/ont, ce/se, ou/où, la/là.

## Mesure

Simulation de 5 000 évaluations sur l'algorithme réel, avec deux exercices
d'homophones de la banque :

| Exercice | Évaluations cassées |
|---|---|
| P47 variante 1 (a/à, et/est) | **49,7 %** |
| P47 variante 2 (a/à, et/est) | **66,5 %** |

Les exercices sans homophone ne sont pas affectés : leurs mots masqués sont
uniques dans le texte, l'ordre du tirage n'a donc pas d'importance.

À l'entraînement le bug n'apparaît pas : la page exercice pose les trous dans
l'ordre du fichier, qui est correct. Il ne se manifeste **qu'à l'évaluation**,
c'est-à-dire au moment qui décide de la ceinture.

## Le correctif

Attention : **conserver l'ordre du tirage ne suffit pas.** C'est le premier
correctif que j'avais proposé, et le test le démolit : il reste 19 % de casse.
La raison est que le mot du trou écarté **reste visible dans le texte**, et
qu'un trou ambigu conservé se pose alors dessus. Exemple : le texte contient
a · à · et · est · à, l'évaluation écarte le premier « a » — le trou « à » est
désormais le premier de la liste et se cale sur le « a » resté en clair.

Le correctif qui tient : **ne pas prélever du tout dans les textes à trous.**
Ligne 67 de `app/eleve/chapitre/[id]/evaluation/page.tsx` :

```ts
// AVANT
const trousChoisis = piocher(trous, Math.min(4, trous.length));

// APRÈS — l'exercice est de toute façon validé en tout ou rien,
// prélever 4 trous sur 5 ne change pas sa difficulté et casse
// le placement des homophones.
const trousChoisis = trous;
```

Mesuré sur les deux exercices d'homophones de la banque, 2 000 tirages chacun :

| Stratégie | Évaluations cassées |
|---|---|
| Actuelle — mélange puis coupe | 47,6 % et 66,1 % |
| Tirage ordonné (insuffisant) | 19,1 % et 19,1 % |
| **Tous les trous conservés** | **0 % et 0 %** |

Effet de bord : une évaluation de ceinture gagne un point par exercice
`texte_a_trous`, soit +3 à +4 questions. Sans incidence sur le seuil, qui est
un pourcentage.

Ne pas toucher aux cinq autres appels de `piocher()` (lignes 84, 101, 117, 133,
147) : pour un classement, un QCM, une série de questions, de calculs ou de
phrases, l'ordre n'a aucune incidence sur la correction, et le prélèvement y
est souhaitable pour raccourcir l'évaluation.

### Si le prélèvement doit absolument être conservé

Il faudrait alors résoudre les positions sur la liste **complète** des trous
avant de prélever, puis transmettre ces positions, et modifier la page exercice
(`~ligne 300`) pour qu'elle **honore** `position` au lieu de la recalculer.
C'est deux fichiers et une migration de comportement : disproportionné pour un
gain d'une question par exercice.

## Vérification

`docs/ceintures/test-piocher.mjs` rejoue l'échantillonnage et la pose sur tous
les fichiers de banque, 2 000 tirages par exercice, et échoue si un trou se
pose sur un autre mot que celui attendu.

```bash
node docs/ceintures/test-piocher.mjs
```

Avant le correctif il signale P47 ; après, il doit sortir `0 exercice affecté`.

## Un point voisin, qui n'est pas un bug

La **consigne d'un exercice survit à l'évaluation** : elle est repassée aux
composants (lignes 586, 596, 605, 628), contrairement aux indices et aux
explications, qui sont bien retirés. Ce n'est pas à corriger — c'est une
contrainte à connaître pour écrire les banques : une consigne du type
« n'oublie pas le -ent » donne la réponse le jour de l'évaluation. Le rappel de
la règle doit descendre dans les `indice`, qui, eux, disparaissent.

Seule exception : le QCM en évaluation ne reçoit pas de consigne (ligne 612).
