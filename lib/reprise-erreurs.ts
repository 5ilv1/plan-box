/**
 * Reprendre un exercice : seules les questions ratées sont reposées. (pur)
 *
 * Un élève sous le seuil reprenait TOUT l'exercice : neuf bonnes réponses sur
 * dix à refaire pour la seule question ratée — et, en le refaisant vite, il
 * pouvait se tromper sur une question qu'il savait. Désormais il ne retravaille
 * que ce qu'il a manqué ; ses bonnes réponses restent acquises.
 *
 * - Les réponses de la tentative précédente vivent dans
 *   `plan_travail.contenu.reponses_eleve` (`{ id, reponse, correcte }`). Un
 *   bloc rouvert « en cours », ou réaffecté au jour d'école suivant (la copie
 *   emporte ces réponses), n'en repose que les fausses.
 * - Le score enregistré reste celui de l'exercice ENTIER : les justes d'avant
 *   + celles de la reprise, sur le total. Le statut se calcule dessus.
 *   `premier_score` n'est pas touché : c'est la note du premier essai.
 * - « Refaire » de l'enseignant efface `reponses_eleve` : tout est reposé.
 * - Dans le doute, tout est reposé, comme avant : réponses absentes, illisibles,
 *   ou qui citent une question que l'exercice n'a plus (contenu modifié depuis).
 *   Jamais une bonne réponse attribuée à une autre question.
 *
 * Contrat : `npx tsx docs/tests/test-reprise-erreurs.mjs`.
 */

export interface ReponseEleve {
  id: number;
  reponse: string;
  correcte: boolean | null;
}

function lireReponses(brut: unknown): ReponseEleve[] | null {
  if (!Array.isArray(brut) || brut.length === 0) return null;
  const out: ReponseEleve[] = [];
  for (const r of brut) {
    const id = (r as { id?: unknown })?.id;
    if (typeof id !== "number" || !Number.isFinite(id)) return null;
    const correcte = (r as { correcte?: unknown }).correcte;
    out.push({
      id,
      reponse: String((r as { reponse?: unknown }).reponse ?? ""),
      correcte: correcte === true ? true : correcte === false ? false : null,
    });
  }
  return out;
}

/**
 * Les questions à reposer, désignées par leur clé ; `null` = tout reposer.
 *
 * `cleDe` regroupe les réponses : l'id d'une question le plus souvent, la
 * phrase entière pour une analyse de phrase (une étape ratée ⇒ la phrase est
 * reprise). `clesTous` : les clés de l'exercice tel qu'il est aujourd'hui.
 */
export function clesARevoir(
  statut: string | null | undefined,
  contenu: Record<string, unknown> | null | undefined,
  clesTous: number[],
  cleDe: (idReponse: number) => number = (id) => id,
): number[] | null {
  if (statut === "fait") return null;
  const reponses = lireReponses(contenu?.reponses_eleve);
  if (!reponses) return null;

  const tous = new Set(clesTous);
  const justes = new Set<number>();
  const fausses = new Set<number>();
  for (const r of reponses) {
    const cle = cleDe(r.id);
    // Une réponse qui ne désigne aucune question d'aujourd'hui : le contenu a
    // changé depuis, on ne sait plus à quoi elle se rapporte.
    if (!tous.has(cle)) return null;
    if (r.correcte === true) justes.add(cle);
    else fausses.add(cle);
  }
  // Une clé est reprise dès qu'UNE de ses réponses est fausse, ou s'il n'y en
  // a aucune (question jamais répondue).
  const aRevoir = clesTous.filter((c) => fausses.has(c) || !justes.has(c));
  if (aRevoir.length === 0 || aRevoir.length === clesTous.length) return null;
  return aRevoir;
}

/**
 * Les réponses de l'exercice entier après une reprise : celles d'avant pour
 * les clés non reprises, les nouvelles pour les autres.
 */
export function fusionnerReprise(
  anciennes: unknown,
  nouvelles: ReponseEleve[],
  reprises: number[],
  cleDe: (idReponse: number) => number = (id) => id,
): { reponses: ReponseEleve[]; bon: number; total: number } {
  const set = new Set(reprises);
  const gardees = (lireReponses(anciennes) ?? []).filter((r) => !set.has(cleDe(r.id)));
  const reponses = [...gardees, ...nouvelles];
  return {
    reponses,
    bon: reponses.filter((r) => r.correcte === true).length,
    total: reponses.length,
  };
}
