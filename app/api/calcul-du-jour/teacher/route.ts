import { NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import type { OperationCalcul } from "@/types";

const NIVEAUX_IDS: Record<string, string> = {
  CE2: "11111111-0000-0000-0000-000000000001",
  CM1: "11111111-0000-0000-0000-000000000002",
  CM2: "11111111-0000-0000-0000-000000000003",
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
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Récupérer les configs
  const { data: configs } = await admin
    .from("calcul_jour_config")
    .select("*, niveaux(nom)")
    .order("niveau_id");

  // Auto-générer les calculs manquants pour les niveaux actifs
  const { data: existingCalculs } = await admin
    .from("calcul_jour")
    .select("niveau_id")
    .eq("date", today);

  const existingNiveaux = new Set((existingCalculs ?? []).map((c: any) => c.niveau_id));

  for (const cfg of configs ?? []) {
    if (!cfg.actif || !cfg.operations || cfg.operations.length === 0) continue;
    if (existingNiveaux.has(cfg.niveau_id)) continue;

    const calcul = genererCalcul({
      operations: cfg.operations,
      decimales_mode: cfg.decimales_mode ?? "aucun",
      nb_decimales: cfg.nb_decimales,
      nombre_min: cfg.nombre_min,
      nombre_max: cfg.nombre_max,
      nombre2_min: cfg.nombre2_min ?? cfg.nombre_min,
      nombre2_max: cfg.nombre2_max ?? cfg.nombre_max,
    });

    await admin
      .from("calcul_jour")
      .upsert(
        {
          date: today,
          niveau_id: cfg.niveau_id,
          operation: calcul.operation,
          nombre1: calcul.nombre1,
          nombre2: calcul.nombre2,
          reponse: calcul.reponse,
        },
        { onConflict: "date,niveau_id" }
      );
  }

  // Récupérer tous les calculs du jour (y compris ceux qu'on vient de créer)
  const { data: calculs, error: calculsError } = await admin
    .from("calcul_jour")
    .select("*, niveaux(nom)")
    .eq("date", today)
    .order("niveau_id");

  if (calculsError) {
    return NextResponse.json({ error: calculsError.message }, { status: 500 });
  }

  // Récupérer les résultats des élèves
  const calculIds = calculs?.map((c: any) => c.id) ?? [];
  let resultats: any[] = [];

  if (calculIds.length > 0) {
    const { data: resultatsData } = await admin
      .from("calcul_jour_resultat")
      .select("*")
      .in("calcul_id", calculIds)
      .order("created_at", { ascending: true });

    if (resultatsData) {
      const eleveIds = [...new Set(resultatsData.filter((r: any) => r.eleve_id).map((r: any) => r.eleve_id))];
      const rbEleveIds = [...new Set(resultatsData.filter((r: any) => r.rb_eleve_id).map((r: any) => r.rb_eleve_id))];

      let elevesMap: Record<string, string> = {};

      if (eleveIds.length > 0) {
        const { data: eleves } = await admin
          .from("eleves")
          .select("id, prenom, nom")
          .in("id", eleveIds);
        for (const e of eleves ?? []) {
          elevesMap[`pb_${e.id}`] = `${e.prenom} ${e.nom ?? ""}`.trim();
        }
      }

      if (rbEleveIds.length > 0) {
        const { data: rbEleves } = await admin
          .from("eleve")
          .select("id, prenom, nom")
          .in("id", rbEleveIds);
        for (const e of rbEleves ?? []) {
          elevesMap[`rb_${e.id}`] = `${e.prenom} ${e.nom ?? ""}`.trim();
        }
      }

      resultats = resultatsData.map((r: any) => {
        const key = r.eleve_id ? `pb_${r.eleve_id}` : `rb_${r.rb_eleve_id}`;
        return {
          ...r,
          eleve_nom: elevesMap[key] ?? "Inconnu",
          eleve_uid: key,
        };
      });
    }
  }

  return NextResponse.json({
    calculs: calculs ?? [],
    resultats,
    configs: configs ?? [],
  });
}
