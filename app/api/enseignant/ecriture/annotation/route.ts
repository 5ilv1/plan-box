import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant, requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { champsReprise } from "@/lib/suivi-metriques";
import {
  normaliserContenuEcriture,
  dateStr,
  type AnnotationEnseignant,
} from "@/lib/ecriture-normaliser";

/**
 * CRUD des annotations enseignant sur un bloc d'écriture.
 *
 * POST   : créer une ou plusieurs annotations
 *          Body : { blocId, annotations: AnnotationEnseignantCreate[] }
 *          → { ok, annotations, statut, remisAFaire }
 *
 *          Une annotation porte une correction, un commentaire, ou les deux.
 *          Sans passage (`extrait` vide), c'est une remarque sur tout le texte.
 *
 *          ⚠️ Sur un texte du JOUR déjà terminé, annoter le remet à faire : la
 *          remarque n'a de sens que si l'élève y revient. L'atelier de la
 *          semaine n'est pas concerné — l'annoter est son cours normal, et sa
 *          version finale est définitive.
 *
 * PATCH  : modifier une annotation existante
 *          Body : { blocId, id, suggestion?, commentaire?, statut? }
 *
 * DELETE : supprimer une annotation
 *          Body : { blocId, id }
 */

type AnnotationCreate = Omit<AnnotationEnseignant, "id" | "date" | "statut"> & {
  statut?: AnnotationEnseignant["statut"];
};

async function chargerBloc(blocId: string) {
  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu, statut, eleve_id, repetibox_eleve_id")
    .eq("id", blocId)
    .single();
  if (error || !bloc) return { erreur: "Bloc introuvable", status: 404 as const };
  return { bloc, admin };
}

