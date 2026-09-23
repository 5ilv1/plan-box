#!/usr/bin/env npx tsx
/**
 * Contrat du brouillon du panneau « Depuis ma programmation ».
 *
 * Le 23/09, un déploiement a rechargé la page pendant une génération : quinze
 * exercices engendrés, en mémoire seulement, ont disparu. Le brouillon les
 * garde ; la fusion décide quel contenu revient sur quelle ligne. Une fusion
 * fautive ne plante pas — elle pose l'exercice d'une séance sur une autre.
 *
 * Lancer après toute modification de lib/brouillon-seances.ts :
 *   npx tsx docs/tests/test-brouillon-seances.mjs
 */
import {
  fusionnerBrouillon, brouillonUtile, extraireEtat, lireBrouillon, sauverBrouillon,
  effacerBrouillon, BROUILLON_PERIME_MS, cleBrouillon,
} from "../../lib/brouillon-seances.ts";

let echecs = 0, total = 0;
function verifier(nom, obtenu, attendu) {
  total++;
  const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
  if (o !== a) { echecs++; console.log(`✗ ${nom}\n    attendu : ${a}\n    obtenu  : ${o}`); }
}

// Un localStorage minimal : le module s'en sert, Node n'en a pas.
const magasin = new Map();
globalThis.localStorage = {
  getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
  setItem: (k, v) => magasin.set(k, String(v)),
  removeItem: (k) => magasin.delete(k),
};

const ligne = (cle, extra = {}) => ({
  cle, choisie: true, type: "exercice", sousMatiere: "Conjugaison",
  sousMatiereIncertaine: false, typesSuggeres: ["exercice", "qcm"],
  statut: "attente", titre: `Séance ${cle}`, ...extra,
});
const EXO = { questions: [{ enonce: "Je (finir)", reponse_attendue: "finis" }] };

/* ── 1. La fusion ─────────────────────────────────────────────────────────── */

const fraiches = [ligne("a_0_CE2"), ligne("a_0_CM1"), ligne("b_0_CM2")];

verifier("sans brouillon, rien ne change",
  fusionnerBrouillon(fraiches, null), { lignes: fraiches, retrouves: 0 });

const brouillon = [
  { ...ligne("a_0_CE2"), statut: "ok", contenu: EXO, type: "texte_a_trous" },
  { ...ligne("a_0_CM1"), statut: "echec", erreur: "Erreur 500" },
  { ...ligne("b_0_CM2"), choisie: false },
];
const f = fusionnerBrouillon(fraiches, brouillon);
verifier("le contenu engendré revient sur SA ligne", f.lignes[0].contenu, EXO);
verifier("le type choisi revient avec lui", f.lignes[0].type, "texte_a_trous");
verifier("un exercice retrouvé est compté", f.retrouves, 1);
verifier("un échec reste un échec, avec sa raison",
  [f.lignes[1].statut, f.lignes[1].erreur], ["echec", "Erreur 500"]);
verifier("un choix décoché reste décoché", f.lignes[2].choisie, false);
verifier("la ligne fraîche garde ses champs Notion", f.lignes[0].titre, "Séance a_0_CE2");

// La programmation a pu bouger : on retrouve par la CLÉ, jamais par la position.
const reordonnees = [ligne("b_0_CM2"), ligne("a_0_CE2")];
const r = fusionnerBrouillon(reordonnees, brouillon);
verifier("retrouvé par la clé, pas par la position",
  [r.lignes[0].contenu, r.lignes[1].contenu], [undefined, EXO]);

// Une génération coupée n'a jamais abouti : on la reprendra.
const coupee = fusionnerBrouillon([ligne("a_0_CE2")], [{ ...ligne("a_0_CE2"), statut: "encours" }]);
verifier("une génération interrompue redevient « attente »", coupee.lignes[0].statut, "attente");
verifier("une génération interrompue n'est pas comptée", coupee.retrouves, 0);

// Un « ok » sans contenu ne doit pas passer pour prêt : on ne pose pas du vide.
const okVide = fusionnerBrouillon([ligne("a_0_CE2")], [{ ...ligne("a_0_CE2"), statut: "ok" }]);
verifier("« ok » sans contenu redevient « attente »", okVide.lignes[0].statut, "attente");

