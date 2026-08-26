#!/usr/bin/env npx tsx
/**
 * 🌱 Applique le seed de `docs/ceintures/migration.sql` au référentiel.
 *
 * Le fichier SQL fait foi : ce script le LIT et rejoue ses deux `insert … on
 * conflict do update` (domaines et items) via l'API, plutôt que de dupliquer
 * les 144 lignes ici. Toute correction de libellé ou de type faite dans
 * migration.sql arrive donc en base par un simple rejeu.
 *
 * Ne touche pas à `lecon` : la leçon vient des fichiers de banque et c'est
 * `import-banque-ceintures.ts` qui l'écrit.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-referentiel.ts
 *   … --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const SQL = readFileSync(resolve(process.cwd(), "docs/ceintures/migration.sql"), "utf8");

/** Découpe `('a', 'b''c', 1, null)` en valeurs, en respectant les quotes SQL. */
function parserTuple(tuple: string): (string | number | null)[] {
  const valeurs: (string | number | null)[] = [];
  let i = 0;
  while (i < tuple.length) {
    while (i < tuple.length && /[\s,]/.test(tuple[i])) i++;
    if (i >= tuple.length) break;

    if (tuple[i] === "'") {
      i++;
      let s = "";
      while (i < tuple.length) {
        if (tuple[i] === "'" && tuple[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (tuple[i] === "'") { i++; break; }
        s += tuple[i++];
      }
      valeurs.push(s);
    } else {
      let s = "";
      while (i < tuple.length && !/[,]/.test(tuple[i])) s += tuple[i++];
      const brut = s.trim();
      valeurs.push(brut === "null" ? null : Number(brut));
    }
  }
  return valeurs;
}

/** Les tuples d'un `insert into <table> (…) values (…),(…) on conflict`. */
function tuplesDe(table: string): string[] {
  const debut = SQL.indexOf(`insert into ${table} (`);
  if (debut < 0) throw new Error(`insert into ${table} introuvable dans migration.sql`);
  const apresValues = SQL.indexOf("values", debut) + "values".length;
  const fin = SQL.indexOf("on conflict", apresValues);
  const bloc = SQL.slice(apresValues, fin);

  const tuples: string[] = [];
  let profondeur = 0, courant = "", dansQuote = false;
  for (let i = 0; i < bloc.length; i++) {
    const c = bloc[i];
    if (c === "'" && bloc[i - 1] !== "\\") {
      if (dansQuote && bloc[i + 1] === "'") { courant += "''"; i++; continue; }
      dansQuote = !dansQuote;
    }
    if (!dansQuote && c === "(") { profondeur++; if (profondeur === 1) { courant = ""; continue; } }
    if (!dansQuote && c === ")") { profondeur--; if (profondeur === 0) { tuples.push(courant); continue; } }
    if (profondeur > 0) courant += c;
  }
  return tuples;
}

async function main() {
  console.log(`\n🌱 Seed du référentiel depuis migration.sql${DRY_RUN ? "  [DRY RUN]" : ""}\n`);

  const domaines = tuplesDe("ceinture_domaine").map(parserTuple).map((v) => ({
    code: v[0] as string, nom: v[1] as string, matiere: v[2] as string,
    description: v[3] as string, ordre: v[4] as number,
  }));

  const items = tuplesDe("ceinture_item").map(parserTuple).map((v) => ({
    code: v[0] as string, domaine_code: v[1] as string, ceinture_idx: v[2] as number,
    libelle: v[3] as string, niveau_cible: v[4] as string, type_exercice: v[5] as string,
    nb_questions_diagnostic: v[6] as number, validation: v[7] as string,
    rattachement: v[8] as string, statut_source: v[9] as string, ordre: v[10] as number,
  }));

  console.log(`  ${domaines.length} domaine(s) et ${items.length} item(s) lus dans le fichier.`);
  const parDomaine: Record<string, number> = {};
  for (const i of items) parDomaine[i.domaine_code] = (parDomaine[i.domaine_code] ?? 0) + 1;
  console.log(`  ${Object.entries(parDomaine).map(([d, n]) => `${d} ${n}`).join(", ")}\n`);

  if (DRY_RUN) { console.log("Rien n'a été écrit (--dry-run).\n"); return; }

  const { error: errD } = await supabase.from("ceinture_domaine").upsert(domaines, { onConflict: "code" });
  if (errD) throw new Error(`ceinture_domaine : ${errD.message}`);

  // Par paquets : l'upsert d'un seul bloc de 144 lignes passe, mais le
  // découpage rend l'erreur lisible si une ligne coince.
  for (let i = 0; i < items.length; i += 50) {
    const paquet = items.slice(i, i + 50);
    const { error } = await supabase.from("ceinture_item").upsert(paquet, { onConflict: "code" });
    if (error) throw new Error(`ceinture_item [${i}..] : ${error.message}`);
  }

  const { count: nbD } = await supabase.from("ceinture_domaine").select("code", { count: "exact", head: true });
  const { count: nbI } = await supabase.from("ceinture_item").select("code", { count: "exact", head: true });
  console.log(`Contrôle : ${nbD} domaine(s), ${nbI} item(s) en base.\n`);
}

main().catch((e) => { console.error(`\n✗ ${e.message}\n`); process.exit(1); });
