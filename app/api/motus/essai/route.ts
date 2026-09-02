import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  ESSAIS_MAX,
  assurerMotDuJour,
  dateDuJour,
  etatPartie,
  filtreEleve,
  motExiste,
  normaliserMot,
  resoudreEleveCourant,
} from "@/lib/motus";

/**
 * POST /api/motus/essai { mot } → enregistre une proposition et renvoie le
 * nouvel état de la partie.
 *
 * Toute la vérification est ici : le navigateur ne connaît pas le mot secret,
 * il ne peut donc ni colorier lui-même la grille ni se déclarer gagnant. Les
 * essais sont stockés, l'élève retrouve sa partie s'il recharge la page.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const eleve = await resoudreEleveCourant(admin, user.id);
  if (!eleve) {
    return NextResponse.json({ erreur: "Élève inconnu" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const proposition = normaliserMot(String(body?.mot ?? ""));

  const date = dateDuJour();
  const motDuJour = await assurerMotDuJour(admin, date);
  if (!motDuJour) {
    return NextResponse.json({ aucun_mot: true, date });
  }
  const secret = motDuJour.mot;

  const [col, val] = filtreEleve(eleve);
  const { data: partie } = await admin
    .from("motus_partie")
    .select("id, essais")
    .eq("date", date)
    .eq(col, val)
    .maybeSingle();

  const essais = Array.isArray(partie?.essais) ? ([...(partie!.essais as string[])]) : [];
  const dejaTermine = essais.includes(secret) || essais.length >= ESSAIS_MAX;
  if (dejaTermine) {
    return NextResponse.json(etatPartie(date, secret, essais));
  }

  if (proposition.length !== secret.length) {
    return NextResponse.json(
      { erreur: `Le mot doit faire ${secret.length} lettres.`, ...etatPartie(date, secret, essais) },
      { status: 400 },
    );
  }
  if (proposition[0] !== secret[0]) {
    return NextResponse.json(
      { erreur: `Le mot commence par ${secret[0]}.`, ...etatPartie(date, secret, essais) },
      { status: 400 },
    );
  }
  // Une suite de lettres au hasard ne coûte pas un essai : elle est refusée
  // avant d'être enregistrée. Le mot du jour échappe au dictionnaire, sinon un
  // mot choisi par l'enseignant et absent de la liste serait invalidable.
  if (proposition !== secret && !(await motExiste(admin, proposition))) {
    return NextResponse.json(
      { erreur: `« ${proposition} » n'est pas un mot.`, ...etatPartie(date, secret, essais) },
      { status: 400 },
    );
  }

  essais.push(proposition);
  const trouve = proposition === secret;
  const termine = trouve || essais.length >= ESSAIS_MAX;

  // Pas d'upsert : les index d'unicité de motus_partie sont partiels
  // (eleve_id / rb_eleve_id), onConflict ne sait pas les viser.
  if (partie?.id) {
    await admin
      .from("motus_partie")
      .update({ essais, trouve, termine, maj_le: new Date().toISOString() })
      .eq("id", partie.id);
  } else {
    const { error } = await admin.from("motus_partie").insert({
      date,
      eleve_id: eleve.eleveId,
      rb_eleve_id: eleve.rbEleveId,
      essais,
      trouve,
      termine,
    });
    // Deux onglets ouverts sur la même partie : l'index d'unicité tranche et on
    // repart de la ligne enregistrée plutôt que de perdre l'essai précédent.
    if (error) {
      const { data: relu } = await admin
        .from("motus_partie")
        .select("essais")
        .eq("date", date)
        .eq(col, val)
        .maybeSingle();
      const essaisRelus = Array.isArray(relu?.essais) ? (relu!.essais as string[]) : essais;
      return NextResponse.json(etatPartie(date, secret, essaisRelus));
    }
  }

  return NextResponse.json(etatPartie(date, secret, essais));
}
