"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface SuiviResp {
  titre: string;
  sousTitre: string | null;
  nbEleves: number;
  domaines: Record<string, { score: number | null; nb_essais: number }>;
  matieres: {
    francais: { score: number | null; nb_essais: number };
    maths: { score: number | null; nb_essais: number };
  };
  ceinture: { index: number; nom: string; couleur: string } | null;
  lecture: { nb_blocs_faits: number };
  forces: string[];
  faiblesses: string[];
  niveau: string | null;
}

type Periode = "jour" | "semaine" | "mois" | "trimestre" | "all";

const PERIODES: Array<{ value: Periode; label: string }> = [
  { value: "jour", label: "Aujourd'hui" },
  { value: "semaine", label: "7 jours" },
  { value: "mois", label: "30 jours" },
  { value: "trimestre", label: "Trimestre" },
  { value: "all", label: "Tout" },
];

const SOUS_FR = ["Conjugaison", "Vocabulaire", "Grammaire", "Orthographe", "Écriture", "Lecture"];
const SOUS_MATHS = ["Calcul", "Problèmes", "Tables ×"];

const couleurPct = (p: number | null | undefined): string => {
  if (p === null || p === undefined) return "#9CA3AF";
  if (p >= 80) return "#16A34A";
  if (p >= 60) return "#D97706";
  if (p >= 40) return "#EA580C";
  return "#DC2626";
};

interface Props {
  cible: "eleve" | "classe";
  id?: string; // pour cible=eleve
  niveauInitial?: "tous" | "CE2" | "CM1" | "CM2"; // pour cible=classe
  retourHref?: string;
  retourLabel?: string;
}

export default function PortraitSuivi({ cible, id, niveauInitial = "tous", retourHref, retourLabel }: Props) {
  const [periode, setPeriode] = useState<Periode>("all");
  const [niveau, setNiveau] = useState<"tous" | "CE2" | "CM1" | "CM2">(niveauInitial);
  const [data, setData] = useState<SuiviResp | null>(null);
  const [chargement, setChargement] = useState(true);

  const url = useMemo(() => {
    const params = new URLSearchParams({ periode });
    if (cible === "eleve") {
      params.set("cible", "eleve");
      params.set("id", id ?? "");
    } else {
      params.set("cible", "classe");
      params.set("niveau", niveau);
    }
    return `/api/enseignant/suivi?${params}`;
  }, [cible, id, niveau, periode]);

  useEffect(() => {
    setChargement(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, [url]);

  if (chargement && !data) {
    return <div className="skeleton" style={{ height: 400, borderRadius: 16 }} />;
  }
  if (!data) {
    return <p style={{ padding: 32, textAlign: "center" }}>Aucune donnée.</p>;
  }

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

  // Lignes Français
  const lignesFr = SOUS_FR.map((nom) => {
    if (nom === "Lecture") {
      const nb = data.lecture.nb_blocs_faits;
      return ligneSous(
        nom,
        null,
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>
          {nb} bloc{nb > 1 ? "s" : ""}
        </span>
      );
    }
    return ligneSous(nom, data.domaines[nom]?.score ?? null);
  });

  // Lignes Maths
  const lignesMaths = SOUS_MATHS.map((nom) => {
    if (nom === "Tables ×") {
      const c = data.ceinture;
      if (cible === "classe") {
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
            <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
              Voir « Ceintures » dans le dashboard
            </span>
          </div>
        );
      }
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
    return ligneSous(nom, data.domaines[nom]?.score ?? null);
  });

  return (
    <>
      {retourHref && (
        <Link
          href={retourHref}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "var(--pb-on-surface-variant)",
            textDecoration: "none", marginBottom: 14,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          {retourLabel ?? "Retour"}
        </Link>
      )}

      {/* En-tête */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap", marginBottom: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: cible === "eleve"
              ? "linear-gradient(135deg, #7C3AED, #4338CA)"
              : "linear-gradient(135deg, #059669, #047857)",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 26,
          }}>
            {cible === "eleve"
              ? (data.titre[0] ?? "?").toUpperCase()
              : <span className="ms" style={{ fontSize: 32 }}>school</span>}
          </div>
          <div>
            <h1 className="ens-page-title" style={{ marginBottom: 2 }}>
              {data.titre}
            </h1>
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: 0 }}>
              {data.sousTitre ?? "Suivi pédagogique"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {cible === "eleve" && data.niveau && (
            <span style={{
              padding: "6px 14px", borderRadius: 12,
              border: "1.5px solid #4338CA", color: "#4338CA",
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 14,
            }}>
              Classe&nbsp;: {data.niveau}
            </span>
          )}
          {cible === "classe" && (
            <select
              value={niveau}
              onChange={(e) => setNiveau(e.target.value as typeof niveau)}
              style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 13,
                border: "1.5px solid var(--pb-outline-variant, #ddd)", background: "white",
              }}
            >
              <option value="tous">Toute la classe</option>
              <option value="CE2">CE2</option>
              <option value="CM1">CM1</option>
              <option value="CM2">CM2</option>
            </select>
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

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
        gap: 18, alignItems: "start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {blocMatiere("Français", data.matieres.francais.score, lignesFr)}
          {blocMatiere("Maths", data.matieres.maths.score, lignesMaths)}
        </div>

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
            {data.forces.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {data.forces.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#166534", lineHeight: 1.4 }}>· {f}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#166534aa", margin: 0 }}>
                Pas encore assez de données.
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
            {data.faiblesses.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {data.faiblesses.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.4 }}>· {f}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#991B1Baa", margin: 0 }}>
                Pas encore assez de données.
              </p>
            )}
          </div>

          <div style={{
            background: "white", border: "1.5px solid var(--pb-outline-variant, #ddd)",
            borderRadius: 14, padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: 6, fontSize: 12,
            color: "var(--pb-on-surface-variant)",
          }}>
            <div>
              <strong>{data.matieres.francais.nb_essais + data.matieres.maths.nb_essais}</strong> évaluations cumulées
            </div>
            <div>
              <strong>{data.lecture.nb_blocs_faits}</strong> bloc{data.lecture.nb_blocs_faits > 1 ? "s" : ""} de lecture
            </div>
            {cible === "classe" && (
              <div>
                <strong>{data.nbEleves}</strong> élève{data.nbEleves > 1 ? "s" : ""} dans la cohorte
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
