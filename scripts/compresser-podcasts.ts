#!/usr/bin/env npx tsx
/**
 * Réduit les podcasts et les fait servir par Plan Box (`/media/…`).
 *
 * Le 08/10/2026, le filtre du réseau de l'école bloquait `*.r2.dev` : plus
 * aucun podcast ne se lisait en classe. Ils passent désormais par Plan Box
 * (réécriture de `vercel.json` vers R2), dont la bande passante compte dans
 * le quota gratuit de Vercel. D'où cette réduction : des MP3 de ~28 Mo en
 * stéréo à 256 kbit/s, pour de la voix, deviennent ~5 Mo en mono à 48 kbit/s.
 *
 * 1. chaque `podcasts/X.mp3` de R2 est réduit par ffmpeg et déposé sous
 *    `podcasts/X-voix.mp3` — une clé NOUVELLE : les fichiers sont servis en
 *    cache immuable, réécrire la même clé laisserait l'ancien sur les tablettes ;
 * 2. les adresses de `plan_travail.contenu` et `banque_ressources.contenu`
 *    passent à `/media/podcasts/X-voix.mp3`.
 * Les originaux restent dans R2 (aucun coût de sortie). Idempotent.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/compresser-podcasts.ts --dry-run
 *   ... sans --dry-run pour écrire
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deposerR2, listerR2, telechargerR2, urlPubliqueR2 } from "../lib/r2";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const SUFFIXE = "-voix.mp3";
const R2_DEV = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/`;

/** Ancienne clé → nouvelle, pour tous les podcasts (réduits ou à réduire). */
async function reduire(): Promise<Map<string, string>> {
  const objets = await listerR2("podcasts/");
  const existants = new Set(objets.map((o) => o.cle));
  const correspondance = new Map<string, string>();
  const dossier = mkdtempSync(join(tmpdir(), "podcasts-"));

  try {
    for (const o of objets) {
      if (!o.cle.endsWith(".mp3") || o.cle.endsWith(SUFFIXE)) continue;
      const cible = o.cle.replace(/\.mp3$/, SUFFIXE);
      correspondance.set(o.cle, cible);
      const mo = (o.taille / 1048576).toFixed(1);

      if (existants.has(cible)) { console.log(`  déjà réduit : ${o.cle}`); continue; }
      if (DRY_RUN) { console.log(`  réduirait ${o.cle} (${mo} Mo)`); continue; }

      const entree = join(dossier, "entree.mp3");
      const sortie = join(dossier, "sortie.mp3");
      writeFileSync(entree, Buffer.from(await telechargerR2(o.cle)));
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-i", entree,
        "-vn", "-map_metadata", "-1", "-ac", "1", "-b:a", "48k", sortie,
      ]);
      const corps = readFileSync(sortie);
      await deposerR2(cible, corps, "audio/mpeg");
      console.log(`  ✓ ${o.cle} : ${mo} Mo → ${(corps.length / 1048576).toFixed(1)} Mo`);
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
  return correspondance;
}

const PORTEURS = {
  plan_travail: ["type", "ressource"],
  banque_ressources: ["sous_type", "podcast"],
} as const;

async function reecrire(table: keyof typeof PORTEURS, correspondance: Map<string, string>) {
  const [colonne, valeur] = PORTEURS[table];
  // L'adresse r2.dev d'abord (illisible à l'école), puis chaque fichier
  // d'origine vers sa version réduite.
  const remplacer = (texte: string) => {
    let t = texte.split(R2_DEV).join(urlPubliqueR2(""));
    for (const [avant, apres] of correspondance) {
      t = t.split(`"${urlPubliqueR2(avant)}"`).join(`"${urlPubliqueR2(apres)}"`);
    }
    return t;
  };

  const lignes: { id: string; contenu: unknown }[] = [];
  // PostgREST plafonne à 1000 lignes par lecture.
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("id, contenu")
      .eq(colonne, valeur)
      .order("id")
      .range(debut, debut + 999);
    if (error) throw error;
    for (const l of data ?? []) {
      const texte = JSON.stringify(l.contenu);
      if (remplacer(texte) !== texte) lignes.push(l);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`${table} : ${lignes.length} ligne(s) à réécrire`);
  if (DRY_RUN) return;

  for (const l of lignes) {
    const contenu = JSON.parse(remplacer(JSON.stringify(l.contenu)));
    const { error } = await supabase.from(table).update({ contenu }).eq("id", l.id);
    if (error) throw error;
  }
  console.log(`  ✓ ${lignes.length} réécrite(s)`);
}

async function main() {
  console.log(DRY_RUN ? "— essai à blanc —" : "— écriture —");
  const correspondance = await reduire();
  // Les adresses ne changent qu'une fois TOUS les fichiers réduits et déposés.
  await reecrire("plan_travail", correspondance);
  await reecrire("banque_ressources", correspondance);
}

main().catch((e) => { console.error(e); process.exit(1); });
