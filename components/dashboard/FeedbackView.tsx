"use client";

import { useEffect, useState } from "react";
import { TYPE_BLOC_CONFIG, TypeBloc } from "@/types";

interface ReponseEleve {
  id: number;
  reponse: string;
  correcte: boolean | null;
}

interface QuestionExo {
  id: number;
  enonce: string;
  reponse_attendue: string;
}

interface EleveFeedback {
  id: string;
  prenom: string;
  nom: string;
  statut: string;
  scoreEleve: number | null;
  scoreTotal: number | null;
  groupe: string;
  enRetard: boolean;
  reponsesEleve: ReponseEleve[] | null;
  questions: QuestionExo[] | null;
}

interface ProblemeJourAttempt {
  studentId: string;
  prenom: string;
  solved: boolean;
  attempts: number;
  hintsUsed: number;
  studentAnswer: string | null;
  date: string;
}

interface ExerciceFeedback {
  cle: string;
  type: string;
  titre: string;
  groupes: string[];
  dateAssignation: string;
  total: number;
  faits: number;
  enCours: number;
  enRetard: number;
  scoreMoyen: number | null;
  eleves: EleveFeedback[];
}

interface Alerte {
  type: string;
  message: string;
  exercice?: string;
}

interface FeedbackStats {
  totalBlocs: number;
  totalFaits: number;
  tauxCompletion: number;
  tauxReussiteMoyen: number | null;
  totalExercices: number;
}

const STATUT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  fait:     { label: "Fait",        icon: "check_circle", color: "#16A34A", bg: "#DCFCE7" },
  en_cours: { label: "En cours",    icon: "pending",      color: "#2563EB", bg: "#DBEAFE" },
  a_faire:  { label: "À faire",     icon: "circle",       color: "#6B7280", bg: "#F3F4F6" },
  retard:   { label: "En retard",   icon: "warning",      color: "#DC2626", bg: "#FEE2E2" },
};

