"use client";

import { useState, useEffect, useRef } from "react";
import { MotDict } from "@/types";
import { normalise } from "@/lib/dictee-utils";

interface Props {
  mots: MotDict[];
  onTermine: (score: number, total: number) => void;
}

type PhasesMot = "affichage" | "saisie" | "correction";

export default function MotsPlayer({ mots, onTermine }: Props) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<PhasesMot>("affichage");
  const [saisie, setSaisie] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [termine, setTermine] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const motActuel = mots[idx];

  // Démarrer le timer de 5s quand on affiche un mot
  useEffect(() => {
    if (phase !== "affichage") return;
    timerRef.current = setTimeout(() => {
      setPhase("saisie");
    }, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, idx]);

  // Focaliser l'input quand on passe en phase saisie
  useEffect(() => {
    if (phase === "saisie") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase]);

  function valider() {
    const estCorrect = normalise(saisie.trim()) === normalise(motActuel.mot);
    setCorrect(estCorrect);
    if (estCorrect) setScore((s) => s + 1);
    setPhase("correction");
  }

  function motSuivant() {
    if (idx < mots.length - 1) {
      setIdx((i) => i + 1);
      setPhase("affichage");
      setSaisie("");
      setCorrect(null);
    } else {
      setTermine(true);
      const scoreF = correct ? score + 1 : score; // score déjà incrémenté si correct
      // Note: score est déjà correct ici, correct a déjà été compté dans valider()
      onTermine(score + (correct ? 0 : 0), mots.length); // score déjà mis à jour
    }
  }

  // Correction : onTermine avec le bon score
  function finir() {
    setTermine(true);
    onTermine(score, mots.length);
  }

  function recommencer() {
    setIdx(0);
    setPhase("affichage");
    setSaisie("");
    setCorrect(null);
    setScore(0);
    setTermine(false);
  }

  if (termine) {
    const pct = Math.round((score / mots.length) * 100);
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{pct >= 80 ? "🌟" : "💪"}</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          {score} / {mots.length} mots réussis
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          {pct >= 80 ? "Excellent travail ! Tu maîtrises bien ces mots." : "Continue de t'entraîner, tu progresses !"}
        </p>
        <button className="btn-ghost" onClick={recommencer} style={{ fontSize: 14 }}>
          🔁 Recommencer
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Compteur */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 13, color: "var(--text-secondary)" }}>
        <span>Mot <strong>{idx + 1}</strong> / {mots.length}</span>
        <span>Score : <strong>{score}</strong></span>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 24, overflow: "hidden" }}>
        <div style={{
          height: "100%", background: "var(--primary)", borderRadius: 2,
          width: `${(idx / mots.length) * 100}%`, transition: "width 0.3s ease",
        }} />
      </div>

      {/* Phase affichage : mot visible 5s avec barre de compte à rebours */}
      {phase === "affichage" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mémorise ce mot !
          </p>

          {/* Barre de compte à rebours CSS */}
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
            <div
              style={{
                height: "100%", background: "var(--primary)", borderRadius: 3,
                animation: "countdown 5s linear forwards",
              }}
            />
          </div>
          <style>{`@keyframes countdown { from { width: 100%; } to { width: 0%; } }`}</style>

          <div style={{
            fontSize: 42, fontWeight: 800, color: "var(--text)",
            background: "var(--primary-pale)", borderRadius: 16, padding: "32px 48px",
            display: "inline-block", marginBottom: 12, letterSpacing: 2,
          }}>
            {motActuel.mot}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {motActuel.definition}
          </p>
        </div>
      )}

      {/* Phase saisie : input */}
      {phase === "saisie" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>
            Définition : <em>{motActuel.definition}</em>
          </p>
          <p style={{ fontWeight: 600, marginBottom: 16 }}>Comment s&apos;écrit ce mot ?</p>

          <input
            ref={inputRef}
            className="form-input"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && saisie.trim()) valider(); }}
            placeholder="Écris le mot ici…"
            style={{ fontSize: 20, textAlign: "center", letterSpacing: 2, maxWidth: 320, margin: "0 auto 16px", display: "block" }}
          />
          <button
            className="btn-primary"
            onClick={valider}
            disabled={!saisie.trim()}
            style={{ fontSize: 14 }}
          >
            Valider ✓
          </button>
        </div>
      )}

      {/* Phase correction */}
      {phase === "correction" && (
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 28, fontWeight: 800, marginBottom: 8,
            color: correct ? "var(--success)" : "var(--error)",
          }}>
            {correct ? "✅ Correct !" : "❌ Incorrect"}
          </div>

          {!correct && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                Tu as écrit : <strong style={{ color: "var(--error)" }}>{saisie || "(vide)"}</strong>
              </p>
              <p style={{ fontSize: 14 }}>
                La bonne orthographe : <strong style={{ color: "var(--success)", fontSize: 20, letterSpacing: 1 }}>{motActuel.mot}</strong>
              </p>
            </div>
          )}

          {correct && (
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, marginBottom: 16, color: "var(--success)" }}>
              {motActuel.mot}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={idx < mots.length - 1 ? motSuivant : finir}
            style={{ fontSize: 14 }}
          >
            {idx < mots.length - 1 ? "Mot suivant →" : "Voir mon score"}
          </button>
        </div>
      )}
    </div>
  );
}
