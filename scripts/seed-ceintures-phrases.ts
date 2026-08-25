#!/usr/bin/env npx tsx
/**
 * 🥋 Seed des chapitres-ceintures — domaine Phrases
 *
 * Une ceinture = un chapitre (`sous_matiere = 'ceinture-phrases'`).
 * Ce script crée les 9 chapitres, remplit `ceinture_chapitre` et assigne
 * chaque chapitre aux trois groupes de classe.
 *
 * Idempotent : rejouable sans créer de doublon. Il ne touche jamais aux
 * exercices ni aux résultats — l'import de la banque est un autre script.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-ceintures-phrases.ts
 *   … --dry-run    # affiche ce qui serait fait, n'écrit rien
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");

const DOMAINE = "PHRA";
const SOUS_MATIERE = "ceinture-phrases";
const MATIERE = "français";
const NIVEAUX_CIBLES = ["CE2", "CM1", "CM2"];
const SEUIL = 90;

/** Les trois groupes de classe. Une ceinture vise les trois niveaux à la fois. */
const GROUPES = [
  { nom: "CE2", id: "9d2d7a69-bd28-4c2b-b4cd-0a9e71308b12" },
  { nom: "CM1", id: "4eabc16b-7c15-4372-a046-2b893b149c49" },
  { nom: "CM2", id: "051dd2f4-c805-4827-9291-bb675998e51c" },
];

interface Ceinture {
  idx: number;
  nom: string;
  hex: string;
  hex_fond: string;
}

interface ItemRef {
  code: string;
  ceinture_idx: number;
  libelle: string;
}

const referentiel = JSON.parse(
  readFileSync(resolve(process.cwd(), "docs/ceintures/referentiel-phrases.json"), "utf8"),
) as { ceintures: Ceinture[]; items: ItemRef[] };

const titreCeinture = (c: Ceinture) => `Phrases · ${c.nom}`;