function genererId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { blocId, annotations } = (await req.json()) as {
    blocId?: string;
    annotations?: AnnotationCreate[];
  };

  if (!blocId || !Array.isArray(annotations) || annotations.length === 0) {
    return NextResponse.json({ erreur: "blocId et annotations requis" }, { status: 400 });
  }

  const res = await chargerBloc(blocId);
  if ("erreur" in res) return NextResponse.json({ erreur: res.erreur }, { status: res.status });
  const { bloc, admin } = res;

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);

  const aujourdhui = dateStr();
  const nouvelles: AnnotationEnseignant[] = [];
  for (const a of annotations) {
    const extrait = typeof a.extrait === "string" ? a.extrait : "";
    const suggestion = typeof a.suggestion === "string" ? a.suggestion.trim() : "";
    const commentaire = typeof a.commentaire === "string" ? a.commentaire.trim() : "";
    // Une annotation vide ne dit rien à l'élève ; une correction sans passage
    // ne saurait pas quoi remplacer.
    if (!suggestion && !commentaire) continue;
    if (suggestion && !extrait) continue;
    nouvelles.push({
      id: genererId(),
      date: aujourdhui,
      debut: extrait ? a.debut : 0,
      fin: extrait ? a.fin : 0,
      extrait,
      suggestion,
      commentaire: commentaire || undefined,
      statut: a.statut ?? "nouvelle",
    });
  }
  if (nouvelles.length === 0) {
    return NextResponse.json({ erreur: "Une correction ou un commentaire est requis" }, { status: 400 });
  }

  contenu.annotations = [...contenu.annotations, ...nouvelles];

  const remisAFaire = contenu.mode === "jour" && bloc.statut === "fait";
  const champs: Record<string, unknown> = { contenu };
  if (remisAFaire) Object.assign(champs, { statut: "a_faire" }, champsReprise());

  const { error: errMaj } = await admin.from("plan_travail").update(champs).eq("id", blocId);
  if (errMaj) {
    return NextResponse.json({ erreur: errMaj.message }, { status: 500 });
  }

  if (remisAFaire) {
    // Sans ce mot, l'élève ne saurait pas pourquoi un travail fini réapparaît.
    await admin.from("notifications").insert({
      type: "rappel",
      eleve_id: bloc.repetibox_eleve_id ? null : bloc.eleve_id,
      rb_eleve_id: bloc.repetibox_eleve_id ?? null,
      message: "Le maître a relu ton texte d'écriture : lis ses remarques et reprends-le.",
      lu: false,
    });
  }

  // Enrichit le référentiel enseignant pour les prochaines suggestions IA —
  // seulement les vraies corrections : un commentaire seul n'en est pas une.
  const corrections = nouvelles.filter((a) => a.suggestion);
  if (corrections.length > 0) {
    await admin.from("ecriture_corrections_enseignant").insert(
      corrections.map((a) => ({
        extrait: a.extrait,
        suggestion: a.suggestion,
        commentaire: a.commentaire ?? null,
      }))
    );
  }

  return NextResponse.json({
    ok: true,
    annotations: nouvelles,
    statut: remisAFaire ? "a_faire" : bloc.statut,
    remisAFaire,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { blocId, id, suggestion, commentaire, statut, eleveRbId } = body as {
    blocId?: string;
    id?: string;
    suggestion?: string;
    commentaire?: string;
    statut?: AnnotationEnseignant["statut"];
    eleveRbId?: number;
  };

  if (!blocId || !id) {
    return NextResponse.json({ erreur: "blocId et id requis" }, { status: 400 });
  }

  // PATCH est autorisé aussi pour l'élève (pour marquer comme "acceptee"/"ignoree"/"lue")
  // On accepte donc soit l'enseignant authentifié, soit un eleveRbId correspondant.
  const admin = createAdminClient();
  const { data: bloc, error } = await admin
    .from("plan_travail")
    .select("id, contenu, repetibox_eleve_id, eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  // Si le caller est un élève, seules les modifs de statut sont permises.
  // Il prouve qu'il est l'élève par sa SESSION : l'`eleveRbId` du corps se
  // falsifiait, et suffisait à modifier les annotations de n'importe qui.
  const caller = eleveRbId !== undefined ? "eleve" : "enseignant";
  if (caller === "eleve") {
    const garde = await requireProprietaireOuEnseignant(bloc.eleve_id, bloc.repetibox_eleve_id);
    if (garde.error) return garde.error;
    if (suggestion !== undefined || commentaire !== undefined) {
      return NextResponse.json(
        { erreur: "L'élève ne peut modifier que le statut" },
        { status: 403 }
      );
    }
  } else {
    const auth = await requireEnseignant();
    if (auth.error) return auth.error;
  }

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  const idx = contenu.annotations.findIndex((a) => a.id === id);
  if (idx < 0) {
    return NextResponse.json({ erreur: "Annotation introuvable" }, { status: 404 });
  }

  const prev = contenu.annotations[idx];
  contenu.annotations[idx] = {
    ...prev,
    suggestion: suggestion ?? prev.suggestion,
    commentaire: commentaire ?? prev.commentaire,
    statut: statut ?? prev.statut,
  };

  await admin.from("plan_travail").update({ contenu }).eq("id", blocId);

  return NextResponse.json({ ok: true, annotation: contenu.annotations[idx] });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json();
  const { blocId, id } = body as { blocId?: string; id?: string };
  if (!blocId || !id) {
    return NextResponse.json({ erreur: "blocId et id requis" }, { status: 400 });
  }

  const res = await chargerBloc(blocId);
  if ("erreur" in res) return NextResponse.json({ erreur: res.erreur }, { status: res.status });
  const { bloc, admin } = res;

  const contenu = normaliserContenuEcriture(bloc.contenu as Record<string, unknown>);
  const before = contenu.annotations.length;
  contenu.annotations = contenu.annotations.filter((a) => a.id !== id);

  if (contenu.annotations.length === before) {
    return NextResponse.json({ erreur: "Annotation introuvable" }, { status: 404 });
  }

  await admin.from("plan_travail").update({ contenu }).eq("id", blocId);

  return NextResponse.json({ ok: true });
}
