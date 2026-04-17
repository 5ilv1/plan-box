import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json();
  const { calcul_id, reponse_eleve, temps_reponse } = body;

  if (!calcul_id || reponse_eleve === undefined || reponse_eleve === null) {
    return NextResponse.json({ error: "calcul_id et reponse_eleve requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupérer le calcul
  const { data: calcul, error: calculError } = await admin
    .from("calcul_jour")
    .select("*")
    .eq("id", calcul_id)
    .single();

  if (calculError || !calcul) {
    return NextResponse.json({ error: "Calcul introuvable" }, { status: 404 });
  }

  // Récupérer la config du niveau pour les décimales
  const { data: configData } = await admin
    .from("calcul_jour_config")
    .select("nb_decimales, decimales")
    .eq("niveau_id", calcul.niveau_id)
    .maybeSingle();

  // Identifier l'élève (PlanBox ou Repetibox)
  let eleveId: string | null = null;
  let rbEleveId: number | null = null;

  const { data: elevePB } = await admin
    .from("eleves")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (elevePB) {
    eleveId = elevePB.id;
  } else {
    const { data: eleveRB } = await admin
      .from("eleve")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();
    if (eleveRB) {
      rbEleveId = eleveRB.id;
    }
  }

  // Compter les tentatives existantes pour cet élève
  let tentativeQuery = admin
    .from("calcul_jour_resultat")
    .select("*")
    .eq("calcul_id", calcul_id);

  if (eleveId) {
    tentativeQuery = tentativeQuery.eq("eleve_id", eleveId);
  } else if (rbEleveId) {
    tentativeQuery = tentativeQuery.eq("rb_eleve_id", rbEleveId);
  } else {
    return NextResponse.json({ error: "Élève non trouvé" }, { status: 404 });
  }

  const { data: tentatives } = await tentativeQuery;

  // Protection anti double-submit : ignorer une soumission identique reçue
  // dans les 2 dernières secondes (évite les doublons lors d'un double-clic /
  // double-appel en cas de race condition côté client).
  const reponseNumCheck = parseFloat(String(reponse_eleve));
  const maintenant = Date.now();
  const doublon = tentatives?.find((t: any) => {
    if (!t.created_at) return false;
    const dt = maintenant - new Date(t.created_at).getTime();
    return dt < 2000 && Number(t.reponse_eleve) === reponseNumCheck;
  });
  if (doublon) {
    return NextResponse.json({
      correct: doublon.correct,
      tentative: doublon.tentative,
      doublon: true,
      ...(doublon.correct
        ? {}
        : doublon.tentative === 1
          ? { encore_une_chance: true }
          : {
              correction: {
                nombre1: calcul.nombre1,
                nombre2: calcul.nombre2,
                operation: calcul.operation,
                reponse: calcul.reponse,
              },
            }),
    });
  }

  const nbTentatives = tentatives?.length ?? 0;

  // Vérifier si déjà réussi
  const dejaReussi = tentatives?.some((t: any) => t.correct);
  if (dejaReussi) {
    return NextResponse.json({
      deja_fait: true,
      correct: true,
      reponse: calcul.reponse,
    });
  }

  // Max 2 tentatives
  if (nbTentatives >= 2) {
    return NextResponse.json({
      correct: false,
      tentative: 2,
      max_atteint: true,
      correction: {
        nombre1: calcul.nombre1,
        nombre2: calcul.nombre2,
        operation: calcul.operation,
        reponse: calcul.reponse,
      },
    });
  }

  // Comparer la réponse
  const nbDecimales = configData?.nb_decimales ?? 0;
  const useDecimales = configData?.decimales ?? false;

  let correct: boolean;
  const reponseNum = parseFloat(String(reponse_eleve));

  if (isNaN(reponseNum)) {
    correct = false;
  } else if (useDecimales && nbDecimales > 0) {
    const factor = Math.pow(10, nbDecimales);
    correct = Math.round(reponseNum * factor) === Math.round(calcul.reponse * factor);
  } else {
    correct = Math.round(reponseNum) === Math.round(calcul.reponse);
  }

  const tentativeNum = nbTentatives + 1;

  // Insérer le résultat
  const { error: insertError } = await admin
    .from("calcul_jour_resultat")
    .insert({
      calcul_id,
      eleve_id: eleveId,
      rb_eleve_id: rbEleveId,
      reponse_eleve: reponseNum,
      correct,
      tentative: tentativeNum,
      temps_reponse: temps_reponse ? Math.round(Number(temps_reponse)) : null,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (correct) {
    return NextResponse.json({ correct: true, tentative: tentativeNum });
  }

  if (tentativeNum === 1) {
    return NextResponse.json({
      correct: false,
      tentative: 1,
      encore_une_chance: true,
    });
  }

  // Tentative 2 incorrecte → correction
  return NextResponse.json({
    correct: false,
    tentative: 2,
    correction: {
      nombre1: calcul.nombre1,
      nombre2: calcul.nombre2,
      operation: calcul.operation,
      reponse: calcul.reponse,
    },
  });
}
