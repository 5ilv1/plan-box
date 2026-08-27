// ── Ceintures de compétences — logique serveur partagée ─────────────────────
//
// Réservé aux routes API : utilise le client admin (service_role).

import { createAdminClient } from "@/lib/supabase-admin";
import {
  ceintureCourante,
  couleur,
  DOMAINES,
  NB_CEINTURES,
  statutCeinture,
  type DomaineCeinture,
  type StatutCeinture,
} from "@/lib/ceintures-competences";

export interface EleveRef {
  eleveId: string | null;
  rbEleveId: number | null;
}

/** Lit `eleve_id` / `rb_eleve_id` d'une URL. */
export function lireEleve(params: URLSearchParams): EleveRef {
  const eleveId = params.get("eleve_id");
  const rb = params.get("rb_eleve_id");
  return { eleveId: eleveId || null, rbEleveId: rb ? Number(rb) : null };
}

/** Colonne et valeur du filtre élève, quelle que soit la source. */
function colonneEleve(e: EleveRef): [string, string | number] {
  return e.eleveId ? ["eleve_id", e.eleveId] : ["rb_eleve_id", e.rbEleveId as number];
}

export interface CeintureEtat {
  idx: number;
  nom: string;
  hex: string;
  hexFond: string;
  statut: StatutCeinture;
  chapitreId: string | null;
  nbItems: number;
  /** Items validés par l'élève, diagnostic compris. */
  nbValides: number;
  diagnosticFait: boolean;
}

export interface DomaineEtat {
  code: string;
  slug: string;
  nom: string;
  /** « français » ou « maths » — sert à grouper les domaines sur le hub. */
  matiere: string;
  description: string;
  icone: string;
  courante: number;
  termine: boolean;
  couleurCourante: { nom: string; hex: string; hexFond: string } | null;
  ceintures: CeintureEtat[];
}

/**
 * Les chapitres-ceintures assignés à un groupe de l'élève, par domaine.
 * `chapitre_assignation` reste la source de vérité de « à qui appartient ce
 * chapitre », même si les ceintures ne passent pas par `mes-chapitres`.
 */
async function chapitresOuverts(eleve: EleveRef): Promise<Set<string>> {
  const admin = createAdminClient();

  let qg = admin.from("eleve_groupe").select("groupe_id");
  qg = eleve.eleveId
    ? qg.eq("planbox_eleve_id", eleve.eleveId)
    : qg.eq("repetibox_eleve_id", eleve.rbEleveId);

  const { data: groupes } = await qg;
  if (!groupes?.length) return new Set();

  const { data: assignations } = await admin
    .from("chapitre_assignation")
    .select("chapitre_id")
    .in("groupe_id", groupes.map((g) => g.groupe_id))
    .eq("actif", true);

  return new Set((assignations ?? []).map((a) => a.chapitre_id as string));
}

/**
 * État complet d'un élève sur les domaines de ceintures.
 * `domaineCode` restreint le calcul à un seul domaine.
 */
export async function etatCeintures(
  eleve: EleveRef,
  domaineCode?: string,
): Promise<DomaineEtat[]> {
  const admin = createAdminClient();
  const domaines = domaineCode
    ? DOMAINES.filter((d) => d.code === domaineCode.toUpperCase())
    : DOMAINES;

  const ouverts = await chapitresOuverts(eleve);

  const { data: liens } = await admin
    .from("ceinture_chapitre")
    .select("domaine_code, ceinture_idx, chapitre_id")
    .in("domaine_code", domaines.map((d) => d.code));

  const chapitreIds = (liens ?? []).map((l) => l.chapitre_id as string);
  if (!chapitreIds.length) return [];

  // Évaluations réussies → ceintures acquises.
  const [colEleve, valEleve] = colonneEleve(eleve);

  const { data: evals } = await admin
    .from("evaluation_resultat")
    .select("chapitre_id")
    .in("chapitre_id", chapitreIds)
    .eq("reussi", true)
    .eq(colEleve, valEleve);

  const chapitresReussis = new Set((evals ?? []).map((e) => e.chapitre_id as string));

  // Items de chaque ceinture.
  const { data: items } = await admin
    .from("ceinture_item")
    .select("code, domaine_code, ceinture_idx")
    .in("domaine_code", domaines.map((d) => d.code))
    .eq("actif", true);

  const nbItems = new Map<string, number>();
  for (const it of items ?? []) {
    const cle = `${it.domaine_code}-${it.ceinture_idx}`;
    nbItems.set(cle, (nbItems.get(cle) ?? 0) + 1);
  }

  // Exercices validés, par chapitre.
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, chapitre_id")
    .in("chapitre_id", chapitreIds);

  const chapitreParExo = new Map((exercices ?? []).map((e) => [e.id as string, e.chapitre_id as string]));

  const { data: resultats } = await admin
    .from("exercice_resultat")
    .select("exercice_id")
    .in("exercice_id", [...chapitreParExo.keys()])
    .eq("valide", true)
    .eq(colEleve, valEleve);

  const exosValides = new Set((resultats ?? []).map((r) => r.exercice_id as string));
  const nbValidesParChapitre = new Map<string, number>();
  for (const exoId of exosValides) {
    const chId = chapitreParExo.get(exoId);
    if (chId) nbValidesParChapitre.set(chId, (nbValidesParChapitre.get(chId) ?? 0) + 1);
  }

  // Diagnostics passés.
  const { data: diags } = await admin
    .from("ceinture_diagnostic")
    .select("domaine_code, ceinture_idx")
    .in("domaine_code", domaines.map((d) => d.code))
    .eq(colEleve, valEleve);

  const diagFaits = new Set(
    (diags ?? []).map((d) => `${d.domaine_code}-${d.ceinture_idx}`),
  );

  return domaines
    .map((domaine) => {
      const liensDomaine = (liens ?? []).filter((l) => l.domaine_code === domaine.code);
      const chapitreParIdx = new Map(
        liensDomaine.map((l) => [l.ceinture_idx as number, l.chapitre_id as string]),
      );

      // Un domaine n'est ouvert que si ses chapitres sont assignés à l'élève.
      const estOuvert = liensDomaine.some((l) => ouverts.has(l.chapitre_id as string));
      if (!estOuvert) return null;

      const idxReussies = [...chapitreParIdx.entries()]
        .filter(([, chId]) => chapitresReussis.has(chId))
        .map(([idx]) => idx);

      const courante = ceintureCourante(idxReussies);

      const ceintures: CeintureEtat[] = Array.from({ length: NB_CEINTURES }, (_, idx) => {
        const c = couleur(idx);
        const chapitreId = chapitreParIdx.get(idx) ?? null;
        return {
          idx,
          nom: c.nom,
          hex: c.hex,
          hexFond: c.hexFond,
          statut: statutCeinture(idx, courante),
          chapitreId,
          nbItems: nbItems.get(`${domaine.code}-${idx}`) ?? 0,
          nbValides: chapitreId ? (nbValidesParChapitre.get(chapitreId) ?? 0) : 0,
          diagnosticFait: diagFaits.has(`${domaine.code}-${idx}`),
        };
      });

      const termine = courante >= NB_CEINTURES;
      const cCourante = termine ? null : couleur(courante);

      return {
        code: domaine.code,
        slug: domaine.slug,
        nom: domaine.nom,
        matiere: domaine.matiere,
        description: domaine.description,
        icone: domaine.icone,
        courante,
        termine,
        couleurCourante: cCourante
          ? { nom: cCourante.nom, hex: cCourante.hex, hexFond: cCourante.hexFond }
          : null,
        ceintures,
      } satisfies DomaineEtat;
    })
    .filter((d): d is DomaineEtat => d !== null);
}

