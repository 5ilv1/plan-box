#!/usr/bin/env npx tsx
/**
 * Contrat du cron du thème d'écriture.
 *
 * Il échouait environ un jour de classe sur deux sans laisser de trace. Chaque
 * scénario de panne est rejoué ici avec de fausses dépendances — ni base, ni
 * modèle, ni attente réelle.
 *
 * Lancer après toute modification de lib/cron-theme-ecriture.ts :
 *   npx tsx docs/tests/test-cron-theme-ecriture.mjs
 */
import { executerThemeDuJour } from "../../lib/cron-theme-ecriture.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

const JEUDI = 4, MERCREDI = 3, LUNDI = 1;

/** Des dépendances qui marchent ; chaque test en casse une. */
function deps(surcharge = {}) {
  let blocs = 0;
  const appels = { generer: 0, affecter: 0, attentes: [] };
  const d = {
    jourSemaine: JEUDI,
    dernierMode: async () => "jour",
    dejaPlanifie: async () => false,
    generer: async () => { appels.generer++; return { id: "t1", sujet: "Ton plat préféré" }; },
    affecter: async () => { appels.affecter++; blocs = 20; return { nb_eleves: 20 }; },
    blocsDuJour: async () => blocs,
    attendre: async (ms) => { appels.attentes.push(ms); },
    ...surcharge,
  };
  return { d, appels };
}

/* ── 1. Le cas normal ────────────────────────────────────────────────────── */

{
  const { d, appels } = deps();
  const r = await executerThemeDuJour(d);
  verifier("jour de classe : thème généré, affecté, vérifié",
    [r.statut, r.nbEleves, r.nbBlocs, r.tentatives], ["ok", 20, 20, 2]);
  verifier("une génération, une affectation, aucune attente",
    [appels.generer, appels.affecter, appels.attentes.length], [1, 1, 0]);
}

/* ── 2. Les jours où il ne doit rien faire ───────────────────────────────── */

{
  const { d, appels } = deps({ jourSemaine: MERCREDI });
  const r = await executerThemeDuJour(d);
  verifier("mercredi : ignoré", [r.statut, appels.generer], ["ignore", 0]);
}
{
  const { d, appels } = deps({ dernierMode: async () => "semaine" });
  const r = await executerThemeDuJour(d);
  verifier("mode semaine un jeudi : ignoré", [r.statut, appels.generer], ["ignore", 0]);
}
{
  const { d } = deps({ jourSemaine: LUNDI, dernierMode: async () => "semaine" });
  verifier("mode semaine un lundi : généré", (await executerThemeDuJour(d)).statut, "ok");
}
{
  const { d, appels } = deps({ dejaPlanifie: async () => true });
  const r = await executerThemeDuJour(d);
  verifier("déjà planifié d'avance : ignoré, rien de généré", [r.statut, appels.generer], ["ignore", 0]);
}

/* ── 3. Les pannes passagères sont reprises ──────────────────────────────── */

{
  let n = 0;
  const { d, appels } = deps({
    generer: async () => { n++; if (n < 3) throw new Error("529 overloaded"); return { id: "t1" }; },
  });
  const r = await executerThemeDuJour(d);
  verifier("le modèle échoue deux fois puis répond : ok au 3e essai",
    [r.statut, r.tentatives], ["ok", 4]);
  verifier("deux attentes, croissantes", appels.attentes, [2000, 5000]);
}
{
  let n = 0;
  const { d } = deps({
    affecter: async () => { n++; if (n === 1) throw new Error("timeout"); return { nb_eleves: 20 }; },
    blocsDuJour: async () => 20,
  });
  verifier("l'affectation échoue une fois puis passe : ok", (await executerThemeDuJour(d)).statut, "ok");
}

/* ── 4. Les pannes durables sont DITES, plus jamais un « ok » ────────────── */

{
  const { d, appels } = deps({ generer: async () => { throw new Error("529 overloaded"); } });
  const r = await executerThemeDuJour(d);
  verifier("le modèle échoue trois fois : échec, avec l'erreur",
    [r.statut, r.erreur, r.tentatives], ["echec", "529 overloaded", 3]);
  verifier("et rien n'est affecté", appels.affecter, 0);
}
{
  const { d, appels } = deps({ generer: async () => ({ id: null }) });
  const r = await executerThemeDuJour(d);
  verifier("une génération sans identifiant n'est pas un thème (l'ancien bug)",
    [r.statut, appels.affecter], ["echec", 0]);
}
{
  const { d } = deps({ affecter: async () => ({ nb_eleves: 20 }), blocsDuJour: async () => 0 });
  const r = await executerThemeDuJour(d);
  verifier("affectation annoncée mais aucun bloc : échec — la preuve, pas la promesse",
    r.statut, "echec");
}
{
  const { d } = deps({ dernierMode: async () => { throw new Error("base injoignable"); } });
  const r = await executerThemeDuJour(d);
  verifier("une base injoignable est un échec dit, pas une exception qui fuit",
    [r.statut, r.erreur], ["echec", "base injoignable"]);
}

/* ── 5. Une affectation reprise ne double pas les blocs ──────────────────── */

{
  // Premier essai : les blocs sont insérés, puis l'erreur tombe avant la fin.
  // Le second trouve des blocs pour aujourd'hui et s'arrête (déjà planifié).
  let blocs = 0, n = 0;
  const { d } = deps({
    affecter: async () => {
      n++;
      if (n === 1) { blocs = 20; throw new Error("coupure après insertion"); }
      return { nb_eleves: 0, deja_planifie: blocs > 0 };
    },
    blocsDuJour: async () => blocs,
  });
  const r = await executerThemeDuJour(d);
  verifier("coupure après insertion : la reprise constate les blocs, ok, 20 blocs et pas 40",
    [r.statut, r.nbBlocs], ["ok", 20]);
}

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);
