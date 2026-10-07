#!/usr/bin/env npx tsx
/**
 * Déménage les podcasts de Supabase Storage vers Cloudflare R2.
 *
 * Le 06/10/2026, 8 MP3 de ~28 Mo servis depuis Supabase ont épuisé le quota
 * gratuit de bande passante : Plan Box et Repetibox ont été coupés. R2 ne
 * facture pas la bande passante sortante (voir lib/r2.ts).
 *
 * 1. copie chaque fichier du bucket `podcasts` vers R2, sous la MÊME clé ;
 * 2. réécrit les adresses dans `plan_travail.contenu` et
 *    `banque_ressources.contenu` (seul le préfixe change).
 * Les fichiers Supabase ne sont PAS supprimés : à faire à la main une fois
 * les écoutes vérifiées. Idempotent : relancé, il recopie et ne trouve plus
 * d'adresse à réécrire.
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/migrer-podcasts-r2.ts --dry-run
 *   ... sans --dry-run pour écrire
 */

import { createClient } from "@supabase/supabase-js";
import { deposerR2, urlPubliqueR2 } from "../lib/r2";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const ANCIEN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/podcasts/`;
const NOUVEAU = urlPubliqueR2("");

async function copierFichiers() {
  const { data, error } = await supabase.storage.from("podcasts").list("podcasts", { limit: 1000 });
  if (error) throw error;
  const fichiers = (data ?? []).filter((f) => f.id);
  console.log(`${fichiers.length} fichier(s) dans Supabase Storage`);

  for (const f of fichiers) {
    const cle = `podcasts/${f.name}`;
    const taille = Math.round(((f.metadata?.size as number) ?? 0) / 1048576);
    if (DRY_RUN) { console.log(`  copierait ${cle} (${taille} Mo)`); continue; }

    const { data: blob, error: e } = await supabase.storage.from("podcasts").download(cle);
    if (e || !blob) throw e ?? new Error(`téléchargement vide : ${cle}`);
    await deposerR2(cle, await blob.arrayBuffer(), blob.type || "audio/mpeg");

    // Relire par l'adresse publique : c'est elle que les élèves ouvriront.
    const verif = await fetch(urlPubliqueR2(cle), { method: "HEAD" });
    const recu = Number(verif.headers.get("content-length"));
    if (!verif.ok || recu !== blob.size) throw new Error(`${cle} : relu ${verif.status}, ${recu} octets au lieu de ${blob.size}`);
    console.log(`  ✓ ${cle} (${taille} Mo)`);
  }
}

// Seules ces lignes portent un podcast. PostgREST ne sait pas filtrer un
// jsonb sur son texte : on lit le type, puis on cherche l'adresse en mémoire.
const PORTEURS = {
  plan_travail: ["type", "ressource"],
  banque_ressources: ["sous_type", "podcast"],
} as const;

async function reecrire(table: keyof typeof PORTEURS) {
  const [colonne, valeur] = PORTEURS[table];
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
    lignes.push(...(data ?? []).filter((l) => JSON.stringify(l.contenu).includes(ANCIEN)));
    if (!data || data.length < 1000) break;
  }
  console.log(`${table} : ${lignes.length} ligne(s) à réécrire`);
  if (DRY_RUN) return;

  for (const l of lignes) {
    const contenu = JSON.parse(JSON.stringify(l.contenu).split(ANCIEN).join(NOUVEAU));
    const { error } = await supabase.from(table).update({ contenu }).eq("id", l.id);
    if (error) throw error;
  }
  console.log(`  ✓ ${lignes.length} réécrite(s)`);
}

async function main() {
  console.log(DRY_RUN ? "— essai à blanc —" : "— écriture —");
  console.log(`${ANCIEN}…  →  ${NOUVEAU}…`);
  await copierFichiers();
  // Les adresses ne changent qu'une fois TOUS les fichiers copiés et relus.
  await reecrire("plan_travail");
  await reecrire("banque_ressources");
}

main().catch((e) => { console.error(e); process.exit(1); });
