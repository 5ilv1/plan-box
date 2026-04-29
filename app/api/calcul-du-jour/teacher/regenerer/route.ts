import { NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import type { OperationCalcul } from "@/types";

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

export async function POST(request: Request) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const { niveau_id } = await request.json();
  if (!niveau_id) return NextResponse.json({ error: "niveau_id requis" }, { status: 400 });

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Récupérer la config
  const { data: cfg } = await admin
    .from("calcul_jour_config")
    .select("*")
    .eq("niveau_id", niveau_id)
    .single();

  if (!cfg || !cfg.actif || !cfg.operations || cfg.operations.length === 0) {
    // Supprimer le calcul existant si le niveau est désactivé
    await admin.from("calcul_jour").delete().eq("date", today).eq("niveau_id", niveau_id);
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Supprimer l'ancien calcul du jour (et ses résultats)
  const { data: existing } = await admin
    .from("calcul_jour")
    .select("id")
    .eq("date", today)
    .eq("niveau_id", niveau_id)
    .maybeSingle();

  if (existing) {
    // On supprime uniquement le calcul ; les résultats des élèves restent
    // dans la BDD (FK ON DELETE SET NULL) et continuent à compter dans
    // les bilans, même si le calcul lui-même est régénéré.
    await admin.from("calcul_jour").delete().eq("id", existing.id);
  }

  // Générer un nouveau calcul
  const calcul = genererCalcul({
    operations: cfg.operations,
    decimales_mode: cfg.decimales_mode ?? "aucun",
    nb_decimales: cfg.nb_decimales,
    nombre_min: cfg.nombre_min,
    nombre_max: cfg.nombre_max,
    nombre2_min: cfg.nombre2_min ?? cfg.nombre_min,
    nombre2_max: cfg.nombre2_max ?? cfg.nombre_max,
  });

  const { data, error } = await admin
    .from("calcul_jour")
    .insert({
      date: today,
      niveau_id,
      operation: calcul.operation,
      nombre1: calcul.nombre1,
      nombre2: calcul.nombre2,
      reponse: calcul.reponse,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, calcul: data });
}
