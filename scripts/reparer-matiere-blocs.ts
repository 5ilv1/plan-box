#!/usr/bin/env npx tsx
/**
 * Précise la matière ET le sous-domaine des travaux déjà en base.
 *
 * Le suivi range chaque travail fait dans un sous-domaine (« Conjugaison »,
 * « Calcul »…) pour répondre à « où faut-il revenir ? ». Deux trous l'en
 * empêchent sur le contenu historique :
 *
 *   - `contenu.sous_matiere` n'existait sur **aucun** bloc : 158 exercices de
 *     français étaient agrégés sous un « Exercices » qui mélange conjugaison,
 *     grammaire et orthographe — la distinction qui sert précisément à décider ;
 *   - `contenu.matiere` n'était posé que sur `exercice` et `ressource`, donc les
 *     QCM et les classements tombaient dans « Non classé ».
 *
 * La génération pose désormais la matière sur tous les types ; ce script
 * rattrape l'existant.
 *
 * ⚠️ **Il ne devine rien et ne recopie rien tout seul.** `banque_exercices`
 * porte `matiere` et `sous_matiere`, mais ces colonnes sont du texte libre et
 * elles le montrent : « Français »/« français », « Mathématiques »/« Maths »/
 * « maths », 53 lignes vides, 2 sous-matières sur 165 — et « Révision : Le verbe
 * être et avoir au présent » y est enregistré en *Mathématiques*. Les types
 * autres que `exercice` et `qcm` y sont de surcroît stockés **sans titre**
 * (`generer/page.tsx:868`), donc sans moyen de les rattacher.
 *
 * Recopier la banque changerait un trou visible en erreur invisible : 20 travaux
 * de conjugaison comptés en maths, et plus personne pour s'en apercevoir. La
 * banque n'est donc affichée que comme **indice**, et chaque exercice est
 * confirmé à la main. Un exercice passé reste en l'état — jamais une régression.
 *
 * Idempotent : ne propose que les blocs dont le sous-domaine n'est pas déjà
 * précis (voir `Classement.precis` dans `lib/suivi-metriques.ts`).
 *
 * Usage :
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/reparer-matiere-blocs.ts --dry-run
 *   ... sans --dry-run pour répondre exercice par exercice et écrire
 *   ... --repondre "1=f1,2=f2,3=p"   pour répondre sans invite
 *   ... --tout    pour revoir aussi les blocs déjà classés par leur type
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  SOUS_DOMAINES,
  estComptePourCompletion,
  matiereDuBloc,
} from "../lib/suivi-metriques";
import { MATIERE_LECONS } from "../lib/matieres-referentiel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const DRY_RUN = process.argv.includes("--dry-run");
const TOUT = process.argv.includes("--tout");
const REPONSES_CLI =
  process.argv.find((a) => a.startsWith("--repondre="))?.slice("--repondre=".length) ??
  (() => {
    const i = process.argv.indexOf("--repondre");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();

/** Lettre de matière → nom canonique. `p` laisse l'exercice en l'état. */
const LETTRES: Record<string, string> = {
  f: "Français",
  m: "Mathématiques",
  l: "Lecture",
  c: MATIERE_LECONS,
};

// Garde-fou : le vocabulaire canonique a déjà changé une fois (« Maths » →
// « Mathématiques »), et le script avait continué de pointer sur l'ancien nom
// sans rien dire — chaque réponse « m » serait partie en erreur à l'exécution.
for (const [lettre, matiere] of Object.entries(LETTRES)) {
  if (!SOUS_DOMAINES[matiere]) {
    throw new Error(
      `Vocabulaire désaccordé : la lettre « ${lettre} » vise « ${matiere} », ` +
      `absent de SOUS_DOMAINES (${Object.keys(SOUS_DOMAINES).join(", ")}).`
    );
  }
}

const TAILLE_PAGE = 1000;

interface Bloc {
  id: string;
  type: string;
  titre: string;
  contenu: Record<string, unknown> | null;
}

interface Indice {
  matiere: string | null;
  sousMatiere: string | null;
}

interface Groupe {
  cle: string;
  type: string;
  titre: string;
  blocs: Bloc[];
  /** Ce que le bloc affiche aujourd'hui dans le suivi. */
  actuel: string;
  /** Ce que dit la banque — un indice, pas une vérité. */
  indice: Indice | null;
}

interface Decision {
  matiere: string;
  sousDomaine: string;
}

/** PostgREST plafonne à 1000 lignes : sans pagination, des blocs passeraient à la trappe. */
async function lireTousLesBlocs(): Promise<Bloc[]> {
  const tout: Bloc[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("plan_travail")
      .select("id, type, titre, contenu")
      .order("id", { ascending: true })
      .range(page * TAILLE_PAGE, (page + 1) * TAILLE_PAGE - 1);
    if (error) throw new Error(`lecture plan_travail : ${error.message}`);
    const lot = (data ?? []) as Bloc[];
    tout.push(...lot);
    if (lot.length < TAILLE_PAGE) return tout;
  }
}

