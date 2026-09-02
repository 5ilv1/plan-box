/**
 * Remplit `motus_lexique` : les mots acceptés comme proposition dans le Motus.
 *
 * Source : le paquet npm `an-array-of-french-words` (~336 000 formes, MIT),
 * gardé en dépendance de développement — la production, elle, ne lit que la
 * table Supabase.
 *
 * On ne retient que ce dont une grille a besoin : formes de 4 à 10 lettres,
 * normalisées en A-Z sans accents (« élève » et « élevé » deviennent tous deux
 * ELEVE, une seule ligne). Les formes fléchies sont conservées : un élève qui
 * propose « chevaux » ou « mangeaient » ne doit pas se faire refuser.
 *
 * Idempotent : relancer ne crée pas de doublon.
 *
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-lexique-motus.ts
 *   … --dry-run   pour ne rien écrire
 */

import { createClient } from "@supabase/supabase-js";
import motsFrancais from "an-array-of-french-words";
import { LONGUEUR_MAX, LONGUEUR_MIN, normaliserMot } from "../lib/motus";

const DRY_RUN = process.argv.includes("--dry-run");
const LOT = 2000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
    process.exit(1);
  }
  const admin = createClient(url, key);

  const retenus = new Set<string>();
  for (const mot of motsFrancais as string[]) {
    const norm = normaliserMot(mot);
    if (norm.length >= LONGUEUR_MIN && norm.length <= LONGUEUR_MAX) retenus.add(norm);
  }

  const lignes = [...retenus].sort().map((mot) => ({ mot }));
  console.log(
    `${(motsFrancais as string[]).length} formes lues → ${lignes.length} retenues ` +
      `(${LONGUEUR_MIN} à ${LONGUEUR_MAX} lettres, normalisées).`,
  );

  if (DRY_RUN) {
    console.log("--dry-run : rien n'est écrit.");
    return;
  }

  let ecrits = 0;
  for (let i = 0; i < lignes.length; i += LOT) {
    const lot = lignes.slice(i, i + LOT);
    const { error } = await admin
      .from("motus_lexique")
      .upsert(lot, { onConflict: "mot", ignoreDuplicates: true });
    if (error) {
      console.error(`Lot ${i / LOT + 1} : ${error.message}`);
      process.exit(1);
    }
    ecrits += lot.length;
    if ((i / LOT) % 10 === 0) console.log(`  ${ecrits} / ${lignes.length}`);
  }

  const { count } = await admin
    .from("motus_lexique")
    .select("mot", { count: "exact", head: true });
  console.log(`Terminé — ${count} mots dans motus_lexique.`);
}

main();
