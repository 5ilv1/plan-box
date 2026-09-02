import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  assurerMotDuJour,
  dateDuJour,
  etatPartie,
  filtreEleve,
  resoudreEleveCourant,
} from "@/lib/motus";

/**
 * GET /api/motus → l'état de la partie du jour pour l'élève connecté.
 *
 * Le mot secret n'est renvoyé que si la partie est terminée (trouvé ou
 * 6 essais). Tant qu'elle est en cours, le client ne connaît que la longueur,
 * la première lettre et les couleurs de ses essais passés.
 */
export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const eleve = await resoudreEleveCourant(admin, user.id);
  if (!eleve) {
    return NextResponse.json({ erreur: "Élève inconnu" }, { status: 403 });
  }

  const date = dateDuJour();
  const motDuJour = await assurerMotDuJour(admin, date);
  if (!motDuJour) {
    return NextResponse.json({ aucun_mot: true, date });
  }

  const [col, val] = filtreEleve(eleve);
  const { data: partie } = await admin
    .from("motus_partie")
    .select("essais")
    .eq("date", date)
    .eq(col, val)
    .maybeSingle();

  const essais = Array.isArray(partie?.essais) ? (partie!.essais as string[]) : [];
  return NextResponse.json(etatPartie(date, motDuJour.mot, essais));
}
