"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";

interface ExerciceLigne {
  exercice_id: string;
  type: string;
  ordre: number | null;
  titre: string;
  consigne: string | null;
  resultat_id: string;
  score: number;
  total: number;
  pourcentage: number;
  valide: boolean;
  force_par_enseignant: boolean;
  created_at: string;
}

interface ChapitreGroupe {
  chapitre_id: string;
  titre: string;
  matiere: string | null;
  sous_matiere: string | null;
  exercices: ExerciceLigne[];
}

interface ApiData {
  eleve: { uid: string; prenom: string | null; nom: string | null; niveau: string | null };
  chapitres: ChapitreGroupe[];
}

const TYPE_LABEL: Record<string, string> = {
  exercice:           "Exercice",
  qcm:                "QCM",
  texte_a_trous:      "Texte à trous",
  ecriture_contrainte: "Écriture",
  revision:           "Révision",
  analyse_phrase:     "Analyse de phrase",
  classement:         "Classement",
  calcul_mental:      "Calcul mental",
};

export default function PageExercicesEleve({ params }: { params: Promise<{ id: string }> }) {
  const { id: uid } = use(params);

  const [data, setData] = useState<ApiData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enAction, setEnAction] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/enseignant/eleves/${uid}/exercices`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.erreur || "Erreur");
      setData(json);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setChargement(false);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function decider(resultat_id: string, action: "forcer" | "annuler") {
    setEnAction(resultat_id);
    try {
      const res = await fetch("/api/enseignant/exercice-resultat/forcer-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultat_id, action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.erreur || "Échec");
      }
      // MAJ locale
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapitres: prev.chapitres.map((c) => ({
            ...c,
            exercices: c.exercices.map((e) =>
              e.resultat_id === resultat_id
                ? action === "forcer"
                  ? { ...e, score: e.total, pourcentage: 100, valide: true, force_par_enseignant: true }
                  : { ...e, valide: false, force_par_enseignant: false }
                : e,
            ),
          })),
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEnAction(null);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 80px" }}>

      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <Link
          href={`/enseignant/eleves/${uid}/performance`}
          className="pb-btn surface"
          style={{ padding: "6px 12px", fontSize: 13 }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Portrait élève
        </Link>
      </div>

      <h1 style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 26, fontWeight: 900,
        margin: "12px 0 4px",
      }}>
        {data?.eleve
          ? `Exercices — ${data.eleve.prenom ?? ""} ${data.eleve.nom ?? ""}`.trim()
          : "Exercices de l'élève"}
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 20px" }}>
        Liste des exercices tentés. Tu peux <strong>forcer la validation</strong> manuellement quand l&apos;IA est trop stricte, ou <strong>annuler</strong> une validation forcée pour la rendre à nouveau évaluable.
      </p>

      {chargement && (
        <p style={{ textAlign: "center", color: "var(--pb-on-surface-variant)", padding: 30 }}>
          Chargement…
        </p>
      )}

      {erreur && (
        <div style={{
          padding: "12px 16px", borderRadius: 12,
          background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626",
          fontSize: 14, marginBottom: 16,
        }}>
          {erreur}
        </div>
      )}

      {!chargement && data && data.chapitres.length === 0 && (
        <div style={{
          padding: 36, textAlign: "center",
          borderRadius: 16,
          background: "var(--pb-surface-container, #f5f5f5)",
          border: "1px dashed rgba(0,0,0,0.12)",
          color: "var(--pb-on-surface-variant)",
        }}>
          <span className="ms" style={{ fontSize: 36, opacity: 0.4, display: "block", marginBottom: 8 }}>inbox</span>
          Aucun exercice tenté pour le moment.
        </div>
      )}

      {data?.chapitres.map((chap) => (
        <section
          key={chap.chapitre_id}
          style={{
            marginBottom: 24,
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <header style={{
            padding: "12px 18px",
            background: "var(--pb-surface-container, #f5f5f5)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
              color: "var(--pb-on-surface-variant)", marginBottom: 2,
            }}>
              {chap.matiere ?? "—"}{chap.sous_matiere ? ` · ${chap.sous_matiere}` : ""}
            </div>
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: "var(--pb-on-surface)",
            }}>{chap.titre}</h2>
          </header>

          <div>
            {chap.exercices.map((e, idx) => {
              const enCours = enAction === e.resultat_id;
              const couleurStatut = e.valide ? "#16a34a" : e.pourcentage >= 60 ? "#d97706" : "#dc2626";
              return (
                <div
                  key={e.exercice_id}
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
                    padding: "12px 18px",
                    borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: "var(--pb-on-surface-variant)",
                      textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2,
                    }}>
                      {TYPE_LABEL[e.type] ?? e.type} · #{e.ordre ?? "—"}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {e.titre}
                    </div>
                    {e.consigne && (
                      <div style={{
                        fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {e.consigne}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div style={{
                    minWidth: 70, textAlign: "right",
                    fontSize: 14, fontWeight: 700,
                    color: couleurStatut,
                  }}>
                    {e.score}/{e.total}
                    <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{e.pourcentage}%</div>
                  </div>

                  {/* Statut */}
                  <div style={{ minWidth: 130 }}>
                    {e.valide ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        background: e.force_par_enseignant ? "#fef3c7" : "#dcfce7",
                        color: e.force_par_enseignant ? "#854d0e" : "#166534",
                        border: `1px solid ${e.force_par_enseignant ? "#fcd34d" : "#86efac"}`,
                      }}>
                        <span className="ms" style={{ fontSize: 14 }}>
                          {e.force_par_enseignant ? "edit" : "check_circle"}
                        </span>
                        {e.force_par_enseignant ? "Validé manuellement" : "Validé"}
                      </span>
                    ) : (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        background: "#fee2e2", color: "#991b1b",
                        border: "1px solid #fca5a5",
                      }}>
                        <span className="ms" style={{ fontSize: 14 }}>cancel</span>
                        À reprendre
                      </span>
                    )}
                  </div>

                  {/* Action */}
                  <div>
                    {e.force_par_enseignant ? (
                      <button
                        onClick={() => decider(e.resultat_id, "annuler")}
                        disabled={enCours}
                        className="pb-btn surface"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                      >
                        <span className="ms" style={{ fontSize: 14 }}>undo</span>
                        Annuler
                      </button>
                    ) : !e.valide ? (
                      <button
                        onClick={() => decider(e.resultat_id, "forcer")}
                        disabled={enCours}
                        className="pb-btn primary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                      >
                        <span className="ms" style={{ fontSize: 14 }}>verified</span>
                        Forcer la validation
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
                        (déjà validé)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
