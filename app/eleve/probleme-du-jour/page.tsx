"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

type State = "loading" | "no_school" | "idle" | "correct" | "incorrect" | "exhausted";

interface Problem {
  id: string;
  enonce: string;
  categorie: string;
  periode: string;
  semaine: string;
  niveau: string;
}

interface SavedState {
  solved: boolean;
  attempts: number;
  hintsUsed: number;
  problemId: string;
  state: State;
}

// Descriptions courtes par catégorie de problème
const CATEGORIE_DESC: Record<string, string> = {
  T:    "Problème de transformation (ajout ou retrait)",
  "T+": "Problème de transformation — ajout",
  "T-": "Problème de transformation — retrait",
  P:    "Problème de partie-tout",
  C:    "Problème de comparaison",
  "C+": "Problème de comparaison (recherche du plus grand)",
  "C-": "Problème de comparaison (recherche du plus petit)",
  Cx:   "Problème de comparaison multiplicative",
  "Cx-":"Problème de comparaison multiplicative",
  MR:   "Problème de multiplication / recherche",
  Pro:  "Problème de proportionnalité",
  "Pro+":"Problème de proportionnalité avancé",
  TT:   "Problème à transformation en deux temps",
  "TT+":"Problème à transformation en deux temps",
  "TR":  "Problème de transformation avec reste",
  "TR+": "Problème de transformation avec reste avancé",
  "TR-": "Problème de transformation avec reste (retrait)",
};

function getStorageKey(userId: string | number): string {
  const today = new Date().toISOString().split("T")[0];
  return `dpd_${userId}_${today}`;
}

function loadSavedState(userId: string | number): SavedState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLocalState(userId: string | number, state: SavedState) {
  try { localStorage.setItem(getStorageKey(userId), JSON.stringify(state)); } catch {}
}

