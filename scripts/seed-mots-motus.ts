/**
 * Charge les mots à deviner du Motus (scripts/mots-motus-cycle3.ts) dans
 * `motus_mot`, thème par thème.
 *
 * Chaque mot doit franchir trois contrôles, sans quoi il est écarté et signalé :
 *  1. lettres uniquement, 5 à 9 lettres une fois normalisé ;
 *  2. le code de thème existe dans THEMES ;
 *  3. le mot figure dans `motus_lexique` — c'est le correcteur orthographique
 *     du script : une faute de frappe n'entre pas dans la liste.
 *
 * Idempotent : relancer ne crée pas de doublon (unicité sur mot + thème).
 *
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-mots-motus.ts
 *   … --dry-run   pour ne rien écrire, juste voir le rapport
 */

import { createClient } from "@supabase/supabase-js";
import { normaliserMot } from "../lib/motus";
import { THEMES, libelleTheme, themeExiste } from "../lib/motus-themes";
import { MOTS_PAR_THEME } from "./mots-motus-cycle3";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Bornes des mots à deviner. Le jeu accepte 4 à 10 lettres ; on écarte les
 * mots de 4 lettres, qui se devinent trop vite, et on garde les longs :
 * « citrouille » ou « hirondelle » valent d'être devinés, et une grille de
 * 10 lettres tient sur un téléphone.
 */
const MIN = 5;
const MAX = 10;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
    process.exit(1);
  }
  const admin = createClient(url, key);

  // Le lexique sert de correcteur : on le charge une fois.
  const lexique = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("motus_lexique")
      .select("mot")
      .range(de, de + 999);
    if (error) {
      console.error(`Lecture du lexique : ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const l of data) lexique.add(l.mot as string);
    if (data.length < 1000) break;
  }
  console.log(`Lexique chargé : ${lexique.size} mots.\n`);

  const lignes: { mot: string; mot_normalise: string; theme: string }[] = [];
  const rejets: string[] = [];

  for (const [theme, mots] of Object.entries(MOTS_PAR_THEME)) {
    if (!themeExiste(theme)) {
      rejets.push(`thème inconnu : ${theme} (${mots.length} mots ignorés)`);
      continue;
    }
    const vus = new Set<string>();
    let gardes = 0;
    for (const mot of mots) {
      const norm = normaliserMot(mot);
      if (!norm) {
        rejets.push(`${theme} · ${mot} : lettres uniquement`);
        continue;
      }
      if (norm.length < MIN || norm.length > MAX) {
        rejets.push(`${theme} · ${mot} : ${norm.length} lettres (attendu ${MIN} à ${MAX})`);
        continue;
      }
      if (!lexique.has(norm)) {
        rejets.push(`${theme} · ${mot} : absent du lexique (faute de frappe ?)`);
        continue;
      }
      if (vus.has(norm)) continue; // doublon dans le même thème
      vus.add(norm);
      lignes.push({ mot: mot.trim(), mot_normalise: norm, theme });
      gardes++;
    }
    console.log(`  ${libelleTheme(theme).padEnd(28)} ${String(gardes).padStart(3)} mots`);
  }

  console.log(`\n${lignes.length} mots retenus, ${rejets.length} écartés.`);
  if (rejets.length) {
    console.log("\nÉcartés :");
    for (const r of rejets) console.log(`  - ${r}`);
  }

  const uniques = new Set(lignes.map((l) => l.mot_normalise));
  console.log(`\n${uniques.size} mots distincts (certains servent dans plusieurs thèmes).`);

  if (DRY_RUN) {
    console.log("\n--dry-run : rien n'est écrit.");
    return;
  }

  const { data, error } = await admin
    .from("motus_mot")
    .upsert(lignes, { onConflict: "mot_normalise,theme", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error(`Écriture : ${error.message}`);
    process.exit(1);
  }

  const { count } = await admin
    .from("motus_mot")
    .select("id", { count: "exact", head: true })
    .eq("actif", true);
  console.log(`\n${data?.length ?? 0} ajoutés — ${count} mots actifs dans motus_mot.`);

  // Un thème sans mot ne pourrait pas fournir la semaine : on le signale.
  const { data: parTheme } = await admin.from("motus_mot").select("theme").eq("actif", true);
  const compte = new Map<string, number>();
  for (const r of parTheme ?? []) {
    const t = (r.theme as string) ?? "(sans thème)";
    compte.set(t, (compte.get(t) ?? 0) + 1);
  }
  const vides = THEMES.filter((t) => !compte.has(t.code));
  if (vides.length) {
    console.log(`\n⚠ Thèmes sans aucun mot : ${vides.map((t) => t.code).join(", ")}`);
  }
}

main();
