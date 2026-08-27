#!/usr/bin/env npx tsx
/**
 * 📚 Import de la banque d'exercices des ceintures
 *
 * Pour chaque item d'un fichier `docs/ceintures/banque/*.json` :
 *   • `ceinture_banque` — 1 ligne par question de diagnostic (usage `diagnostic`)
 *                         et 1 ligne par variante d'entraînement (usage `entrainement`)
 *   • `exercice`        — UNE ligne dans le chapitre de la ceinture, portant
 *                         `contenu.item_code`, la variante 1 aplatie, et les
 *                         deux variantes sous `contenu.variantes`.
 *   • `ceinture_item.lecon` — la leçon de l'item (docs/ceintures/SPEC-LECONS.md).
 *                         Elle est portée par l'ITEM et non par la variante :
 *                         un passage en remédiation change l'exercice, pas la
 *                         règle à apprendre.
 *
 * Une seule ligne `exercice` par item : l'évaluation est composée à partir de
 * TOUS les exercices du chapitre, une deuxième ligne la doublerait et
 * imposerait deux maillons dans la chaîne de déblocage séquentiel.
 *
 * Idempotent, et sans destruction : une ligne `exercice` déjà présente est
 * mise à jour, jamais supprimée — la supprimer emporterait les
 * `exercice_resultat` des élèves.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/import-banque-ceintures.ts
 *   … --domaine=PHRA     # un seul domaine (défaut : all)
 *   … --dry-run          # affiche ce qui serait fait, n'écrit rien
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DOMAINES,
  domaineParCode,
  compterQuestions,
  type DomaineCeinture,
} from "../lib/ceintures-competences";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const argDomaine =
  process.argv.find((a) => a.startsWith("--domaine="))?.split("=")[1]?.toUpperCase() ?? "ALL";

const DOSSIER_BANQUE = resolve(process.cwd(), "docs/ceintures/banque");

/** Préfixe de fichier → domaine. `ceinture-*.json` sans préfixe = Phrases. */
const PREFIXE: Record<string, string> = {
  "": "PHRA",
  "mots-": "MOTS",
  "textes-": "TEXT",
  "nombres-": "NOMB",
  "calcul-": "CALC",
  "grandeurs-": "GRME",
};

interface QuestionDiagnostic {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
}

interface ExempleLecon {
  phrase: string;
  demonstration: string;
}

interface Lecon {
  titre: string;
  regle: string;
  procedure: string[];
  exemples: ExempleLecon[];
  piege?: string;
}

interface ItemBanque {
  item_code: string;
  type: string;
  lecon?: Lecon;
  diagnostic: QuestionDiagnostic[];
  entrainement: Record<string, unknown>[];
}

interface ItemBase {
  code: string;
  ceinture_idx: number;
  libelle: string;
  type_exercice: string;
  ordre: number;
}

/**
 * Contrôle de forme d'une leçon, d'après docs/ceintures/SPEC-LECONS.md.
 * Renvoie la liste des manquements — vide si la leçon est conforme.
 */
function controlerLecon(lecon: Lecon): string[] {
  const pbs: string[] = [];

  if (!lecon.titre?.trim()) pbs.push("titre vide");
  if (!lecon.regle?.trim()) pbs.push("regle vide");

  if (!Array.isArray(lecon.procedure) || lecon.procedure.length < 2 || lecon.procedure.length > 3) {
    pbs.push(`procedure : ${lecon.procedure?.length ?? 0} étape(s), 2 ou 3 attendues`);
  }

  if (!Array.isArray(lecon.exemples) || lecon.exemples.length !== 2) {
    pbs.push(`exemples : ${lecon.exemples?.length ?? 0}, 2 attendus`);
  } else {
    lecon.exemples.forEach((e, i) => {
      if (!e.phrase?.trim()) pbs.push(`exemple ${i + 1} sans phrase`);
      if (!e.demonstration?.trim()) pbs.push(`exemple ${i + 1} sans demonstration`);
    });
  }

  // Longueur indicative (80 à 120 mots). Signalée, jamais bloquante : le
  // calibrage est un jugement pédagogique, pas une règle de schéma.
  const mots = [
    lecon.titre, lecon.regle, ...(lecon.procedure ?? []),
    ...(lecon.exemples ?? []).flatMap((e) => [e.phrase, e.demonstration]),
    lecon.piege ?? "",
  ].join(" ").trim().split(/\s+/).length;
  if (mots < 60 || mots > 160) pbs.push(`~${mots} mots (80 à 120 attendus)`);

  return pbs;
}

/**
 * Motif des noms de fichiers, dérivé de PREFIXE : ajouter un domaine à la
 * table suffit, il n'y a pas de regex à penser à mettre à jour.
 * Ex. : /^(mots-|textes-|nombres-)?ceinture-(\d)-/
 */