async function indicesDeLaBanque(): Promise<Map<string, Indice>> {
  const { data, error } = await supabase
    .from("banque_exercices")
    .select("type, titre, matiere, sous_matiere")
    .not("titre", "is", null);
  if (error) {
    console.warn(`  (banque illisible : ${error.message} — on continue sans indice)`);
    return new Map();
  }
  const map = new Map<string, Indice>();
  for (const r of (data ?? []) as Array<{
    type: string; titre: string; matiere: string | null; sous_matiere: string | null;
  }>) {
    if (!r.matiere && !r.sous_matiere) continue;
    map.set(`${r.type}::${r.titre}`, { matiere: r.matiere, sousMatiere: r.sous_matiere });
  }
  return map;
}

function grouper(blocs: Bloc[], indices: Map<string, Indice>): Groupe[] {
  const groupes = new Map<string, Groupe>();

  for (const b of blocs) {
    // Hors périmètre du suivi : inutile de les classer.
    if (!estComptePourCompletion(b.type)) continue;

    const rang = matiereDuBloc(b.type, b.contenu);
    // Déjà précis — soit la sous-matière est saisie, soit le type suffit.
    // `--tout` permet de revenir dessus (un texte à trous rangé d'office en
    // orthographe peut relever de la conjugaison).
    const saisi = typeof b.contenu?.sous_matiere === "string" && b.contenu.sous_matiere.trim() !== "";
    if (rang.precis && !(TOUT && !saisi)) continue;

    const cle = `${b.type}::${b.titre}`;
    let g = groupes.get(cle);
    if (!g) {
      g = {
        cle, type: b.type, titre: b.titre, blocs: [],
        actuel: `${rang.matiere} · ${rang.sousDomaine}`,
        indice: indices.get(cle) ?? null,
      };
      groupes.set(cle, g);
    }
    g.blocs.push(b);
  }

  return [...groupes.values()].sort(
    (a, b) => b.blocs.length - a.blocs.length || a.titre.localeCompare(b.titre, "fr")
  );
}

function texteIndice(i: Indice | null): string {
  if (!i) return "banque : rien";
  const parts = [i.matiere ?? "?", i.sousMatiere ?? "sous-matière absente"];
  return `banque : ${parts.join(" · ")}`;
}

function afficherInventaire(groupes: Groupe[]) {
  const largeur = Math.min(46, Math.max(...groupes.map((g) => g.titre.length)));
  groupes.forEach((g, i) => {
    const titre = g.titre.length > largeur ? g.titre.slice(0, largeur - 1) + "…" : g.titre;
    console.log(
      `  ${String(i + 1).padStart(2)}. ${g.type.padEnd(14)} ${titre.padEnd(largeur)}  ` +
      `${String(g.blocs.length).padStart(3)} trav.  ` +
      `actuel : ${g.actuel.padEnd(24)} ${texteIndice(g.indice)}`
    );
  });
}

function menuMatieres(): string {
  return Object.entries(LETTRES)
    .map(([l, m]) => `[${l}] ${m}`)
    .join("  ") + "  [p] passer";
}

/** `--repondre "1=f3"` → matière `f`, 3ᵉ sous-domaine de cette matière. */
function parserReponses(brut: string): Map<number, Decision | null> {
  const map = new Map<number, Decision | null>();
  for (const part of brut.split(",")) {
    const [g, r] = part.split("=").map((s) => s.trim());
    const n = parseInt(g, 10);
    const rep = (r ?? "").toLowerCase();
    if (isNaN(n) || !rep) {
      throw new Error(`--repondre : « ${part} » est mal formé (attendu « 2=f1 » ou « 2=p »)`);
    }
    if (rep === "p") { map.set(n, null); continue; }

    const matiere = LETTRES[rep[0]];
    const sousDomaines = matiere ? SOUS_DOMAINES[matiere] : undefined;
    const idx = parseInt(rep.slice(1), 10);
    if (!matiere || !sousDomaines || isNaN(idx) || idx < 1 || idx > sousDomaines.length) {
      throw new Error(
        `--repondre : « ${part} » n'est pas une réponse valide. ` +
        `Attendu une lettre (${Object.keys(LETTRES).join("/")}) suivie du numéro du sous-domaine, ou « p ».`
      );
    }
    map.set(n, { matiere, sousDomaine: sousDomaines[idx - 1] });
  }
  return map;
}

