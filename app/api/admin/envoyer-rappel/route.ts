import { createAdminClient } from "@/lib/supabase-admin";
import { NextRequest, NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { decouperUid } from "@/lib/suivi-metriques";

/**
 * POST /api/admin/envoyer-rappel
 *
 * Dépose une notification dans le tableau de bord de l'élève.
 *
 * `eleveId` est un identifiant préfixé (`pb_<uuid>` ou `rb_<id>`) : les deux
 * sources d'élèves cohabitent, et la table a une colonne pour chacune. Passer
 * le préfixe brut à la colonne uuid faisait échouer l'insertion sans bruit.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await req.json();
  const { eleveId, chapitreId, message } = body;

  if (!eleveId || !chapitreId || !message) {
    return NextResponse.json(
      { erreur: "eleveId, chapitreId et message sont requis" },
      { status: 400 }
    );
  }

  const cible = decouperUid(String(eleveId));
  if (!cible) {
    return NextResponse.json(
      { erreur: "eleveId doit être préfixé (pb_… ou rb_…)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("notifications").insert({
    type: "rappel",
    eleve_id: cible.source === "planbox" ? cible.id : null,
    rb_eleve_id: cible.source === "repetibox" ? Number(cible.id) : null,
    chapitre_id: chapitreId,
    message,
    lu: false,
  });

  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
