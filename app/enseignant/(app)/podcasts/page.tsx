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

interface Groupe {
  id: string;
  nom: string;
}

interface Podcast {
  qcm_id: string;
  titre: string;
  date: string;
  contenu: Record<string, unknown>;
  dans_podium: boolean;
  nb_eleves: number;
  scores: ScoreEleve[];
}

// Prochain lundi (ou aujourd'hui si lundi)
function prochainLundi(): string {
  const d = new Date();
  const jour = d.getDay();
  const diff = jour === 0 ? 1 : jour === 1 ? 0 : 8 - jour;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

export default function PodcastsEnseignant() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Affectation
  const [affecterQcmId, setAffecterQcmId] = useState<string | null>(null);
  const [affDate, setAffDate] = useState(prochainLundi());
  const [affGroupeIds, setAffGroupeIds] = useState<Set<string>>(new Set());
  const [affMode, setAffMode] = useState<"classe" | "groupes">("classe");
  const [affEnCours, setAffEnCours] = useState(false);
  const [affResultat, setAffResultat] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/podcasts").then((r) => r.json()),
      fetch("/api/admin/groupes").then((r) => r.json()),
    ])
      .then(([podJson, grpJson]) => {
        setPodcasts(podJson.podcasts ?? []);
        setGroupes(grpJson.groupes ?? []);
      })
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

  function ouvrirAffecter(qcm_id: string) {
    setAffecterQcmId(qcm_id);
    setAffDate(prochainLundi());
    setAffGroupeIds(new Set());
    setAffMode("classe");
    setAffResultat(null);
  }

  async function lancerAffectation() {
    if (!affecterQcmId) return;
    const podcast = podcasts.find((p) => p.qcm_id === affecterQcmId);
    if (!podcast) return;

    setAffEnCours(true);
    setAffResultat(null);

    const body: Record<string, unknown> = {
      type: "ressource",
      titre: podcast.titre,
      contenu: podcast.contenu,
      dateAssignation: affDate,
      periodicite: "jour",
      groupeIds: affMode === "classe" ? groupes.map((g) => g.id) : Array.from(affGroupeIds),
    };

    try {
      const res = await fetch("/api/affecter-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        setAffResultat(`Affecté à ${json.nb} élève${json.nb > 1 ? "s" : ""}`);
        setTimeout(() => setAffecterQcmId(null), 2000);
      } else {
        setAffResultat(`Erreur : ${json.erreur ?? "inconnue"}`);
      }
    } catch {
      setAffResultat("Erreur réseau");
    }
    setAffEnCours(false);
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
          <span className="ms" style={{ fontSize: 28, verticalAlign: "middle", marginRight: 8 }}>podcasts</span>
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
          const isAffecting = affecterQcmId === p.qcm_id;
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

                {/* Bouton Affecter */}
                <button
                  onClick={(e) => { e.stopPropagation(); ouvrirAffecter(p.qcm_id); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 999,
                    border: "1.5px solid var(--pb-primary, #0050D4)",
                    background: "rgba(0,80,212,0.06)",
                    color: "var(--pb-primary, #0050D4)",
                    fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>send</span>
                  Affecter
                </button>

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

              {/* Panneau d'affectation */}
              {isAffecting && (
                <div style={{
                  borderTop: "1px solid var(--pb-outline-variant, #E0E0FF)",
                  padding: "20px",
                  background: "rgba(0,80,212,0.03)",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6 }}>send</span>
                    Affecter ce podcast
                  </div>

                  {/* Date (lundi) */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", display: "block", marginBottom: 4 }}>
                      Semaine du (lundi)
                    </label>
                    <input
                      type="date"
                      value={affDate}
                      onChange={(e) => setAffDate(e.target.value)}
                      style={{
                        padding: "8px 12px", borderRadius: 8,
                        border: "1.5px solid var(--pb-outline-variant, #D1D5DB)",
                        fontSize: 14, fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Mode */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", display: "block", marginBottom: 6 }}>
                      Affecter à
                    </label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      {(["classe", "groupes"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setAffMode(m)}
                          style={{
                            padding: "6px 16px", borderRadius: 999,
                            border: `1.5px solid ${affMode === m ? "var(--pb-primary)" : "#D1D5DB"}`,
                            background: affMode === m ? "var(--pb-primary)" : "white",
                            color: affMode === m ? "white" : "var(--pb-on-surface)",
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                          }}
                        >
                          {m === "classe" ? "Toute la classe" : "Groupe(s)"}
                        </button>
                      ))}
                    </div>

                    {affMode === "groupes" && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {groupes.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => setAffGroupeIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id);
                              else next.add(g.id);
                              return next;
                            })}
                            style={{
                              padding: "5px 14px", borderRadius: 999,
                              border: `1.5px solid ${affGroupeIds.has(g.id) ? "var(--pb-primary)" : "#E0E0FF"}`,
                              background: affGroupeIds.has(g.id) ? "rgba(0,80,212,0.08)" : "white",
                              color: affGroupeIds.has(g.id) ? "var(--pb-primary)" : "var(--pb-on-surface)",
                              fontSize: 13, fontWeight: 600, cursor: "pointer",
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {g.nom}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={lancerAffectation}
                      disabled={affEnCours || (affMode === "groupes" && affGroupeIds.size === 0)}
                      style={{
                        padding: "10px 24px", borderRadius: 999,
                        background: "var(--pb-primary, #0050D4)", color: "white",
                        border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        opacity: affEnCours || (affMode === "groupes" && affGroupeIds.size === 0) ? 0.5 : 1,
                      }}
                    >
                      {affEnCours ? "Affectation..." : "Affecter"}
                    </button>
                    <button
                      onClick={() => setAffecterQcmId(null)}
                      style={{
                        padding: "10px 20px", borderRadius: 999,
                        background: "transparent", color: "var(--pb-on-surface-variant)",
                        border: "1.5px solid var(--pb-outline-variant, #D1D5DB)",
                        fontSize: 14, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }}
                    >
                      Annuler
                    </button>
                    {affResultat && (
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: affResultat.startsWith("Erreur") ? "#DC2626" : "#16A34A",
                      }}>
                        {affResultat}
                      </span>
                    )}
                  </div>
                </div>
              )}

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
