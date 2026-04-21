"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Exercice {
  id: string;
  titre: string | null;
  type: string;
  score: number;
  total: number;
  pourcentage: number;
  valide: boolean;
  notable: boolean;
  tente_at: string;
}

interface Chapitre {
  chapitre_id: string;
  titre: string;
  score_eleve: number | null;
  moyenne_classe: number | null;
  nb_eleves_classe: number;
  nb_exercices: number;
  exercices: Exercice[];
}

interface SousMatiere {
  sous_matiere: string;
  score_eleve: number | null;
  moyenne_classe: number | null;
  nb_eleves_classe: number;
  nb_exercices: number;
  chapitres: Chapitre[];
}

interface Matiere {
  matiere: string;
  score_eleve: number | null;
  moyenne_classe: number | null;
  nb_eleves_classe: number;
  nb_exercices: number;
  sous_matieres: SousMatiere[];
}

interface Performance {
  eleve: {
    uid: string;
    prenom: string;
    nom: string;
    niveau_nom: string | null;
    source: "planbox" | "repetibox";
  };
  periode: string;
  niveau_compare: string | null;
  nb_eleves_classe: number;
  global: {
    score_eleve: number;
    moyenne_classe: number | null;
    nb_eleves_classe: number;
    nb_exercices: number;
  } | null;
  matieres: Matiere[];
}

type PeriodeFilter = "semaine" | "mois" | "trimestre" | "all";

// ── Helpers UI ────────────────────────────────────────────────────────────────

const scoreColor = (s: number | null) => {
  if (s === null) return "var(--ens-on-surface-variant)";
  return s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
};

const TYPE_ICONES: Record<string, string> = {
  exercice: "edit_note",
  texte_a_trous: "text_fields",
  qcm: "quiz",
  ecriture_contrainte: "edit",
  calcul_mental: "pin",
  analyse_phrase: "segment",
  revision: "menu_book",
};

const TYPE_LABELS: Record<string, string> = {
  exercice: "Exercice",
  texte_a_trous: "Texte à trous",
  qcm: "QCM",
  ecriture_contrainte: "Écriture",
  calcul_mental: "Calcul mental",
  analyse_phrase: "Analyse",
  revision: "Leçon",
};

const MATIERE_ICONES: Record<string, string> = {
  francais: "menu_book",
  français: "menu_book",
  mathematiques: "calculate",
  mathématiques: "calculate",
  maths: "calculate",
  histoire: "history_edu",
  geographie: "public",
  géographie: "public",
  sciences: "science",
  anglais: "translate",
};

function iconeMatiere(m: string): string {
  return MATIERE_ICONES[m.toLowerCase()] ?? "folder";
}

