/**
 * Remplit `lexique_francais` : le dictionnaire ACCENTUÉ qui vérifie la
 * correction automatique des textes d'élèves (`lib/ecriture-correction.ts`).
 *
 * Même source que `seed-lexique-motus.ts` — le paquet npm
 * `an-array-of-french-words` (~336 000 formes, MIT, dépendance de
 * développement) — mais pas le même traitement : on garde **toutes** les
 * formes, **avec leurs accents**, en minuscules. Le Motus normalise « élève »
 * et « élevé » en ELEVE ; la correction, elle, doit distinguer « très » de
 * « trés », sinon elle est aveugle là où les élèves se trompent le plus.
 *
 * Idempotent : relancer ne crée pas de doublon.
 *
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-lexique-francais.ts
 *   … --dry-run   pour ne rien écrire
 */

import { createClient } from "@supabase/supabase-js";
import motsFrancais from "an-array-of-french-words";
import { cleLexique } from "../lib/ecriture-correction";

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

  // Mots à tiret compris : « grand-père » est attesté tel quel. La même clé que
  // celle qu'interroge la correction, sinon on chercherait ce qu'on n'a pas rangé.
  const retenus = new Set<string>();
  for (const mot of motsFrancais as string[]) {
    const brut = mot.toLowerCase().trim();
    if (brut.includes("-")) {
      if (/^[\p{L}-]+$/u.test(brut)) retenus.add(brut);
    } else {
      const cle = cleLexique(brut);
      if (cle) retenus.add(cle);
    }
  }

  const lignes = [...retenus].sort().map((mot) => ({ mot }));
  console.log(`${(motsFrancais as string[]).length} formes lues → ${lignes.length} retenues (accents gardés).`);

  if (DRY_RUN) {
    console.log("--dry-run : rien n'est écrit.");
    for (const m of ["très", "trés", "élève", "eleve", "chevaux", "grand-père"]) {
      console.log(`  ${m.padEnd(11)} ${retenus.has(m) ? "présent" : "absent"}`);
    }
    return;
  }

  let ecrits = 0;
  for (let i = 0; i < lignes.length; i += LOT) {
    const lot = lignes.slice(i, i + LOT);
    const { error } = await admin
      .from("lexique_francais")
      .upsert(lot, { onConflict: "mot", ignoreDuplicates: true });
    if (error) {
      console.error(`Lot ${i / LOT + 1} : ${error.message}`);
      process.exit(1);
    }
    ecrits += lot.length;
    if ((i / LOT) % 20 === 0) console.log(`  ${ecrits} / ${lignes.length}`);
  }
  console.log(`✓ ${ecrits} formes chargées dans lexique_francais.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
