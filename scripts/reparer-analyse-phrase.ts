#!/usr/bin/env npx tsx
/**
 * Recale les groupes des exercices d'analyse grammaticale déjà en base.
 *
 * Le contenu généré avant l'arrivée de `lib/analyse-phrase.ts` peut porter des
 * positions fausses — un groupe annoncé aux mots 3 à 6 quand il en occupe 3 à
 * 7. À l'écran, ce groupe est introuvable : l'élève clique exactement dessus,
 * la réponse est refusée, et rien ne le fait avancer. C'est arrivé à un élève
 * sur « Les élèves courent dans la cour de récréation chaque mardi. »
 *
 * L'affichage recale déjà à la volée ; ce script remet la base d'aplomb pour
 * que l'aperçu enseignant et les exports disent la même chose que l'élève voit.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/reparer-analyse-phrase.ts
 *   ... --dry-run   pour ne rien écrire
 */

import { createClient } from "@supabase/supabase-js";
import { recalerPhrases, type PhraseAnalyse } from "../lib/analyse-phrase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");

/** Recale les phrases d'un contenu, variantes de ceintures comprises. */
function reparerContenu(contenu: Record<string, unknown> | null): { contenu: Record<string, unknown>; change: boolean } | null {
  if (!contenu || typeof contenu !== "object") return null;

  const copie = JSON.parse(JSON.stringify(contenu)) as Record<string, unknown>;
  let change = false;

  const recaler = (cible: Record<string, unknown>) => {
    if (!Array.isArray(cible.phrases)) return;
    const avant = JSON.stringify(cible.phrases);
    cible.phrases = recalerPhrases(cible.phrases as PhraseAnalyse[]);
    if (JSON.stringify(cible.phrases) !== avant) change = true;
  };

  recaler(copie);
  if (Array.isArray(copie.variantes)) {
    for (const v of copie.variantes as Record<string, unknown>[]) recaler(v);
  }

  return { contenu: copie, change };
}

async function reparerTable(table: "exercice" | "plan_travail" | "banque_exercices") {
  const { data, error } = await supabase
    .from(table)
    .select("id, titre, contenu")
    .eq("type", "analyse_phrase");

  if (error) {
    console.error(`  ✗ ${table} : ${error.message}`);
    return;
  }

  let corriges = 0;
  for (const ligne of data ?? []) {
    const resultat = reparerContenu(ligne.contenu as Record<string, unknown> | null);
    if (!resultat?.change) continue;

    corriges++;
    console.log(`  · ${table} ${ligne.id} — ${ligne.titre ?? "(sans titre)"}`);
    if (DRY_RUN) continue;

    const { error: err } = await supabase.from(table).update({ contenu: resultat.contenu }).eq("id", ligne.id);
    if (err) console.error(`    ✗ ${err.message}`);
  }

  console.log(`  ${table} : ${data?.length ?? 0} lue(s), ${corriges} à corriger`);
}

async function main() {
  console.log(DRY_RUN ? "Analyse (aucune écriture)\n" : "Réparation\n");
  for (const table of ["exercice", "plan_travail", "banque_exercices"] as const) {
    await reparerTable(table);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
