"use client";

import { useState, useEffect, useRef } from "react";
import { genererCarteCalcul, TemplateCalcul } from "@/lib/calcul";

interface Calcul {
  id: number;
  enonce: string;
  reponse: string;
}

interface CalcMentalStackProps {
  // Format classique (calculs fixes)
  calculs?: Calcul[];
  // Nouveau format (modèles aléatoires)
  modeles?: TemplateCalcul[];
  nbCalculs?: number;
  onComplete?: (score: number, total: number, reponsesEleve?: { id: number; reponse: string; correcte: boolean | null }[]) => void;
  readOnly?: boolean; // aperçu enseignant : affiche toutes les cartes statiques
}

/** Génère des calculs frais à partir de modèles de templates */
function genererDepuisModeles(modeles: TemplateCalcul[], nb: number): Calcul[] {
  return Array.from({ length: nb }, (_, i) => {
    const tmpl = modeles[i % modeles.length];
    const carte = genererCarteCalcul(tmpl);
    return { id: i + 1, enonce: carte.recto, reponse: carte.bonneReponse };
  });
}

export default function CalcMentalStack({
  calculs,
  modeles,
  nbCalculs,
  onComplete,
  readOnly = false,
}: CalcMentalStackProps) {
  // Calculs effectifs : générés une seule fois depuis les modèles, ou fixés
  const [calculsSession] = useState<Calcul[]>(() => {
    if (modeles && modeles.length > 0 && nbCalculs && nbCalculs > 0) {
      return genererDepuisModeles(modeles, nbCalculs);
    }
    return calculs ?? [];
  });

  const [index, setIndex] = useState(0);
  const [reponse, setReponse] = useState("");
  const [score, setScore] = useState(0);
  const [termine, setTermine] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [reponsesLog, setReponsesLog] = useState<{ id: number; reponse: string; correcte: boolean }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!readOnly && !termine) inputRef.current?.focus();
  }, [index, readOnly, termine]);

  function valider() {
    if (!reponse.trim()) return;
    const correct =
      reponse.trim().toLowerCase() ===
      calculsSession[index].reponse.trim().toLowerCase();
    setFeedback(correct ? "correct" : "incorrect");
    if (correct) setScore((s) => s + 1);
    const newLog = [...reponsesLog, { id: calculsSession[index].id, reponse: reponse.trim(), correcte: correct }];
    setReponsesLog(newLog);

    setTimeout(() => {
      setFeedback(null);
      setReponse("");
      if (index + 1 >= calculsSession.length) {
        setTermine(true);
        onComplete?.(correct ? score + 1 : score, calculsSession.length, newLog);
      } else {
        setIndex((i) => i + 1);
      }
    }, 800);
  }

  // Aperçu statique enseignant
  if (readOnly) {
    const apercu = calculsSession.slice(0, 8); // max 8 exemples en aperçu
    return (
      <div style={{ padding: "8px 0" }}>
        {modeles && modeles.length > 0 && (
          <div
            style={{
              padding: "8px 14px",
              marginBottom: 12,
              background: "#EDE9FE",
              borderRadius: 8,
              fontSize: 13,
              color: "#5B21B6",
              fontWeight: 600,
            }}
          >
            🎲 Calculs aléatoires — {nbCalculs} calculs générés à chaque session
          </div>
        )}
        {apercu.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              marginBottom: 8,
              background: "var(--primary-pale)",
              border: "1.5px solid var(--primary-mid)",
              borderRadius: 10,
              fontFamily: "monospace",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 16, color: "var(--primary)" }}>
              {i + 1}. {c.enonce}
            </span>
            <span
              style={{
                fontSize: 14,
                color: "var(--success)",
                fontWeight: 700,
                background: "#D1FAE5",
                padding: "2px 10px",
                borderRadius: 6,
              }}
            >
              {c.reponse}
            </span>
          </div>
        ))}
        {modeles && calculsSession.length > 8 && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", marginTop: 4 }}>
            … et {calculsSession.length - 8} autres calculs aléatoires
          </p>
        )}
      </div>
    );
  }

  // Garde : pas de calculs
  if (calculsSession.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
        Aucun calcul disponible.
      </div>
    );
  }

  // Écran de fin
  if (termine) {
    const pct = Math.round((score / calculsSession.length) * 100);
    return (
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>
          {pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪"}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)", marginBottom: 8 }}>
          {score} / {calculsSession.length}
        </div>
        <div style={{ fontSize: 16, color: "var(--text-secondary)" }}>
          {pct >= 80
            ? "Excellent travail !"
            : pct >= 50
            ? "Bien joué, continue !"
            : "Continue de t'entraîner !"}
        </div>
      </div>
    );
  }

  const carteEnCours = calculsSession[index];

  return (
    <div style={{ userSelect: "none" }}>
      {/* Compteur */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span className="text-secondary text-sm">
          Calcul {index + 1} sur {calculsSession.length}
        </span>
        <span
          className="badge badge-primary"
          style={{ fontSize: 13 }}
        >
          ✓ {score} réussi{score > 1 ? "s" : ""}
        </span>
      </div>

      {/* Cartes empilées */}
      <div
        style={{
          position: "relative",
          height: 160,
          marginBottom: 24,
        }}
      >
        {/* Carte 3 (fond) */}
        {index + 2 < calculsSession.length && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--primary-pale)",
              border: "1.5px solid var(--primary-mid)",
              borderRadius: 12,
              transform: "rotate(-2deg) translateY(6px)",
              opacity: 0.3,
            }}
          />
        )}
        {/* Carte 2 */}
        {index + 1 < calculsSession.length && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--primary-pale)",
              border: "1.5px solid var(--primary-mid)",
              borderRadius: 12,
              transform: "rotate(1deg) translateY(3px)",
              opacity: 0.6,
            }}
          />
        )}
        {/* Carte principale */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              feedback === "correct"
                ? "#D1FAE5"
                : feedback === "incorrect"
                ? "#FEE2E2"
                : "var(--primary-pale)",
            border: `1.5px solid ${
              feedback === "correct"
                ? "var(--success)"
                : feedback === "incorrect"
                ? "var(--error)"
                : "var(--primary-mid)"
            }`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.3s ease, border-color 0.3s ease",
          }}
        >
          {feedback === "correct" && (
            <span style={{ fontSize: 48 }}>✓</span>
          )}
          {feedback === "incorrect" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, color: "var(--error)" }}>✗</div>
              <div style={{ fontSize: 14, color: "var(--error)", marginTop: 4 }}>
                Réponse : {carteEnCours.reponse}
              </div>
            </div>
          )}
          {!feedback && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 28,
                fontWeight: 600,
                color: "var(--primary)",
              }}
            >
              {carteEnCours.enonce}
            </span>
          )}
        </div>
      </div>

      {/* Saisie */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="form-input"
          value={reponse}
          onChange={(e) => setReponse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valider()}
          placeholder="Ta réponse…"
          disabled={!!feedback}
          style={{ fontSize: 18, textAlign: "center", flex: 1 }}
        />
        <button
          className="btn-primary"
          onClick={valider}
          disabled={!!feedback || !reponse.trim()}
          style={{ minWidth: 80 }}
        >
          ↵ OK
        </button>
      </div>
    </div>
  );
}
