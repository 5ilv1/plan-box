import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { NIVEAUX_IDS, assurerCalculDuJour } from "@/lib/calcul-jour";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // --- Détecter le niveau de l'élève (même logique que daily-problem) ---
  let niveau = "CM1";
  let niveauId = NIVEAUX_IDS["CM1"];
  let eleveId: string | null = null;
  let rbEleveId: number | null = null;

  const { data: elevePB } = await admin
    .from("eleves")
    .select("id, niveau_id, niveaux(nom)")
    .eq("id", user.id)
    .maybeSingle();

  if (elevePB) {
    eleveId = elevePB.id;
    const niveauNom: string = (elevePB as any).niveaux?.nom ?? "";
    const matchCM = niveauNom.match(/CM[12]/i);
    const matchCE2 = niveauNom.match(/CE2/i);
    if (matchCM) {
      niveau = matchCM[0].toUpperCase();
    } else if (matchCE2) {
      niveau = "CE2";
    }
    niveauId = NIVEAUX_IDS[niveau] || NIVEAUX_IDS["CM1"];
  } else {
    // Repetibox : eleve.auth_id
    const { data: eleveRBData } = await admin
      .from("eleve")
      .select("id, classe_id")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (eleveRBData) {
      rbEleveId = eleveRBData.id;

      // Chercher dans les groupes (table : eleve_groupe, FK : repetibox_eleve_id)
      const { data: groupeEleve } = await admin
        .from("eleve_groupe")
        .select("groupe_id, groupes:groupe_id(nom)")
        .eq("repetibox_eleve_id", eleveRBData.id)
        .limit(10);

      let foundFromGroupe = false;
      for (const ge of groupeEleve ?? []) {
        const groupeNom = (ge as any).groupes?.nom ?? "";
        const matchCM = groupeNom.match(/CM[12]/i);
        if (matchCM) {
          niveau = matchCM[0].toUpperCase();
          foundFromGroupe = true;
          break;
        }
        const matchCE2 = groupeNom.match(/CE2/i);
        if (matchCE2) {
          niveau = "CE2";
          foundFromGroupe = true;
          break;
        }
      }

      // Fallback : nom de classe
      if (!foundFromGroupe) {
        const { data: classe } = await admin
          .from("classe")
          .select("nom")
          .eq("id", eleveRBData.classe_id)
          .single();
        const matchCM = classe?.nom?.match(/CM[12]/i);
        const matchCE2 = classe?.nom?.match(/CE2/i);
        if (matchCM) {
          niveau = matchCM[0].toUpperCase();
        } else if (matchCE2) {
          niveau = "CE2";
        }
      }

      niveauId = NIVEAUX_IDS[niveau] || NIVEAUX_IDS["CM1"];
    }
  }

  const today = new Date().toISOString().split("T")[0];

  // Vérifier si l'élève a déjà un résultat correct aujourd'hui
  const { data: existingCalcul } = await admin
    .from("calcul_jour")
    .select("*")
    .eq("date", today)
    .eq("niveau_id", niveauId)
    .maybeSingle();

  if (existingCalcul) {
    // Chercher le résultat de cet élève
    let resultQuery = admin
      .from("calcul_jour_resultat")
      .select("*")
      .eq("calcul_id", existingCalcul.id);

    if (eleveId) {
      resultQuery = resultQuery.eq("eleve_id", eleveId);
    } else if (rbEleveId) {
      resultQuery = resultQuery.eq("rb_eleve_id", rbEleveId);
    }

    const { data: resultats } = await resultQuery;

    const dernierResultat = resultats?.sort((a: any, b: any) => b.tentative - a.tentative)[0];

    if (dernierResultat?.correct) {
      return NextResponse.json({
        id: existingCalcul.id,
        deja_fait: true,
        correct: true,
        reponse: existingCalcul.reponse,
        operation: existingCalcul.operation,
        nombre1: existingCalcul.nombre1,
        nombre2: existingCalcul.nombre2,
      });
    }

    const nbTentatives = resultats?.length ?? 0;
    const tentativesRestantes = Math.max(0, 2 - nbTentatives);

    return NextResponse.json({
      id: existingCalcul.id,
      operation: existingCalcul.operation,
      nombre1: existingCalcul.nombre1,
      nombre2: existingCalcul.nombre2,
      niveau,
      date: existingCalcul.date,
      tentatives_restantes: tentativesRestantes,
      // Si plus de tentatives, inclure la réponse pour la correction
      ...(tentativesRestantes === 0 ? { reponse: existingCalcul.reponse } : {}),
    });
  }

  // Pas de calcul pour aujourd'hui → en générer un (logique partagée avec le cron)
  const resultat = await assurerCalculDuJour(admin, niveauId, today);
  if ("inactif" in resultat) {
    return NextResponse.json({ inactif: true, message: "Le calcul du jour n'est pas activé pour ce niveau." });
  }

  const newCalc = resultat.row;
  return NextResponse.json({
    id: newCalc.id,
    operation: newCalc.operation,
    nombre1: newCalc.nombre1,
    nombre2: newCalc.nombre2,
    niveau,
    date: newCalc.date,
    tentatives_restantes: 2,
  });
}
