"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { QCMQuestion } from "@/types";

interface QCMPlayerProps {
  questions: QCMQuestion[];
  qcm_id: string;
  planTravailId: string;
  eleveId?: string;
  repetiboxEleveId?: number;
  prenom: string;
  nom?: string;
  onTermine: (score: number, total: number, reponses?: { id: number; reponse: string; correcte: boolean }[]) => void;
}

type Phase = "quiz" | "resultat";

export default function QCMPlayer({
  questions,
  qcm_id,
  planTravailId,
  eleveId,
  repetiboxEleveId,
  prenom,
  nom = "",
  onTermine,
}: QCMPlayerProps) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [index, setIndex] = useState(0);
  const [reponsesChoisies, setReponsesChoisies] = useState<(number | null)[]>(
    Array(questions.length).fill(null)
  );
  const [sortie, setSortie] = useState<"droite" | "gauche" | null>(null);
  const [reponseValidee, setReponseValidee] = useState<number | null>(null);
  const [score, setScore] = useState<{ bon: number; total: number } | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const q = questions[index];
  const nbRestantes = questions.length - index;

  const passerSuivante = useCallback(() => {
    setSortie(null);
    setReponseValidee(null);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      // Fin du quiz — calculer le score
      const bon = questions.filter((qq, i) => reponsesChoisies[i] === qq.reponse_correcte).length;
      const total = questions.length;
      setScore({ bon, total });
      setPhase("resultat");
      setEnregistrement(true);

      fetch("/api/qcm-reponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcm_id,
          plan_travail_id: planTravailId,
          eleve_id: eleveId || null,
          repetibox_eleve_id: repetiboxEleveId || null,
          prenom,
          nom,
          score: bon,
          total,
          reponses: reponsesChoisies,
        }),
      })
        .catch(() => {})
        .finally(() => setEnregistrement(false));

      // Construire le détail des réponses pour le feedback
      const reponsesDetail = questions.map((qq, i) => ({
        id: i + 1,
        reponse: qq.options[reponsesChoisies[i] ?? -1] ?? "—",
        correcte: reponsesChoisies[i] === qq.reponse_correcte,
      }));
      onTermine(bon, total, reponsesDetail);
    }
  }, [index, questions, reponsesChoisies, qcm_id, planTravailId, eleveId, repetiboxEleveId, prenom, nom, onTermine]);

  function choisir(optionIndex: number) {
    if (reponseValidee !== null) return; // déjà validé

    const correct = optionIndex === q.reponse_correcte;
    setReponseValidee(optionIndex);
    setReponsesChoisies((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });

    // Animation de sortie puis passage à la suivante
    setTimeout(() => {
      setSortie(correct ? "droite" : "gauche");
      setTimeout(passerSuivante, 380);
    }, 1200);
  }

  function recommencer() {
    setReponsesChoisies(Array(questions.length).fill(null));
    setIndex(0);
    setSortie(null);
    setReponseValidee(null);
    setScore(null);
    setPhase("quiz");
  }

  // ── Résultat ────────────────────────────────────────────────────────────────
  if (phase === "resultat" && score) {
    const pct = Math.round((score.bon / score.total) * 100);
    const reussi = pct >= 70;

    return (
      <div style={{ marginTop: 20 }}>
        <div style={{
          padding: "28px 24px",
          background: reussi ? "#F0FDF4" : "#FFF7ED",
          border: `2px solid ${reussi ? "#86EFAC" : "#FCD34D"}`,
          borderRadius: "1.25rem",
          textAlign: "center",
          marginBottom: 20,
        }}>
          <div style={{ marginBottom: 8 }}>
            <span className="ms" style={{ fontSize: 48, color: reussi ? "#16A34A" : "#D97706" }}>
              {pct === 100 ? "emoji_events" : pct >= 70 ? "celebration" : "fitness_center"}
            </span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: reussi ? "#16A34A" : "#D97706", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {score.bon} / {score.total}
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6 }}>
            {pct === 100 ? "Parfait ! Toutes les bonnes réponses !" :
              reussi ? `Bravo, ${pct}% de bonnes réponses !` :
              `${pct}% — Continue à t'entraîner !`}
          </div>
        </div>

        {/* Corrigé */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {questions.map((qq, i) => {
            const choix = reponsesChoisies[i];
            const correct = choix === qq.reponse_correcte;
            return (
              <div key={i} style={{
                padding: "14px 16px",
                borderRadius: "0.875rem",
                background: correct ? "#DCFCE7" : "#FEE2E2",
                borderLeft: `4px solid ${correct ? "#16A34A" : "#DC2626"}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ms" style={{ fontSize: 18, color: correct ? "#16A34A" : "#DC2626" }}>
                    {correct ? "check_circle" : "cancel"}
                  </span>
                  {i + 1}. {qq.question}
                </div>
                {!correct && (
                  <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 3, paddingLeft: 24 }}>
                    Ta réponse : {choix !== null ? qq.options[choix] : "(sans réponse)"}
                  </div>
                )}
                <div style={{ fontSize: 13, color: correct ? "#15803D" : "#65A30D", fontWeight: 600, paddingLeft: 24 }}>
                  Bonne réponse : {qq.options[qq.reponse_correcte]}
                </div>
                {qq.explication && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, paddingLeft: 24, display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <span className="ms" style={{ fontSize: 14, color: "#F59E0B", flexShrink: 0, marginTop: 1 }}>lightbulb</span>
                    {qq.explication}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={recommencer}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: "0.75rem",
              background: "var(--pb-surface-low, #F3F4F6)", border: "1.5px solid var(--pb-outline-variant, #D1D5DB)",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface, #333)",
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>refresh</span>
            Refaire le quiz
          </button>
          <Link
            href={`/eleve/qcm-classement/${qcm_id}`}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "12px 16px", borderRadius: "0.75rem",
              background: "#FEF3C7", color: "#92400E", fontWeight: 700, fontSize: 14,
              textDecoration: "none", border: "1.5px solid #FCD34D",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>emoji_events</span>
            Voir le classement
          </Link>
        </div>

        {enregistrement && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginTop: 8 }}>
            Enregistrement du score…
          </p>
        )}
      </div>
    );
  }

  // ── Quiz (cartes stackées) ────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 20 }}>
      <style>{`
        @keyframes qcmSortirDroite {
          0% { transform: translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateX(120%) rotate(15deg); opacity: 0; }
        }
        @keyframes qcmSortirGauche {
          0% { transform: translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateX(-120%) rotate(-15deg); opacity: 0; }
        }
        @keyframes qcmEntrer {
          0% { transform: scale(0.95); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        .qcm-sortir-droite { animation: qcmSortirDroite 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
        .qcm-sortir-gauche { animation: qcmSortirGauche 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
        .qcm-entrer { animation: qcmEntrer 0.3s ease forwards; }
      `}</style>

      {/* Compteur */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ms" style={{ fontSize: 22, color: "var(--pb-primary, #0050D4)" }}>quiz</span>
          <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface, #282B51)" }}>
            Questionnaire
          </span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant, #555)",
          background: "var(--pb-surface-container, #E7E6FF)", padding: "4px 14px", borderRadius: 999,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {index + 1} / {questions.length}
        </span>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 4, background: "var(--pb-surface-container, #E0E0FF)", borderRadius: 999, marginBottom: 24, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${((index) / questions.length) * 100}%`,
          background: "var(--pb-primary, #0050D4)", borderRadius: 999,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Zone stack */}
      <div style={{ position: "relative", minHeight: 320 }}>

        {/* Carte 3 (fond) */}
        {nbRestantes >= 3 && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            background: "white",
            border: "1.5px solid var(--pb-surface-container, #E0E0FF)",
            borderRadius: "1.5rem",
            transform: "translateY(16px) scale(0.92)",
            transformOrigin: "bottom center",
            height: "100%",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            zIndex: 1,
          }} />
        )}

        {/* Carte 2 (milieu) */}
        {nbRestantes >= 2 && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            background: "white",
            border: "1.5px solid var(--pb-surface-container, #E0E0FF)",
            borderRadius: "1.5rem",
            transform: "translateY(8px) scale(0.96)",
            transformOrigin: "bottom center",
            height: "100%",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            zIndex: 2,
          }} />
        )}

        {/* Carte active */}
        <div
          key={index}
          className={
            sortie === "droite" ? "qcm-sortir-droite" :
            sortie === "gauche" ? "qcm-sortir-gauche" :
            "qcm-entrer"
          }
          style={{
            position: "relative",
            zIndex: 10,
            background: "white",
            border: `1.5px solid ${
              reponseValidee !== null
                ? reponseValidee === q.reponse_correcte ? "#16A34A" : "#DC2626"
                : "var(--pb-surface-container, #E0E0FF)"
            }`,
            borderRadius: "1.5rem",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            padding: "2rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            transition: "border-color 0.2s ease",
          }}
        >
          {/* Question */}
          <div style={{
            textAlign: "center",
            padding: "1.25rem 1rem",
            borderRadius: "1rem",
            background: "var(--pb-surface-low, #F1EFFF)",
            minHeight: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <p style={{
              fontSize: "1.125rem", fontWeight: 700,
              color: "var(--pb-on-surface, #282B51)", lineHeight: 1.5,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              margin: 0,
            }}>
              {q.question}
            </p>
          </div>

          {/* Séparateur */}
          <div style={{ height: 1, background: "var(--pb-surface-container, #E0E0FF)" }} />

          {/* Options */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {q.options.map((opt, j) => {
              const selectionne = reponseValidee === j;
              const estCorrect = j === q.reponse_correcte;
              const revele = reponseValidee !== null;

              let bg = "white";
              let border = "1.5px solid var(--pb-outline-variant, #A7AAD7)";
              let textColor = "var(--pb-on-surface, #282B51)";
              let badgeBg = "var(--pb-surface-container, #E7E6FF)";
              let badgeColor = "var(--pb-on-surface-variant, #555881)";

              if (revele && estCorrect) {
                bg = "#F0FDF4";
                border = "2px solid #16A34A";
                textColor = "#15803D";
                badgeBg = "#16A34A";
                badgeColor = "white";
              } else if (revele && selectionne && !estCorrect) {
                bg = "#FEF2F2";
                border = "2px solid #DC2626";
                textColor = "#DC2626";
                badgeBg = "#DC2626";
                badgeColor = "white";
              } else if (revele) {
                bg = "var(--pb-surface-low, #F8F5FF)";
                border = "1.5px solid var(--pb-surface-container, #E0E0FF)";
                textColor = "var(--pb-on-surface-variant, #555)";
              }

              return (
                <button
                  key={j}
                  onClick={() => choisir(j)}
                  disabled={reponseValidee !== null}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", borderRadius: "0.875rem",
                    border, background: bg, color: textColor,
                    fontWeight: 600, fontSize: 14,
                    cursor: reponseValidee !== null ? "default" : "pointer",
                    fontFamily: "'Manrope', sans-serif",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                    opacity: revele && !estCorrect && !selectionne ? 0.5 : 1,
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: badgeBg, color: badgeColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {revele && estCorrect ? (
                      <span className="ms" style={{ fontSize: 16 }}>check</span>
                    ) : revele && selectionne ? (
                      <span className="ms" style={{ fontSize: 16 }}>close</span>
                    ) : (
                      ["A", "B", "C", "D"][j]
                    )}
                  </span>
                  <span style={{ flex: 1 }}>{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Feedback après réponse */}
          {reponseValidee !== null && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "0.875rem",
              background: reponseValidee === q.reponse_correcte ? "#F0FDF4" : "#FEF2F2",
              border: `1.5px solid ${reponseValidee === q.reponse_correcte ? "#BBF7D0" : "#FECACA"}`,
              fontSize: 14, fontWeight: 600,
              color: reponseValidee === q.reponse_correcte ? "#15803D" : "#DC2626",
              display: "flex", alignItems: "center", gap: 8,
              animation: "qcmEntrer 0.2s ease",
            }}>
              <span className="ms" style={{ fontSize: 20 }}>
                {reponseValidee === q.reponse_correcte ? "check_circle" : "info"}
              </span>
              {reponseValidee === q.reponse_correcte
                ? "Bonne réponse !"
                : `La bonne réponse était : ${q.options[q.reponse_correcte]}`
              }
            </div>
          )}

          {/* Explication si disponible */}
          {reponseValidee !== null && q.explication && (
            <div style={{
              padding: "10px 14px", borderRadius: "0.75rem",
              background: "#FFFBEB", border: "1px solid #FDE68A",
              fontSize: 13, color: "#92400E", lineHeight: 1.5,
              display: "flex", alignItems: "flex-start", gap: 6,
            }}>
              <span className="ms" style={{ fontSize: 16, color: "#F59E0B", flexShrink: 0, marginTop: 1 }}>lightbulb</span>
              {q.explication}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
