"use client";

import { useEffect, useState, use, useMemo } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Performance {
  eleve: { uid: string; prenom: string; nom: string; niveau_nom: string | null; source: "planbox" | "repetibox" };
  periode: string;
  global: { score_eleve: number; nb_exercices: number } | null;
  matieres: Array<{
    matiere: string;
    score_eleve: number | null;
    nb_exercices: number;
    sous_matieres: Array<{
      sous_matiere: string;
      score_eleve: number | null;
      nb_exercices: number;
    }>;
  }>;
}

interface SuiviExtra {
  prenom: string;
  niveau: string | null;
  ceinture: { index: number; nom: string; couleur: string };
  lecture: { nb_blocs_faits: number };
  forces: string[];
  faiblesses: string[];
}

type Periode = "jour" | "semaine" | "mois" | "trimestre" | "all";

const PERIODES: Array<{ value: Periode; label: string }> = [
  { value: "jour", label: "Aujourd'hui" },
  { value: "semaine", label: "7 jours" },
  { value: "mois", label: "30 jours" },
  { value: "trimestre", label: "Trimestre" },
  { value: "all", label: "Tout" },
];

// Normalisation des libellés sous-matière → labels lisibles
const LIBELLE_SOUS: Record<string, string> = {
  "Conjugaison": "Conjugaison",
  "Grammaire": "Grammaire",
  "Vocabulaire": "Vocabulaire",
  "rituel-orthographe": "Orthographe",
  "Orthographe": "Orthographe",
  "Écriture": "Écriture",
  "Lecture": "Lecture",
  "Calcul": "Calcul",
  "Calcul mental": "Calcul",
  "Problèmes": "Problèmes",
};

const couleurPct = (p: number | null | undefined): string => {
  if (p === null || p === undefined) return "#9CA3AF";
  if (p >= 80) return "#16A34A";
  if (p >= 60) return "#D97706";
  if (p >= 40) return "#EA580C";
  return "#DC2626";
};

// ──────────────────────────────────────────────────────────────────────────────

