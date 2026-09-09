#!/usr/bin/env npx tsx
/**
 * Pose les traits d'union manquants dans le contenu déjà en base.
 *
 * La génération applique désormais la règle de 1990 sans rien demander au
 * modèle (`lib/nombres-en-lettres.ts`), mais les exercices produits avant
 * gardent leur « trois cent quarante-cinq ». Ce script les remet d'aplomb.
 *
 * Il ne touche qu'aux séries de mots-nombres reliées par une simple espace :
 * la ponctuation, les chiffres et les mots ordinaires sont laissés tels quels.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/reparer-traits-union.ts --dry-run
 *   ... sans --dry-run pour écrire
 *   ... --exemples   pour voir le détail des changements
 */

import { createClient } from "@supabase/supabase-js";
import { traitsUnionNombres } from "../lib/nombres-en-lettres";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const EXEMPLES = process.argv.includes("--exemples");

const TABLES = ["exercice", "plan_travail", "banque_exercices"] as const;

/**
 * Les champs qu'on accepte de réécrire.
 *
 * Volontairement étroit : `exercice.contenu` héberge aussi des chapitres de
 * romans importés (« La Rivière à l'envers » et consorts). Corriger
 * l'orthographe d'un auteur ne nous regarde pas — on ne touche qu'à ce que la
 * génération a écrit, et d'abord aux réponses attendues.
 */
const CHAMPS = new Set([
  "reponse_attendue", "reponse", "reponses", "mot", "mots",
  "options", "choix", "enonce", "question", "indice", "consigne", "correction",
]);

/** Au-delà, c'est de la prose, pas une réponse : on passe. */
const LONGUEUR_MAX = 400;

/** Les chaînes modifiées, pour pouvoir montrer ce qu'on s'apprête à écrire. */
function differences(valeur: unknown, autorise = false, vues: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof valeur === "string") {
    if (!autorise || valeur.length > LONGUEUR_MAX) return vues;
    const apres = traitsUnionNombres(valeur);
    if (apres !== valeur) vues.push([valeur, apres]);
  } else if (Array.isArray(valeur)) {
    valeur.forEach((v) => differences(v, autorise, vues));
  } else if (valeur && typeof valeur === "object") {
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      differences(v, autorise || CHAMPS.has(cle), vues);
    }
  }
  return vues;
}

/** La même sélection, mais qui produit le contenu réécrit. */
function corriger<T>(valeur: T, autorise = false): T {
  if (typeof valeur === "string") {
    return (autorise && valeur.length <= LONGUEUR_MAX ? traitsUnionNombres(valeur) : valeur) as unknown as T;
  }
  if (Array.isArray(valeur)) return valeur.map((v) => corriger(v, autorise)) as unknown as T;
  if (valeur && typeof valeur === "object") {
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
      sortie[cle] = corriger(v, autorise || CHAMPS.has(cle));
    }
    return sortie as unknown as T;
  }
  return valeur;
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
      .update({ contenu: corriger(ligne.contenu) })
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