const MOTIF_FICHIER = new RegExp(
  `^(${Object.keys(PREFIXE).filter(Boolean).join("|")})?ceinture-(\\d)-`,
);

/** Fichiers de banque d'un domaine, dans l'ordre des ceintures. */
function fichiersDuDomaine(code: string): { fichier: string; idx: number }[] {
  const prefixe = Object.entries(PREFIXE).find(([, c]) => c === code)?.[0] ?? "";
  return readdirSync(DOSSIER_BANQUE)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const m = f.match(MOTIF_FICHIER);
      return m && PREFIXE[m[1] ?? ""] === code && (m[1] ?? "") === prefixe
        ? { fichier: f, idx: Number(m[2]) }
        : null;
    })
    .filter((x): x is { fichier: string; idx: number } => x !== null)
    .sort((a, b) => a.idx - b.idx);
}

async function importerDomaine(domaine: DomaineCeinture) {
  console.log(`\n── ${domaine.nom} (${domaine.code}) ─────────────────────────────`);

  // Référentiel en base : c'est lui qui donne l'ordre des items dans la ceinture.
  const { data: itemsBase, error: errItems } = await supabase
    .from("ceinture_item")
    .select("code, ceinture_idx, libelle, type_exercice, ordre")
    .eq("domaine_code", domaine.code);

  if (errItems) throw new Error(`ceinture_item illisible : ${errItems.message}`);
  const parCode = new Map((itemsBase ?? []).map((i) => [i.code, i as ItemBase]));

  // Chapitres du domaine.
  const { data: liens, error: errLiens } = await supabase
    .from("ceinture_chapitre")
    .select("ceinture_idx, chapitre_id")
    .eq("domaine_code", domaine.code);

  if (errLiens) throw new Error(`ceinture_chapitre illisible : ${errLiens.message}`);
  const chapitreParIdx = new Map((liens ?? []).map((l) => [l.ceinture_idx, l.chapitre_id]));

  if (chapitreParIdx.size === 0) {
    throw new Error(
      `Aucun chapitre pour ${domaine.code} — lancer scripts/seed-ceintures.ts d'abord.`,
    );
  }

  let nbExercicesCrees = 0;
  let nbExercicesMaj = 0;
  let nbBanque = 0;
  let nbLecons = 0;
  const sansLecon: string[] = [];
  const leconsDouteuses: string[] = [];

  for (const { fichier, idx } of fichiersDuDomaine(domaine.code)) {
    const items = JSON.parse(readFileSync(resolve(DOSSIER_BANQUE, fichier), "utf8")) as ItemBanque[];
    const chapitreId = chapitreParIdx.get(idx);
    if (!chapitreId) throw new Error(`Pas de chapitre pour ${domaine.code} ceinture ${idx}`);

    // Exercices déjà présents dans ce chapitre, indexés par item_code.
    const { data: exosExistants } = await supabase
      .from("exercice")
      .select("id, contenu")
      .eq("chapitre_id", chapitreId);

    const exoParItem = new Map<string, string>();
    for (const e of exosExistants ?? []) {
      const code = (e.contenu as Record<string, unknown>)?.item_code;
      if (typeof code === "string") exoParItem.set(code, e.id);
    }

    // Ordre d'affichage : celui du référentiel, ramené à 1..n dans la ceinture.
    const ordonnes = [...items].sort(
      (a, b) => (parCode.get(a.item_code)?.ordre ?? 0) - (parCode.get(b.item_code)?.ordre ?? 0),
    );

    const lignesBanque: Record<string, unknown>[] = [];
    const details: string[] = [];

    for (const [rang, item] of ordonnes.entries()) {
      const ref = parCode.get(item.item_code);
      if (!ref) throw new Error(`${fichier} : item ${item.item_code} absent de ceinture_item`);
      if (ref.ceinture_idx !== idx) {
        throw new Error(
          `${item.item_code} : ceinture ${ref.ceinture_idx} en base, ${idx} dans le fichier`,
        );
      }
      // Le type de la banque fait foi (BRIEF §6) — et le seed de migration.sql
      // l'a déjà repris. Un écart ici signale une base désynchronisée.
      if (ref.type_exercice !== item.type) {
        throw new Error(
          `${item.item_code} : type « ${ref.type_exercice} » en base, « ${item.type} » dans la banque — rejouer migration.sql`,
        );
      }
      if (item.entrainement.length !== 2) {
        throw new Error(`${item.item_code} : ${item.entrainement.length} variante(s), 2 attendues`);
      }

      // ── ceinture_item.lecon ──────────────────────────────────────────
      // La leçon vit sur l'item : elle survit au passage en remédiation, qui
      // ne change que la variante d'entraînement.
      if (item.lecon) {
        const pbs = controlerLecon(item.lecon);
        if (pbs.length) leconsDouteuses.push(`${item.item_code} — ${pbs.join(" ; ")}`);

        if (!DRY_RUN) {
          const { error } = await supabase
            .from("ceinture_item")
            .update({ lecon: item.lecon })
            .eq("code", item.item_code);
          if (error) throw new Error(`leçon ${item.item_code} : ${error.message}`);
        }
        nbLecons++;
      } else {
        sansLecon.push(item.item_code);
      }

      // ── ceinture_banque ──────────────────────────────────────────────
      for (const q of item.diagnostic) {
        lignesBanque.push({
          item_code: item.item_code,
          usage: "diagnostic",
          type_exercice: "qcm", // le diagnostic est en QCM quel que soit le type de l'item
          contenu: q,
          valide_par_enseignant: true,
          genere_par_ia: false,
        });
      }
      for (const v of item.entrainement) {
        lignesBanque.push({
          item_code: item.item_code,
          usage: "entrainement",
          type_exercice: item.type,
          contenu: v,
          valide_par_enseignant: true,
          genere_par_ia: false,
        });
      }

      // ── exercice ─────────────────────────────────────────────────────
      const variante1 = item.entrainement[0];
      const contenu = {
        ...variante1,
        item_code: item.item_code,
        item_libelle: ref.libelle,
        variante: 1,
        variantes: item.entrainement,
      };

      const champs = {
        chapitre_id: chapitreId,
        ordre: rang + 1,
        titre: (variante1.titre as string) ?? ref.libelle,
        type: item.type,
        contenu,
        nb_questions: compterQuestions(item.type, variante1),
      };

      const exoId = exoParItem.get(item.item_code);
      if (exoId) {
        if (!DRY_RUN) {
          const { error } = await supabase.from("exercice").update(champs).eq("id", exoId);
          if (error) throw new Error(`maj exercice ${item.item_code} : ${error.message}`);
        }
        nbExercicesMaj++;
        details.push(`↻ ${item.item_code}`);
      } else {
        if (!DRY_RUN) {
          const { error } = await supabase.from("exercice").insert(champs);
          if (error) throw new Error(`création exercice ${item.item_code} : ${error.message}`);
        }
        nbExercicesCrees++;
        details.push(`✓ ${item.item_code}`);
      }
    }

    if (!DRY_RUN) {
      // La banque est réécrite intégralement pour ces items : elle ne porte
      // aucune référence externe, contrairement aux lignes `exercice`.
      const codes = ordonnes.map((i) => i.item_code);
      const { error: errDel } = await supabase
        .from("ceinture_banque")
        .delete()
        .in("item_code", codes)
        .eq("genere_par_ia", false);
      if (errDel) throw new Error(`purge ceinture_banque : ${errDel.message}`);

      const { error: errIns } = await supabase.from("ceinture_banque").insert(lignesBanque);
      if (errIns) throw new Error(`insert ceinture_banque : ${errIns.message}`);
    }
    nbBanque += lignesBanque.length;

    console.log(
      `  ceinture ${idx} — ${String(ordonnes.length).padStart(2)} item(s)  ${details.join(" ")}`,
    );
  }

  console.log(
    `  ${nbExercicesCrees} exercice(s) créé(s), ${nbExercicesMaj} mis à jour, ` +
      `${nbBanque} ligne(s) de banque, ${nbLecons} leçon(s).`,
  );

  if (sansLecon.length) {
    console.log(`  ⚠ ${sansLecon.length} item(s) sans leçon : ${sansLecon.join(", ")}`);
  }
  for (const l of leconsDouteuses) console.log(`  ⚠ leçon ${l}`);
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

  console.log(`\n📚 Import de la banque des ceintures${DRY_RUN ? "  [DRY RUN]" : ""}`);

  for (const d of domaines) await importerDomaine(d);

  if (DRY_RUN) {
    console.log("\nRien n'a été écrit (--dry-run).\n");
    return;
  }

  // Relecture de contrôle : un exercice par item, dans chaque chapitre.
  const { data: controle } = await supabase
    .from("ceinture_item")
    .select("domaine_code")
    .eq("actif", true);

  const { count: nbExos } = await supabase
    .from("exercice")
    .select("id", { count: "exact", head: true })
    .not("contenu->>item_code", "is", null);

  const { count: nbLeconsBase } = await supabase
    .from("ceinture_item")
    .select("code", { count: "exact", head: true })
    .not("lecon", "is", null);

  console.log(
    `\nContrôle : ${nbExos ?? 0} exercice(s) portant un item_code et ` +
      `${nbLeconsBase ?? 0} leçon(s) pour ${controle?.length ?? 0} item(s) au référentiel.\n`,
  );
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