export default function PageSuiviEleve({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);

  const [perf, setPerf] = useState<Performance | null>(null);
  const [extra, setExtra] = useState<SuiviExtra | null>(null);
  const [periode, setPeriode] = useState<Periode>("all");
  const [chargement, setChargement] = useState(true);
  const [extraChargement, setExtraChargement] = useState(false);

  // Charge la performance
  useEffect(() => {
    setChargement(true);
    fetch(`/api/enseignant/eleves/${rawId}/performance?periode=${periode}`)
      .then((r) => r.json())
      .then((data) => setPerf(data))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, [rawId, periode]);

  // Domaines à passer à l'IA pour forces/faiblesses
  const domaines = useMemo(() => {
    if (!perf) return [];
    const flat: Array<{ libelle: string; pourcentage: number | null; matiere: string }> = [];
    for (const m of perf.matieres) {
      for (const sm of m.sous_matieres) {
        flat.push({
          libelle: LIBELLE_SOUS[sm.sous_matiere] ?? sm.sous_matiere,
          pourcentage: sm.score_eleve,
          matiere: m.matiere,
        });
      }
    }
    return flat;
  }, [perf]);

  // Charge les extras (ceinture + lecture + IA)
  useEffect(() => {
    if (!perf) return;
    setExtraChargement(true);
    fetch(`/api/enseignant/eleves/${rawId}/suivi-extra?periode=${periode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domaines: domaines.map((d) => ({ libelle: d.libelle, pourcentage: d.pourcentage })),
      }),
    })
      .then((r) => r.json())
      .then((data) => setExtra(data))
      .catch(() => {})
      .finally(() => setExtraChargement(false));
  }, [rawId, periode, perf, domaines]);

  if (chargement && !perf) {
    return <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />;
  }

  if (!perf || !perf.eleve) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <p>Élève introuvable.</p>
        <Link href="/enseignant/admin/eleves" className="btn-primary-sm" style={{ marginTop: 16 }}>
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  const matFr = perf.matieres.find((m) => m.matiere === "français");
  const matMaths = perf.matieres.find((m) => m.matiere === "maths" || m.matiere === "mathématiques");
  const matLecture = perf.matieres.find((m) => m.matiere === "lecture");

  // Sous-matières français — toutes les rubriques attendues
  const SOUS_FR = ["Conjugaison", "Vocabulaire", "Grammaire", "Orthographe", "Écriture", "Lecture"];
  const SOUS_MATHS = ["Calcul", "Problèmes", "Tables ×"];

  function ligneSous(libelle: string, pct: number | null, suffixe?: React.ReactNode) {
    return (
      <div
        key={libelle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 14px", fontSize: 14,
          borderBottom: "1px solid #F3F4F6",
        }}
      >
        <span style={{ color: "var(--pb-on-surface)", fontWeight: 500 }}>{libelle}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {suffixe}
          <span style={{
            fontWeight: 700, color: couleurPct(pct), minWidth: 48, textAlign: "right",
          }}>
            {pct !== null && pct !== undefined ? `${pct}%` : "—"}
          </span>
        </div>
      </div>
    );
  }

  function blocMatiere(titre: string, pctGlobal: number | null, lignes: React.ReactNode) {
    return (
      <div style={{
        background: "white", borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ddd)",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.12))",
          borderBottom: "1.5px solid rgba(124,58,237,0.15)",
        }}>
          <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, margin: 0 }}>
            {titre}
          </h3>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            border: `3px solid ${couleurPct(pctGlobal)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "white",
          }}>
            <span style={{ fontWeight: 800, color: couleurPct(pctGlobal), fontSize: 14 }}>
              {pctGlobal !== null && pctGlobal !== undefined ? `${pctGlobal}%` : "—"}
            </span>
          </div>
        </div>
        <div>{lignes}</div>
      </div>
    );
  }

  // Construction des lignes Français
  const lignesFr = SOUS_FR.map((nom) => {
    if (nom === "Lecture") {
      const sm = matLecture?.sous_matieres.find((sm) => true) ?? matFr?.sous_matieres.find((sm) => sm.sous_matiere === "Lecture");
      const pct = sm?.score_eleve ?? null;
      const nbLectures = extra?.lecture.nb_blocs_faits ?? 0;
      return ligneSous(
        nom,
        pct,
        nbLectures > 0 ? (
          <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
            {nbLectures} bloc{nbLectures > 1 ? "s" : ""} lu{nbLectures > 1 ? "s" : ""}
          </span>
        ) : undefined
      );
    }
    const sm = matFr?.sous_matieres.find((s) => (LIBELLE_SOUS[s.sous_matiere] ?? s.sous_matiere) === nom);
    return ligneSous(nom, sm?.score_eleve ?? null);
  });

  // Construction des lignes Maths
  const lignesMaths = SOUS_MATHS.map((nom) => {
    if (nom === "Tables ×") {
      const c = extra?.ceinture;
      return (
        <div
          key={nom}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", fontSize: 14,
            borderBottom: "1px solid #F3F4F6",
          }}
        >
          <span style={{ color: "var(--pb-on-surface)", fontWeight: 500 }}>{nom}</span>
          {c && c.index >= 0 ? (
            <span style={{
              padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: c.couleur, color: "white",
            }}>
              Ceinture {c.nom}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
              Aucune ceinture
            </span>
          )}
        </div>
      );
    }
    const sm = matMaths?.sous_matieres.find((s) => (LIBELLE_SOUS[s.sous_matiere] ?? s.sous_matiere) === nom);
    return ligneSous(nom, sm?.score_eleve ?? null);
  });

  return (
    <>
      {/* Bouton retour */}
      <Link
        href="/enseignant/admin/eleves"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--pb-on-surface-variant)",
          textDecoration: "none", marginBottom: 14,
        }}
      >
        <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
        Retour aux élèves
      </Link>

      {/* En-tête : photo (initiale) + nom + chasse + filtre */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap", marginBottom: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg, #7C3AED, #4338CA)",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 26,
          }}>
            {(perf.eleve.prenom?.[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <h1 className="ens-page-title" style={{ marginBottom: 2 }}>
              {perf.eleve.prenom} {perf.eleve.nom}
            </h1>
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: 0 }}>
              Suivi pédagogique
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {extra?.niveau && (
            <span style={{
              padding: "6px 14px", borderRadius: 12,
              border: "1.5px solid #4338CA", color: "#4338CA",
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 14,
            }}>
              Classe&nbsp;: {extra.niveau}
            </span>
          )}
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value as Periode)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 13,
              border: "1.5px solid var(--pb-outline-variant, #ddd)", background: "white",
            }}
          >
            {PERIODES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grille principale : (gauche) blocs matières / (droite) +/- */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
        gap: 18, alignItems: "start",
      }}>
        {/* Colonne gauche : Français + Maths */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {blocMatiere(
            "Français",
            matFr?.score_eleve ?? null,
            lignesFr
          )}
          {blocMatiere(
            "Maths",
            matMaths?.score_eleve ?? null,
            lignesMaths
          )}
        </div>

        {/* Colonne droite : forces / faiblesses */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            background: "#F0FDF4", border: "1.5px solid #BBF7D0",
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
              color: "#166534", fontSize: 14,
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
              Points forts
            </div>
            {extraChargement && !extra?.forces.length ? (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#166534aa", margin: 0 }}>Analyse en cours…</p>
            ) : extra?.forces.length ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {extra.forces.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#166534", lineHeight: 1.4 }}>· {f}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#166534aa", margin: 0 }}>
                Pas encore assez de données pour conclure.
              </p>
            )}
          </div>

          <div style={{
            background: "#FEF2F2", border: "1.5px solid #FECACA",
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
              color: "#991B1B", fontSize: 14,
            }}>
              <span style={{ fontSize: 24, lineHeight: 0.7, fontWeight: 900 }}>−</span>
              Points à travailler
            </div>
            {extraChargement && !extra?.faiblesses.length ? (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#991B1Baa", margin: 0 }}>Analyse en cours…</p>
            ) : extra?.faiblesses.length ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {extra.faiblesses.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.4 }}>· {f}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#991B1Baa", margin: 0 }}>
                Pas encore assez de données pour conclure.
              </p>
            )}
          </div>

          {/* Récap stats brutes */}
          <div style={{
            background: "white", border: "1.5px solid var(--pb-outline-variant, #ddd)",
            borderRadius: 14, padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: 6, fontSize: 12,
            color: "var(--pb-on-surface-variant)",
          }}>
            <div>
              <strong>{perf.global?.nb_exercices ?? 0}</strong> exercice{(perf.global?.nb_exercices ?? 0) > 1 ? "s" : ""} validé{(perf.global?.nb_exercices ?? 0) > 1 ? "s" : ""}
            </div>
            <div>
              <strong>{extra?.lecture.nb_blocs_faits ?? 0}</strong> bloc{(extra?.lecture.nb_blocs_faits ?? 0) > 1 ? "s" : ""} de lecture
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
