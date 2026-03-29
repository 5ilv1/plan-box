"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

type DifficulteGlobale = "elevee" | "moderee" | "faible" | "ok";

interface ChapEnDifficulte {
  titre: string;
  matiere: string;
  scoreMoyen: number;
  nbTentatives: number;
}

interface EleveStat {
  eleveId: string;
  prenom: string;
  nom: string;
  niveau: string;
  source: "planbox" | "repetibox";
  nbExercices: number;
  tauxReussite: number;
  scoreMoyen: number;
  nbReaffectations: number;
  chapitresEnDifficulte: ChapEnDifficulte[];
  difficulteGlobale: DifficulteGlobale;
}

interface BilanStats {
  nbTotalEleves: number;
  nbEnDifficulte: number;
  scoreMoyenClasse: number;
  pointsFaiblesCollectifs: { titre: string; matiere: string; scoreMoyen: number; nbEleves: number }[];
}

type PeriodeFilter = "semaine" | "mois" | "trimestre";
type SortKey = "nom" | "scoreMoyen" | "tauxReussite" | "nbReaffectations" | "difficulteGlobale";

function getDateRange(periode: PeriodeFilter): { debut: string; fin: string } {
  const today = new Date();
  const fin = today.toISOString().split("T")[0];
  let debut: Date;
  if (periode === "semaine") {
    debut = new Date(today);
    debut.setDate(today.getDate() - 7);
  } else if (periode === "mois") {
    debut = new Date(today);
    debut.setMonth(today.getMonth() - 1);
  } else {
    debut = new Date(today);
    debut.setMonth(today.getMonth() - 3);
  }
  return { debut: debut.toISOString().split("T")[0], fin };
}

const DIFF_CONFIG: Record<DifficulteGlobale, { label: string; color: string; bg: string }> = {
  elevee:  { label: "Élevée",  color: "#DC2626", bg: "#FEE2E2" },
  moderee: { label: "Modérée", color: "#D97706", bg: "#FEF3C7" },
  faible:  { label: "Faible",  color: "#2563EB", bg: "#DBEAFE" },
  ok:      { label: "OK",      color: "#16A34A", bg: "#DCFCE7" },
};

