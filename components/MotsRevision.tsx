"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MotDict } from "@/types";

interface Props {
  mots: MotDict[];
  theme: string;
  onTermine: (score: { bon: number; total: number }) => void;
}

const DUREE_AFFICHAGE = 5; // secondes

/** Normalise un mot pour la comparaison */
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFC")
    .replace(/[\u2019\u2018']/g, "'")
    .replace(/\s+/g, " ");
}

function motCorrect(reponse: string, attendu: string): boolean {
  return normaliser(reponse) === normaliser(attendu);
}

type Phase = "affichage" | "saisie" | "correct" | "incorrect" | "termine";

export default function MotsRevision({ mots, theme, onTermine }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("affichage");
  const [saisie, setSaisie] = useState("");
  const [tempsRestant, setTempsRestant] = useState(DUREE_AFFICHAGE);
  const [resultats, setResultats] = useState<{ mot: string; essais: number }[]>([]);
  const [essaisCourant, setEssaisCourant] = useState(0);
  const [scoreFinal, setScoreFinal] = useState<{ bon: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = mots.length;
  const motCourant = mots[index];
  const reussisPremierCoup = resultats.filter((r) => r.essais === 1).length;

  // ── Timer pour la phase d'affichage ──
  useEffect(() => {
    if (phase !== "affichage") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setTempsRestant(DUREE_AFFICHAGE);
    const start = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = DUREE_AFFICHAGE - elapsed;
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setTempsRestant(0);
        setPhase("saisie");
      } else {
        setTempsRestant(remaining);
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, index]);

  // Focus auto sur l'input
  useEffect(() => {
    if (phase === "saisie" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase]);

  const valider = useCallback(() => {
    if (!saisie.trim()) return;
    const tentatives = essaisCourant + 1;

    if (motCorrect(saisie, motCourant.mot)) {
      setEssaisCourant(tentatives);
      setPhase("correct");
    } else {
      setEssaisCourant(tentatives);
      setPhase("incorrect");
    }
  }, [saisie, motCourant, essaisCourant]);

  function motSuivant() {
    const tentatives = essaisCourant;
    const newResultats = [...resultats, { mot: motCourant.mot, essais: tentatives }];
    setResultats(newResultats);

    if (index + 1 >= total) {
      const bonFinal = newResultats.filter((r) => r.essais === 1).length;
      setScoreFinal({ bon: bonFinal, total });
      setPhase("termine");
    } else {
      setIndex(index + 1);
      setSaisie("");
      setEssaisCourant(0);
      setPhase("affichage");
    }
  }

  function rejouerMot() {
    // Mauvaise réponse → on réaffiche le même mot
    setSaisie("");
    setPhase("affichage");
  }

  // ── Terminé ──
  if (phase === "termine") {
    const pct = total > 0 ? Math.round((reussisPremierCoup / total) * 100) : 0;
    const motsRates = resultats.filter((r) => r.essais > 1);
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
              {reussisPremierCoup}/{total} mots du premier coup
            </span>
          </div>
        </div>

        {motsRates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "var(--text)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Mots à revoir :
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {motsRates.map((r, i) => (
                <div key={i} style={{
                  background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                  padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>{r.mot}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {r.essais} essai{r.essais > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton Continuer → appelle onTermine */}
        <button
          onClick={() => { if (scoreFinal) onTermine(scoreFinal); }}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, marginTop: 24,
            background: "#5B21B6", color: "white",
            border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span className="ms" style={{ fontSize: 20 }}>check_circle</span>
          Continuer
        </button>
      </div>
    );
  }

  // ── Progression en haut ──
  const progressBar = (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
        <span>Mot {index + 1} sur {total}</span>
        <span>{reussisPremierCoup} réussi{reussisPremierCoup > 1 ? "s" : ""} du 1er coup</span>
      </div>
      <div style={{ height: 6, background: "var(--border, #E5E7EB)", borderRadius: 999 }}>
        <div style={{
          height: "100%", borderRadius: 999, background: "#D97706",
          width: `${(index / total) * 100}%`, transition: "width 0.3s",
        }} />
      </div>
    </div>
  );

  // ── Phase AFFICHAGE : le mot s'affiche avec un décompte ──
  if (phase === "affichage") {
    const pctTimer = (tempsRestant / DUREE_AFFICHAGE) * 100;
    return (
      <div style={{ padding: "4px 0" }}>
        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span className="ms" style={{ fontSize: 22, color: "#D97706" }}>visibility</span>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Mémorise le mot
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, marginTop: 2 }}>
              Regarde bien, il va disparaître !
            </p>
          </div>
        </div>

        {progressBar}

        {/* Carte mot */}
        <div style={{
          background: "linear-gradient(135deg, #DBEAFE 0%, #E0E7FF 100%)",
          border: "2px solid #93C5FD",
          borderRadius: 24, padding: "48px 24px", textAlign: "center", marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            fontSize: Math.min(48, 300 / Math.max(motCourant.mot.length, 1)),
            fontWeight: 800, color: "#1E3A5F", letterSpacing: "0.02em",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {motCourant.mot}
          </div>
        </div>

        {/* Barre de décompte */}
        <div style={{
          height: 8, background: "#E5E7EB", borderRadius: 999,
          overflow: "hidden", marginBottom: 12,
        }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: pctTimer > 30 ? "#22C55E" : pctTimer > 10 ? "#F59E0B" : "#EF4444",
            width: `${pctTimer}%`,
            transition: "width 0.05s linear, background 0.3s",
          }} />
        </div>
        <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          <span className="ms" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}>timer</span>
          {Math.ceil(tempsRestant)}s
        </div>

        {essaisCourant > 0 && (
          <div style={{
            marginTop: 16, textAlign: "center", fontSize: 13, color: "#D97706",
            fontWeight: 600, fontStyle: "italic",
          }}>
            Regarde bien cette fois !
          </div>
        )}
      </div>
    );
  }

  // ── Phase SAISIE : le mot a disparu, l'élève tape ──
  if (phase === "saisie") {
    return (
      <div style={{ padding: "4px 0" }}>
        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span className="ms" style={{ fontSize: 22, color: "#D97706" }}>edit</span>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Écris le mot
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, marginTop: 2 }}>
              Tape le mot que tu viens de voir
            </p>
          </div>
        </div>

        {progressBar}

        {/* Zone de saisie stylisée */}
        <div style={{
          background: "#FFF", border: "2px solid #93C5FD",
          borderRadius: 24, padding: "32px 24px", textAlign: "center", marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, marginBottom: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Quel était le mot ?
          </div>
          <form onSubmit={(e) => { e.preventDefault(); valider(); }}>
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
                border: "2px solid var(--border, #E5E7EB)", fontSize: 22, fontWeight: 700,
                textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif",
                outline: "none",
              }}
              onFocus={(e) => e.target.style.borderColor = "#3B82F6"}
              onBlur={(e) => e.target.style.borderColor = "var(--border, #E5E7EB)"}
            />
            <button
              type="submit"
              disabled={!saisie.trim()}
              style={{
                width: "100%", padding: "14px", borderRadius: 12, marginTop: 12,
                background: saisie.trim() ? "#3B82F6" : "var(--border, #E5E7EB)",
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
        </div>
      </div>
    );
  }

  // ── Phase CORRECT ──
  if (phase === "correct") {
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span className="ms" style={{ fontSize: 22, color: "#16A34A" }}>emoji_events</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Bravo !
          </h2>
        </div>

        {progressBar}

        <div style={{
          background: "#F0FDF4", border: "2px solid #BBF7D0",
          borderRadius: 24, padding: "40px 24px", textAlign: "center", marginBottom: 20,
        }}>
          <span className="ms" style={{ fontSize: 56, color: "#16A34A", display: "block", marginBottom: 12 }}>check_circle</span>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#16A34A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {motCourant.mot}
          </div>
          {essaisCourant === 1 && (
            <div style={{ fontSize: 14, color: "#16A34A", marginTop: 8, fontWeight: 600 }}>
              Du premier coup !
            </div>
          )}
          {essaisCourant > 1 && (
            <div style={{ fontSize: 14, color: "#D97706", marginTop: 8, fontWeight: 600 }}>
              Réussi en {essaisCourant} essais
            </div>
          )}
        </div>

        <button
          onClick={motSuivant}
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
      </div>
    );
  }

  // ── Phase INCORRECT ──
  if (phase === "incorrect") {
    return (
      <div style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span className="ms" style={{ fontSize: 22, color: "#DC2626" }}>close</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Pas tout à fait...
          </h2>
        </div>

        {progressBar}

        <div style={{
          background: "#FEF2F2", border: "2px solid #FECACA",
          borderRadius: 24, padding: "32px 24px", textAlign: "center", marginBottom: 20,
        }}>
          <span className="ms" style={{ fontSize: 48, color: "#DC2626", display: "block", marginBottom: 12 }}>cancel</span>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#DC2626", textDecoration: "line-through" }}>
              {saisie}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Le mot va réapparaître, observe-le bien !
          </div>
        </div>

        <button
          onClick={rejouerMot}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: "#3B82F6", color: "white",
            border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span className="ms" style={{ fontSize: 20 }}>refresh</span>
          Revoir le mot
        </button>
      </div>
    );
  }

  return null;
}
