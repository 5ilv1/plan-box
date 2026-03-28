"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { MotDict, PhraseDict } from "@/types";
import { genereTrous } from "@/lib/dictee-utils";
import EnseignantLayout from "@/components/EnseignantLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DicteeRow {
  id: string;
  batch_id: string | null;
  dictee_parent_id: string;
  titre: string;
  theme: string;
  texte: string;
  phrases: PhraseDict[];
  mots: MotDict[];
  points_travailles: string[];
  temps_verbaux: string[];
  niveau_etoiles: 1 | 2 | 3 | 4;
  audio_complet_url: string | null;
  audio_phrases_urls: { id: number; url: string | null }[];
  created_at: string;
}

// Un "jour" = 4 niveaux d'une même dictée (groupés par dictee_parent_id)
interface Jour {
  parentId: string;
  titre: string;
  niveaux: DicteeRow[];
}

// Un "batch" = toutes les dictées générées ensemble (une semaine)
interface Batch {
  batchId: string;
  theme: string;
  created_at: string;
  jours: Jour[]; // 1 par dictée générée (ex: 4 si "4 dictées par semaine")
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NIVEAUX = [
  { etoiles: 1 as const, label: "N1", long: "CE2" },
  { etoiles: 2 as const, label: "N2", long: "CM1" },
  { etoiles: 3 as const, label: "N3", long: "CM2" },
  { etoiles: 4 as const, label: "N4", long: "CM2+" },
];

// Labels des jours de dictée : le lundi est "dictée de mots" (géré séparément),
// les dictées audio commencent le mardi ; le vendredi est dicté par l'enseignant (pas d'audio élève)
const JOURS_LABELS = ["Mardi", "Jeudi", "Vendredi"];

const NB_SEMAINES_PAR_PERIODE = 6;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// Imprime du HTML via un iframe invisible (pas d'onglet about:blank)
function imprimerHTML(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 350);
}

// ─── Génération PDF (fenêtre print) ───────────────────────────────────────────