export default function BilanEnseignantPage() {
  const router = useRouter();
  const supabase = createClient();

  const [periode, setPeriode] = useState<PeriodeFilter>("mois");
  const [groupe, setGroupe] = useState("");
  const [matiere, setMatiere] = useState("");
  const [groupes, setGroupes] = useState<string[]>([]);
  const [matieres, setMatieres] = useState<string[]>([]);

  const [elevesStats, setElevesStats] = useState<EleveStat[]>([]);
  const [bilanStats, setBilanStats] = useState<BilanStats | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [selectedEleve, setSelectedEleve] = useState<EleveStat | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("difficulteGlobale");
  const [sortAsc, setSortAsc] = useState(true);

  // Charger les groupes et matières disponibles
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/enseignant"); return; }

      const [{ data: groupesData }, { data: matieresData }] = await Promise.all([
        supabase.from("plan_travail").select("groupe_label").not("groupe_label", "is", null),
        supabase.from("matieres").select("nom"),
      ]);

      const gs = [...new Set((groupesData ?? []).map((g: any) => g.groupe_label).filter(Boolean))].sort();
      const ms = (matieresData ?? []).map((m: any) => m.nom).sort();
      setGroupes(gs as string[]);
      setMatieres(ms);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charger les données bilan
  useEffect(() => {
    async function charger() {
      setChargement(true);
      setErreur("");
      const { debut, fin } = getDateRange(periode);
      const params = new URLSearchParams({ debut, fin });
      if (groupe) params.set("groupe", groupe);
      if (matiere) params.set("matiere", matiere);

      const res = await fetch(`/api/admin/bilan-difficulte?${params}`);
      if (!res.ok) { setErreur("Erreur lors du chargement"); setChargement(false); return; }

      const json = await res.json();
      setElevesStats(json.elevesStats ?? []);
      setBilanStats(json.stats ?? null);
      setChargement(false);
    }
    charger();
  }, [periode, groupe, matiere]);

  // Tri
  const elevesAffiches = useMemo(() => {
    const sorted = [...elevesStats].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (sortKey === "nom") { va = `${a.nom} ${a.prenom}`; vb = `${b.nom} ${b.prenom}`; }
      else if (sortKey === "difficulteGlobale") {
        const order: Record<DifficulteGlobale, number> = { elevee: 0, moderee: 1, faible: 2, ok: 3 };
        va = order[a.difficulteGlobale];
        vb = order[b.difficulteGlobale];
      }
      else { va = a[sortKey] as number; vb = b[sortKey] as number; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [elevesStats, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "1rem",
    padding: "18px 20px",
    border: "1px solid var(--ens-outline-variant)",
    boxShadow: "0 1px 3px rgba(0,0,48,0.06)",
  };

  const thStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--ens-on-surface-variant)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "10px 12px",
    textAlign: "left",
    borderBottom: "2px solid var(--ens-outline-variant)",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <EnseignantLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 className="ens-page-title">Bilan de classe</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {(["semaine", "mois", "trimestre"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${periode === p ? "var(--ens-primary)" : "var(--ens-outline-variant)"}`,
                background: periode === p ? "var(--ens-primary)" : "white",
                color: periode === p ? "white" : "var(--ens-on-surface-variant)",
                cursor: "pointer",
              }}
            >
              {p === "semaine" ? "Cette semaine" : p === "mois" ? "Ce mois" : "Ce trimestre"}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ens-on-surface-variant)" }}>Groupe</label>
          <select
            value={groupe}
            onChange={e => setGroupe(e.target.value)}
            style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "1.5px solid var(--ens-outline-variant)", background: "white", cursor: "pointer", fontFamily: "inherit" }}
          >
            <option value="">Tous</option>
            {groupes.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ens-on-surface-variant)" }}>Matière</label>
          <select
            value={matiere}
            onChange={e => setMatiere(e.target.value)}
            style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "1.5px solid var(--ens-outline-variant)", background: "white", cursor: "pointer", fontFamily: "inherit" }}
          >
            <option value="">Toutes</option>
            {matieres.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {chargement ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ens-on-surface-variant)" }}>Chargement…</div>
      ) : erreur ? (
        <div style={{ textAlign: "center", padding: 40, color: "#DC2626" }}>{erreur}</div>
      ) : (
        <>
          {/* KPIs */}
          {bilanStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              <div style={cardStyle}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <span className="ms" style={{ fontSize: 20, color: "#DC2626" }}>warning</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ens-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Élèves en difficulté</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#DC2626", lineHeight: 1 }}>{bilanStats.nbEnDifficulte}</div>
                <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", marginTop: 4 }}>sur {bilanStats.nbTotalEleves} élèves</div>
              </div>
              <div style={cardStyle}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <span className="ms" style={{ fontSize: 20, color: "#16A34A" }}>check_circle</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ens-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Score moyen de la classe</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: scoreColor(bilanStats.scoreMoyenClasse), lineHeight: 1 }}>{bilanStats.scoreMoyenClasse}%</div>
                <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", marginTop: 4 }}>sur {bilanStats.nbTotalEleves} élèves actifs</div>
              </div>
              <div style={cardStyle}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EEF0FE", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <span className="ms" style={{ fontSize: 20, color: "var(--ens-primary)" }}>people</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ens-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Élèves actifs</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: "var(--ens-primary)", lineHeight: 1 }}>{bilanStats.nbTotalEleves}</div>
                <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", marginTop: 4 }}>avec au moins 1 exercice soumis</div>
              </div>
            </div>
          )}

          {/* Tableau + Panel détail */}
          <div style={{ display: "grid", gridTemplateColumns: selectedEleve ? "1fr 320px" : "1fr", gap: 20, marginBottom: 24 }}>

            {/* Tableau */}
            <div style={cardStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle} onClick={() => toggleSort("nom")}>
                        Élève {sortKey === "nom" && (sortAsc ? "↑" : "↓")}
                      </th>
                      <th style={thStyle} onClick={() => toggleSort("scoreMoyen")}>
                        Score moyen {sortKey === "scoreMoyen" && (sortAsc ? "↑" : "↓")}
                      </th>
                      <th style={thStyle} onClick={() => toggleSort("tauxReussite")}>
                        Taux réussite {sortKey === "tauxReussite" && (sortAsc ? "↑" : "↓")}
                      </th>
                      <th style={thStyle} onClick={() => toggleSort("nbReaffectations")}>
                        Réaffectations {sortKey === "nbReaffectations" && (sortAsc ? "↑" : "↓")}
                      </th>
                      <th style={thStyle} onClick={() => toggleSort("difficulteGlobale")}>
                        Difficulté {sortKey === "difficulteGlobale" && (sortAsc ? "↑" : "↓")}
                      </th>
                      <th style={{ ...thStyle, cursor: "default" }}>Chapitres difficiles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {elevesAffiches.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "32px 12px", textAlign: "center", color: "var(--ens-on-surface-variant)", fontSize: 13 }}>
                          Aucune donnée pour cette période.
                        </td>
                      </tr>
                    ) : elevesAffiches.map(e => {
                      const diff = DIFF_CONFIG[e.difficulteGlobale];
                      const isSelected = selectedEleve?.eleveId === e.eleveId;
                      return (
                        <tr
                          key={e.eleveId}
                          onClick={() => setSelectedEleve(isSelected ? null : e)}
                          style={{
                            cursor: "pointer",
                            background: isSelected ? "var(--ens-surface-container)" : undefined,
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={ev => { if (!isSelected) (ev.currentTarget as HTMLTableRowElement).style.background = "var(--ens-surface-container-low)"; }}
                          onMouseLeave={ev => { if (!isSelected) (ev.currentTarget as HTMLTableRowElement).style.background = ""; }}
                        >
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ens-on-surface)" }}>{e.prenom} {e.nom}</div>
                            {e.niveau && <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>{e.niveau}</div>}
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 5, background: "var(--ens-surface-container)", borderRadius: 999, minWidth: 60, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 999, width: `${e.scoreMoyen}%`, background: scoreColor(e.scoreMoyen) }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(e.scoreMoyen) }}>{e.scoreMoyen}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: e.tauxReussite >= 80 ? "#DCFCE7" : e.tauxReussite >= 60 ? "#FEF3C7" : "#FEE2E2", color: scoreColor(e.tauxReussite) }}>
                              {e.tauxReussite}%
                            </span>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)", fontSize: 13 }}>
                            {e.nbReaffectations > 0 ? (
                              <span style={{ color: "#D97706", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                                <span className="ms" style={{ fontSize: 14 }}>refresh</span>
                                {e.nbReaffectations}
                              </span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: diff.bg, color: diff.color }}>
                              {diff.label}
                            </span>
                          </td>
                          <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--ens-surface-container)" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {e.chapitresEnDifficulte.slice(0, 3).map((c, i) => (
                                <span key={i} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E" }}>
                                  {c.titre.length > 16 ? c.titre.slice(0, 15) + "…" : c.titre}
                                </span>
                              ))}
                              {e.chapitresEnDifficulte.length === 0 && <span style={{ color: "var(--ens-on-surface-variant)", fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel détail élève */}
            {selectedEleve && (
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden", alignSelf: "start" }}>
                <div style={{ padding: "16px 20px", background: "linear-gradient(135deg, var(--ens-primary), var(--ens-secondary))", color: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{selectedEleve.prenom} {selectedEleve.nom}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>{selectedEleve.niveau || "Niveau non renseigné"} · {selectedEleve.nbExercices} exercices</div>
                    </div>
                    <button onClick={() => setSelectedEleve(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ens-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Statistiques</div>
                    {[
                      { label: "Score moyen", value: `${selectedEleve.scoreMoyen}%`, color: scoreColor(selectedEleve.scoreMoyen) },
                      { label: "Taux de réussite", value: `${selectedEleve.tauxReussite}%`, color: scoreColor(selectedEleve.tauxReussite) },
                      { label: "Réaffectations", value: String(selectedEleve.nbReaffectations), color: selectedEleve.nbReaffectations > 0 ? "#D97706" : "#16A34A" },
                    ].map(r => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "var(--ens-surface-container-low)" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ens-on-surface)" }}>{r.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>

                  {selectedEleve.chapitresEnDifficulte.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ens-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Chapitres en difficulté</div>
                      {selectedEleve.chapitresEnDifficulte.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "var(--ens-surface-container-low)" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ens-on-surface)" }}>{c.titre}</div>
                            <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>{c.matiere} · {c.nbTentatives} essai{c.nbTentatives > 1 ? "s" : ""}</div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(c.scoreMoyen) }}>{c.scoreMoyen}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Points faibles collectifs */}
          {bilanStats && bilanStats.pointsFaiblesCollectifs.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ms" style={{ fontSize: 18, color: "#D97706" }}>trending_down</span>
                Points faibles collectifs
              </div>
              <div style={{ fontSize: 12, color: "var(--ens-on-surface-variant)", marginBottom: 16 }}>
                Chapitres où au moins 2 élèves ont un score moyen inférieur à 70%
              </div>
              {bilanStats.pointsFaiblesCollectifs.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 6, border: "1px solid var(--ens-outline-variant)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="ms" style={{ fontSize: 18, color: "#D97706" }}>menu_book</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ens-on-surface)" }}>{c.titre}</div>
                    <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>{c.matiere} · {c.nbEleves} élève{c.nbEleves > 1 ? "s" : ""} en difficulté</div>
                    <div style={{ height: 4, background: "var(--ens-surface-container)", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 999, width: `${c.scoreMoyen}%`, background: scoreColor(c.scoreMoyen) }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: scoreColor(c.scoreMoyen) }}>{c.scoreMoyen}%</div>
                    <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>moy. classe</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notifications difficultés */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ms" style={{ fontSize: 18, color: "#DC2626" }}>notifications_active</span>
              Alertes récentes
            </div>
            <div style={{ fontSize: 12, color: "var(--ens-on-surface-variant)", marginBottom: 16 }}>
              Élèves ayant échoué 3 fois de suite à un exercice
            </div>
            {elevesStats.filter(e => e.nbReaffectations >= 3).length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--ens-on-surface-variant)", fontSize: 13 }}>
                Aucune alerte pour cette période 🎉
              </div>
            ) : elevesStats.filter(e => e.nbReaffectations >= 3).map(e => (
              <div key={e.eleveId} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, marginBottom: 8, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <span className="ms" style={{ fontSize: 20, color: "#DC2626", flexShrink: 0 }}>warning</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ens-on-surface)", lineHeight: 1.5 }}>
                    <strong>{e.prenom} {e.nom}</strong> a {e.nbReaffectations} réaffectation{e.nbReaffectations > 1 ? "s" : ""} sur la période.
                  </div>
                  {e.chapitresEnDifficulte.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", marginTop: 2 }}>
                      Chapitres : {e.chapitresEnDifficulte.map(c => c.titre).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </EnseignantLayout>
  );
}
