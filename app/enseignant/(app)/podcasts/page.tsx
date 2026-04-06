"use client";

import { useState, useEffect } from "react";

interface ScoreEleve {
  prenom: string;
  nom: string;
  score: number;
  total: number;
  pct: number;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  created_at: string;
}

interface Podcast {
  qcm_id: string;
  titre: string;
  date: string;
  dans_podium: boolean;
  nb_eleves: number;
  scores: ScoreEleve[];
}

export default function PodcastsEnseignant() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/podcasts")
      .then((r) => r.json())
      .then((json) => setPodcasts(json.podcasts ?? []))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  async function togglePodium(qcm_id: string, current: boolean, titre: string) {
    setSaving(qcm_id);
    const newVal = !current;
    setPodcasts((prev) =>
      prev.map((p) => (p.qcm_id === qcm_id ? { ...p, dans_podium: newVal } : p))
    );
    await fetch("/api/podcasts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qcm_id, dans_podium: newVal, titre }),
    }).catch(() => {});
    setSaving(null);
  }

  if (chargement) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--pb-on-surface-variant)" }}>
        Chargement des podcasts...
      </div>
    );
  }

  if (podcasts.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 8 }}>
          Podcasts
        </h1>
        <p style={{ color: "var(--pb-on-surface-variant)" }}>
          Aucun podcast avec QCM n'a encore été assigné.
        </p>
      </div>
    );
  }

  const nbPodium = podcasts.filter((p) => p.dans_podium).length;

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>
          <span className="ms" style={{ fontSize: 28, verticalAlign: "middle", marginRight: 8 }}>podcasts</span>
          Podcasts
        </h1>
        <p style={{ color: "var(--pb-on-surface-variant)", fontSize: 14 }}>
          {podcasts.length} podcast{podcasts.length > 1 ? "s" : ""} &middot; {nbPodium} dans le podium global
        </p>
      </div>

      {/* Liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {podcasts.map((p) => {
          const isOpen = ouvert === p.qcm_id;
          const moyennePct = p.scores.length > 0
            ? Math.round(p.scores.reduce((s, e) => s + e.pct, 0) / p.scores.length)
            : 0;

          return (
            <div
              key={p.qcm_id}
              style={{
                background: "white",
                borderRadius: "1rem",
                border: "1px solid var(--pb-outline-variant, #E0E0FF)",
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              {/* En-tête podcast */}
              <div
                onClick={() => setOuvert(isOpen ? null : p.qcm_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "18px 20px",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: p.dans_podium ? "rgba(245,158,11,0.12)" : "rgba(107,114,128,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span className="ms" style={{ fontSize: 24, color: p.dans_podium ? "#F59E0B" : "#9CA3AF" }}>
                    {p.dans_podium ? "emoji_events" : "podcasts"}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.titre}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2, display: "flex", gap: 12 }}>
                    <span>
                      {p.date ? new Date(p.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </span>
                    <span>{p.nb_eleves} participant{p.nb_eleves > 1 ? "s" : ""}</span>
                    {p.nb_eleves > 0 && <span>Moyenne : {moyennePct}%</span>}
                  </div>
                </div>

                {/* Toggle podium */}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePodium(p.qcm_id, p.dans_podium, p.titre); }}
                  disabled={saving === p.qcm_id}
                  title={p.dans_podium ? "Retirer du podium global" : "Ajouter au podium global"}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 999,
                    border: `1.5px solid ${p.dans_podium ? "#F59E0B" : "#D1D5DB"}`,
                    background: p.dans_podium ? "#FFFBEB" : "white",
                    color: p.dans_podium ? "#92400E" : "#6B7280",
                    fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    opacity: saving === p.qcm_id ? 0.5 : 1,
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>
                    {p.dans_podium ? "emoji_events" : "add"}
                  </span>
                  {p.dans_podium ? "Dans le podium" : "Hors podium"}
                </button>

                <span className="ms" style={{
                  fontSize: 20, color: "var(--pb-on-surface-variant)",
                  transition: "transform 0.2s",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                }}>
                  expand_more
                </span>
              </div>

              {/* Détail scores élèves */}
              {isOpen && (
                <div style={{
                  borderTop: "1px solid var(--pb-outline-variant, #E0E0FF)",
                  padding: "16px 20px",
                  background: "var(--pb-surface-low, #FAFAFE)",
                }}>
                  {p.scores.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textAlign: "center", padding: "12px 0" }}>
                      Aucun élève n'a encore répondu.
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--pb-outline-variant, #E0E0FF)" }}>
                          <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>#</th>
                          <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Élève</th>
                          <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Score</th>
                          <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>%</th>
                          <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.scores.map((s, i) => {
                          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid var(--pb-outline-variant, #F0F0F8)" }}>
                              <td style={{ padding: "10px 0", width: 40 }}>
                                {medal || (i + 1)}
                              </td>
                              <td style={{ padding: "10px 0", fontWeight: 600 }}>
                                {s.prenom} {s.nom}
                              </td>
                              <td style={{ padding: "10px 0", textAlign: "center" }}>
                                {s.score}/{s.total}
                              </td>
                              <td style={{ padding: "10px 0", textAlign: "center" }}>
                                <span style={{
                                  display: "inline-block",
                                  padding: "2px 10px", borderRadius: 999,
                                  fontSize: 12, fontWeight: 700,
                                  background: s.pct >= 70 ? "#DCFCE7" : s.pct >= 40 ? "#FEF3C7" : "#FEE2E2",
                                  color: s.pct >= 70 ? "#166534" : s.pct >= 40 ? "#92400E" : "#991B1B",
                                }}>
                                  {s.pct}%
                                </span>
                              </td>
                              <td style={{ padding: "10px 0", textAlign: "right", color: "var(--pb-on-surface-variant)", fontSize: 12 }}>
                                {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
