"use client";

import React, { useState, useMemo } from "react";
import Liseuse from "./Liseuse";

interface Question {
  id: number;
  question: string;
  choix: string[];
  reponse: number;
}

interface Props {
  titre: string;
  texte: string;
  questions: Question[];
  onTermine: (score: { bon: number; total: number }, reponsesEleve: { id: number; reponse: string; correcte: boolean }[]) => void;
  skipLecture?: boolean;
  exerciceId?: string | number;
}

const COULEURS_CHOIX = [
  { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", selectedBg: "#2563EB" },
  { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E", selectedBg: "#D97706" },
  { bg: "#DCFCE7", border: "#BBF7D0", text: "#166534", selectedBg: "#16A34A" },
  { bg: "#F3E8FF", border: "#DDD6FE", text: "#5B21B6", selectedBg: "#7C3AED" },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LectureEleve({ titre, texte, questions, onTermine, skipLecture, exerciceId }: Props) {
  const [phase, setPhase] = useState<"lecture" | "qcm" | "termine">(skipLecture ? "qcm" : "lecture");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoix, setSelectedChoix] = useState<number | null>(null);
  const [validated, setValidated] = useState(false);
  const [score, setScore] = useState(0);
  const [reponsesLog, setReponsesLog] = useState<{ id: number; reponse: string; correcte: boolean }[]>([]);
  const [animDir, setAnimDir] = useState<"in" | "out" | null>(null);
  const [showTexte, setShowTexte] = useState(false);

  const shuffledQuestions = useMemo(() => shuffleArray(questions), [questions]);
  const current = shuffledQuestions[currentIndex];
  const total = shuffledQuestions.length;
  const isCorrect = selectedChoix === current?.reponse;

  function validerChoix() {
    if (selectedChoix === null || !current) return;
    setValidated(true);

    const correct = selectedChoix === current.reponse;
    const newScore = correct ? score + 1 : score;
    setScore(newScore);

    const newLog = [...reponsesLog, {
      id: current.id,
      reponse: current.choix[selectedChoix],
      correcte: correct,
    }];
    setReponsesLog(newLog);

    // Passer à la question suivante après un délai
    setTimeout(() => {
      if (currentIndex + 1 >= total) {
        setPhase("termine");
        onTermine({ bon: newScore, total }, newLog);
      } else {
        setAnimDir("out");
        setTimeout(() => {
          setCurrentIndex((i) => i + 1);
          setSelectedChoix(null);
          setValidated(false);
          setAnimDir("in");
          setTimeout(() => setAnimDir(null), 300);
        }, 200);
      }
    }, 1200);
  }

  // ── Phase lecture ──
  if (phase === "lecture") {
    return (
      <div style={{ padding: "0.5rem 0" }}>
        <Liseuse
          titre={titre}
          texte={texte}
          exerciceId={exerciceId}
          onTermine={() => setPhase("qcm")}
          actionLabel="J'ai terminé la lecture — Passer aux questions"
        />
      </div>
    );
  }

  // ── Phase terminée ──
  if (phase === "termine") {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: pct >= 80 ? "#16A34A" : pct >= 50 ? "#D97706" : "#DC2626" }}>
          {pct >= 80 ? "emoji_events" : pct >= 50 ? "sentiment_satisfied" : "sentiment_dissatisfied"}
        </span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 12 }}>
          Lecture terminée !
        </h2>
        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: pct >= 80 ? "#16A34A" : pct >= 50 ? "#D97706" : "#DC2626", marginTop: 8 }}>
          {score} / {total} bonnes réponses ({pct}%)
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: 8 }}>
          {pct >= 80 ? "Excellent ! Tu as bien compris le texte." : pct >= 50 ? "Pas mal, mais relis le texte pour mieux comprendre." : "Relis bien le texte, tu peux faire mieux !"}
        </p>
      </div>
    );
  }

  // ── Phase QCM (cartes stackées) ──
  return (
    <div style={{ padding: "0.5rem 0" }}>
      {/* Progression + bouton revoir */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 8 }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          Question {currentIndex + 1} / {total}
        </span>
        <div style={{ flex: 1, maxWidth: 200, height: 6, background: "var(--border)", borderRadius: 999 }}>
          <div style={{
            height: "100%", borderRadius: 999, background: "#7C3AED",
            width: `${((currentIndex + 1) / total) * 100}%`,
            transition: "width 0.3s",
          }} />
        </div>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#16A34A" }}>
          {score} ✓
        </span>
        <button
          onClick={() => setShowTexte(true)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 12px", borderRadius: 8,
            background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)",
            color: "#7C3AED", fontWeight: 700, fontSize: "0.75rem",
            cursor: "pointer", whiteSpace: "nowrap",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.08)")}
        >
          <span className="ms" style={{ fontSize: 16 }}>auto_stories</span>
          Revoir le texte
        </button>
      </div>

      {/* Modale revoir le texte */}
      {showTexte && (
        <div
          onClick={() => setShowTexte(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 900 }}
          >
            <Liseuse
              titre={titre}
              texte={texte}
              exerciceId={exerciceId}
              onClose={() => setShowTexte(false)}
              onTermine={() => setShowTexte(false)}
              actionLabel="Retour aux questions"
              height="min(80vh, 680px)"
            />
          </div>
        </div>
      )}

      {/* Pile de cartes */}
      <div style={{ position: "relative", minHeight: 320, perspective: 1000 }}>
        {/* Cartes en arrière-plan (stack effect) */}
        {currentIndex + 2 < total && (
          <div style={{
            position: "absolute", top: 8, left: 12, right: 12,
            height: 60, borderRadius: 16, background: "rgba(124,58,237,0.05)",
            border: "1px solid rgba(124,58,237,0.1)",
          }} />
        )}
        {currentIndex + 1 < total && (
          <div style={{
            position: "absolute", top: 4, left: 6, right: 6,
            height: 60, borderRadius: 16, background: "rgba(124,58,237,0.08)",
            border: "1px solid rgba(124,58,237,0.15)",
          }} />
        )}

        {/* Carte active */}
        <div style={{
          position: "relative",
          background: "white", borderRadius: 20, padding: "1.5rem",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          transform: animDir === "out" ? "translateX(-110%) rotate(-5deg)" : animDir === "in" ? "translateX(0)" : "none",
          opacity: animDir === "out" ? 0 : 1,
          transition: "transform 0.25s ease, opacity 0.2s ease",
        }}>
          {/* Question */}
          <div style={{
            fontSize: "1.125rem", fontWeight: 700, color: "var(--text)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginBottom: 20, lineHeight: 1.5,
          }}>
            {current.question}
          </div>

          {/* Choix */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {current.choix.map((choix, ci) => {
              const c = COULEURS_CHOIX[ci % COULEURS_CHOIX.length];
              const isSelected = selectedChoix === ci;
              const isCorrectAnswer = ci === current.reponse;
              const showCorrect = validated && isCorrectAnswer;
              const showWrong = validated && isSelected && !isCorrectAnswer;

              return (
                <button
                  key={ci}
                  onClick={() => !validated && setSelectedChoix(ci)}
                  disabled={validated}
                  style={{
                    padding: "12px 16px", borderRadius: 12,
                    background: showCorrect ? "#DCFCE7" : showWrong ? "#FEE2E2" : isSelected ? c.bg : "var(--bg, #F8F9FA)",
                    border: showCorrect ? "2px solid #16A34A" : showWrong ? "2px solid #DC2626" : isSelected ? `2px solid ${c.selectedBg}` : "1.5px solid var(--border)",
                    cursor: validated ? "default" : "pointer",
                    textAlign: "left",
                    display: "flex", alignItems: "center", gap: 12,
                    transition: "all 0.15s",
                    fontSize: "0.9375rem", fontWeight: isSelected ? 700 : 500,
                    color: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : isSelected ? c.text : "var(--text)",
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: showCorrect ? "#16A34A" : showWrong ? "#DC2626" : isSelected ? c.selectedBg : "var(--border)",
                    color: isSelected || showCorrect || showWrong ? "white" : "var(--text-secondary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.8125rem", fontWeight: 800, flexShrink: 0,
                    transition: "all 0.15s",
                  }}>
                    {showCorrect ? "✓" : showWrong ? "✗" : String.fromCharCode(65 + ci)}
                  </span>
                  {choix}
                </button>
              );
            })}
          </div>

          {/* Bouton valider */}
          {!validated && (
            <button
              onClick={validerChoix}
              disabled={selectedChoix === null}
              style={{
                width: "100%", padding: "12px", borderRadius: 999,
                background: selectedChoix !== null ? "#7C3AED" : "var(--border)",
                color: selectedChoix !== null ? "white" : "var(--text-secondary)",
                fontWeight: 700, fontSize: "0.9375rem", border: "none",
                cursor: selectedChoix !== null ? "pointer" : "default",
                marginTop: 16, transition: "all 0.15s",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Valider
            </button>
          )}

          {/* Feedback */}
          {validated && (
            <div style={{
              marginTop: 16, padding: "10px 16px", borderRadius: 10,
              background: isCorrect ? "#DCFCE7" : "#FEF3C7",
              border: isCorrect ? "1px solid #BBF7D0" : "1px solid #FDE68A",
              textAlign: "center", fontWeight: 700, fontSize: "0.875rem",
              color: isCorrect ? "#16A34A" : "#92400E",
            }}>
              {isCorrect ? "✓ Bonne réponse !" : `✗ La bonne réponse était : ${current.choix[current.reponse]}`}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
