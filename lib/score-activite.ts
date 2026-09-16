/**
 * Le score d'une activité terminée — et la note honnête à côté.
 *
 * Quatre activités ne se terminent **que** lorsque tout est juste : l'élève
 * corrige jusqu'au sans-faute. Leur score final vaut donc toujours le total,
 * et c'est très bien pour décider si le travail est fait. Mais c'est cette
 * valeur-là qui partait en base, si bien que `premier_score` valait 100 %
 * pour tout le monde — y compris pour l'élève qui s'y était repris à quatre
 * fois. Le graphe de réussite par sous-domaine, fait précisément pour repérer
 * le travail bâclé, ne voyait que des notes parfaites.
 *
 * `premier` porte le nombre de réponses justes **au premier essai**. Il est
 * facultatif : une activité qui n'a qu'un seul essai (l'analyse de phrase)
 * n'en a pas besoin, son score EST celui du premier jet.
 */
export interface ScoreActivite {
  /** Ce qui est juste à la fin. Décide du statut du bloc. */
  bon: number;
  total: number;
  /** Ce qui était juste au premier essai. Décide de la note enregistrée. */
  premier?: number;
}
