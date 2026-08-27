"use client";

import { useState } from "react";
import DroiteGraduee, { type Droite } from "@/components/DroiteGraduee";
import FigureGeo, { type Figure } from "@/components/FigureGeo";

interface QCMQuestion {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
  /** Droite graduée dessinée au-dessus de l'énoncé. Voir SPEC-DROITE-GRADUEE.md. */
  droite?: Droite;
  /** Figure dessinée sous l'énoncé. Voir SPEC-FIGURES.md. */
  figure?: Figure;
}

interface Props {
  titre?: string;
  questions: QCMQuestion[];
  onTermine: (
    score: { bon: number; total: number },
    reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[],
  ) => void;
}

export default function QCMEleve({ titre, questions, onTermine }: Props) {
  const [reponses, setReponses] = useState<Record<number, number>>({});
  const [valide, setValide] = useState(false);

  const toutRepondu = questions.every((_, i) => reponses[i] !== undefined);

  function valider() {
    if (!toutRepondu) return;
    let bon = 0;
    const repEleve = questions.map((q, i) => {
      const idx = reponses[i];
      const ok = idx === q.reponse_correcte;
      if (ok) bon++;
      return {
        id: i,
        reponse: idx !== undefined ? q.options[idx] : "",
        correcte: ok,
      };
    });
    setValide(true);
    onTermine({ bon, total: questions.length }, repEleve);
  }

  const score = questions.reduce(
    (acc, q, i) => (reponses[i] === q.reponse_correcte ? acc + 1 : acc),
    0,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {titre && (
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {titre}
        </h2>
      )}

      {questions.map((q, i) => {
        const choisi = reponses[i];
        return (
          <div
            key={i}
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              border: "1.5px solid var(--pb-outline-variant, #E5E7EB)",
              background: "white",
            }}
          >
            {q.droite && <DroiteGraduee droite={q.droite} />}
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              <span style={{ color: "#92400E", marginRight: 6 }}>Q{i + 1}.</span>
              {q.question}
            </p>
            {q.figure && <FigureGeo figure={q.figure} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map((opt, j) => {
                const isChoisi = choisi === j;
                const isBonne = j === q.reponse_correcte;
                let bg = "white";
                let border = "1.5px solid var(--pb-outline-variant, #E5E7EB)";
                let color = "inherit";
                if (valide) {
                  if (isBonne) {
                    bg = "#DCFCE7";
                    border = "1.5px solid #16A34A";
                    color = "#14532D";
                  } else if (isChoisi && !isBonne) {
                    bg = "#FEE2E2";
                    border = "1.5px solid #DC2626";
                    color = "#7F1D1D";
                  }
                } else if (isChoisi) {
                  bg = "#FEF3C7";
                  border = "1.5px solid #92400E";
                  color = "#78350F";
                }
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={valide}
                    onClick={() => setReponses((r) => ({ ...r, [i]: j }))}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border,
                      background: bg,
                      color,
                      cursor: valide ? "default" : "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: isChoisi ? "#92400E" : "#F3F4F6",
                        color: isChoisi ? "white" : "#6B7280",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {String.fromCharCode(65 + j)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {valide && q.explication && (
              <p
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontSize: 13,
                  color: "var(--pb-on-surface-variant, #4B5563)",
                  fontStyle: "italic",
                }}
              >
                💡 {q.explication}
              </p>
            )}
          </div>
        );
      })}

      {!valide && (
        <button
          type="button"
          className="pb-btn primary"
          disabled={!toutRepondu}
          onClick={valider}
          style={{ alignSelf: "stretch" }}
        >
          Valider mes réponses
        </button>
      )}

      {valide && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: score / questions.length >= 0.8 ? "#DCFCE7" : "#FEF3C7",
            border: `1.5px solid ${score / questions.length >= 0.8 ? "#16A34A" : "#F59E0B"}`,
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>
            Score : {score} / {questions.length}
          </p>
        </div>
      )}
    </div>
  );
}
