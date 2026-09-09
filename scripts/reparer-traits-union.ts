#!/usr/bin/env npx tsx
/**
 * Pose les traits d'union manquants dans le contenu déjà en base.
 *
 * La génération applique désormais la règle de 1990 sans rien demander au
 * modèle (`lib/nombres-en-lettres.ts`), mais les exercices produits avant
 * gardent leur « trois cent quarante-cinq ». Ce script les remet d'aplomb.
 *
 * Il ne touche qu'aux champs ENTIÈREMENT occupés par un nombre — la réponse
 * d'un « écris 345 en lettres », l'énoncé d'une dictée de nombres. Une phrase
 * qui parle de millions au passage, et les chapitres de romans importés dans
 * `exercice.contenu`, restent tels quels.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/reparer-traits-union.ts --dry-run
 *   ... sans --dry-run pour écrire
 *   ... --exemples   pour voir le détail des changements
 */

import { createClient } from "@supabase/supabase-js";
import { normaliserNombresEnLettres, traitsUnionSiNombre } from "../lib/nombres-en-lettres";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const EXEMPLES = process.argv.includes("--exemples");

const TABLES = ["exercice", "plan_travail", "banque_exercices"] as const;

/** Les chaînes modifiées, pour montrer ce qu'on s'apprête à écrire. */
function differences(valeur: unknown, vues: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof valeur === "string") {
    const apres = traitsUnionSiNombre(valeur);
    if (apres !== valeur) vues.push([valeur, apres]);
  } else if (Array.isArray(valeur)) {
    valeur.forEach((v) => differences(v, vues));
  } else if (valeur && typeof valeur === "object") {
    Object.values(valeur as Record<string, unknown>).forEach((v) => differences(v, vues));
  }
  return vues;
}

async function reparerTable(table: (typeof TABLES)[number]) {
  const { data, error } = await supabase.from(table).select("id, titre, contenu");
  if (error) {
    console.error(`  ✗ ${table} : ${error.message}`);
    return { lus: 0, corriges: 0, chaines: 0 };
  }

  let corriges = 0;
  let chaines = 0;

  for (const ligne of data ?? []) {
    if (!ligne.contenu || typeof ligne.contenu !== "object") continue;

    const vues = differences(ligne.contenu);
    if (vues.length === 0) continue;

    corriges++;
    chaines += vues.length;

    if (EXEMPLES) {
      console.log(`  · ${table} ${ligne.id} — ${ligne.titre ?? "(sans titre)"}`);
      for (const [avant, apres] of vues.slice(0, 3)) {
        console.log(`      « ${avant} »\n    → « ${apres} »`);
      }
      if (vues.length > 3) console.log(`      … et ${vues.length - 3} autre(s)`);
    }

    if (DRY_RUN) continue;

    const { error: err } = await supabase
      .from(table)
      .update({ contenu: normaliserNombresEnLettres(ligne.contenu) })
      .eq("id", ligne.id);
    if (err) console.error(`    ✗ ${ligne.id} : ${err.message}`);
  }

  console.log(`  ${table} : ${data?.length ?? 0} ligne(s) lue(s), ${corriges} à corriger (${chaines} chaîne(s))`);
  return { lus: data?.length ?? 0, corriges, chaines };
}

async function main() {
  console.log(DRY_RUN ? "Analyse (aucune écriture)\n" : "Réparation\n");
  for (const table of TABLES) await reparerTable(table);
}

main().catch((e) => { console.error(e); process.exit(1); });
