#!/usr/bin/env npx tsx
/**
 * 🥋 Seed des chapitres-ceintures — domaines de français
 *
 * Une ceinture = un chapitre (`sous_matiere = 'ceinture-<domaine>'`).
 * Ce script crée les 9 chapitres d'un domaine, remplit `ceinture_chapitre` et
 * assigne chaque chapitre aux trois groupes de classe.
 *
 * Idempotent : rejouable sans créer de doublon. Il ne touche jamais aux
 * exercices ni aux résultats — l'import de la banque est un autre script
 * (`scripts/import-banque-ceintures.ts`).
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/seed-ceintures.ts
 *   … --domaine=PHRA     # un seul domaine (défaut : all)
 *   … --dry-run          # affiche ce qui serait fait, n'écrit rien
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COULEURS,
  DOMAINES,
  domaineParCode,
  sousMatiere,
  titreChapitre,
  type DomaineCeinture,
} from "../lib/ceintures-competences";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");

const argDomaine =
  process.argv.find((a) => a.startsWith("--domaine="))?.split("=")[1]?.toUpperCase() ?? "ALL";

const NIVEAUX_CIBLES = ["CE2", "CM1", "CM2"];
const SEUIL = 90;

/** Les trois groupes de classe. Une ceinture vise les trois niveaux à la fois. */
const GROUPES = [
  { nom: "CE2", id: "9d2d7a69-bd28-4c2b-b4cd-0a9e71308b12" },
  { nom: "CM1", id: "4eabc16b-7c15-4372-a046-2b893b149c49" },
  { nom: "CM2", id: "051dd2f4-c805-4827-9291-bb675998e51c" },
];

interface ItemRef {
  code: string;
  domaine: string;
  ceinture_idx: number;
  libelle: string;
}

const referentiel = JSON.parse(
  readFileSync(resolve(process.cwd(), "docs/ceintures/referentiel-francais.json"), "utf8"),
) as ItemRef[];

async function seedDomaine(domaine: DomaineCeinture) {
  const sm = sousMatiere(domaine);
  console.log(`\n── ${domaine.nom} (${domaine.code}) ─────────────────────────────`);

  // Garde-fou : le référentiel doit être en base (migration jouée).
  const { data: items, error: errItems } = await supabase
    .from("ceinture_item")
    .select("code, ceinture_idx")
    .eq("domaine_code", domaine.code);

  if (errItems) throw new Error(`ceinture_item illisible : ${errItems.message}`);

  if (!items?.length) {
    throw new Error(
      `Aucun item ${domaine.code} en base — jouer docs/ceintures/migration.sql d'abord.`,
    );
  }

  // Contrôle croisé avec referentiel-francais.json, quand il couvre le
  // domaine. Ce fichier s'est arrêté aux six premiers : la source de vérité
  // des items est `migration.sql`, dont la base est le reflet. Un domaine
  // absent du JSON n'est donc pas une anomalie, il n'a simplement pas de
  // second témoin.
  const attendus = referentiel.filter((r) => r.domaine === domaine.code);
  if (attendus.length && items.length !== attendus.length) {
    throw new Error(
      `${items.length} items ${domaine.code} en base pour ${attendus.length} au référentiel — migration incomplète.`,
    );
  }
  if (!attendus.length) {
    console.log(`  (pas de contrôle croisé : ${domaine.code} est absent de referentiel-francais.json)`);
  }

  // La répartition qui fait foi est celle de la BASE, qui vient du seed de
  // migration.sql, lui-même aligné sur les fichiers de banque.
  const nbItemsParCeinture = new Map<number, number>();
  for (const it of items) {
    nbItemsParCeinture.set(it.ceinture_idx, (nbItemsParCeinture.get(it.ceinture_idx) ?? 0) + 1);
  }

  // Chapitres-ceintures déjà présents ?
  const { data: existants } = await supabase
    .from("chapitres")
    .select("id, titre, ordre")
    .eq("sous_matiere", sm);

  const parTitre = new Map((existants ?? []).map((c) => [c.titre, c]));

  let crees = 0;
  let maj = 0;
  let assignations = 0;

  for (const ceinture of COULEURS) {
    const titre = titreChapitre(domaine, ceinture.idx);
    const nbItems = nbItemsParCeinture.get(ceinture.idx) ?? 0;
    const description =
      `Ceinture ${ceinture.nom.toLowerCase()} du domaine ${domaine.nom} — ` +
      `${nbItems} compétence${nbItems > 1 ? "s" : ""} à valider.`;

    const champs = {
      titre,
      matiere: domaine.matiere,
      sous_matiere: sm,
      niveau_id: null,
      niveaux_cibles: NIVEAUX_CIBLES,
      seuil_evaluation: SEUIL,
      seuil_exercice: SEUIL,
      // Hérité de Repetibox : sans rapport avec l'évaluation de ceinture, qui
      // est composée à partir des exercices. Calé sur le nombre d'items pour
      // ne pas déclencher l'avertissement de Joseph.
      nb_cartes_eval: nbItems,
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
        { domaine_code: domaine.code, ceinture_idx: ceinture.idx, chapitre_id: chapitreId },
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
    `  ${crees} chapitre(s) créé(s), ${maj} mis à jour, ${assignations} assignation(s) actives.`,
  );
}

async function main() {
  const domaines =
    argDomaine === "ALL"
      ? DOMAINES
      : [domaineParCode(argDomaine)].filter(Boolean as unknown as (d: unknown) => d is DomaineCeinture);

  if (!domaines.length) {
    throw new Error(
      `Domaine « ${argDomaine} » inconnu. Attendu : ${DOMAINES.map((d) => d.code).join(", ")} ou ALL.`,
    );
  }

  console.log(`\n🥋 Seed des ceintures de compétences${DRY_RUN ? "  [DRY RUN]" : ""}`);

  // Vérifier les groupes avant d'écrire quoi que ce soit.
  const { data: groupes } = await supabase
    .from("groupes")
    .select("id, nom")
    .in("id", GROUPES.map((g) => g.id));

  const groupesManquants = GROUPES.filter((g) => !groupes?.some((x) => x.id === g.id));
  if (groupesManquants.length) {
    throw new Error(`Groupe(s) introuvable(s) : ${groupesManquants.map((g) => g.nom).join(", ")}`);
  }

  for (const d of domaines) await seedDomaine(d);

  if (DRY_RUN) {
    console.log("\nRien n'a été écrit (--dry-run).\n");
    return;
  }

  // Relecture de contrôle
  const { data: liens } = await supabase
    .from("ceinture_chapitre")
    .select("domaine_code, ceinture_idx, chapitres(titre, sous_matiere, seuil_evaluation, niveaux_cibles)")
    .order("domaine_code")
    .order("ceinture_idx");

  console.log("\nContrôle :");
  for (const l of (liens ?? []) as unknown as {
    domaine_code: string;
    ceinture_idx: number;
    chapitres: { titre: string; sous_matiere: string; seuil_evaluation: number; niveaux_cibles: string[] };
  }[]) {
    const ch = l.chapitres;
    console.log(
      `  ${l.domaine_code} ${String(l.ceinture_idx).padStart(2)} → ${ch.titre.padEnd(26)} ` +
        `${ch.sous_matiere.padEnd(18)} seuil ${ch.seuil_evaluation}  [${(ch.niveaux_cibles ?? []).join(", ")}]`,
    );
  }
  console.log(`\n${liens?.length ?? 0} ceinture(s) reliée(s) à un chapitre.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