function genererPDF(batch: Batch) {
  const JOURS_NOMS_PDF = ["Mardi", "Jeudi", "Vendredi"];
  const NIVEAUX_LABELS: Record<number, string> = {
    1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐", 4: "⭐⭐⭐⭐",
  };

  // Niveaux présents dans le batch
  const niveausDispo = new Set<number>();
  for (const jour of batch.jours)
    for (const niv of jour.niveaux) niveausDispo.add(niv.niveau_etoiles);
  const niveauxTries = [1, 2, 3, 4].filter((e) => niveausDispo.has(e));

  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Dictées – ${batch.theme}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; }
  .page { padding: 20mm 18mm 16mm; min-height: 100vh; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  h1 { text-align: center; color: #1e3a5f; font-size: 14pt; font-weight: bold; margin-bottom: 14pt; }
  .jour-titre { color: #2563EB; font-weight: bold; font-size: 10.5pt; margin-top: 14pt; margin-bottom: 4pt; }
  .phrase { line-height: 1.5; font-size: 11pt; margin-bottom: 3pt; }
  @media print {
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>`;

  for (const etoiles of niveauxTries) {
    const label = NIVEAUX_LABELS[etoiles] ?? `Niveau ${etoiles}`;
    html += `<div class="page">
<h1>Dictées de la semaine – Niveau ${label} – ${batch.theme}</h1>
`;

    batch.jours.forEach((jour, jIdx) => {
      const niv = jour.niveaux.find((n) => n.niveau_etoiles === etoiles);
      if (!niv) return;
      const isLast = jIdx === batch.jours.length - 1;
      const jourNom = JOURS_NOMS_PDF[jIdx] ?? `Dictée ${jIdx + 1}`;
      const typeDictee = isLast ? "Dictée bilan" : "Dictée d\u2019entraînement";
      html += `<p class="jour-titre">${jourNom} – ${typeDictee}</p>\n`;
      niv.phrases.forEach((p) => {
        html += `<p class="phrase">${p.texte}</p>\n`;
      });
    });

    html += `</div>\n`;
  }

  html += `</body></html>`;
  imprimerHTML(html);
}

// ─── Génération PDF à trous (1 page par jour, tous niveaux) ──────────────────

function genererPDFTrous(batch: Batch) {
  const JOURS_NOMS_PDF = ["Mardi", "Jeudi", "Vendredi"];
  const NIVEAUX_LABELS: Record<number, string> = {
    1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐", 4: "⭐⭐⭐⭐",
  };

  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Dictées à trous – ${batch.theme}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; }
  .page { padding: 20mm 18mm 16mm; min-height: 100vh; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  h1 { text-align: center; color: #1e3a5f; font-size: 13pt; font-weight: bold; margin-bottom: 12pt; }
  .consigne { font-style: italic; font-size: 10pt; color: #555; margin-bottom: 18pt; }
  .niveau-titre { color: #2563EB; font-weight: bold; font-size: 11pt; margin-top: 20pt; margin-bottom: 10pt; }
  .phrase { line-height: 2.6; font-size: 11pt; }
  @media print {
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>`;

  batch.jours.forEach((jour, jIdx) => {
    const isLast = jIdx === batch.jours.length - 1;
    const jourNom = JOURS_NOMS_PDF[jIdx] ?? `Dictée ${jIdx + 1}`;
    const bilanStr = isLast ? " – Bilan" : "";
    const titre = `Dictées à trous – ${jourNom}${bilanStr} – ${batch.theme}`;

    const niveauxTries = [1, 2, 3, 4].filter((e) =>
      jour.niveaux.some((n) => n.niveau_etoiles === e)
    );

    html += `<div class="page">
<h1>${titre}</h1>
<p class="consigne">Complète avec les mots appris et les verbes conjugués.</p>\n`;

    for (const etoiles of niveauxTries) {
      const niv = jour.niveaux.find((n) => n.niveau_etoiles === etoiles);
      if (!niv) continue;
      const label = NIVEAUX_LABELS[etoiles] ?? `Niveau ${etoiles}`;
      html += `<p class="niveau-titre">${label}</p>\n`;
      niv.phrases.forEach((p) => {
        const avecTrous = genereTrous(p.texte, niv.mots);
        html += `<p class="phrase">${avecTrous}</p>\n`;
      });
    }

    html += `</div>\n`;
  });

  html += `</body></html>`;
  imprimerHTML(html);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PageDictees() {
  const supabase = createClient();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");
  const [groupesPB, setGroupesPB] = useState<{ id: string; nom: string }[]>([]);
  const [affectationEnCours, setAffectationEnCours] = useState<string | null>(null);
  const [semaineAffectation, setSemaineAffectation] = useState<Record<string, string>>({});

  // Vue active : tableau des mots ou bibliothèque
  const [vue, setVue] = useState<"tableau" | "bibliotheque">("bibliotheque");

  // Tableau des mots
  const [niveauActif, setNiveauActif] = useState<1 | 2 | 3 | 4>(2);
  const [semainesSelectionnees, setSemainesSelectionnees] = useState<Set<string>>(new Set());

  // Bibliothèque — accordéons ouverts (par batchId)
  const [semainesOuvertes, setSemainesOuvertes] = useState<Set<string>>(new Set());
  // Bibliothèque — jour actif dans chaque batch (index)
  const [batchJourActif, setBatchJourActif] = useState<Record<string, number>>({});
  // Bibliothèque — onglet niveau actif par batch (partagé entre tous les jours d'un batch)
  const [batchOnglet, setBatchOnglet] = useState<Record<string, 1 | 2 | 3 | 4>>({});
  // Mots dépliés — clé : `${batchId}-${jourIdx}`
  const [motsOuverts, setMotsOuverts] = useState<Set<string>>(new Set());
  // Lecture TTS en cours — clé : batchId
  const [lecture, setLecture] = useState<Record<string, boolean>>({});

  useEffect(() => {
    charger();
    fetch("/api/admin/groupes").then((r) => r.json())
      .then((data) => {
        const grps = Array.isArray(data) ? data : data.groupes ?? [];
        setGroupesPB(grps.map((g: any) => ({ id: g.id, nom: g.nom })));
      })
      .catch(() => {});
  }, []);

  async function charger() {
    setChargement(true);
    const { data, error } = await supabase
      .from("dictees")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      setErreurChargement(error.message);
      setChargement(false);
      return;
    }

    // ── Regroupement : batch_id → dictee_parent_id → DicteeRow[] ──────────
    // Anciens enregistrements sans batch_id : chaque dictee_parent_id = son propre batch
    const batchMap = new Map<string, Map<string, DicteeRow[]>>();
    for (const row of (data ?? []) as DicteeRow[]) {
      const pid = row.dictee_parent_id ?? row.id;
      const bid = row.batch_id ?? pid;
      if (!batchMap.has(bid)) batchMap.set(bid, new Map());
      const jourMap = batchMap.get(bid)!;
      if (!jourMap.has(pid)) jourMap.set(pid, []);
      jourMap.get(pid)!.push(row);
    }

    const liste: Batch[] = [];
    for (const [bid, jourMap] of batchMap.entries()) {
      const jours: Jour[] = [];
      for (const [pid, niveaux] of jourMap.entries()) {
        niveaux.sort((a, b) => a.niveau_etoiles - b.niveau_etoiles);
        jours.push({ parentId: pid, titre: niveaux[0].titre, niveaux });
      }
      // Trier les jours par date de création (ordre d'insertion = ordre des jours)
      jours.sort((a, b) =>
        new Date(a.niveaux[0].created_at).getTime() - new Date(b.niveaux[0].created_at).getTime()
      );
      const ref = jours[0]?.niveaux[0];
      liste.push({ batchId: bid, theme: ref?.theme ?? "", created_at: ref?.created_at ?? "", jours });
    }
    liste.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    setBatches(liste);

    // Initialiser onglets (défaut CM1 = 2)
    const initOnglets: Record<string, 1 | 2 | 3 | 4> = {};
    for (const b of liste) initOnglets[b.batchId] = 2;
    setBatchOnglet(initOnglets);

    setChargement(false);
  }

  const niveauInfo = NIVEAUX.find((n) => n.etoiles === niveauActif) ?? NIVEAUX[1];
  const nbSelectionnees = semainesSelectionnees.size;

  function toggleSelectionSemaine(batchId: string) {
    setSemainesSelectionnees((prev) => {
      const s = new Set(prev);
      s.has(batchId) ? s.delete(batchId) : s.add(batchId);
      return s;
    });
  }

  function toutSelectionner() {
    setSemainesSelectionnees(new Set(batches.map((b) => b.batchId)));
  }

  function toutDeselectionner() {
    setSemainesSelectionnees(new Set());
  }

  // Calcule le lundi de la semaine contenant une date ISO (YYYY-MM-DD)
  function getLundiDeSemaine(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay(); // 0=dim, 1=lun, ..., 6=sam
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  }

  // Retourne le lundi suivant (ou le lundi de la semaine prochaine si on est déjà après lundi)
  function getProchainLundi(): string {
    const d = new Date();
    const day = d.getDay(); // 0=dim, 1=lun
    const diff = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  }

  // Offsets des jours depuis lundi : Lundi=0, Mardi=1, Jeudi=3, Vendredi=4 (pas de mercredi)
  const JOURS_OFFSETS = [0, 1, 3, 4];

  async function affecterDictee(batch: Batch) {
    if (groupesPB.length === 0) {
      alert("Aucun groupe trouvé. Vérifiez que votre classe contient des groupes.");
      return;
    }

    const lundi = semaineAffectation[batch.batchId] || getProchainLundi();
    const nbJours = Math.min(batch.jours.length, JOURS_LABELS.length);

    if (nbJours === 0) {
      alert("Ce batch ne contient aucune dictée.");
      return;
    }

    const lundiDate = new Date(lundi + "T00:00:00");
    const joursDates = JOURS_OFFSETS.slice(0, nbJours).map((offset) => {
      const d = new Date(lundiDate);
      d.setDate(d.getDate() + offset);
      return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    });

    const JOURS_DESC = ["Lundi : dictée de mots", "Mardi : dictée d'entraînement", "Jeudi : dictée d'entraînement", "Vendredi : dictée bilan (en classe)"];
    if (!confirm(
      `Affecter "${batch.theme}" à toute la classe ?\n\n` +
      joursDates.map((d, i) => `${JOURS_DESC[i] ?? JOURS_LABELS[i]} — ${d}`).join("\n") +
      `\n\nSemaine du ${new Date(lundi + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
    )) return;

    setAffectationEnCours(batch.batchId);

    try {
      // Collecter tous les mots uniques du premier jour (toutes les étoiles)
      const premierJour = batch.jours[0];
      const motsUniques: { mot: string; definition: string }[] = [];
      const motsSeen = new Set<string>();
      if (premierJour) {
        for (const niv of premierJour.niveaux) {
          for (const m of (niv.mots ?? [])) {
            const key = m.mot.toLowerCase().trim();
            if (!motsSeen.has(key)) {
              motsSeen.add(key);
              motsUniques.push({ mot: m.mot, definition: m.definition });
            }
          }
        }
      }

      const assignation = {
        groupeIds: groupesPB.map((g) => g.id),
        eleveUids: [],
        groupeNoms: groupesPB.map((g) => g.nom),
      };

      // Lundi : mots de la semaine (premier parent_id)
      // Mardi : dictée d'entraînement (deuxième parent_id)
      // Jeudi : dictée d'entraînement (troisième parent_id)
      // Vendredi : dictée bilan (en classe, pas de bloc élève)
      const blocs: { type: string; titre: string; jour: number; contenu: Record<string, unknown>; assignation: typeof assignation }[] = [];

      // Lundi — Mots
      if (batch.jours[0]) {
        blocs.push({
          type: "mots",
          titre: `${batch.theme} — Mots`,
          jour: JOURS_OFFSETS[0], // 0 = lundi
          contenu: {
            dictee_parent_id: batch.jours[0].parentId,
            batch_id: batch.batchId,
            theme: batch.theme,
            mots_semaine: true,
            mots: motsUniques,
            titre_dictee: batch.theme,
          },
          assignation,
        });
      }

      // Mardi — Dictée d'entraînement (2e parent)
      if (batch.jours[1]) {
        blocs.push({
          type: "dictee",
          titre: `${batch.theme} — Mardi`,
          jour: JOURS_OFFSETS[1], // 1 = mardi
          contenu: {
            dictee_parent_id: batch.jours[1].parentId,
            batch_id: batch.batchId,
            theme: batch.theme,
          },
          assignation,
        });
      }

      // Jeudi — Dictée d'entraînement (3e parent)
      if (batch.jours[2]) {
        blocs.push({
          type: "dictee",
          titre: `${batch.theme} — Jeudi`,
          jour: JOURS_OFFSETS[2], // 3 = jeudi
          contenu: {
            dictee_parent_id: batch.jours[2].parentId,
            batch_id: batch.batchId,
            theme: batch.theme,
          },
          assignation,
        });
      }

      // Vendredi — Dictée bilan : pas de bloc élève (l'enseignant gère en classe)

      const res = await fetch("/api/planifier-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lundi, blocs }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        alert(`Erreur : ${json.error ?? "Affectation échouée."}`);
      } else {
        const msg = json.totalSkipped > 0
          ? `Dictées affectées (${json.totalInserted} créées, ${json.totalSkipped} déjà existantes).`
          : `Dictées affectées avec succès (${json.totalInserted} blocs créés).`;
        alert(msg);
      }
    } catch (err) {
      alert("Erreur réseau lors de l'affectation.");
    } finally {
      setAffectationEnCours(null);
    }
  }

  async function supprimerBatch(batch: Batch) {
    const titre0 = batch.jours[0]?.titre ?? batch.theme;
    if (!confirm(`Supprimer la semaine "${titre0}" et tous les exercices élèves associés ?\n\nCette action est irréversible.`)) return;

    const parentIds = batch.jours.map((j) => j.parentId);
    const titres = [...new Set(batch.jours.map((j) => j.titre))];
    const titresMots = titres.map((t) => `Mots — ${t}`);

    const res = await fetch("/api/supprimer-dictee-semaine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: batch.batchId, parentIds, titres, titresMots }),
    });
    const json = await res.json();

    if (!res.ok || json.erreur) {
      alert(`Erreur : ${json.erreur ?? "Suppression échouée."}`);
      return;
    }

    await charger();
  }

  function imprimerTableauMots() {
    const selection = nbSelectionnees > 0
      ? batches.filter((b) => semainesSelectionnees.has(b.batchId))
      : batches;
    const label = niveauInfo.label;
    let html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Mots de dictée</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; padding: 20mm 18mm; }
  h1 { text-align: center; font-size: 13pt; margin-bottom: 16pt; color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #D1D5DB; padding: 8pt 12pt; border: 1px solid #9CA3AF; text-align: left; font-size: 13pt; }
  td { padding: 10pt 12pt; border: 1px solid #E5E7EB; font-size: 11pt; line-height: 1.6; }
  td:first-child { font-weight: bold; white-space: nowrap; width: 90pt; }
  tr:nth-child(even) td { background: #F9FAFB; }
</style></head><body>
<h1>Mots de dictée</h1>
<table><thead><tr><th>${label}</th><th></th></tr></thead><tbody>\n`;
    selection.forEach((batch) => {
      const numSemaine = batches.indexOf(batch) + 1;
      const niv = batch.jours[0]?.niveaux.find((n) => n.niveau_etoiles === niveauActif);
      const motsTxt = (niv?.mots ?? []).map((m) => m.mot).join(" – ") || "—";
      html += `<tr><td>Semaine ${numSemaine}</td><td>${motsTxt}</td></tr>\n`;
    });
    html += `</tbody></table></body></html>`;
    imprimerHTML(html);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 820 }}>

          <div className="no-print" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}><span className="ms" style={{ fontSize: 22, verticalAlign: "middle" }}>headphones</span> Dictées</h1>
              <p className="text-secondary text-sm">Tableau des mots et bibliothèque audio.</p>
            </div>
            <Link
              href="/enseignant/generer?type=dictee"
              className="btn-primary"
            >
              Nouvelle dictée
            </Link>
          </div>

          {/* Onglets vue */}
          <div className="tabs no-print" style={{ marginBottom: 24 }}>
            <button className={`tab${vue === "tableau" ? " active" : ""}`} onClick={() => setVue("tableau")}>
              Tableau des mots
            </button>
            <button className={`tab${vue === "bibliotheque" ? " active" : ""}`} onClick={() => setVue("bibliotheque")}>
              Bibliothèque
            </button>
          </div>

          {chargement && (
            <div style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>Chargement…</div>
          )}

          {erreurChargement && (
            <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
              <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>warning</span> Erreur : {erreurChargement}
              <br /><span style={{ fontSize: 12, opacity: 0.8 }}>La table &quot;dictees&quot; existe-t-elle dans Supabase ? Vérifiez aussi les politiques RLS.</span>
            </div>
          )}

          {!chargement && !erreurChargement && batches.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}><span className="ms" style={{ fontSize: 48 }}>headphones</span></div>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Aucune dictée pour l&apos;instant</p>
              <p className="text-secondary text-sm" style={{ marginBottom: 20 }}>
                Générez votre première dictée différenciée.
              </p>
              <Link href="/enseignant/generer?type=dictee" className="btn-primary">
                Générer une dictée
              </Link>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* TABLEAU DES MOTS                                                 */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!chargement && batches.length > 0 && vue === "tableau" && (
            <div>
              {/* Contrôles */}
              <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>

                {/* Sélecteur niveau */}
                <div style={{ display: "flex", gap: 4 }}>
                  {NIVEAUX.map((n) => (
                    <button
                      key={n.etoiles}
                      onClick={() => setNiveauActif(n.etoiles)}
                      style={{
                        padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                        fontWeight: niveauActif === n.etoiles ? 700 : 500,
                        background: niveauActif === n.etoiles ? "var(--primary)" : "white",
                        color: niveauActif === n.etoiles ? "white" : "var(--text-secondary)",
                        border: niveauActif === n.etoiles ? "none" : "1px solid var(--border)",
                      }}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>

                {/* Sélection rapide */}
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button
                    onClick={toutSelectionner}
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                  >
                    Tout cocher
                  </button>
                  <button
                    onClick={toutDeselectionner}
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                  >
                    Tout décocher
                  </button>
                </div>

                {/* Bouton imprimer */}
                <button
                  onClick={imprimerTableauMots}
                  className="btn-secondary"
                  style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6 }}
                >
                  {nbSelectionnees > 0 ? `Imprimer la sélection (${nbSelectionnees})` : "Imprimer tout"}
                </button>
              </div>

              {/* Tableau — toutes les semaines, cases à cocher pour sélectionner */}
              <div style={{ background: "white", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#D1D5DB" }}>
                      <th className="no-print" style={{
                        width: 36, padding: "10px 12px", border: "1px solid #9CA3AF", textAlign: "center",
                      }}>
                        <input
                          type="checkbox"
                          checked={nbSelectionnees === batches.length && batches.length > 0}
                          onChange={(e) => e.target.checked ? toutSelectionner() : toutDeselectionner()}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <th style={{
                        width: 110, padding: "10px 16px", textAlign: "left",
                        fontWeight: 700, fontSize: 16, border: "1px solid #9CA3AF",
                      }}>
                        {niveauInfo.label}
                      </th>
                      <th style={{ padding: "10px 16px", border: "1px solid #9CA3AF" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch, idx) => {
                      const coche = semainesSelectionnees.has(batch.batchId);
                      const niv = batch.jours[0]?.niveaux.find((n) => n.niveau_etoiles === niveauActif);
                      const mots = niv?.mots ?? [];
                      const motsTxt = mots.map((m) => m.mot).join(" – ");

                      return (
                        <tr
                          key={batch.batchId}
                          style={{ background: coche ? "#F0FDF4" : idx % 2 === 0 ? "white" : "#F9FAFB", cursor: "pointer" }}
                          onClick={() => toggleSelectionSemaine(batch.batchId)}
                        >
                          <td className="no-print" style={{
                            padding: "10px 12px", border: "1px solid #E5E7EB", textAlign: "center",
                          }}>
                            <input
                              type="checkbox"
                              checked={coche}
                              onChange={() => toggleSelectionSemaine(batch.batchId)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{
                            padding: "12px 16px", fontWeight: 700, fontSize: 14,
                            border: "1px solid #E5E7EB", whiteSpace: "nowrap", verticalAlign: "top",
                          }}>
                            Semaine {idx + 1}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 14, lineHeight: 1.7, border: "1px solid #E5E7EB" }}>
                            {mots.length > 0
                              ? motsTxt
                              : <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Aucun mot pour ce niveau</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* BIBLIOTHÈQUE                                                     */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!chargement && batches.length > 0 && vue === "bibliotheque" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...batches].reverse().map((batch, idxBatch) => {
                const bid = batch.batchId;
                const ouvert = semainesOuvertes.has(bid);
                const ongletActif = batchOnglet[bid] ?? 2;
                const jourActifIdx = batchJourActif[bid] ?? 0;
                const jour = batch.jours[jourActifIdx] ?? batch.jours[0];
                const niv = jour?.niveaux.find((n) => n.niveau_etoiles === ongletActif) ?? jour?.niveaux[0];
                const numSemaine = batches.length - idxBatch;
                const motsCleKey = `${bid}-${jourActifIdx}`;
                const motsOuvert = motsOuverts.has(motsCleKey);
                const enLecture = lecture[bid] ?? false;

                function toggleSemaine() {
                  setSemainesOuvertes((prev) => {
                    const s = new Set(prev);
                    s.has(bid) ? s.delete(bid) : s.add(bid);
                    return s;
                  });
                }

                function toggleMots() {
                  setMotsOuverts((prev) => {
                    const s = new Set(prev);
                    s.has(motsCleKey) ? s.delete(motsCleKey) : s.add(motsCleKey);
                    return s;
                  });
                }

                function jouer() {
                  if (enLecture) {
                    const el = document.getElementById(`audio-${bid}-${ongletActif}`) as HTMLAudioElement | null;
                    el?.pause();
                    setLecture((prev) => ({ ...prev, [bid]: false }));
                    return;
                  }
                  const src = niv?.audio_complet_url;
                  if (!src) return;
                  const el = document.getElementById(`audio-${bid}-${ongletActif}`) as HTMLAudioElement | null;
                  if (!el) return;
                  el.src = src;
                  el.onended = () => setLecture((prev) => ({ ...prev, [bid]: false }));
                  el.play().then(() => setLecture((prev) => ({ ...prev, [bid]: true }))).catch(() => {});
                }

                const nbJours = batch.jours.length;
                // Le dernier jour = Vendredi (dictée bilan) : l'enseignant dicte en classe, pas d'audio élève
                const isVendredi = jourActifIdx === nbJours - 1;
                const titreSemaine = `Semaine ${numSemaine} — ${batch.jours[0]?.titre ?? batch.theme}`;

                return (
                  <div key={bid} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "white" }}>

                    {/* ── En-tête accordéon ── */}
                    <div
                      style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", padding: "14px 20px",
                        background: ouvert ? "#F0FDF4" : "white",
                        borderBottom: ouvert ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {/* Zone titre (cliquable pour toggle) */}
                      <div
                        onClick={toggleSemaine}
                        style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{titreSemaine}</span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {nbJours > 1 ? `${nbJours} dictées · ` : ""}{batch.theme} · {formatDate(batch.created_at)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {/* Sélecteur lundi de démarrage + bouton Affecter */}
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Début :</span>
                          <input
                            type="date"
                            value={semaineAffectation[bid] || getProchainLundi()}
                            onChange={(e) => {
                              const lundi = getLundiDeSemaine(e.target.value);
                              setSemaineAffectation((prev) => ({ ...prev, [bid]: lundi }));
                            }}
                            style={{
                              padding: "4px 8px", fontSize: 12, borderRadius: 6,
                              border: "1px solid var(--border)", background: "white",
                              cursor: "pointer", width: 130,
                            }}
                            title="Lundi de démarrage de la semaine"
                          />
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); affecterDictee(batch); }}
                          disabled={affectationEnCours === bid}
                          className="btn-primary"
                          style={{ padding: "4px 12px", fontSize: 13, borderRadius: 6, opacity: affectationEnCours === bid ? 0.6 : 1 }}
                          title="Affecter à toute la classe (Lundi : mots, Mardi et Jeudi : dictées, Vendredi : bilan en classe)"
                        >
                          {affectationEnCours === bid ? "Envoi…" : "Affecter"}
                        </button>
                        <button
                          onClick={() => genererPDF(batch)}
                          className="btn-secondary"
                          style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => genererPDFTrous(batch)}
                          className="btn-secondary"
                          style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}
                        >
                          À trous
                        </button>
                        <button
                          onClick={() => supprimerBatch(batch)}
                          className="btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 14, color: "var(--text-secondary)" }}
                          title="Supprimer cette semaine"
                        >
                          <span className="ms" style={{ fontSize: 16 }}>delete</span>
</button>
                        <span
                          onClick={toggleSemaine}
                          style={{ fontSize: 18, color: "var(--text-secondary)", lineHeight: 1, cursor: "pointer" }}
                        >
                          {ouvert ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* ── Contenu accordéon ── */}
                    {ouvert && jour && (
                      <div style={{ padding: "16px 20px" }}>

                        {/* Sélecteur jour (visible seulement si plusieurs dictées dans le batch) */}
                        {nbJours > 1 && (
                          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                            {batch.jours.map((j, jIdx) => (
                              <button
                                key={j.parentId}
                                onClick={() => {
                                  (document.getElementById(`audio-${bid}-${ongletActif}`) as HTMLAudioElement | null)?.pause();
                                  setLecture((prev) => ({ ...prev, [bid]: false }));
                                  setBatchJourActif((prev) => ({ ...prev, [bid]: jIdx }));
                                }}
                                style={{
                                  padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                                  fontWeight: jourActifIdx === jIdx ? 700 : 500,
                                  background: jourActifIdx === jIdx ? "var(--primary)" : "white",
                                  color: jourActifIdx === jIdx ? "white" : "var(--text-secondary)",
                                  border: jourActifIdx === jIdx ? "none" : "1px solid var(--border)",
                                }}
                              >
                                {JOURS_LABELS[jIdx] ?? `Dictée ${jIdx + 1}`}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Onglets niveaux */}
                        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
                          {jour.niveaux.map((n) => (
                            <button
                              key={n.niveau_etoiles}
                              onClick={() => {
                                (document.getElementById(`audio-${bid}-${ongletActif}`) as HTMLAudioElement | null)?.pause();
                                setLecture((prev) => ({ ...prev, [bid]: false }));
                                setBatchOnglet((prev) => ({ ...prev, [bid]: n.niveau_etoiles as 1 | 2 | 3 | 4 }));
                              }}
                              style={{
                                padding: "7px 16px", fontSize: 13, cursor: "pointer",
                                fontWeight: ongletActif === n.niveau_etoiles ? 700 : 500,
                                background: "none", border: "none",
                                borderBottom: ongletActif === n.niveau_etoiles ? "2px solid var(--primary)" : "2px solid transparent",
                                color: ongletActif === n.niveau_etoiles ? "var(--primary)" : "var(--text-secondary)",
                                marginBottom: -2,
                              }}
                            >
                              {NIVEAUX.find((l) => l.etoiles === n.niveau_etoiles)?.long}
                            </button>
                          ))}
                        </div>

                        {/* ── Ligne principale : bouton play + phrases ── */}
                        {niv && (
                          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                            <audio id={`audio-${bid}-${ongletActif}`} style={{ display: "none" }} />
                            {isVendredi ? (
                              /* Vendredi = dictée bilan dictée par l'enseignant en classe → pas d'audio */
                              <div
                                title="Dictée bilan — l'enseignant dicte en classe"
                                style={{
                                  flexShrink: 0, width: 52, height: 52, borderRadius: "50%",
                                  background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 22,
                                }}
                              >
                                🏫
                              </div>
                            ) : (
                              <button
                                onClick={jouer}
                                title={enLecture ? "Arrêter" : "Écouter"}
                                disabled={!niv?.audio_complet_url}
                                style={{
                                  flexShrink: 0, width: 52, height: 52, borderRadius: "50%",
                                  background: enLecture ? "#DC2626" : "var(--primary)",
                                  color: "white", border: "none", cursor: niv?.audio_complet_url ? "pointer" : "not-allowed",
                                  fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                  opacity: niv?.audio_complet_url ? 1 : 0.4,
                                }}
                              >
                                {enLecture ? "⏹" : "▶"}
                              </button>
                            )}

                            <div style={{ flex: 1 }}>
                              {(niv.phrases ?? []).map((p, i) => (
                                <p key={p.id} style={{ fontSize: 14, lineHeight: 1.8, margin: "0 0 4px 0" }}>
                                  <span style={{ fontWeight: 700, color: "var(--text-secondary)", marginRight: 6, fontSize: 12 }}>
                                    {i + 1}.
                                  </span>
                                  {p.texte}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Mots à apprendre (dépliant) — communs à toute la semaine ── */}
                        {(niv?.mots?.length ?? 0) > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <button
                              onClick={toggleMots}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                background: "none", border: "none", cursor: "pointer",
                                fontSize: 13, fontWeight: 600, color: "var(--text-secondary)",
                                padding: "6px 0",
                              }}
                            >
                              <span style={{ fontSize: 11 }}>{motsOuvert ? "▲" : "▼"}</span>
                              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>assignment</span> Mots à apprendre ({niv!.mots.length})
                            </button>

                            {motsOuvert && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                                {niv!.mots.map((m) => (
                                  <div key={m.mot} style={{
                                    padding: "6px 12px", borderRadius: 8,
                                    background: "var(--bg)", border: "1px solid var(--border)", fontSize: 13,
                                  }}>
                                    <strong>{m.mot}</strong>
                                    {m.definition && (
                                      <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>— {m.definition}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* Styles impression */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .card { box-shadow: none !important; border: 1px solid #ddd !important; page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </EnseignantLayout>
  );
}