async function demander(groupes: Groupe[]): Promise<Map<string, Decision | null>> {
  const decisions = new Map<string, Decision | null>();

  if (REPONSES_CLI) {
    const reponses = parserReponses(REPONSES_CLI);
    groupes.forEach((g, i) => {
      // Sans réponse explicite, on passe : le silence ne vaut pas accord.
      decisions.set(g.cle, reponses.get(i + 1) ?? null);
    });
    return decisions;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    for (const [i, g] of groupes.entries()) {
      console.log(`\n  ${i + 1}/${groupes.length} — ${g.type} · « ${g.titre} » (${g.blocs.length} travaux)`);
      console.log(`     Aujourd'hui : ${g.actuel}`);
      if (g.indice) {
        console.log(`     ${texteIndice(g.indice)} — à vérifier, la banque se trompe parfois.`);
      }

      // 1. La matière
      let matiere: string | null = null;
      for (;;) {
        const rep = (await rl.question(`     Matière — ${menuMatieres()} : `)).trim().toLowerCase();
        if (rep === "p") break;
        if (LETTRES[rep]) { matiere = LETTRES[rep]; break; }
        console.log(`     Réponse attendue : ${Object.keys(LETTRES).join(", ")} ou p.`);
      }
      if (!matiere) { decisions.set(g.cle, null); continue; }

      // 2. Le sous-domaine, dans la liste fermée de cette matière
      const choix = SOUS_DOMAINES[matiere];
      console.log(`     ${choix.map((s, k) => `[${k + 1}] ${s}`).join("  ")}`);
      let sousDomaine: string | null = null;
      for (;;) {
        const rep = (await rl.question("     Sous-domaine : ")).trim();
        const k = parseInt(rep, 10);
        if (!isNaN(k) && k >= 1 && k <= choix.length) { sousDomaine = choix[k - 1]; break; }
        console.log(`     Réponse attendue : un numéro entre 1 et ${choix.length}.`);
      }
      decisions.set(g.cle, { matiere, sousDomaine });
    }
  } finally {
    rl.close();
  }
  return decisions;
}

async function ecrire(groupes: Groupe[], decisions: Map<string, Decision | null>) {
  let blocsEcrits = 0;
  let passes = 0;

  for (const g of groupes) {
    const d = decisions.get(g.cle) ?? null;
    if (!d) { passes += g.blocs.length; continue; }

    for (const b of g.blocs) {
      const contenu = { ...(b.contenu ?? {}), matiere: d.matiere, sous_matiere: d.sousDomaine };
      const { error } = await supabase.from("plan_travail").update({ contenu }).eq("id", b.id);
      if (error) console.error(`    ✗ ${b.id} : ${error.message}`);
      else blocsEcrits++;
    }
    console.log(`  ✓ ${g.type} · « ${g.titre} » → ${d.matiere} · ${d.sousDomaine} (${g.blocs.length} travaux)`);

    // La banque sera repiochée : si elle disait autre chose, elle resservirait
    // la même erreur au prochain usage.
    const differe =
      g.indice !== null &&
      ((g.indice.matiere ?? "").trim().toLowerCase() !== d.matiere.toLowerCase() ||
       (g.indice.sousMatiere ?? "").trim().toLowerCase() !== d.sousDomaine.toLowerCase());
    if (differe) {
      const { error } = await supabase
        .from("banque_exercices")
        .update({ matiere: d.matiere, sous_matiere: d.sousDomaine })
        .eq("type", g.type)
        .eq("titre", g.titre);
      if (error) console.error(`    ✗ banque « ${g.titre} » : ${error.message}`);
      else console.log(`    ↳ banque corrigée : ${texteIndice(g.indice)} → ${d.matiere} · ${d.sousDomaine}`);
    }
  }

  console.log(`\n  ${blocsEcrits} travaux précisés, ${passes} laissés en l'état.`);
}

async function main() {
  console.log(DRY_RUN ? "Inventaire (aucune écriture)\n" : "Précision des matières et sous-domaines\n");

  const [blocs, indices] = await Promise.all([lireTousLesBlocs(), indicesDeLaBanque()]);
  const groupes = grouper(blocs, indices);

  const total = groupes.reduce((s, g) => s + g.blocs.length, 0);
  console.log(
    `  ${blocs.length} travaux lus, ${groupes.length} exercice(s) à préciser ` +
    `(${total} travaux)${TOUT ? " — mode --tout" : ""} :\n`
  );

  if (groupes.length === 0) {
    console.log("  Rien à préciser.");
    return;
  }

  afficherInventaire(groupes);

  if (DRY_RUN) {
    console.log("\n  Relancer sans --dry-run pour répondre exercice par exercice.");
    if (!TOUT) console.log("  Ajouter --tout pour revoir aussi les blocs classés d'office par leur type.");
    return;
  }

  console.log(
    "\n  La colonne « banque » n'est qu'un indice : c'est du texte libre, saisi à\n" +
    "  la génération, et il contient des erreurs. C'est votre réponse qui fait foi.\n"
  );

  const decisions = await demander(groupes);
  console.log("");
  await ecrire(groupes, decisions);
}

main().catch((e) => {
  // Une erreur d'argument est une faute de frappe, pas un bug : on montre la
  // phrase, pas la pile d'appels.
  console.error(`\n  ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