export default function ProblemeJourPage() {
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [state, setState] = useState<State>("loading");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    const saved = loadSavedState(session.id);

    // Toujours charger le problème pour l'afficher
    fetch("/api/daily-problem")
      .then(r => r.json())
      .then(data => {
        if (data.noSchool || data.error) { setState("no_school"); return; }
        setProblem(data);

        // Priorité 1 : si le serveur dit que c'est résolu (validation enseignant)
        if (data.serverAttempt?.solved) {
          setState("correct");
          setAttempts(data.serverAttempt.attempts ?? saved?.attempts ?? 0);
          setHintsUsed(data.serverAttempt.hintsUsed ?? saved?.hintsUsed ?? 0);
          // Synchroniser le localStorage
          saveLocalState(session!.id, {
            solved: true,
            attempts: data.serverAttempt.attempts ?? saved?.attempts ?? 0,
            hintsUsed: data.serverAttempt.hintsUsed ?? saved?.hintsUsed ?? 0,
            problemId: data.id,
            state: "correct",
          });
        } else if (saved?.solved) {
          setState("correct");
          setAttempts(saved.attempts);
          setHintsUsed(saved.hintsUsed);
        } else if (saved?.state === "exhausted") {
          setState("exhausted");
          setAttempts(saved.attempts);
          setHintsUsed(saved.hintsUsed);
        } else if (saved && saved.attempts > 0) {
          setState("incorrect");
          setAttempts(saved.attempts);
          setHintsUsed(saved.hintsUsed);
        } else {
          setState("idle");
        }
      })
      .catch(() => setState("no_school"));
  }, [chargementSession, session, router]);

  const recordAttempt = useCallback((solved: boolean, att: number, hints: number, studentAnswer?: string) => {
    if (!problem) return;
    fetch("/api/daily-problem/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_id: problem.id, solved, attempts: att, hints_used: hints, student_answer: studentAnswer ?? null }),
    }).catch(() => {});
  }, [problem]);

  async function handleValidate() {
    if (!problem || !session || !answer.trim()) return;
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    const res = await fetch("/api/daily-problem/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_id: problem.id, student_answer: answer, attempts: newAttempts }),
    });
    const data = await res.json();

    if (data.correct) {
      setState("correct");
      saveLocalState(session.id, { solved: true, attempts: newAttempts, hintsUsed, problemId: problem.id, state: "correct" });
      recordAttempt(true, newAttempts, hintsUsed, answer);
    } else if (data.correctAnswer !== undefined) {
      setState("exhausted");
      setCorrectAnswer(String(data.correctAnswer));
      saveLocalState(session.id, { solved: false, attempts: newAttempts, hintsUsed, problemId: problem.id, state: "exhausted" });
      recordAttempt(false, newAttempts, hintsUsed, answer);
      fetchHint(newAttempts);
    } else {
      setState("incorrect");
      saveLocalState(session.id, { solved: false, attempts: newAttempts, hintsUsed, problemId: problem.id, state: "incorrect" });
      recordAttempt(false, newAttempts, hintsUsed, answer);
    }
    setAnswer("");
  }

  async function fetchHint(att?: number) {
    if (!problem || !session) return;
    setHintLoading(true);
    const currentAttempts = att ?? attempts;
    try {
      const res = await fetch("/api/daily-problem/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enonce: problem.enonce, wrong_answer: answer || "?", categorie: problem.categorie, attempt: currentAttempts }),
      });
      const data = await res.json();
      setHint(data.hint);
      const newHints = hintsUsed + 1;
      setHintsUsed(newHints);
      saveLocalState(session.id, {
        solved: false, attempts: currentAttempts, hintsUsed: newHints, problemId: problem.id,
        state: currentAttempts >= 3 ? "exhausted" : "incorrect",
      });
    } catch {}
    setHintLoading(false);
  }

  // ── Écran de chargement ─────────────────────────────────────────────────────
  if (chargementSession || state === "loading") {
    return (
      <div className="eleve-page">
        <nav className="eleve-nav">
          <div className="eleve-nav-inner">
            <span className="eleve-nav-logo">Plan Box</span>
          </div>
        </nav>
        <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />
        </main>
      </div>
    );
  }

  if (state === "no_school" || !problem) {
    return (
      <div className="eleve-page">
        <nav className="eleve-nav">
          <div className="eleve-nav-inner">
            <span className="eleve-nav-logo">Plan Box</span>
          </div>
        </nav>
        <main style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", marginTop: "4rem" }}>Pas de problème du jour disponible.</p>
          <Link href="/eleve/dashboard" style={{ color: "var(--primary)", marginTop: 16, display: "inline-block" }}>
            ← Retour au tableau de bord
          </Link>
        </main>
      </div>
    );
  }

  const isDisabled = state === "correct" || state === "exhausted";
  const catDesc = CATEGORIE_DESC[problem.categorie] ?? `Type : ${problem.categorie}`;

  return (
    <div className="eleve-page" style={{ background: "var(--pb-background, #f8f5ff)" }}>
      {/* ── Top Nav ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px",
      }}>
        <Link
          href="/eleve/dashboard"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "var(--pb-primary)", fontWeight: 600, fontSize: 14,
            textDecoration: "none", padding: "6px 10px", borderRadius: 12,
            fontFamily: "Manrope, sans-serif",
          }}
        >
          <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
          Retour
        </Link>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pb-on-surface)" }}>
          Problème du jour
        </span>
        <div style={{ width: 60 }} />
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1.5rem 8rem", display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* ── Header centré ── */}
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "clamp(2rem, 6vw, 2.75rem)",
            fontWeight: 800, letterSpacing: -1, color: "var(--pb-on-surface)", marginBottom: 8,
          }}>
            Problème du jour
            <span className="ms" style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)", marginLeft: 10, verticalAlign: "middle", color: "var(--pb-primary)" }}>calculate</span>
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", fontWeight: 500, letterSpacing: "0.02em", fontSize: 14 }}>
            Améliore tes compétences mathématiques quotidiennes
          </p>
        </header>

        {/* ── Info card (période / type) ── */}
        <div style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", background: "var(--pb-surface-container-low, #f1efff)",
          borderRadius: 14, marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "rgba(0,80,212,0.1)", padding: 8, borderRadius: 10, display: "flex" }}>
              <span className="ms" style={{ fontSize: 20, color: "var(--pb-primary)" }}>calendar_today</span>
            </div>
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--pb-on-surface-variant)" }}>
              Période {problem.periode?.replace("P", "")} · Semaine {problem.semaine?.replace("S", "")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--pb-on-surface-variant)", opacity: 0.6 }}>
              Type :
            </span>
            <span style={{
              background: "rgba(112,42,225,0.1)", color: "var(--pb-secondary, #702ae1)",
              padding: "4px 12px", borderRadius: 999, fontSize: 13,
              fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              {problem.categorie}
            </span>
          </div>
        </div>

        {/* ── Carte énoncé ── */}
        <div style={{
          width: "100%", position: "relative", overflow: "hidden",
          background: state === "correct" ? "#f0fdf4" : state === "exhausted" ? "#fef2f2" : "white",
          borderRadius: 16, padding: "2rem 2.25rem",
          boxShadow: "0 10px 30px rgba(40,43,81,0.06)",
          marginBottom: 24, transition: "background 0.3s",
        }}>
          {/* Barre latérale colorée */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
            borderRadius: "0 4px 4px 0",
            background: state === "correct" ? "#22c55e" : state === "exhausted" ? "#ef4444" : "var(--pb-primary)",
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span className="ms" style={{ fontSize: 20, color: "var(--pb-primary)" }}>quiz</span>
            <span style={{
              fontSize: 12, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--pb-primary)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Énoncé
            </span>
          </div>

          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(1.25rem, 4vw, 1.625rem)", fontWeight: 700,
            lineHeight: 1.4, color: "var(--pb-on-surface)",
          }}>
            {problem.enonce}
          </p>
        </div>

        {/* ── Message résultat ── */}
        {state === "correct" && (
          <div style={{
            width: "100%", textAlign: "center", padding: "16px",
            background: "#f0fdf4", borderRadius: 14, marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            <span className="ms" style={{ fontSize: 28, color: "#16A34A" }}>check_circle</span>
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: "#16A34A" }}>
              Bravo, bonne réponse !
            </span>
          </div>
        )}
        {state === "incorrect" && (
          <div style={{
            width: "100%", textAlign: "center", padding: "12px 16px",
            background: "rgba(239,68,68,0.06)", borderRadius: 14, marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span className="ms" style={{ fontSize: 20, color: "#ef4444" }}>close</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#ef4444" }}>
              Pas tout à fait... essaie encore !
            </span>
          </div>
        )}
        {state === "exhausted" && correctAnswer && (
          <div style={{
            width: "100%", textAlign: "center", padding: "12px 16px",
            background: "rgba(239,68,68,0.06)", borderRadius: 14, marginBottom: 16,
          }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#ef4444" }}>
              La réponse était : <strong>{correctAnswer}</strong>
            </span>
          </div>
        )}

        {/* ── Indice ── */}
        {hint && (
          <div style={{
            width: "100%", background: "#FFF7ED", border: "1px solid #FED7AA",
            borderRadius: 14, padding: "16px 20px", marginBottom: 16,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span className="ms" style={{ fontSize: 22, color: "#F59E0B", flexShrink: 0, marginTop: 2 }}>lightbulb</span>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#92400E", margin: 0 }}>{hint}</p>
          </div>
        )}

        {/* ── Zone de saisie ── */}
        {!isDisabled && (
          <div style={{
            width: "100%", background: "var(--pb-surface-container, #e7e6ff)",
            borderRadius: 16, padding: "2rem", display: "flex", flexDirection: "column", gap: 16,
          }}>
            <label
              htmlFor="answer-input"
              style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant)", marginLeft: 4 }}
            >
              Ta réponse
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="answer-input"
                type="text"
                inputMode="decimal"
                placeholder="Écris un nombre (ex : 120)"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleValidate(); }}
                autoFocus
                style={{
                  width: "100%", padding: "18px 52px 18px 20px",
                  background: "var(--pb-surface-container-high, #e0e0ff)",
                  border: "none", borderRadius: 14,
                  fontSize: 18, fontWeight: 700,
                  color: "var(--pb-on-surface)", outline: "none",
                  fontFamily: "Manrope, sans-serif",
                  transition: "box-shadow 0.2s",
                }}
                onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--pb-primary)"; }}
                onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}
              />
              <span className="ms" style={{
                position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                fontSize: 22, color: "var(--pb-outline-variant)", pointerEvents: "none",
              }}>
                calculate
              </span>
            </div>

            <button
              onClick={handleValidate}
              disabled={!answer.trim()}
              style={{
                width: "100%", padding: "18px",
                background: "var(--pb-primary)", color: "white",
                border: "none", borderRadius: 999,
                fontSize: 17, fontWeight: 700, cursor: answer.trim() ? "pointer" : "default",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                opacity: answer.trim() ? 1 : 0.5,
                boxShadow: answer.trim() ? "0 4px 16px rgba(0,80,212,0.2)" : "none",
                transition: "all 0.2s",
              }}
            >
              Valider
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--pb-on-surface-variant)", opacity: 0.7, fontWeight: 500 }}>
              Réponds avec un nombre, sans unité
            </p>
          </div>
        )}

        {/* ── Bouton indice ── */}
        {state === "incorrect" && !hint && (
          <button
            onClick={() => fetchHint()}
            disabled={hintLoading}
            style={{
              width: "100%", marginTop: 8,
              fontSize: 14, color: "var(--pb-primary)", fontWeight: 700,
              background: "rgba(0,80,212,0.06)",
              border: "1.5px solid rgba(0,80,212,0.15)",
              borderRadius: 14, padding: "14px",
              cursor: hintLoading ? "wait" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>lightbulb</span>
            {hintLoading ? "Chargement..." : "Besoin d\u2019un indice ?"}
          </button>
        )}

        {/* ── Retour ── */}
        {isDisabled && (
          <Link
            href="/eleve/dashboard"
            style={{
              width: "100%", marginTop: 8,
              padding: "16px", fontSize: 16, borderRadius: 999,
              textAlign: "center", textDecoration: "none",
              background: "var(--pb-primary)", color: "white",
              fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(0,80,212,0.2)",
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>home</span>
            Retour au tableau de bord
          </Link>
        )}
      </main>
    </div>
  );
}
