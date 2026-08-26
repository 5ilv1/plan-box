# Les leçons courtes — format et règles de rédaction

Chaque item de ceinture reçoit **une leçon**, affichée à l'élève **avant son
exercice d'entraînement**, après le diagnostic. Elle explique la procédure à
appliquer. C'est elle qui porte la règle : les `indice` des exercices ne font
que la relancer, et ils disparaissent le jour de l'évaluation.

## Où elle se range

Au niveau de l'**item**, pas de la variante : une seule leçon sert la variante 1
et la variante 2.

```jsonc
{
  "item_code": "P16",
  "type": "exercice",
  "lecon": { … },              // ← nouveau, juste après "type"
  "diagnostic": [ … ],
  "entrainement": [ … ]
}
```

## Le format, exactement

```jsonc
"lecon": {
  "titre": "Trouver le verbe",
  "regle": "Le verbe est le mot qui change quand on change le moment.",
  "procedure": [
    "Encadre la phrase avec « ne … pas ».",
    "Le mot qui se retrouve entre « ne » et « pas », c'est le verbe."
  ],
  "exemples": [
    {
      "phrase": "Lila range son cartable.",
      "demonstration": "Lila ne range pas son cartable. → le verbe est « range »."
    },
    {
      "phrase": "Les élèves attendent devant la porte.",
      "demonstration": "Les élèves n'attendent pas devant la porte. → le verbe est « attendent »."
    }
  ],
  "piege": "Le verbe n'est pas toujours au milieu de la phrase : cherche-le avec ne … pas, pas avec les yeux."
}
```

- `titre` : 2 à 5 mots, à l'infinitif ou en groupe nominal.
- `regle` : **une seule phrase**, la règle telle qu'on veut que l'élève la
  retienne. Bornée : « un verbe **en -ER** prend -ent quand le sujet vaut ils »,
  jamais « au pluriel le verbe prend -ent ».
- `procedure` : 2 ou 3 étapes, à l'impératif, dans l'ordre où on les fait.
  C'est le cœur : l'élève doit pouvoir l'appliquer sans avoir compris la théorie.
- `exemples` : **deux** exemples travaillés, avec la démonstration écrite en
  entier — on montre le geste, on ne se contente pas de donner la réponse. Le
  premier est le cas le plus simple ; le second déplace une variable pour que
  l'élève voie que la procédure tient : un autre sujet, un autre temps, une
  phrase plus longue, ou justement le cas où le piège apparaît. Deux exemples
  qui ne diffèrent que par les prénoms n'apprennent rien.
- `piege` : facultatif, une phrase. L'erreur que les élèves font vraiment.

Longueur totale : **80 à 120 mots**, les deux exemples compris. Elle se lit en trente secondes, debout,
avant de commencer. Ce n'est pas la leçon du cahier, c'est le rappel du geste.

## Les cinq règles de rédaction

1. **La procédure de la leçon et les `indice` de l'exercice disent la même
   chose.** Si l'indice dit « essaie de remplacer par étaient », la leçon a
   appris ce remplacement. Un élève ne doit jamais rencontrer deux méthodes
   concurrentes pour le même item.
2. **L'exemple ne sort pas de l'exercice.** Prendre une phrase de
   l'entraînement, c'est donner une réponse. Nouvelle phrase, nouveaux
   personnages.
3. **Rien qui vienne d'une ceinture ultérieure**, ni dans la règle, ni dans le
   vocabulaire. Le mot « attribut » n'existe pas avant la ceinture 6.
4. **Aucune règle fausse, même simplifiée.** Une simplification qu'un autre item
   de la même ceinture dément est une faute, pas un raccourci.
5. **On s'adresse à l'élève**, à la deuxième personne, sans jargon inutile. Les
   termes grammaticaux du programme sont bienvenus ; les périphrases savantes,
   non.

## Ce que le moteur en fera

- Écran affiché **avant l'exercice d'entraînement**, avec un bouton « J'ai
  compris, je commence ».
- Bouton « revoir la leçon » accessible **pendant** l'entraînement.
- **Jamais pendant l'évaluation de ceinture** : la leçon donnerait la règle au
  moment précis où l'on vérifie qu'elle est acquise.
- Stockage : colonne `lecon jsonb` sur `ceinture_item`, pas dans le contenu de
  l'exercice — la leçon appartient à l'item, qui survit au changement de
  variante.
