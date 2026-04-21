import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import {
  normaliserContenuEcriture,
  dateStr,
  type AnnotationEnseignant,
} from "@/lib/ecriture-normaliser";

/**
 * CRUD des annotations enseignant sur un bloc écriture mode semaine.
 *
 * POST   : créer une ou plusieurs annotations
 *          Body : { blocId, annotations: AnnotationEnseignantCreate[] }
 *          → { ok, annotations }
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
    .select("id, contenu")
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
  const nouvelles: AnnotationEnseignant[] = annotations.map((a) => ({
    id: genererId(),
    date: aujourdhui,
    debut: a.debut,
    fin: a.fin,
    extrait: a.extrait,
    suggestion: a.suggestion,
    commentaire: a.commentaire,
    statut: a.statut ?? "nouvelle",
  }));

  contenu.annotations = [...contenu.annotations, ...nouvelles];

  await admin.from("plan_travail").update({ contenu }).eq("id", blocId);

  // Enrichit le référentiel enseignant pour les prochaines suggestions IA
  await admin.from("ecriture_corrections_enseignant").insert(
    nouvelles.map((a) => ({
      extrait: a.extrait,
      suggestion: a.suggestion,
      commentaire: a.commentaire ?? null,
    }))
  );

  return NextResponse.json({ ok: true, annotations: nouvelles });
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
    .select("id, contenu, repetibox_eleve_id")
    .eq("id", blocId)
    .single();

  if (error || !bloc) {
    return NextResponse.json({ erreur: "Bloc introuvable" }, { status: 404 });
  }

  // Si le caller est un élève Repetibox, seules les modifs de statut sont permises
  const caller = eleveRbId !== undefined ? "eleve" : "enseignant";
  if (caller === "eleve") {
    if (bloc.repetibox_eleve_id !== eleveRbId) {
      return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
    }
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