// Une séance supprimée de Notion : son exercice ne se rattache à rien.
const disparue = fusionnerBrouillon([ligne("a_0_CE2")], [{ ...ligne("z_0_CE2"), statut: "ok", contenu: EXO }]);
verifier("séance disparue : rien n'est rattaché ailleurs",
  [disparue.lignes.length, disparue.lignes[0].contenu, disparue.retrouves], [1, undefined, 0]);

// Le sous-domaine corrigé à la main survit, avec ses suggestions recalculées.
const corrige = fusionnerBrouillon([ligne("a_0_CE2")],
  [{ ...ligne("a_0_CE2"), sousMatiere: "Orthographe", typesSuggeres: ["texte_a_trous", "exercice"] }]);
verifier("le sous-domaine corrigé survit", corrige.lignes[0].sousMatiere, "Orthographe");
verifier("les suggestions suivent", corrige.lignes[0].typesSuggeres[0], "texte_a_trous");

/* ── 2. Ce qui mérite d'être gardé ───────────────────────────────────────── */

verifier("rien d'engendré : rien à garder", brouillonUtile([ligne("a")]), false);
verifier("un contenu : à garder", brouillonUtile([{ ...ligne("a"), statut: "ok", contenu: EXO }]), true);
verifier("une génération en cours : à garder", brouillonUtile([{ ...ligne("a"), statut: "encours" }]), true);
verifier("l'état ne garde pas les champs Notion",
  Object.keys(extraireEtat([ligne("a")])[0]).includes("titre"), false);

/* ── 3. Le stockage ─────────────────────────────────────────────────────── */

magasin.clear();
const LUNDI = "2026-09-28";
// LE piège du montage : la liste est vide, l'enregistrer effacerait tout.
sauverBrouillon(LUNDI, [{ ...ligne("a"), statut: "ok", contenu: EXO }]);
verifier("aller-retour : le contenu revient", lireBrouillon(LUNDI)?.[0]?.contenu, EXO);
sauverBrouillon(LUNDI, [ligne("a")]);
verifier("plus rien d'utile : le brouillon est retiré", lireBrouillon(LUNDI), null);

sauverBrouillon(LUNDI, [{ ...ligne("a"), statut: "ok", contenu: EXO }]);
verifier("un brouillon par semaine", lireBrouillon("2026-10-05"), null);
effacerBrouillon(LUNDI);
verifier("effacé après la pose", lireBrouillon(LUNDI), null);

// Une semaine passée ne revient pas des mois plus tard.
sauverBrouillon(LUNDI, [{ ...ligne("a"), statut: "ok", contenu: EXO }]);
verifier("périmé : ignoré", lireBrouillon(LUNDI, Date.now() + BROUILLON_PERIME_MS + 1), null);
verifier("périmé : effacé au passage", magasin.has(cleBrouillon(LUNDI)), false);

magasin.set(cleBrouillon(LUNDI), "{pas du json");
verifier("abîmé : ignoré sans planter", lireBrouillon(LUNDI), null);
magasin.set(cleBrouillon(LUNDI), JSON.stringify({ version: 2, enregistreLe: Date.now(), lignes: [] }));
verifier("autre version : ignorée", lireBrouillon(LUNDI), null);

// Stockage bloqué (navigation privée) : on perd le filet, jamais le travail.
globalThis.localStorage = {
  getItem: () => { throw new Error("bloqué"); },
  setItem: () => { throw new Error("quota"); },
  removeItem: () => { throw new Error("bloqué"); },
};
verifier("stockage bloqué : lecture sans planter", lireBrouillon(LUNDI), null);
let plante = false;
try { sauverBrouillon(LUNDI, [{ ...ligne("a"), statut: "ok", contenu: EXO }]); effacerBrouillon(LUNDI); }
catch { plante = true; }
verifier("stockage bloqué : écriture sans planter", plante, false);

console.log(echecs === 0 ? `✓ ${total} cas passent` : `\n${echecs} échec(s) sur ${total}`);
process.exit(echecs === 0 ? 0 : 1);
