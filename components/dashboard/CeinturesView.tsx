"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface EleveStat {
  uid: string;
  prenom: string;
  nom: string;
  groupeId: string;
  ceintureIndex: number;
  ceintureCouleur: string;
  ceintureNom: string;
  nbObtenues: number;
  nbEntrainements: number;
  dernierResultat: { date: string; score: string } | null;
}

interface Groupe {
  id: string;
  nom: string;
}

interface Repartition {
  index: number;
  nom: string;
  couleur: string;
  count: number;
}

interface StatsData {
  groupes: Groupe[];
  eleves: EleveStat[];
  repartition: Repartition[];
  nbTotal: number;
}

export default function CeinturesView() {
  const [data, setData] = useState<StatsData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [groupeFiltre, setGroupeFiltre] = useState<string>("tous");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      fetch(`/api/ceinture-stats?enseignant_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => { setData(d); setChargement(false); })
        .catch(() => setChargement(false));
    });
  }, []);

  if (chargement) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 16 }} />
        ))}
      </div>
    );
  }

  if (!data || data.eleves.length === 0) {
    return (
      <div className="ens-student-card" style={{ textAlign: "center", padding: 40 }}>
        <span className="ms" style={{ fontSize: 40, color: "var(--pb-outline)", display: "block", marginBottom: 12 }}>military_tech</span>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--pb-on-surface)", marginBottom: 4 }}>
          Aucune ceinture activée
        </p>
        <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
          Activez les ceintures de multiplications depuis l&apos;onglet &quot;Programme du jour&quot; pour voir les statistiques.
        </p>
      </div>
    );
  }

  const elevesFiltres = groupeFiltre === "tous"
    ? data.eleves
    : data.eleves.filter((e) => e.groupeId === groupeFiltre);

  const elevesTries = [...elevesFiltres].sort((a, b) => {
    if (b.ceintureIndex !== a.ceintureIndex) return b.ceintureIndex - a.ceintureIndex;
    return a.nom.localeCompare(b.nom);
  });

  // Stats agrégées
  const nbActifs = elevesFiltres.filter((e) => e.nbEntrainements > 0).length;
  const moyenneCeinture = elevesFiltres.length > 0
    ? (elevesFiltres.reduce((s, e) => s + e.ceintureIndex, 0) / elevesFiltres.length).toFixed(1)
    : "0";

  // Répartition filtrée
  const repartition = groupeFiltre === "tous"
    ? data.repartition
    : data.repartition.map((r) => ({
        ...r,
        count: elevesFiltres.filter((e) => e.ceintureIndex === r.index).length,
      }));
  const maxCount = Math.max(1, ...repartition.map((r) => r.count));

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Filtre groupe */}
      {data.groupes.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setGroupeFiltre("tous")}
            style={{
              padding: "6px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
              cursor: "pointer", border: "none",
              background: groupeFiltre === "tous" ? "var(--pb-primary)" : "var(--pb-surface-container, #f0f0f0)",
              color: groupeFiltre === "tous" ? "white" : "var(--pb-on-surface-variant)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Tous les groupes
          </button>
          {data.groupes.map((g) => (
            <button
              key={g.id}
              onClick={() => setGroupeFiltre(g.id)}
              style={{
                padding: "6px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "none",
                background: groupeFiltre === g.id ? "var(--pb-primary)" : "var(--pb-surface-container, #f0f0f0)",
                color: groupeFiltre === g.id ? "white" : "var(--pb-on-surface-variant)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {g.nom}
            </button>
          ))}
        </div>
      )}

      {/* Stats globales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="ens-student-card" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--pb-primary)" }}>{elevesFiltres.length}</div>
          <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>élèves</div>
        </div>
        <div className="ens-student-card" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#F59E0B" }}>{nbActifs}</div>
          <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>se sont entraînés</div>
        </div>
        <div className="ens-student-card" style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#22C55E" }}>{moyenneCeinture}</div>
          <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>ceinture moyenne</div>
        </div>
      </div>

      {/* Répartition par ceinture */}
      <div className="ens-student-card" style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>bar_chart</span>
          Répartition par ceinture
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {repartition.filter((r) => r.count > 0 || r.index <= Math.max(...elevesFiltres.map((e) => e.ceintureIndex), 0) + 1).map((r) => (
            <div key={r.index} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%",
                background: r.couleur,
                border: r.couleur === "#9CA3AF" ? "1.5px solid #D1D5DB" : "none",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, width: 80, flexShrink: 0, color: "var(--pb-on-surface)" }}>{r.nom}</span>
              <div style={{ flex: 1, height: 20, background: "var(--pb-surface-container, #f5f5f5)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{
                  width: `${(r.count / maxCount) * 100}%`,
                  height: "100%",
                  background: r.couleur,
                  borderRadius: 10,
                  transition: "width 0.3s ease",
                  minWidth: r.count > 0 ? 20 : 0,
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, width: 24, textAlign: "right", color: "var(--pb-on-surface)" }}>{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tableau des élèves */}
      <div className="ens-student-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--pb-outline-variant, #e0e0e0)" }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>group</span>
            Détail par élève
          </h4>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--pb-surface-container, #fafafa)" }}>
                <th style={{ ...thStyle, textAlign: "left" }}>Élève</th>
                <th style={thStyle}>Ceinture actuelle</th>
                <th style={thStyle}>Obtenues</th>
                <th style={thStyle}>Entraînements</th>
                <th style={thStyle}>Dernier résultat</th>
              </tr>
            </thead>
            <tbody>
              {elevesTries.map((el) => (
                <tr key={el.uid} style={{ borderBottom: "1px solid var(--pb-outline-variant, #f0f0f0)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{el.prenom} {el.nom}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: "50%",
                        background: el.ceintureCouleur,
                        border: el.ceintureCouleur === "#9CA3AF" ? "1.5px solid #D1D5DB" : "none",
                        display: "inline-block",
                      }} />
                      <span>{el.ceintureNom}</span>
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{
                      fontWeight: 700,
                      color: el.nbObtenues > 0 ? "#16A34A" : "var(--pb-on-surface-variant)",
                    }}>
                      {el.nbObtenues}/{data.nbTotal}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {el.nbEntrainements > 0 ? (
                      <span style={{ fontWeight: 600 }}>{el.nbEntrainements}</span>
                    ) : (
                      <span style={{ color: "var(--pb-on-surface-variant)" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {el.dernierResultat ? (
                      <span>
                        <span style={{ fontWeight: 600 }}>{el.dernierResultat.score}</span>
                        <span style={{ color: "var(--pb-on-surface-variant)", marginLeft: 6, fontSize: 11 }}>
                          {formatDate(el.dernierResultat.date)}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--pb-on-surface-variant)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--pb-on-surface-variant)",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  whiteSpace: "nowrap",
};
