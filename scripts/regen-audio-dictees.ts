/**
 * Régénère les audios manquants des dictées via l'endpoint TTS local.
 *
 * Cible par défaut : les dictées qui ont au moins un élève avec un bloc
 * plan_travail à venir (date_assignation >= aujourd'hui - 7 jours).
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs)
 *   npm run dev   # dans un autre terminal — l'endpoint /api/tts/generer-dictee doit être joignable sur localhost:3000
 *   npx tsx scripts/regen-audio-dictees.ts
 *
 * Variables :
 *   --all     : régénère TOUTES les dictées sans audio (même non assignées)
 *   --base=…  : URL base de l'app (défaut http://localhost:3000)
 *   --dry     : affiche la liste mais ne lance rien
 */

import { createClient } from "@supabase/supabase-js";

type DicteeRow = {
  id: string;
  niveau_etoiles: number;
  titre: string;
  texte: string | null;
  phrases: { id: number; texte: string }[] | null;
  audio_complet_url: string | null;
  audio_phrases_urls: { id: number; url: string }[] | null;
  dictee_parent_id: string;
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const all = args.has("--all");
  const dry = args.has("--dry");
  const baseArg = [...args].find((a) => a.startsWith("--base="));
  const base = baseArg ? baseArg.split("=", 2)[1] : "http://localhost:3000";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY requis");
    process.exit(1);
  }
  const sb = createClient(url, key);

  // 1. Toutes les dictées sources sans audio
  const { data: dictees, error: errD } = await sb
    .from("dictees")
    .select("id, niveau_etoiles, titre, texte, phrases, audio_complet_url, audio_phrases_urls, dictee_parent_id")
    .or("audio_complet_url.is.null,audio_phrases_urls.is.null")
    .order("created_at", { ascending: true });

  if (errD) {
    console.error("❌ Erreur lecture dictees :", errD.message);
    process.exit(1);
  }

  const aRegenerer = (dictees ?? []) as DicteeRow[];
  console.log(`Total dictées sources sans audio : ${aRegenerer.length}`);

  // 2. Filtrer par "élèves concernés" sauf si --all
  let cibles: DicteeRow[];
  if (all) {
    cibles = aRegenerer;
  } else {
    const ilYa7Jours = new Date();
    ilYa7Jours.setDate(ilYa7Jours.getDate() - 7);
    const isoDepuis = ilYa7Jours.toISOString().split("T")[0];

    const cibleIds: string[] = [];
    for (const d of aRegenerer) {
      const { count } = await sb
        .from("plan_travail")
        .select("id", { count: "exact", head: true })
        .eq("type", "dictee")
        .gte("date_assignation", isoDepuis)
        .filter("contenu->>dictee_parent_id", "eq", d.dictee_parent_id)
        .filter("contenu->niveau_etoiles", "eq", d.niveau_etoiles);
      if ((count ?? 0) > 0) cibleIds.push(d.id);
    }
    cibles = aRegenerer.filter((d) => cibleIds.includes(d.id));
  }

  console.log(`À régénérer (élèves concernés${all ? "" : " uniquement"}) : ${cibles.length}\n`);
  for (const d of cibles) {
    console.log(`  • ${d.titre} — ⭐${d.niveau_etoiles} — ${d.id}`);
  }

  if (dry) {
    console.log("\n--dry : aucune action.");
    return;
  }
  if (cibles.length === 0) {
    console.log("\nRien à faire.");
    return;
  }

  // 3. Régénérer une par une
  console.log("\n──────────────────────────────────────────────────");
  let ok = 0, ko = 0;
  for (const d of cibles) {
    if (!d.texte || !d.phrases || !Array.isArray(d.phrases) || d.phrases.length === 0) {
      console.warn(`  ⏭  ${d.titre} ⭐${d.niveau_etoiles} : texte/phrases manquants en source — SKIP`);
      ko++;
      continue;
    }

    const debut = Date.now();
    process.stdout.write(`  ▶ ${d.titre} ⭐${d.niveau_etoiles} (${d.phrases.length} phrases)… `);
    try {
      const res = await fetch(`${base}/api/tts/generer-dictee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dictee_id: d.id,
          niveau_etoiles: d.niveau_etoiles,
          texte_complet: d.texte,
          phrases: d.phrases,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.log(`❌ HTTP ${res.status} — ${txt.slice(0, 200)}`);
        ko++;
        continue;
      }
      const dur = Math.round((Date.now() - debut) / 1000);
      console.log(`✓ ${dur}s`);
      ok++;
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
      ko++;
    }
  }

  console.log("──────────────────────────────────────────────────");
  console.log(`Succès : ${ok}    Échecs : ${ko}    Total : ${cibles.length}`);
}

main().catch((err) => {
  console.error("Fatal :", err);
  process.exit(1);
});
