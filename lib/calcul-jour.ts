/**
 * Logique partagée du « calcul du jour ».
 *
 * Utilisée à la fois :
 *  - par l'API /api/calcul-du-jour (génération à la demande quand l'élève
 *    ouvre son tableau de bord) ;
 *  - par le cron /api/cron/calcul-du-jour qui PRÉ-génère, chaque matin de
 *    classe, un calcul pour chaque niveau actif — ainsi chaque élève voit son
 *    calcul, quel que soit l'ordre de connexion.
 *
 * La génération est idempotente : contrainte UNIQUE (date, niveau_id) sur
 * `calcul_jour` + upsert `ignoreDuplicates` → jamais de doublon, et un calcul
 * déjà créé (potentiellement déjà tenté par un élève) n'est jamais écrasé.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationCalcul } from "@/types";

export const NIVEAUX_IDS: Record<string, string> = {
  CE2: "11111111-0000-0000-0000-000000000001",
  CM1: "11111111-0000-0000-0000-000000000002",
  CM2: "11111111-0000-0000-0000-000000000003",
};

export const DEFAULT_CONFIG = {
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

export type CalculJourRow = {
  id: string;
  date: string;
  niveau_id: string;
  operation: OperationCalcul;
  nombre1: number;
  nombre2: number;
  reponse: number;
};

export function genererCalcul(config: {
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
    default:
      reponse = 0;
  }

  if (n1Decimal || n2Decimal) {
    reponse = Math.round(reponse * factor) / factor;
  }

  return { nombre1: n1, nombre2: n2, operation: op, reponse };
}

/**
 * Garantit qu'un calcul du jour existe pour (date, niveauId).
 *  - S'il existe déjà → le renvoie tel quel (jamais écrasé).
 *  - Sinon, s'il y a une config active → le génère et le renvoie.
 *  - Si la config est désactivée/vide → renvoie { inactif: true }.
 */
export async function assurerCalculDuJour(
  admin: SupabaseClient,
  niveauId: string,
  date: string,
): Promise<{ row: CalculJourRow } | { inactif: true }> {
  // 1. Déjà présent ? (la contrainte UNIQUE garantit 0 ou 1 ligne)
  const { data: existant } = await admin
    .from("calcul_jour")
    .select("*")
    .eq("date", date)
    .eq("niveau_id", niveauId)
    .maybeSingle();
  if (existant) return { row: existant as CalculJourRow };

  // 2. Config du niveau
  const { data: configData } = await admin
    .from("calcul_jour_config")
    .select("*")
    .eq("niveau_id", niveauId)
    .maybeSingle();

  const config = configData ?? { ...DEFAULT_CONFIG, niveau_id: niveauId };
  if ((!config.actif && configData) || !config.operations || config.operations.length === 0) {
    return { inactif: true };
  }

  // 3. Génération + insertion idempotente (ne JAMAIS écraser un calcul existant)
  const calcul = genererCalcul({
    operations: config.operations,
    decimales_mode: config.decimales_mode ?? "aucun",
    nb_decimales: config.nb_decimales,
    nombre_min: config.nombre_min,
    nombre_max: config.nombre_max,
    nombre2_min: config.nombre2_min ?? config.nombre_min,
    nombre2_max: config.nombre2_max ?? config.nombre_max,
  });

  await admin
    .from("calcul_jour")
    .upsert(
      {
        date,
        niveau_id: niveauId,
        operation: calcul.operation,
        nombre1: calcul.nombre1,
        nombre2: calcul.nombre2,
        reponse: calcul.reponse,
      },
      { onConflict: "date,niveau_id", ignoreDuplicates: true },
    );

  // 4. Relire la ligne canonique (la nôtre, ou celle insérée en concurrence)
  const { data: row } = await admin
    .from("calcul_jour")
    .select("*")
    .eq("date", date)
    .eq("niveau_id", niveauId)
    .single();

  return { row: row as CalculJourRow };
}