async function main() {
  console.log(`\n🥋 Seed des ceintures « Phrases »${DRY_RUN ? "  [DRY RUN]" : ""}\n`);

  // Garde-fou : le référentiel doit être en base (migration jouée).
  const { data: items, error: errItems } = await supabase
    .from("ceinture_item")
    .select("code, ceinture_idx")
    .eq("domaine_code", DOMAINE);

  if (errItems) throw new Error(`ceinture_item illisible : ${errItems.message}`);
  if (!items?.length) {
    throw new Error("Aucun item en base — jouer docs/ceintures/migration.sql d'abord.");
  }
  if (items.length !== referentiel.items.length) {
    throw new Error(
      `${items.length} items en base pour ${referentiel.items.length} au référentiel — migration incomplète.`,
    );
  }

  const nbItemsParCeinture = new Map<number, number>();
  for (const it of items) {
    nbItemsParCeinture.set(it.ceinture_idx, (nbItemsParCeinture.get(it.ceinture_idx) ?? 0) + 1);
  }

  // Vérifier les groupes avant d'écrire quoi que ce soit.
  const { data: groupes } = await supabase
    .from("groupes")
    .select("id, nom")
    .in("id", GROUPES.map((g) => g.id));

  const groupesManquants = GROUPES.filter((g) => !groupes?.some((x) => x.id === g.id));
  if (groupesManquants.length) {
    throw new Error(`Groupe(s) introuvable(s) : ${groupesManquants.map((g) => g.nom).join(", ")}`);
  }

  // Chapitres-ceintures déjà présents ?
  const { data: existants } = await supabase
    .from("chapitres")
    .select("id, titre, ordre")
    .eq("sous_matiere", SOUS_MATIERE);

  const parTitre = new Map((existants ?? []).map((c) => [c.titre, c]));

  let crees = 0;
  let maj = 0;
  let assignations = 0;

  for (const ceinture of referentiel.ceintures) {
    const titre = titreCeinture(ceinture);
    const nbItems = nbItemsParCeinture.get(ceinture.idx) ?? 0;
    const description =
      `Ceinture ${ceinture.nom.toLowerCase()} du domaine Phrases — ${nbItems} compétence${nbItems > 1 ? "s" : ""} à valider.`;

    const champs = {
      titre,
      matiere: MATIERE,
      sous_matiere: SOUS_MATIERE,
      niveau_id: null,
      niveaux_cibles: NIVEAUX_CIBLES,
      seuil_evaluation: SEUIL,
      seuil_exercice: SEUIL,
      ordre: ceinture.idx + 1,
      description,
      disponible_bibliotheque: false,
    };

    let chapitreId = parTitre.get(titre)?.id;

    if (chapitreId) {
      if (!DRY_RUN) {
        const { error } = await supabase.from("chapitres").update(champs).eq("id", chapitreId);
        if (error) throw new Error(`maj chapitre « ${titre} » : ${error.message}`);
      }
      maj++;
      console.log(`  ↻ ${titre.padEnd(26)} déjà présent (${nbItems} items)`);
    } else {
      if (DRY_RUN) {
        chapitreId = `dry-run-${ceinture.idx}`;
      } else {
        const { data, error } = await supabase
          .from("chapitres")
          .insert(champs)
          .select("id")
          .single();
        if (error) throw new Error(`création chapitre « ${titre} » : ${error.message}`);
        chapitreId = data.id;
      }
      crees++;
      console.log(`  ✓ ${titre.padEnd(26)} créé (${nbItems} items)`);
    }

    if (DRY_RUN) continue;

    // Lien ceinture → chapitre
    const { error: errLien } = await supabase
      .from("ceinture_chapitre")
      .upsert(
        { domaine_code: DOMAINE, ceinture_idx: ceinture.idx, chapitre_id: chapitreId },
        { onConflict: "domaine_code,ceinture_idx" },
      );
    if (errLien) throw new Error(`ceinture_chapitre ${ceinture.idx} : ${errLien.message}`);

    // Assignation aux trois groupes.
    // Pas de date_debut : les ceintures ne passent pas par mes-chapitres, mais
    // l'assignation reste la source de vérité pour « à qui appartient ce chapitre ».
    for (const groupe of GROUPES) {
      const { error } = await supabase
        .from("chapitre_assignation")
        .upsert(
          { chapitre_id: chapitreId, groupe_id: groupe.id, actif: true },
          { onConflict: "chapitre_id,groupe_id" },
        );
      if (error) throw new Error(`assignation ${titre} → ${groupe.nom} : ${error.message}`);
      assignations++;
    }
  }

  console.log(
    `\n${crees} chapitre(s) créé(s), ${maj} mis à jour, ${assignations} assignation(s) actives.`,
  );

  if (DRY_RUN) {
    console.log("Rien n'a été écrit (--dry-run).\n");
    return;
  }

  // Relecture de contrôle
  const { data: liens } = await supabase
    .from("ceinture_chapitre")
    .select("ceinture_idx, chapitre_id, chapitres(titre, sous_matiere, seuil_evaluation, niveaux_cibles)")
    .eq("domaine_code", DOMAINE)
    .order("ceinture_idx");

  console.log("\nContrôle :");
  for (const l of (liens ?? []) as unknown as {
    ceinture_idx: number;
    chapitres: { titre: string; sous_matiere: string; seuil_evaluation: number; niveaux_cibles: string[] };
  }[]) {
    const ch = l.chapitres;
    console.log(
      `  ${String(l.ceinture_idx).padStart(2)} → ${ch.titre.padEnd(26)} ${ch.sous_matiere}  seuil ${ch.seuil_evaluation}  [${(ch.niveaux_cibles ?? []).join(", ")}]`,
    );
  }
  console.log(`\n${liens?.length ?? 0} ceinture(s) reliée(s) à un chapitre.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
