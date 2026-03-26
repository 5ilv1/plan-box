"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

interface Problem {
  id: string;
  enonce: string;
  categorie: string;
  periode: string;
  semaine: string;
  reponse: number | null;
}

interface EleveData {
  id: number;
  prenom: string;
  niveau: string;
  groupe: string;
  auth_id: string | null;
  solved: boolean | null;
  attempts: number;
  hints_used: number;
  niveau_plus: boolean;
  tauxRecent: number | null;
  recentTotal: number;
  recentSolved: number;
  suggestedPlus: boolean;
}

interface HistoryEntry {
  date: string;
  ce2: { enonce: string; categorie: string } | null;
  cm1: { enonce: string; categorie: string } | null;
  cm2: { enonce: string; categorie: string } | null;
  tauxReussite: number | null;
}

interface MonthlyGroup {
  groupe: string;
  total: number;
  solved: number;
  taux: number | null;
}

interface MonthlyEntry {
  month: string;
  groups: MonthlyGroup[];
}

export default function DailyProblemTeacher() {
  const [loading, setLoading] = useState(true);
  const [problemCM1, setProblemCM1] = useState<Problem | null>(null);
  const [problemCM2, setProblemCM2] = useState<Problem | null>(null);
  const [problemCE2, setProblemCE2] = useState<Problem | null>(null);
  const [eleves, setEleves] = useState<EleveData[]>([]);
  const [stats, setStats] = useState({ total_attempted: 0, total_solved: 0, avg_attempts: 0, avg_hints: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyEntry[]>([]);
  const [groupes, setGroupes] = useState<string[]>([]);
  const [schoolWeek, setSchoolWeek] = useState<{ periode: string; semaine: string } | null>(null);
  const [modaleNiveau, setModaleNiveau] = useState<string | null>(null);
  const [problemesCandidats, setProblemesCandidats] = useState<any[]>([]);
  const [filtreCategorie, setFiltreCategorie] = useState("");
  const [loadingProblemes, setLoadingProblemes] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { const r = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null; if (r === "enseignant") return; router.push("/enseignant"); return; }
      try {
        const res = await fetch("/api/daily-problem/teacher");
        if (!res.ok) { router.push("/enseignant"); return; }
        const data = await res.json();
        setProblemCM1(data.problemCM1);
        setProblemCM2(data.problemCM2);
        setProblemCE2(data.problemCE2);
        setEleves(data.eleves ?? []);
        setStats(data.stats ?? {});
        setHistory(data.history ?? []);
        setMonthlyStats(data.monthlyStats ?? []);
        setGroupes(data.groupes ?? []);
        setSchoolWeek(data.schoolWeek);
      } catch {}
      setLoading(false);
    });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ouvrirModale(niveau: string) {
    setModaleNiveau(niveau);
    setLoadingProblemes(true);
    setFiltreCategorie("");
    try {
      const niveaux = niveau === "CM2" ? ["CM2", "CM2+"] : niveau === "CE2" ? ["CE2"] : ["CM1"];
      let query = supabase
        .from("math_problems")
        .select("id, enonce, categorie, niveau, difficulte")
        .in("niveau", niveaux)
        .eq("difficulte", "semaine")
        .not("reponse", "is", null);
      if (schoolWeek) query = query.eq("periode", schoolWeek.periode).eq("semaine", schoolWeek.semaine);
      const { data } = await query.order("categorie").limit(100);
      setProblemesCandidats(data ?? []);
    } catch {}
    setLoadingProblemes(false);
  }

  async function toggleNiveauPlus(eleveId: number, value: boolean) {
    await fetch("/api/daily-problem/teacher/toggle-plus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eleve_id: eleveId, niveau_plus: value }),
    });
    setEleves(prev => prev.map(e => e.id === eleveId ? { ...e, niveau_plus: value } : e));
  }

  async function choisirProbleme(problemId: string) {
    if (!modaleNiveau) return;
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/daily-problem/teacher/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, niveau: modaleNiveau, problem_id: problemId }),
    });
    setModaleNiveau(null);
    const res = await fetch("/api/daily-problem/teacher");
    if (res.ok) {
      const data = await res.json();
      setProblemCM1(data.problemCM1);
      setProblemCM2(data.problemCM2);
      setProblemCE2(data.problemCE2);
    }
  }

  async function toggleValidation(eleve: EleveData) {
    if (!eleve.auth_id) return;
    const newSolved = eleve.solved !== true;
    await fetch("/api/daily-problem/teacher/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_auth_id: eleve.auth_id, solved: newSolved }),
    });
    // Rafraîchir les données
    const res = await fetch("/api/daily-problem/teacher");
    if (res.ok) {
      const data = await res.json();
      setEleves(data.eleves ?? []);
      setStats(data.stats ?? {});
    }
  }

  const categories = [...new Set(problemesCandidats.map((p: any) => p.categorie))];
  const problemesFiltres = filtreCategorie
    ? problemesCandidats.filter((p: any) => p.categorie === filtreCategorie)
    : problemesCandidats;

  const resolus = eleves.filter(e => e.solved === true).length;
  const enCours = eleves.filter(e => e.attempts > 0 && e.solved !== true).length;
  const pasCommence = eleves.filter(e => e.attempts === 0).length;

  if (loading) return null;

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}><span className="ms" style={{ fontSize: 24, verticalAlign: "middle" }}>calculate</span> Problème du jour</h1>

          {schoolWeek && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "-0.75rem" }}>
              Période {schoolWeek.periode.replace("P", "")} · Semaine {schoolWeek.semaine.replace("S", "")}
            </p>
          )}

          {/* Section 1 : Problèmes du jour */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {[{ label: "CE2", problem: problemCE2, color: "#D97706", bg: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" },
              { label: "CM1", problem: problemCM1, color: "var(--primary)", bg: "var(--blue-50)", borderColor: "var(--blue-200)" },
              { label: "CM2", problem: problemCM2, color: "#7C3AED", bg: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.25)" }]
              .map(({ label, problem, color, bg, borderColor }) => (
              <div key={label} className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.875rem", color, backgroundColor: bg, border: `1px solid ${borderColor}`, borderRadius: 999, padding: "0.2rem 0.75rem" }}>{label}</span>
                  <button onClick={() => ouvrirModale(label)} style={{ fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "0.25rem 0.5rem", cursor: "pointer" }}>
                    Changer
                  </button>
                </div>
                {problem ? (
                  <>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--text)" }}>{problem.enonce}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                      {problem.categorie} · {problem.periode}-{problem.semaine}
                    </p>
                    {problem.reponse != null && (
                      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#16A34A", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 4 }}>
                        <span className="ms" style={{ fontSize: 16 }}>check_circle</span>
                        Réponse : {problem.reponse}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Aucun problème sélectionné</p>
                )}
              </div>
            ))}
          </div>

          {/* Section 2 : Suivi élèves */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}><span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>bar_chart</span> Suivi des élèves aujourd&apos;hui</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              {resolus} résolu{resolus > 1 ? "s" : ""} · {enCours} en cours · {pasCommence} pas encore commencé
            </p>
            {eleves.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Aucun élève</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["Prénom", "Niveau", "Résolu", "Tentatives", "Indices", ""].map(h => (
                        <th key={h || "action"} style={{ textAlign: h === "Prénom" ? "left" : "center", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eleves.map(e => (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)", backgroundColor: e.solved === true ? "#F0FDF4" : e.attempts > 0 ? "#FFFBEB" : "transparent" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500 }}>{e.prenom}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: e.niveau === "CM2" ? "#7C3AED" : "var(--primary)", backgroundColor: e.niveau === "CM2" ? "rgba(124,58,237,0.08)" : "var(--blue-50)", borderRadius: 999, padding: "0.125rem 0.5rem" }}>{e.niveau}</span>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{e.solved === true ? <span className="ms" style={{ fontSize: 16, color: "#16A34A" }}>check_circle</span> : e.attempts > 0 ? <span className="ms" style={{ fontSize: 16, color: "#D97706" }}>refresh</span> : "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{e.attempts || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>{e.hints_used || "—"}</td>
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                          {e.auth_id && (
                            <button
                              onClick={() => toggleValidation(e)}
                              title={e.solved === true ? "Annuler la validation" : "Valider manuellement"}
                              style={{
                                background: "none", border: "1px solid var(--border)",
                                borderRadius: 6, padding: "0.2rem 0.5rem", cursor: "pointer",
                                fontSize: "0.75rem", color: e.solved === true ? "var(--error)" : "var(--success)",
                              }}
                            >
                              {e.solved === true ? "✕ Annuler" : "✓ Valider"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3 : Niveau + */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              <span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>trending_up</span>{" "}
              Niveau + — Différenciation
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Les élèves avec le niveau + reçoivent des problèmes plus difficiles.
              Le système suggère les élèves avec un taux de réussite ≥ 80% sur 2 semaines.
            </p>
            {(() => {
              const cmEleves = eleves.filter(e => e.niveau === "CM1" || e.niveau === "CM2");
              if (cmEleves.length === 0) return <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Aucun élève CM1/CM2</p>;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                  {cmEleves
                    .sort((a, b) => {
                      // D'abord les activés, puis les suggérés, puis le reste
                      if (a.niveau_plus && !b.niveau_plus) return -1;
                      if (!a.niveau_plus && b.niveau_plus) return 1;
                      if (a.suggestedPlus && !b.suggestedPlus) return -1;
                      if (!a.suggestedPlus && b.suggestedPlus) return 1;
                      return a.prenom.localeCompare(b.prenom);
                    })
                    .map(e => (
                    <div key={e.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 12,
                      border: `1px solid ${e.niveau_plus ? "#16A34A" : e.suggestedPlus ? "#F59E0B" : "var(--border)"}`,
                      background: e.niveau_plus ? "rgba(22,163,74,0.05)" : e.suggestedPlus ? "rgba(245,158,11,0.04)" : "var(--white)",
                      transition: "all 0.2s",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
                          {e.prenom}
                          <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: 6 }}>
                            {e.niveau} · {e.groupe}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                          {e.tauxRecent !== null ? (
                            <>
                              <span style={{ fontWeight: 600, color: e.tauxRecent >= 80 ? "#16A34A" : e.tauxRecent >= 50 ? "#D97706" : "#DC2626" }}>
                                {e.tauxRecent}%
                              </span>
                              {" "}de réussite ({e.recentSolved}/{e.recentTotal})
                            </>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>Pas assez de données</span>
                          )}
                          {e.suggestedPlus && !e.niveau_plus && (
                            <span style={{
                              marginLeft: 8, fontSize: "0.6875rem", fontWeight: 700,
                              background: "rgba(245,158,11,0.15)", color: "#D97706",
                              padding: "2px 8px", borderRadius: 999,
                            }}>
                              Suggéré
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleNiveauPlus(e.id, !e.niveau_plus)}
                        title={e.niveau_plus ? "Désactiver niveau +" : "Activer niveau +"}
                        style={{
                          width: 40, height: 24, borderRadius: 12,
                          border: "none", cursor: "pointer",
                          background: e.niveau_plus ? "#16A34A" : "#D1D5DB",
                          position: "relative", transition: "background 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%",
                          background: "white", position: "absolute", top: 3,
                          left: e.niveau_plus ? 19 : 3,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Section 4 : Historique */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              <span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>calendar_today</span> Historique des 7 derniers jours
            </h2>
            {history.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>Aucun historique</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["Date", "CE2", "CM1", "CM2", "% réussite"].map(h => (
                        <th key={h} style={{ textAlign: h === "Date" ? "left" : h === "% réussite" ? "center" : "left", padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.date} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {new Date(h.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                        </td>
                        {[h.ce2, h.cm1, h.cm2].map((p, i) => (
                          <td key={i} style={{ padding: "0.5rem 0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p?.enonce ? (p.enonce.length > 60 ? p.enonce.substring(0, 60) + "..." : p.enonce) : "—"}
                          </td>
                        ))}
                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 600, color: h.tauxReussite !== null ? (h.tauxReussite >= 70 ? "var(--success)" : h.tauxReussite >= 40 ? "var(--warning)" : "var(--error)") : "var(--text-secondary)" }}>
                          {h.tauxReussite !== null ? `${h.tauxReussite}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4 : Graphique mensuel par groupe */}
          {monthlyStats.length > 0 && (
            <div className="card" style={{ padding: "1.25rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
                <span className="ms" style={{ fontSize: 18, verticalAlign: "middle" }}>bar_chart</span> Réussite par groupe — 9 derniers mois
              </h2>
              {(() => {
                const COLORS: Record<string, string> = {};
                const palette = ["#0050d4", "#7C3AED", "#D97706", "#059669", "#DC2626", "#6366f1", "#0891b2", "#be185d"];
                groupes.forEach((g, i) => { COLORS[g] = palette[i % palette.length]; });
                const maxTaux = 100;

                return (
                  <div>
                    {/* Légende */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                      {groupes.map(g => (
                        <div key={g} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[g] }} />
                          {g}
                        </div>
                      ))}
                    </div>

                    {/* Graphique */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 220, borderBottom: "2px solid var(--border)", paddingBottom: 4 }}>
                      {monthlyStats.map((m) => {
                        const monthLabel = new Date(m.month + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "short" });
                        return (
                          <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            {/* Barres groupées */}
                            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 180 }}>
                              {m.groups.map((g) => {
                                const h = g.taux !== null ? Math.max((g.taux / maxTaux) * 180, 4) : 0;
                                return (
                                  <div
                                    key={g.groupe}
                                    title={`${g.groupe}: ${g.taux ?? 0}% (${g.solved}/${g.total})`}
                                    style={{
                                      width: Math.max(16, Math.floor(60 / groupes.length)),
                                      height: h,
                                      background: COLORS[g.groupe] ?? "#999",
                                      borderRadius: "4px 4px 0 0",
                                      transition: "height 0.3s",
                                      cursor: "default",
                                      position: "relative",
                                    }}
                                  >
                                    {g.taux !== null && g.taux > 0 && (
                                      <span style={{
                                        position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                                        fontSize: 9, fontWeight: 700, color: COLORS[g.groupe],
                                        whiteSpace: "nowrap",
                                      }}>
                                        {g.taux}%
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Label mois */}
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginTop: 4 }}>
                              {monthLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Axe Y labels */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--text-secondary)" }}>
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Modale */}
      {modaleNiveau && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setModaleNiveau(null)}>
          <div style={{ backgroundColor: "white", borderRadius: 16, padding: "1.5rem", maxWidth: 600, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>Changer le problème {modaleNiveau}</h3>
              <button onClick={() => setModaleNiveau(null)} style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-secondary)" }}>✕</button>
            </div>
            <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)} style={{ padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "1rem", fontSize: "0.875rem", fontFamily: "var(--font)" }}>
              <option value="">Toutes les catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {loadingProblemes ? (
                <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>Chargement...</p>
              ) : problemesFiltres.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>Aucun problème disponible</p>
              ) : problemesFiltres.map((p: any) => (
                <button key={p.id} onClick={() => choisirProbleme(p.id)} style={{ textAlign: "left", padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: 8, backgroundColor: "white", cursor: "pointer", fontSize: "0.8125rem", lineHeight: 1.4, fontFamily: "var(--font)" }}>
                  <span style={{ color: "var(--text)" }}>{p.enonce.length > 80 ? p.enonce.substring(0, 80) + "..." : p.enonce}</span>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{p.categorie} · {p.niveau}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
