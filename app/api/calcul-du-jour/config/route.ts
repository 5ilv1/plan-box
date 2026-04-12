import { NextResponse } from "next/server";
import { requireEnseignant } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import type { CalculJourConfig, OperationCalcul } from "@/types";

const NIVEAUX_IDS = {
  CE2: "11111111-0000-0000-0000-000000000001",
  CM1: "11111111-0000-0000-0000-000000000002",
  CM2: "11111111-0000-0000-0000-000000000003",
};

const DEFAULT_CONFIG: Omit<CalculJourConfig, "id" | "niveau_id" | "created_at" | "updated_at" | "niveaux"> = {
  operations: [],
  decimales: false,
  decimales_mode: "aucun",
  nb_decimales: 0,
  nombre_min: 1,
  nombre_max: 100,
  nombre2_min: 1,
  nombre2_max: 100,
  actif: false,
};

export async function GET() {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();

  const { data: configs, error } = await admin
    .from("calcul_jour_config")
    .select("*, niveaux(nom)")
    .order("niveau_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Construire la réponse avec les valeurs par défaut pour les niveaux manquants
  const result: Record<string, CalculJourConfig | (typeof DEFAULT_CONFIG & { niveau_id: string; niveau_nom: string })> = {};

  for (const [nom, id] of Object.entries(NIVEAUX_IDS)) {
    const existing = configs?.find((c: any) => c.niveau_id === id);
    if (existing) {
      result[nom] = existing;
    } else {
      result[nom] = {
        ...DEFAULT_CONFIG,
        niveau_id: id,
        niveau_nom: nom,
      };
    }
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { niveau_id, operations, decimales, decimales_mode, nb_decimales, nombre_min, nombre_max, nombre2_min, nombre2_max, actif } = body;

  if (!niveau_id) {
    return NextResponse.json({ error: "niveau_id requis" }, { status: 400 });
  }

  // Valider que le niveau_id est valide
  const validIds = Object.values(NIVEAUX_IDS);
  if (!validIds.includes(niveau_id)) {
    return NextResponse.json({ error: "niveau_id invalide" }, { status: 400 });
  }

  // Valider les opérations
  const validOps: OperationCalcul[] = ["addition", "soustraction", "multiplication", "division"];
  if (operations && !operations.every((op: string) => validOps.includes(op as OperationCalcul))) {
    return NextResponse.json({ error: "Opérations invalides" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("calcul_jour_config")
    .upsert(
      {
        niveau_id,
        operations: operations ?? DEFAULT_CONFIG.operations,
        decimales: decimales ?? DEFAULT_CONFIG.decimales,
        decimales_mode: decimales_mode ?? DEFAULT_CONFIG.decimales_mode,
        nb_decimales: nb_decimales ?? DEFAULT_CONFIG.nb_decimales,
        nombre_min: nombre_min ?? DEFAULT_CONFIG.nombre_min,
        nombre_max: nombre_max ?? DEFAULT_CONFIG.nombre_max,
        nombre2_min: nombre2_min ?? DEFAULT_CONFIG.nombre2_min,
        nombre2_max: nombre2_max ?? DEFAULT_CONFIG.nombre2_max,
        actif: actif ?? DEFAULT_CONFIG.actif,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "niveau_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