export default function FeedbackView() {
  const [loading, setLoading] = useState(true);
  const [exercices, setExercices] = useState<ExerciceFeedback[]>([]);
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [semaine, setSemaine] = useState("");
  const [selectedExo, setSelectedExo] = useState<ExerciceFeedback | null>(null);
  const [selectedEleveDetail, setSelectedEleveDetail] = useState<string | null>(null);
  const [problemesDuJour, setProblemesDuJour] = useState<ProblemeJourAttempt[]>([]);
  const [filtrePeriode, setFiltrePeriode] = useState<"jour" | "semaine">("jour");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/feedback?periode=${filtrePeriode}`)
      .then((r) => r.json())
      .then((data) => {
        setExercices(data.exercices ?? []);
        setAlertes(data.alertes ?? []);
        setStats(data.stats ?? null);
        setSemaine(data.semaine ?? "");
        setProblemesDuJour(data.problemesDuJour ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filtrePeriode]);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Filtre période ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", fontWeight: 500 }}>
          {semaine}
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--pb-surface-container, #e7e6ff)", borderRadius: 10, padding: 3 }}>
          {(["jour", "semaine"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFiltrePeriode(p)}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer",
                background: filtrePeriode === p ? "white" : "transparent",
                color: filtrePeriode === p ? "var(--pb-on-surface)" : "var(--pb-on-surface-variant)",
                boxShadow: filtrePeriode === p ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {p === "jour" ? "Aujourd\u2019hui" : "Semaine"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bandeau de stats ── */}
      {stats && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12,
        }}>
          {[
            { label: "Complétion", value: `${stats.tauxCompletion}%`, icon: "task_alt", color: stats.tauxCompletion >= 70 ? "#16A34A" : stats.tauxCompletion >= 40 ? "#D97706" : "#DC2626" },
            { label: "Réussite moyenne", value: stats.tauxReussiteMoyen !== null ? `${stats.tauxReussiteMoyen}%` : "—", icon: "emoji_events", color: (stats.tauxReussiteMoyen ?? 0) >= 70 ? "#16A34A" : (stats.tauxReussiteMoyen ?? 0) >= 40 ? "#D97706" : "#DC2626" },
            { label: "Exercices", value: String(stats.totalExercices), icon: "assignment", color: "var(--pb-primary)" },
            { label: "Terminés", value: `${stats.totalFaits}/${stats.totalBlocs}`, icon: "check_circle", color: "#16A34A" },
          ].map((s) => (
            <div key={s.label} className="ens-student-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span className="ms" style={{ fontSize: 22, color: s.color }}>{s.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)" }}>{s.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Alertes ── */}
      {alertes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alertes.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: 12,
              background: a.type === "retard" ? "#FEF2F2" : "#FFF7ED",
              border: `1px solid ${a.type === "retard" ? "#FECACA" : "#FED7AA"}`,
            }}>
              <span className="ms" style={{ fontSize: 18, color: a.type === "retard" ? "#DC2626" : "#D97706" }}>
                {a.type === "retard" ? "warning" : "error_outline"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: a.type === "retard" ? "#991B1B" : "#92400E" }}>
                {a.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tableau par exercice ── */}
      {exercices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--pb-on-surface-variant)" }}>
          <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 12, opacity: 0.3 }}>assessment</span>
          <p style={{ fontWeight: 600 }}>Aucun exercice cette semaine</p>
          <p style={{ fontSize: 13 }}>Les retours apparaîtront ici quand des exercices seront assignés.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--pb-outline-variant, #ccc)" }}>
                {["Exercice", "Type", "Groupes", "Complétés", "Réussite", "Retard", ""].map((h) => (
                  <th key={h} style={{
                    textAlign: h === "Complétés" || h === "Réussite" || h === "Retard" ? "center" : "left",
                    padding: "10px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "var(--pb-on-surface-variant)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercices.map((ex) => {
                const cfg = TYPE_BLOC_CONFIG[ex.type as TypeBloc] ?? { icone: "assignment", libelle: ex.type, couleur: "#6B7280" };
                const pct = ex.total > 0 ? Math.round((ex.faits / ex.total) * 100) : 0;
                const isSelected = selectedExo?.cle === ex.cle;

                return (
                  <tr
                    key={ex.cle}
                    onClick={() => setSelectedExo(isSelected ? null : ex)}
                    style={{
                      borderBottom: "1px solid var(--pb-outline-variant, #eee)",
                      cursor: "pointer",
                      background: isSelected ? "rgba(0,80,212,0.04)" : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px", fontWeight: 600, color: "var(--pb-on-surface)", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="ms" style={{ fontSize: 18, color: cfg.couleur }}>{cfg.icone}</span>
                        {ex.titre}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                        padding: "3px 10px", borderRadius: 999, color: cfg.couleur,
                        background: `${cfg.couleur}15`,
                      }}>
                        {cfg.libelle}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                      {ex.groupes.length > 0 ? ex.groupes.join(", ") : "Tous"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                        <span style={{ fontWeight: 700, color: pct === 100 ? "#16A34A" : "var(--pb-on-surface)" }}>{ex.faits}/{ex.total}</span>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--pb-outline-variant, #ddd)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16A34A" : "var(--pb-primary)", borderRadius: 2 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{
                      padding: "12px", textAlign: "center", fontWeight: 700,
                      color: ex.scoreMoyen !== null
                        ? (ex.scoreMoyen >= 70 ? "#16A34A" : ex.scoreMoyen >= 40 ? "#D97706" : "#DC2626")
                        : "var(--pb-on-surface-variant)",
                    }}>
                      {ex.scoreMoyen !== null ? `${ex.scoreMoyen}%` : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      {ex.enRetard > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "2px 8px", borderRadius: 999 }}>
                          {ex.enRetard}
                        </span>
                      ) : (
                        <span style={{ color: "var(--pb-on-surface-variant)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span className="ms" style={{ fontSize: 18, color: "var(--pb-outline-variant)" }}>
                        {isSelected ? "expand_less" : "expand_more"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modale détail exercice ── */}
      {selectedExo && (
        <div
          onClick={() => setSelectedExo(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white", borderRadius: 20,
              padding: "28px 32px", maxWidth: 780, width: "100%",
              maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {(() => {
                  const cfg = TYPE_BLOC_CONFIG[selectedExo.type as TypeBloc] ?? { icone: "assignment", libelle: selectedExo.type, couleur: "#6B7280" };
                  return (
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: `${cfg.couleur}15`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span className="ms" style={{ fontSize: 22, color: cfg.couleur }}>{cfg.icone}</span>
                    </div>
                  );
                })()}
                <div>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: "var(--pb-on-surface)", margin: 0 }}>
                    {selectedExo.titre}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 4 }}>
                    {(TYPE_BLOC_CONFIG[selectedExo.type as TypeBloc]?.libelle ?? selectedExo.type)}
                    {selectedExo.groupes.length > 0 ? ` · ${selectedExo.groupes.join(", ")}` : " · Toute la classe"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedExo(null)}
                style={{
                  background: "var(--pb-surface-container, #f0f0f0)", border: "none",
                  width: 36, height: 36, borderRadius: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <span className="ms" style={{ fontSize: 20, color: "var(--pb-on-surface-variant)" }}>close</span>
              </button>
            </div>

            {/* Résumé en haut */}
            <div style={{
              display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap",
              fontSize: 12, fontWeight: 700,
            }}>
              <span style={{ color: "#16A34A", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ms" style={{ fontSize: 16 }}>check_circle</span> {selectedExo.faits} terminé{selectedExo.faits > 1 ? "s" : ""}
              </span>
              <span style={{ color: "#2563EB", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ms" style={{ fontSize: 16 }}>pending</span> {selectedExo.enCours} en cours
              </span>
              <span style={{ color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ms" style={{ fontSize: 16 }}>circle</span> {selectedExo.total - selectedExo.faits - selectedExo.enCours} pas commencé{selectedExo.total - selectedExo.faits - selectedExo.enCours > 1 ? "s" : ""}
              </span>
              {selectedExo.enRetard > 0 && (
                <span style={{ color: "#DC2626", display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="ms" style={{ fontSize: 16 }}>warning</span> {selectedExo.enRetard} en retard
                </span>
              )}
            </div>

            {/* Liste des élèves */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedExo.eleves.map((eleve) => {
                const statutKey = eleve.enRetard ? "retard" : eleve.statut;
                const s = STATUT_CONFIG[statutKey] ?? STATUT_CONFIG.a_faire;
                const score = eleve.scoreEleve !== null && eleve.scoreTotal !== null && eleve.scoreTotal > 0
                  ? Math.round((eleve.scoreEleve / eleve.scoreTotal) * 100)
                  : null;
                const hasDetail = eleve.reponsesEleve && eleve.reponsesEleve.length > 0;
                const isExpanded = selectedEleveDetail === eleve.id;

                return (
                  <div key={`${eleve.id}_${eleve.groupe}`}>
                    <div
                      onClick={() => hasDetail ? setSelectedEleveDetail(isExpanded ? null : eleve.id) : undefined}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                        background: s.bg, border: `1px solid ${s.color}20`,
                        cursor: hasDetail ? "pointer" : "default",
                      }}
                    >
                      <span className="ms" style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--pb-on-surface)" }}>
                          {eleve.prenom} {eleve.nom}
                        </span>
                        {eleve.groupe && (
                          <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginLeft: 8 }}>
                            {eleve.groupe}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {score !== null && (
                          <span style={{
                            fontWeight: 700, fontSize: 13,
                            color: score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626",
                          }}>
                            {eleve.scoreEleve}/{eleve.scoreTotal} ({score}%)
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                          background: `${s.color}20`, color: s.color,
                        }}>
                          {s.label}
                        </span>
                        {hasDetail && (
                          <span className="ms" style={{ fontSize: 16, color: "var(--pb-on-surface-variant)" }}>
                            {isExpanded ? "expand_less" : "expand_more"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Détail des réponses */}
                    {isExpanded && eleve.reponsesEleve && (
                      <div style={{
                        background: "white", border: `1px solid ${s.color}20`, borderTop: "none",
                        borderRadius: "0 0 10px 10px", padding: "12px 14px",
                        display: "flex", flexDirection: "column", gap: 8,
                      }}>
                        {eleve.reponsesEleve.map((r, i) => {
                          const q = eleve.questions?.find((qq) => qq.id === r.id);
                          return (
                            <div key={r.id} style={{
                              padding: "8px 12px", borderRadius: 8,
                              background: r.correcte ? "#f0fdf4" : r.correcte === false ? "#fef2f2" : "#f9fafb",
                              borderLeft: `3px solid ${r.correcte ? "#22c55e" : r.correcte === false ? "#ef4444" : "#d1d5db"}`,
                            }}>
                              <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 4 }}>
                                Q{i + 1}. {q?.enonce ?? `Question ${r.id}`}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                {r.correcte ? (
                                  <span style={{ color: "#166534" }}>
                                    <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check</span> {r.reponse}
                                  </span>
                                ) : (
                                  <>
                                    <span style={{ color: "#dc2626" }}>
                                      <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>close</span> {r.reponse || "(vide)"}
                                    </span>
                                    {q?.reponse_attendue && (
                                      <span style={{ color: "var(--pb-on-surface-variant)", fontSize: 12 }}>
                                        → {q.reponse_attendue}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Problème du jour — réponses */}
            {problemesDuJour.length > 0 && selectedExo.type === "probleme_jour" && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--pb-on-surface)" }}>
                  Réponses des élèves
                </h4>
                {problemesDuJour.map((a, i) => (
                  <div key={`${a.studentId}_${i}`} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    borderRadius: 8, marginBottom: 4,
                    background: a.solved ? "#f0fdf4" : "#fef2f2",
                  }}>
                    <span className="ms" style={{ fontSize: 16, color: a.solved ? "#16A34A" : "#ef4444" }}>
                      {a.solved ? "check_circle" : "close"}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{a.prenom}</span>
                    <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
                      {a.studentAnswer ? `"${a.studentAnswer}"` : "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
                      {a.attempts} essai{a.attempts > 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
