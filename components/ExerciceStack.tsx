"use client";

import { useState, useEffect, useRef } from "react";

interface Question {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

interface ExerciceStackProps {
  consigne?: string;
  questions: Question[];
  onComplete: (reponses: { id: number; reponse: string; correcte: boolean | null }[], score: number, total: number) => void;
}

export default function ExerciceStack({ consigne, questions, onComplete }: ExerciceStackProps) {
  const [index, setIndex] = useState(0);
  const [reponse, setReponse] = useState("");
  const [score, setScore] = useState(0);
  const [termine, setTermine] = useState(false);
  const [sortie, setSortie] = useState<"droite" | "gauche" | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [bonneReponse, setBonneReponse] = useState<string | null>(null);
  const [showIndice, setShowIndice] = useState(false);
  const [reponsesSauvees, setReponsesSauvees] = useState<{ id: number; reponse: string; correcte: boolean | null }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mélanger les questions une seule fois au montage
  const [questionsShuffled] = useState<Question[]>(() => {
    const arr = [...questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  useEffect(() => {
    if (!termine && !feedback) inputRef.current?.focus();
  }, [index, termine, feedback]);

  const q = questionsShuffled[index];
  const nbRestantes = questionsShuffled.length - index;

  function valider() {
    if (!reponse.trim()) return;
    const attendue = q.reponse_attendue.trim().toLowerCase();
    const donnee = reponse.trim().toLowerCase();

    // Comparaison souple : exact ou numérique
    const numAttend = parseFloat(attendue.replace(",", "."));
    const numDonne = parseFloat(donnee.replace(",", "."));
    const correct = donnee === attendue
      || (!isNaN(numAttend) && !isNaN(numDonne) && Math.abs(numAttend - numDonne) < 0.01);

    setFeedback(correct ? "correct" : "incorrect");
    if (!correct) setBonneReponse(q.reponse_attendue);
    if (correct) setScore(s => s + 1);

    setReponsesSauvees(prev => [...prev, { id: q.id, reponse: reponse.trim(), correcte: correct }]);

    setTimeout(() => {
      setSortie(correct ? "droite" : "gauche");
      setTimeout(() => {
        setSortie(null);
        setFeedback(null);
        setBonneReponse(null);
        setReponse("");
        setShowIndice(false);
        if (index + 1 >= questionsShuffled.length) {
          const finalScore = correct ? score + 1 : score;
          setTermine(true);
          const allReponses = [...reponsesSauvees, { id: q.id, reponse: reponse.trim(), correcte: correct }];
          onComplete(allReponses, finalScore, questions.length);
        } else {
          setIndex(i => i + 1);
        }
      }, 380);
    }, 1200);
  }

  // Écran de fin
  if (termine) {
    const pct = Math.round((score / questionsShuffled.length) * 100);
    return (
      <div style={{ padding: "24px 0" }}>
        <div style={{
          padding: "28px 24px",
          background: pct >= 70 ? "#F0FDF4" : "#FFF7ED",
          border: `2px solid ${pct >= 70 ? "#86EFAC" : "#FCD34D"}`,
          borderRadius: "1.5rem",
          textAlign: "center",
          marginBottom: 20,
        }}>
          <div style={{ marginBottom: 8 }}>
            <span className="ms" style={{ fontSize: 48, color: pct >= 70 ? "#16A34A" : "#D97706" }}>
              {pct === 100 ? "emoji_events" : pct >= 70 ? "celebration" : "fitness_center"}
            </span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: pct >= 70 ? "#16A34A" : "#D97706", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {score} / {questionsShuffled.length}
          </div>
          <div style={{ fontSize: 14, color: "var(--pb-on-surface-variant, #555)", marginTop: 6 }}>
            {pct === 100 ? "Parfait ! Toutes les bonnes réponses !" :
              pct >= 70 ? `Bravo, ${pct}% de bonnes réponses !` :
              `${pct}% — Continue de t'entraîner !`}
          </div>
        </div>

        {/* Corrigé */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {questionsShuffled.map((qq, i) => {
            const r = reponsesSauvees[i];
            const correct = r?.correcte;
            return (
              <div key={qq.id} style={{
                padding: "14px 16px",
                borderRadius: "0.875rem",
                background: correct ? "#DCFCE7" : "#FEE2E2",
                borderLeft: `4px solid ${correct ? "#16A34A" : "#DC2626"}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ms" style={{ fontSize: 18, color: correct ? "#16A34A" : "#DC2626" }}>
                    {correct ? "check_circle" : "cancel"}
                  </span>
                  {i + 1}. {qq.enonce}
                </div>
                {!correct && r && (
                  <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 3, paddingLeft: 24 }}>
                    Ta réponse : {r.reponse}
                  </div>
                )}
                <div style={{ fontSize: 13, color: correct ? "#15803D" : "#65A30D", fontWeight: 600, paddingLeft: 24 }}>
                  Bonne réponse : {qq.reponse_attendue}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes exoSortirDroite {
          0% { transform: translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateX(120%) rotate(15deg); opacity: 0; }
        }
        @keyframes exoSortirGauche {
          0% { transform: translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateX(-120%) rotate(-15deg); opacity: 0; }
        }
        @keyframes exoEntrer {
          0% { transform: scale(0.95); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
        .exo-sortir-droite { animation: exoSortirDroite 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
        .exo-sortir-gauche { animation: exoSortirGauche 0.38s cubic-bezier(0.4,0,0.2,1) forwards; }
        .exo-entrer { animation: exoEntrer 0.3s ease forwards; }
      `}</style>

      {/* Consigne */}
      {consigne && (
        <div style={{
          padding: "14px 18px", marginBottom: 20,
          background: "var(--pb-surface-low, #F1EFFF)",
          border: "1.5px solid var(--pb-surface-container, #E7E6FF)",
          borderRadius: "1rem",
          fontSize: 14, fontWeight: 600, lineHeight: 1.6,
          color: "var(--pb-on-surface, #282B51)",
        }}>
          <span className="ms" style={{ fontSize: 18, verticalAlign: "middle", marginRight: 6, color: "var(--pb-primary, #0050D4)" }}>info</span>
          {consigne}
        </div>
      )}

      {/* Compteur */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ms" style={{ fontSize: 22, color: "var(--pb-primary, #0050D4)" }}>edit_note</span>
          <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface, #282B51)" }}>
            Exercice
          </span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant, #555)",
          background: "var(--pb-surface-container, #E7E6FF)", padding: "4px 14px", borderRadius: 999,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {index + 1} / {questionsShuffled.length}
        </span>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 4, background: "var(--pb-surface-container, #E0E0FF)", borderRadius: 999, marginBottom: 24, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${(index / questionsShuffled.length) * 100}%`,
          background: "var(--pb-primary, #0050D4)", borderRadius: 999,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Zone stack */}
      <div style={{ position: "relative", minHeight: 280 }}>

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
            sortie === "droite" ? "exo-sortir-droite" :
            sortie === "gauche" ? "exo-sortir-gauche" :
            "exo-entrer"
          }
          style={{
            position: "relative",
            zIndex: 10,
            background: feedback === "correct" ? "#F0FDF4" : feedback === "incorrect" ? "#FEF2F2" : "white",
            border: `1.5px solid ${
              feedback === "correct" ? "#16A34A" :
              feedback === "incorrect" ? "#DC2626" :
              "var(--pb-surface-container, #E0E0FF)"
            }`,
            borderRadius: "1.5rem",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            padding: "2rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
            transition: "border-color 0.2s ease, background 0.2s ease",
          }}
        >
          {/* Question */}
          <div style={{
            fontSize: 17, fontWeight: 700, lineHeight: 1.6,
            color: "var(--pb-on-surface, #282B51)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {q.enonce}
          </div>

          {/* Indice */}
          {q.indice && showIndice && (
            <div style={{
              padding: "10px 14px",
              background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "0.75rem",
              fontSize: 13, color: "#92400E", lineHeight: 1.5,
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <span className="ms" style={{ fontSize: 18, color: "#F59E0B", flexShrink: 0, marginTop: 1 }}>lightbulb</span>
              {q.indice}
            </div>
          )}

          {/* Feedback bonne réponse */}
          {feedback === "correct" && (
            <div style={{ textAlign: "center", fontWeight: 800, fontSize: 20, color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span className="ms" style={{ fontSize: 28 }}>check_circle</span>
              Bonne réponse !
            </div>
          )}

          {/* Feedback mauvaise réponse */}
          {feedback === "incorrect" && bonneReponse && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                <span className="ms" style={{ fontSize: 24 }}>cancel</span>
                Pas tout à fait
              </div>
              <div style={{ fontSize: 14, color: "#15803D", fontWeight: 600 }}>
                Réponse : {bonneReponse}
              </div>
            </div>
          )}

          {/* Saisie */}
          {!feedback && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={reponse}
                  onChange={e => setReponse(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && valider()}
                  placeholder="Ta réponse…"
                  style={{
                    flex: 1, padding: "14px 18px", fontSize: 16, fontWeight: 600,
                    borderRadius: "0.875rem",
                    border: "2px solid var(--pb-outline-variant, #A7AAD7)",
                    background: "var(--pb-surface-low, #F8F5FF)",
                    outline: "none", fontFamily: "inherit",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--pb-primary, #0050D4)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--pb-outline-variant, #A7AAD7)"}
                />
                <button
                  onClick={valider}
                  disabled={!reponse.trim()}
                  className="pb-btn primary"
                  style={{
                    padding: "14px 24px", fontSize: 15, borderRadius: "0.875rem",
                    opacity: reponse.trim() ? 1 : 0.5,
                  }}
                >
                  <span className="ms" style={{ fontSize: 20 }}>check</span>
                </button>
              </div>
              {q.indice && !showIndice && (
                <button
                  onClick={() => setShowIndice(true)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, color: "#D97706",
                    display: "flex", alignItems: "center", gap: 4, padding: 0,
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>lightbulb</span>
                  Voir l'indice
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
