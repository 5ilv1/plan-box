"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MotDict } from "@/types";

interface Props {
  mots: MotDict[];
  theme: string;
  onTermine: (score: { bon: number; total: number }) => void;
}

/** Normalise un mot pour la comparaison (minuscules, pas d'accents superflus, trim) */
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFC") // canonical form
    .replace(/[\u2019\u2018']/g, "'") // apostrophes unifiées
    .replace(/\s+/g, " ");
}

/** Compare deux mots avec tolérance sur les accents optionnels */
function motCorrect(reponse: string, attendu: string): boolean {
  return normaliser(reponse) === normaliser(attendu);
}

export default function MotsRevision({ mots, theme, onTermine }: Props) {
  const [index, setIndex] = useState(0);
  const [saisie, setSaisie] = useState("");
  const [etat, setEtat] = useState<"question" | "correct" | "incorrect" | "termine">("question");
  const [resultats, setResultats] = useState<{ mot: string; reponse: string; correct: boolean }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = mots.length;
  const motCourant = mots[index];
  const bon = resultats.filter((r) => r.correct).length;

  // Focus auto sur l'input
  useEffect(() => {
    if (etat === "question" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [index, etat]);

  const valider = useCallback(() => {
    if (!saisie.trim()) return;
    const correct = motCorrect(saisie, motCourant.mot);
    const newResultats = [...resultats, { mot: motCourant.mot, reponse: saisie.trim(), correct }];
    setResultats(newResultats);
    setEtat(correct ? "correct" : "incorrect");
  }, [saisie, motCourant, resultats]);

  function suivant() {
    if (index + 1 >= total) {
      setEtat("termine");
      const bonFinal = resultats.filter((r) => r.correct).length;
      onTermine({ bon: bonFinal, total });
    } else {
      setIndex(index + 1);
      setSaisie("");
      setEtat("question");
    }
  }

  // ── Terminé ──
  if (etat === "termine") {
    const pct = total > 0 ? Math.round((bon / total) * 100) : 0;
    const motsFaux = resultats.filter((r) => !r.correct);
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{pct >= 80 ? "🎉" : "💪"}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {pct >= 80 ? "Bravo !" : "Continue tes efforts !"}
          </h2>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: pct >= 80 ? "#F0FDF4" : "#FEF3C7",
            border: `1px solid ${pct >= 80 ? "#BBF7D0" : "#FDE68A"}`,
            borderRadius: 12, padding: "12px 24px", marginBottom: 16,
          }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: pct >= 80 ? "#16A34A" : "#D97706" }}>
              {pct}%
            </span>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {bon}/{total} mots corrects
            </span>
          </div>
        </div>

        {motsFaux.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "var(--text)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Mots à revoir :
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {motsFaux.map((r, i) => (
                <div key={i} style={{
                  background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                  padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#DC2626", textDecoration: "line-through", marginRight: 8 }}>
                      {r.reponse}
                    </span>
                    <span style={{ fontWeight: 700, color: "#16A34A" }}>→ {r.mot}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Question en cours ──
  return (
    <div style={{ padding: "4px 0" }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span className="ms" style={{ fontSize: 22, color: "#D97706" }}>quiz</span>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Révision des mots
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, marginTop: 2 }}>
            Lis la définition et écris le bon mot
          </p>
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          <span>Mot {index + 1} sur {total}</span>
          <span>{bon} correct{bon > 1 ? "s" : ""}</span>
        </div>
        <div style={{ height: 6, background: "var(--border, #E5E7EB)", borderRadius: 999 }}>
          <div style={{
            height: "100%", borderRadius: 999, background: "#D97706",
            width: `${(index / total) * 100}%`, transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Carte définition */}
      <div style={{
        background: "#FFFBEB", border: "2px solid #FDE68A",
        borderRadius: 20, padding: "32px 24px", textAlign: "center", marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, color: "#D97706", fontWeight: 700, marginBottom: 12, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Définition
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", lineHeight: 1.5 }}>
          {motCourant.definition}
        </div>
        {motCourant.pronom && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, fontStyle: "italic" }}>
            Pronom : {motCourant.pronom}
          </div>
        )}
      </div>

      {/* Feedback correct/incorrect */}
      {etat === "correct" && (
        <div style={{
          background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12,
          padding: "16px", marginBottom: 16, textAlign: "center",
        }}>
          <span className="ms" style={{ fontSize: 28, color: "#16A34A", verticalAlign: "middle" }}>check_circle</span>
          <span style={{ fontWeight: 700, color: "#16A34A", marginLeft: 8, fontSize: 16 }}>
            Correct ! — {motCourant.mot}
          </span>
        </div>
      )}

      {etat === "incorrect" && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12,
          padding: "16px", marginBottom: 16, textAlign: "center",
        }}>
          <span className="ms" style={{ fontSize: 28, color: "#DC2626", verticalAlign: "middle" }}>cancel</span>
          <span style={{ fontWeight: 700, color: "#DC2626", marginLeft: 8, fontSize: 16, textDecoration: "line-through" }}>
            {saisie}
          </span>
          <span style={{ fontWeight: 700, color: "#16A34A", marginLeft: 12, fontSize: 16 }}>
            → {motCourant.mot}
          </span>
        </div>
      )}

      {/* Input + bouton */}
      {etat === "question" ? (
        <form onSubmit={(e) => { e.preventDefault(); valider(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            ref={inputRef}
            type="text"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Écris le mot ici..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "2px solid var(--border, #E5E7EB)", fontSize: 18, fontWeight: 600,
              textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif",
              outline: "none",
            }}
            onFocus={(e) => e.target.style.borderColor = "#D97706"}
            onBlur={(e) => e.target.style.borderColor = "var(--border, #E5E7EB)"}
          />
          <button
            type="submit"
            disabled={!saisie.trim()}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: saisie.trim() ? "#D97706" : "var(--border, #E5E7EB)",
              color: saisie.trim() ? "white" : "var(--text-secondary)",
              border: "none", cursor: saisie.trim() ? "pointer" : "default",
              fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>check</span>
            Vérifier
          </button>
        </form>
      ) : (
        <button
          onClick={suivant}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: "#5B21B6", color: "white",
            border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span className="ms" style={{ fontSize: 20 }}>
            {index + 1 >= total ? "done_all" : "arrow_forward"}
          </span>
          {index + 1 >= total ? "Voir mon score" : "Mot suivant"}
        </button>
      )}
    </div>
  );
}