function labelMatiere(m: string): string {
  if (m === "non-renseignée") return "Non classée";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function labelSousMat(sm: string): string {
  if (sm === "—") return "—";
  return sm.charAt(0).toUpperCase() + sm.slice(1);
}

// ── Composant comparaison élève vs classe ─────────────────────────────────────

function BarComparaison({
  scoreEleve,
  moyenneClasse,
  compact = false,
}: {
  scoreEleve: number | null;
  moyenneClasse: number | null;
  compact?: boolean;
}) {
  if (scoreEleve === null) {
    return (
      <span style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", fontStyle: "italic" }}>
        Aucun exercice noté
      </span>
    );
  }

  const ecart = moyenneClasse != null ? scoreEleve - moyenneClasse : null;
  const ecartStr = ecart == null ? null : (ecart > 0 ? `+${ecart}` : `${ecart}`);
  const couleurEcart = ecart == null
    ? "var(--ens-on-surface-variant)"
    : ecart > 3 ? "#16A34A"
    : ecart < -3 ? "#DC2626"
    : "#D97706";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12 }}>
      {/* Barre double : élève / classe */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: compact ? 80 : 120 }}>
        <div style={{ position: "relative", height: compact ? 5 : 6, background: "var(--ens-surface-container)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${scoreEleve}%`, background: scoreColor(scoreEleve), borderRadius: 999 }} />
          {moyenneClasse != null && (
            <div style={{
              position: "absolute", top: -2, bottom: -2,
              left: `${moyenneClasse}%`,
              width: 2, background: "#475569",
              borderRadius: 1,
            }} title={`Moyenne classe : ${moyenneClasse}%`} />
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 54, justifyContent: "flex-end" }}>
        <span style={{ fontSize: compact ? 12 : 14, fontWeight: 800, color: scoreColor(scoreEleve) }}>
          {scoreEleve}%
        </span>
      </div>
      {ecartStr != null && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          padding: "2px 7px", borderRadius: 999,
          background: couleurEcart === "#16A34A" ? "#DCFCE7" : couleurEcart === "#DC2626" ? "#FEE2E2" : "#FEF3C7",
          color: couleurEcart,
          whiteSpace: "nowrap",
          minWidth: 36, textAlign: "center",
        }}>
          {ecartStr}
        </span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PerformanceElevePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: uid } = use(params);

  const [periode, setPeriode] = useState<PeriodeFilter>("all");
  const [data, setData] = useState<Performance | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [expMatieres, setExpMatieres] = useState<Set<string>>(new Set());
  const [expSousMat, setExpSousMat]  = useState<Set<string>>(new Set());
  const [expChapitres, setExpChapitres] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function charger() {
      setChargement(true);
      setErreur("");
      try {
        const res = await fetch(`/api/enseignant/eleves/${uid}/performance?periode=${periode}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setErreur(j.error ?? "Erreur de chargement");
          setChargement(false);
          return;
        }
        const json = await res.json();
        setData(json);
      } catch (e) {
        setErreur((e as Error).message);
      }
      setChargement(false);
    }
    charger();
  }, [uid, periode]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "1rem",
    padding: "18px 20px",
    border: "1px solid var(--ens-outline-variant)",
    boxShadow: "0 1px 3px rgba(0,0,48,0.06)",
  };

  if (chargement) {
    return <div style={{ textAlign: "center", padding: 60, color: "var(--ens-on-surface-variant)" }}>Chargement…</div>;
  }

  if (erreur) {
    return (
      <div>
        <button onClick={() => router.back()} style={{ marginBottom: 16, background: "none", border: "none", color: "var(--ens-primary)", cursor: "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour
        </button>
        <div style={{ ...cardStyle, color: "#DC2626" }}>{erreur}</div>
      </div>
    );
  }

  if (!data) return null;

  const { eleve, global, matieres } = data;

  return (
    <>
      {/* Bouton retour */}
      <button
        onClick={() => router.back()}
        style={{
          marginBottom: 16, background: "none", border: "none",
          color: "var(--ens-primary)", cursor: "pointer",
          fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour
      </button>

      {/* En-tête élève */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h2 className="ens-page-title" style={{ marginBottom: 4 }}>
            {eleve.prenom} {eleve.nom}
          </h2>
          <div style={{ fontSize: 13, color: "var(--ens-on-surface-variant)", display: "flex", alignItems: "center", gap: 8 }}>
            {eleve.niveau_nom && <span>{eleve.niveau_nom}</span>}
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 999,
              background: eleve.source === "planbox" ? "#EEF0FE" : "#FEF3C7",
              color: eleve.source === "planbox" ? "var(--ens-primary)" : "#92400E",
            }}>
              {eleve.source}
            </span>
            {data.niveau_compare && data.nb_eleves_classe > 0 && (
              <span>· comparaison avec {data.nb_eleves_classe} élève{data.nb_eleves_classe > 1 ? "s" : ""} de {data.niveau_compare}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["semaine", "mois", "trimestre", "all"] as const).map((p) => (
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
              {p === "semaine" ? "7 jours" : p === "mois" ? "30 jours" : p === "trimestre" ? "3 mois" : "Tout"}
            </button>
          ))}
        </div>
      </div>

      {/* Score global */}
      {global ? (
        <div style={{ ...cardStyle, marginBottom: 24, background: "linear-gradient(135deg, var(--ens-primary), var(--ens-secondary))", border: "none", color: "white" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.8, marginBottom: 4 }}>
                Performance globale
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{global.score_eleve}%</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                sur {global.nb_exercices} exercice{global.nb_exercices > 1 ? "s" : ""} noté{global.nb_exercices > 1 ? "s" : ""}
              </div>
            </div>
            {global.moyenne_classe != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.8, marginBottom: 4 }}>
                  Moyenne classe
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{global.moyenne_classe}%</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                  {global.nb_eleves_classe} élève{global.nb_eleves_classe > 1 ? "s" : ""} comparé{global.nb_eleves_classe > 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, marginBottom: 24, textAlign: "center", color: "var(--ens-on-surface-variant)" }}>
          Aucun exercice noté sur cette période.
        </div>
      )}

      {/* Arbre matières → sous-matières → chapitres → exercices */}
      {matieres.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ens-on-surface-variant)" }}>
          Pas d&apos;activité sur cette période.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {matieres.map((m) => {
            const matOpen = expMatieres.has(m.matiere);
            return (
              <div key={m.matiere} style={cardStyle}>
                {/* Ligne matière */}
                <div
                  onClick={() => toggle(expMatieres, setExpMatieres, m.matiere)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    cursor: "pointer", userSelect: "none",
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "var(--ens-surface-container)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span className="ms" style={{ fontSize: 22, color: "var(--ens-primary)" }}>
                      {iconeMatiere(m.matiere)}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ens-on-surface)" }}>
                      {labelMatiere(m.matiere)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)", marginTop: 2 }}>
                      {m.nb_exercices} exercice{m.nb_exercices > 1 ? "s" : ""} noté{m.nb_exercices > 1 ? "s" : ""}
                      {" · "}
                      {m.sous_matieres.length} sous-matière{m.sous_matieres.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ minWidth: 260, maxWidth: 320, flex: "0 0 auto" }}>
                    <BarComparaison scoreEleve={m.score_eleve} moyenneClasse={m.moyenne_classe} />
                  </div>
                  <span className="ms" style={{ fontSize: 22, color: "var(--ens-on-surface-variant)", transition: "transform 0.2s", transform: matOpen ? "rotate(180deg)" : "none" }}>
                    expand_more
                  </span>
                </div>

                {/* Sous-matières */}
                {matOpen && (
                  <div style={{ marginTop: 14, paddingLeft: 14, borderLeft: "2px solid var(--ens-surface-container)" }}>
                    {m.sous_matieres.map((sm) => {
                      const smKey = `${m.matiere}::${sm.sous_matiere}`;
                      const smOpen = expSousMat.has(smKey);
                      return (
                        <div key={smKey} style={{ padding: "10px 0", borderBottom: "1px solid var(--ens-surface-container)" }}>
                          <div
                            onClick={() => toggle(expSousMat, setExpSousMat, smKey)}
                            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}
                          >
                            <span className="ms" style={{ fontSize: 18, color: "var(--ens-on-surface-variant)", transition: "transform 0.2s", transform: smOpen ? "rotate(90deg)" : "none" }}>
                              chevron_right
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ens-on-surface)" }}>
                                {labelSousMat(sm.sous_matiere)}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>
                                {sm.chapitres.length} chapitre{sm.chapitres.length > 1 ? "s" : ""} · {sm.nb_exercices} ex.
                              </div>
                            </div>
                            <div style={{ minWidth: 240, maxWidth: 300, flex: "0 0 auto" }}>
                              <BarComparaison scoreEleve={sm.score_eleve} moyenneClasse={sm.moyenne_classe} compact />
                            </div>
                          </div>

                          {/* Chapitres */}
                          {smOpen && (
                            <div style={{ marginTop: 10, paddingLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                              {sm.chapitres.map((c) => {
                                const chOpen = expChapitres.has(c.chapitre_id);
                                return (
                                  <div key={c.chapitre_id} style={{
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    background: chOpen ? "var(--ens-surface-container-low)" : "transparent",
                                    border: `1px solid ${chOpen ? "var(--ens-outline-variant)" : "transparent"}`,
                                  }}>
                                    <div
                                      onClick={() => toggle(expChapitres, setExpChapitres, c.chapitre_id)}
                                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}
                                    >
                                      <span className="ms" style={{ fontSize: 16, color: "var(--ens-on-surface-variant)", transition: "transform 0.2s", transform: chOpen ? "rotate(90deg)" : "none" }}>
                                        chevron_right
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ens-on-surface)" }}>
                                          {c.titre}
                                        </div>
                                        <div style={{ fontSize: 10, color: "var(--ens-on-surface-variant)" }}>
                                          {c.exercices.length} exercice{c.exercices.length > 1 ? "s" : ""} tenté{c.exercices.length > 1 ? "s" : ""}
                                        </div>
                                      </div>
                                      <div style={{ minWidth: 200, maxWidth: 260, flex: "0 0 auto" }}>
                                        <BarComparaison scoreEleve={c.score_eleve} moyenneClasse={c.moyenne_classe} compact />
                                      </div>
                                    </div>

                                    {/* Exercices (drill-down final) */}
                                    {chOpen && c.exercices.length > 0 && (
                                      <div style={{ marginTop: 10, paddingLeft: 26, display: "flex", flexDirection: "column", gap: 4 }}>
                                        {c.exercices.map((ex) => (
                                          <div key={ex.id} style={{
                                            display: "flex", alignItems: "center", gap: 10,
                                            padding: "6px 10px", borderRadius: 6,
                                            background: "white",
                                            border: "1px solid var(--ens-surface-container)",
                                            fontSize: 12,
                                          }}>
                                            <span className="ms" style={{ fontSize: 16, color: "var(--ens-on-surface-variant)" }}>
                                              {TYPE_ICONES[ex.type] ?? "help"}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontWeight: 600, color: "var(--ens-on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {ex.titre || TYPE_LABELS[ex.type] || ex.type}
                                              </div>
                                              <div style={{ fontSize: 10, color: "var(--ens-on-surface-variant)" }}>
                                                {TYPE_LABELS[ex.type] ?? ex.type}
                                                {" · "}
                                                {new Date(ex.tente_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                              </div>
                                            </div>
                                            {ex.notable ? (
                                              <>
                                                <span style={{ fontSize: 11, color: "var(--ens-on-surface-variant)" }}>
                                                  {ex.score}/{ex.total}
                                                </span>
                                                <span style={{
                                                  fontSize: 11, fontWeight: 700,
                                                  padding: "2px 8px", borderRadius: 999,
                                                  background: ex.pourcentage >= 80 ? "#DCFCE7" : ex.pourcentage >= 60 ? "#FEF3C7" : "#FEE2E2",
                                                  color: scoreColor(ex.pourcentage),
                                                  minWidth: 44, textAlign: "center",
                                                }}>
                                                  {ex.pourcentage}%
                                                </span>
                                              </>
                                            ) : (
                                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#EEF0FE", color: "var(--ens-primary)", fontWeight: 600 }}>
                                                {ex.valide ? "Fait" : "Entamé"}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Légende */}
      <div style={{ marginTop: 20, padding: "10px 14px", background: "var(--ens-surface-container-low)", borderRadius: 8, fontSize: 11, color: "var(--ens-on-surface-variant)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 4, background: "#16A34A", borderRadius: 999, display: "inline-block" }} /> Score élève
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 2, height: 12, background: "#475569", borderRadius: 1, display: "inline-block" }} /> Moyenne de la classe
        </span>
        <span>· Les leçons et écritures libres ne sont pas notées.</span>
      </div>
    </>
  );
}
