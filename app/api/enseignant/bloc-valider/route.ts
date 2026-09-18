import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { champsTerminaison } from "@/lib/suivi-metriques";
import { cleActivite } from "@/lib/reprise";
import { progresDepuisBloc, progresDepuisReprise, type ProgresPartiel } from "@/lib/progres-partiel";

/**
 * Clore un travail qu'un élève ne peut pas terminer.
 *
 * Il arrive qu'un exercice soit **infaisable** : un groupe mal placé dans une
 * analyse de phrase, une réponse attendue fautive. L'élève a fait neuf
 * questions sur dix et reste bloqué devant la dernière. Sans cette route, ses
 * seules issues étaient de laisser le travail en retard indéfiniment, ou de le
 * refaire depuis le début — pour se heurter au même mur.
 *
 * `GET  ?id=<bloc>` dit ce qui est su du travail, pour que l'écran le montre.
 * `POST { id, bon, total }` enregistre la note et clôt le bloc.
 *
 * ⚠️ La note enregistrée est **rapportée à ce qui a été fait** : neuf justes
 * sur neuf tentées font 9/9, pas 9/10. Compter la dixième contre l'élève
 * reviendrait à lui faire payer un exercice cassé.
 */

/** Ce que l'on sait du travail en cours, sans rien décider. */
async function releverProgres(blocId: string) {
  const admin = createAdminClient();

  const { data: bloc } = await admin
    .from("plan_travail")
    .select("id, type, titre, statut, contenu, duree_secondes, eleve_id, repetibox_eleve_id")
    .eq("id", blocId)
    .single();
  if (!bloc) return { bloc: null, progres: null as ProgresPartiel | null };

  // D'abord le bloc : un travail « en cours » peut déjà porter un score —
  // l'élève avait fini, mais sous le seuil de réussite.
  let progres = progresDepuisBloc(bloc.contenu);

  // Sinon, le travail laissé en route. C'est le cas qui nous intéresse : il
  // n'existe nulle part ailleurs que dans la reprise.
  if (!progres) {
    let q = admin
      .from("exercice_reprise")
      .select("etat")
      .eq("cle", cleActivite(blocId));
    q = bloc.repetibox_eleve_id != null
      ? q.eq("rb_eleve_id", bloc.repetibox_eleve_id)
      : q.eq("eleve_id", bloc.eleve_id);

    const { data: reprise } = await q.maybeSingle();
    if (reprise?.etat) progres = progresDepuisReprise(bloc.type, reprise.etat, bloc.contenu);
  }

  return { bloc, progres };
}

export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const { bloc, progres } = await releverProgres(id);
  if (!bloc) return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });

  return NextResponse.json({ titre: bloc.titre, type: bloc.type, statut: bloc.statut, progres });
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) return NextResponse.json({ erreur: "id requis" }, { status: 400 });

  const { bloc } = await releverProgres(id);
  if (!bloc) return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });

  // Les deux nombres viennent de l'écran : l'enseignant a vu le relevé et a pu
  // le corriger. On les vérifie quand même — ils deviennent une note.
  const bon = Number(body?.bon);
  const total = Number(body?.total);
  if (!Number.isInteger(bon) || !Number.isInteger(total) || total <= 0 || bon < 0 || bon > total) {
    return NextResponse.json(
      { erreur: "Note invalide : « bon » doit être un entier compris entre 0 et « total »." },
      { status: 400 }
    );
  }

  const contenu = { ...((bloc.contenu ?? {}) as Record<string, unknown>) };
  contenu.score_eleve = bon;
  contenu.score_total = total;
  contenu.premier_score = bon;
  contenu.premier_score_total = total;
  // La trace de la décision : sans elle, un 9/9 ressemblerait plus tard à un
  // sans-faute ordinaire, et personne ne saurait que l'exercice était cassé.
  contenu.valide_par_enseignant = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("plan_travail")
    .update({
      statut: "fait",
      contenu,
      // La durée reste celle que l'élève a réellement passée : elle n'est pas
      // remise à zéro, sinon le signal « travail expédié » deviendrait faux.
      ...champsTerminaison(bloc.duree_secondes as number | null | undefined),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  // Le travail est clos : la reprise n'a plus d'objet, et la laisser
  // rouvrirait l'exercice cassé au prochain passage de l'élève.
  let suppr = admin.from("exercice_reprise").delete().eq("cle", cleActivite(id));
  suppr = bloc.repetibox_eleve_id != null
    ? suppr.eq("rb_eleve_id", bloc.repetibox_eleve_id)
    : suppr.eq("eleve_id", bloc.eleve_id);
  await suppr;

  return NextResponse.json({ ok: true, bon, total });
}