/**
 * Bascule sur la variante 2 les items ratés à la dernière évaluation, et
 * dévalide leurs résultats pour que l'élève les retravaille.
 *
 * Rejouable : une évaluation déjà traitée est reconnue par
 * `ceinture_variante.origine_evaluation_id`. Ne fait rien si l'élève est déjà
 * sur la variante 2 de l'item (il ne reste alors qu'à refaire l'exercice).
 *
 * Retourne le nombre d'items basculés.
 */
export async function appliquerRemediation(
  eleve: EleveRef,
  chapitreId: string,
): Promise<number> {
  const admin = createAdminClient();

  const [colEleve, valEleve] = colonneEleve(eleve);

  const { data: derniere } = await admin
    .from("evaluation_resultat")
    .select("id, reussi, exercices_echoues")
    .eq("chapitre_id", chapitreId)
    .eq(colEleve, valEleve)
    .order("created_at", { ascending: false })
    .limit(1);

  const evaluation = (derniere ?? [])[0] as
    | { id: string; reussi: boolean; exercices_echoues: string[] | null }
    | undefined;

  if (!evaluation || evaluation.reussi) return 0;

  const echoues = evaluation.exercices_echoues ?? [];
  if (!echoues.length) return 0;

  // Déjà traitée ?
  const { data: dejaFait } = await admin
    .from("ceinture_variante")
    .select("id")
    .eq("origine_evaluation_id", evaluation.id)
    .limit(1);

  if (dejaFait?.length) return 0;

  // Seuls les exercices à variantes sont concernés.
  const { data: exercices } = await admin
    .from("exercice")
    .select("id, contenu")
    .eq("chapitre_id", chapitreId)
    .in("id", echoues);

  const aBasculer = (exercices ?? []).filter((e) =>
    Array.isArray((e.contenu as Record<string, unknown>)?.variantes),
  );
  if (!aBasculer.length) return 0;

  // Pas d'upsert : les index d'unicité sont PARTIELS (`where eleve_id is not
  // null`), et PostgREST ne sait pas les viser par `onConflict`. On remplace.
  await admin
    .from("ceinture_variante")
    .delete()
    .in("exercice_id", aBasculer.map((e) => e.id))
    .eq(colEleve, valEleve);

  const { error: errVar } = await admin.from("ceinture_variante").insert(
    aBasculer.map((e) => ({
      eleve_id: eleve.eleveId,
      rb_eleve_id: eleve.rbEleveId,
      exercice_id: e.id,
      variante: 2,
      origine_evaluation_id: evaluation.id,
    })),
  );
  if (errVar) {
    console.error("[ceintures] remediation ceinture_variante:", errVar.message);
    return 0;
  }

  // Dévalider : l'élève doit refaire l'item avant de repasser l'évaluation.
  // Le déblocage séquentiel rouvre alors la chaîne à partir de cet item.
  const { error: errRes } = await admin
    .from("exercice_resultat")
    .update({ valide: false })
    .in("exercice_id", aBasculer.map((e) => e.id))
    .eq(colEleve, valEleve);

  if (errRes) console.error("[ceintures] remediation exercice_resultat:", errRes.message);

  return aBasculer.length;
}

export function domainesActifs(): DomaineCeinture[] {
  return DOMAINES;
}
