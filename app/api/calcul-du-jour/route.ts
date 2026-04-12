import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import type { CalculJourConfig, OperationCalcul } from "@/types";

const NIVEAUX_IDS: Record<string, string> = {
  CE2: "11111111-0000-0000-0000-000000000001",
  CM1: "11111111-0000-0000-0000-000000000002",
  CM2: "11111111-0000-0000-0000-000000000003",
};

const DEFAULT_CONFIG = {
  operations: [] as OperationCalcul[],
  decimales: false,
  decimales_mode: "aucun",
  nb_decimales: 0,
  nombre_min: 1,
  nombre_max: 100,
  nombre2_min: 1,
  nombre2_max: 100,
  actif: false,
};

function genererCalcul(config: {
  operations: OperationCalcul[];
  decimales_mode: string;
  nb_decimales: number;
  nombre_min: number;
  nombre_max: number;
  nombre2_min: number;
  nombre2_max: number;
}): { nombre1: number; nombre2: number; operation: OperationCalcul; reponse: number } {
  const op = config.operations[Math.floor(Math.random() * config.operations.length)];
  let n1: number, n2: number, reponse: number;

  const n1Decimal = config.decimales_mode === "premier_nombre" || config.decimales_mode === "les_deux";
  const n2Decimal = config.decimales_mode === "les_deux";
  const nbDec = (n1Decimal || n2Decimal) && config.nb_decimales === 0 ? 1 : config.nb_decimales;
  const factor = Math.pow(10, nbDec);

  if (n1Decimal) {
    n1 = Math.round((config.nombre_min + Math.random() * (config.nombre_max - config.nombre_min)) * factor) / factor;
  } else {
    n1 = Math.floor(config.nombre_min + Math.random() * (config.nombre_max - config.nombre_min + 1));
  }
  if (n2Decimal) {
    n2 = Math.round((config.nombre2_min + Math.random() * (config.nombre2_max - config.nombre2_min)) * factor) / factor;
  } else {
    n2 = Math.floor(config.nombre2_min + Math.random() * (config.nombre2_max - config.nombre2_min + 1));
  }

  switch (op) {
    case "addition":
      reponse = n1 + n2;
      break;
    case "soustraction":
      if (n1 < n2) [n1, n2] = [n2, n1];
      reponse = n1 - n2;
      break;
    case "multiplication":
      reponse = n1 * n2;
      break;
    case "division": {
      // Pour que la division soit "propre" : n1 est un multiple de n2
      const n2Min = Math.max(2, config.nombre2_min);
      const n2Max = Math.max(n2Min, config.nombre2_max);
      n2 = Math.floor(n2Min + Math.random() * (n2Max - n2Min + 1));
      if (n2 < 2) n2 = 2;
      const minMultiplier = Math.max(1, Math.ceil(config.nombre_min / n2));
      const maxMultiplier = Math.floor(config.nombre_max / n2);
      const multiplier = Math.floor(minMultiplier + Math.random() * (maxMultiplier - minMultiplier + 1));
      n1 = n2 * (multiplier || 1);
      if (n1 === 0) n1 = n2;
      reponse = n1 / n2;
      break;
    }
  }

  if (n1Decimal || n2Decimal) {
    reponse = Math.round(reponse * factor) / factor;
  }

  return { nombre1: n1, nombre2: n2, operation: op, reponse };
}

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

      // Chercher dans les groupes
      const { data: groupeEleve } = await admin
        .from("groupe_eleve")
        .select("groupe_id, groupe:groupe_id(nom)")
        .eq("eleve_id", eleveRBData.id)
        .limit(10);

      let foundFromGroupe = false;
      for (const ge of groupeEleve ?? []) {
        const groupeNom = (ge as any).groupe?.nom ?? "";
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

  // Pas de calcul pour aujourd'hui → en générer un
  // Récupérer la config du niveau
  const { data: configData } = await admin
    .from("calcul_jour_config")
    .select("*")
    .eq("niveau_id", niveauId)
    .maybeSingle();

  const config = configData ?? { ...DEFAULT_CONFIG, niveau_id: niveauId };

  if ((!config.actif && configData) || !config.operations || config.operations.length === 0) {
    return NextResponse.json({ inactif: true, message: "Le calcul du jour n'est pas activé pour ce niveau." });
  }

  const calcul = genererCalcul({
    operations: config.operations,
    decimales_mode: config.decimales_mode ?? "aucun",
    nb_decimales: config.nb_decimales,
    nombre_min: config.nombre_min,
    nombre_max: config.nombre_max,
    nombre2_min: config.nombre2_min ?? config.nombre_min,
    nombre2_max: config.nombre2_max ?? config.nombre_max,
  });

  const { data: newCalcTmp, error: insertError } = await admin
    .from("calcul_jour")
    .upsert(
      {
        date: today,
        niveau_id: niveauId,
        operation: calcul.operation,
        nombre1: calcul.nombre1,
        nombre2: calcul.nombre2,
        reponse: calcul.reponse,
      },
      { onConflict: "date,niveau_id" }
    )
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    id: newCalcTmp.id,
    operation: newCalcTmp.operation,
    nombre1: newCalcTmp.nombre1,
    nombre2: newCalcTmp.nombre2,
    niveau,
    date: newCalcTmp.date,
    tentatives_restantes: 2,
  });
}
