"use client";

import { useState } from "react";
import { FonctionGram, FONCTIONS_COULEURS } from "@/types";

interface Groupe {
  mots: string;
  fonction: FonctionGram;
  debut: number;
  fin: number;
}

interface Phrase {
  texte: string;
  groupes: Groupe[];
}

interface Props {
  titre: string;
  consigne: string;
  phrases: Phrase[];
  fonctionsActives: FonctionGram[];
  onTermine: (score: { bon: number; total: number }, reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[]) => void;
}

// Ordre progressif de recherche
const ORDRE_PROGRESSIF: FonctionGram[] = [
  "Verbe", "Sujet", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière", "Attribut",
];

function getEtapeLabel(f: FonctionGram): string {
  switch (f) {
    case "Verbe": return "Trouve le verbe conjugué";
    case "Sujet": return "Trouve le sujet";
    case "COD": return "Trouve le COD (complément d'objet direct)";
    case "COI": return "Trouve le COI (complément d'objet indirect)";
    case "CC Lieu": return "Trouve le complément circonstanciel de lieu";
    case "CC Temps": return "Trouve le complément circonstanciel de temps";
    case "CC Manière": return "Trouve le complément circonstanciel de manière";
    case "Attribut": return "Trouve l'attribut du sujet";
    default: return `Trouve ${f}`;
  }
}

export default function AnalysePhraseEleve({ titre, consigne, phrases, fonctionsActives, onTermine }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [etapeIdx, setEtapeIdx] = useState(0);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [reponses, setReponses] = useState<Record<number, Record<string, { debut: number; fin: number; correct: boolean | null }>>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"correct" | "incorrect" | null>(null);
  const [termine, setTermine] = useState(false);
  const [scoreTotal, setScoreTotal] = useState({ bon: 0, total: 0 });

  const phrase = phrases[phraseIdx];
  if (!phrase) return null;

  const mots = phrase.texte.split(/\s+/);

  // Fonctions à trouver dans cette phrase, filtrées par fonctionsActives
  const fonctionsDansPhrase = ORDRE_PROGRESSIF.filter(
    (f) => fonctionsActives.includes(f) && phrase.groupes.some((g) => g.fonction === f)
  );

  const etapeCourante = fonctionsDansPhrase[etapeIdx];
  const groupeAttendu = etapeCourante ? phrase.groupes.find((g) => g.fonction === etapeCourante) : null;

  // Groupes déjà trouvés pour cette phrase
  const reponsesPhrase = reponses[phraseIdx] ?? {};

  function toggleMot(index: number) {
    if (!etapeCourante || feedback) return;
    // Vérifier que le mot n'est pas déjà assigné
    for (const key of Object.keys(reponsesPhrase)) {
      const r = reponsesPhrase[key];
      if (r.correct && index >= r.debut && index <= r.fin) return;
    }
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function validerSelection() {
    if (!groupeAttendu || selection.size === 0) return;

    const selectionArr = Array.from(selection).sort((a, b) => a - b);
    const debut = selectionArr[0];
    const fin = selectionArr[selectionArr.length - 1];

    // Vérifier que la sélection est contiguë
    const estContigue = selectionArr.every((v, i) => i === 0 || v === selectionArr[i - 1] + 1);
    if (!estContigue) {
      setFeedback("Sélectionne des mots qui se suivent !");
      setFeedbackType("incorrect");
      setTimeout(() => { setFeedback(null); setFeedbackType(null); }, 2000);
      return;
    }

    const correct = debut === groupeAttendu.debut && fin === groupeAttendu.fin;

    setReponses((prev) => ({
      ...prev,
      [phraseIdx]: {
        ...(prev[phraseIdx] ?? {}),
        [etapeCourante!]: { debut, fin, correct },
      },
    }));

    if (correct) {
      setFeedback("Bravo !");
      setFeedbackType("correct");
      setScoreTotal((prev) => ({ ...prev, bon: prev.bon + 1, total: prev.total + 1 }));

      setTimeout(() => {
        setFeedback(null);
        setFeedbackType(null);
        setSelection(new Set());

        if (etapeIdx + 1 < fonctionsDansPhrase.length) {
          setEtapeIdx(etapeIdx + 1);
        } else {
          // Phrase terminée → passer à la suivante
          if (phraseIdx + 1 < phrases.length) {
            setPhraseIdx(phraseIdx + 1);
            setEtapeIdx(0);
          } else {
            // Tout terminé
            const finalScore = { bon: scoreTotal.bon + 1, total: scoreTotal.total + 1 };
            setScoreTotal(finalScore);
            setTermine(true);
            // Construire le résumé des réponses
            const repEleve = phrases.flatMap((ph, pi) => {
              const rph = reponses[pi] ?? {};
              return Object.entries(rph).map(([fn, r], qi) => ({
                id: pi * 10 + qi + 1,
                reponse: `${fn} : ${ph.texte.split(/\s+/).slice(r.debut, r.fin + 1).join(" ")}`,
                correcte: r.correct,
              }));
            });
            onTermine(finalScore, repEleve);
          }
        }
      }, 1200);
    } else {
      setFeedback(`Ce n'est pas le bon groupe. Réessaie !`);
      setFeedbackType("incorrect");
      setScoreTotal((prev) => ({ ...prev, total: prev.total + 1 }));

      setTimeout(() => {
        setFeedback(null);
        setFeedbackType(null);
        setSelection(new Set());
        // Retirer la mauvaise réponse
        setReponses((prev) => {
          const copy = { ...prev };
          if (copy[phraseIdx]) {
            delete copy[phraseIdx][etapeCourante!];
          }
          return copy;
        });
      }, 2000);
    }
  }

  function getFonctionMot(index: number): { fonction: FonctionGram; couleur: string } | null {
    for (const [fn, r] of Object.entries(reponsesPhrase)) {
      if (r.correct && index >= r.debut && index <= r.fin) {
        return { fonction: fn as FonctionGram, couleur: FONCTIONS_COULEURS[fn as FonctionGram] };
      }
    }
    return null;
  }

  if (termine) {
    const pct = scoreTotal.total > 0 ? Math.round((scoreTotal.bon / scoreTotal.total) * 100) : 0;
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: pct >= 80 ? "#16A34A" : "#D97706" }}>
          {pct >= 80 ? "emoji_events" : "sentiment_neutral"}
        </span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 12 }}>
          Analyse terminée !
        </h2>
        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: pct >= 80 ? "#16A34A" : "#D97706", marginTop: 8 }}>
          Score : {scoreTotal.bon} / {scoreTotal.total} ({pct}%)
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Progression */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          Phrase {phraseIdx + 1} / {phrases.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {phrases.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < phraseIdx ? "#16A34A" : i === phraseIdx ? "var(--primary)" : "var(--border)",
            }} />
          ))}
        </div>
      </div>

      {/* Instruction */}
      {etapeCourante && (
        <div style={{
          background: `${FONCTIONS_COULEURS[etapeCourante]}10`,
          border: `1.5px solid ${FONCTIONS_COULEURS[etapeCourante]}30`,
          borderRadius: 14, padding: "0.875rem 1.25rem", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span className="ms" style={{ fontSize: 22, color: FONCTIONS_COULEURS[etapeCourante] }}>
            {etapeCourante === "Verbe" ? "menu_book" : etapeCourante === "Sujet" ? "person" : "arrow_forward"}
          </span>
          <div>
            <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: FONCTIONS_COULEURS[etapeCourante], margin: 0 }}>
              {getEtapeLabel(etapeCourante)}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>
              Clique sur les mots qui forment ce groupe
            </p>
          </div>
        </div>
      )}

      {/* Phrase avec mots cliquables */}
      <div style={{
        background: "white", borderRadius: 16, padding: "1.5rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        lineHeight: 2.8, fontSize: "1.25rem",
      }}>
        {mots.map((mot, i) => {
          const trouve = getFonctionMot(i);
          const selected = selection.has(i);
          const estAssigne = !!trouve;

          return (
            <span
              key={i}
              onClick={() => toggleMot(i)}
              style={{
                display: "inline-block",
                padding: "4px 6px",
                margin: "2px 1px",
                borderRadius: 8,
                cursor: estAssigne ? "default" : "pointer",
                fontWeight: trouve || selected ? 700 : 400,
                background: trouve
                  ? `${trouve.couleur}18`
                  : selected
                    ? `${etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "#888"}25`
                    : "transparent",
                color: trouve ? trouve.couleur : "var(--text)",
                border: selected && !trouve
                  ? `2px solid ${etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "#888"}`
                  : trouve
                    ? `2px solid ${trouve.couleur}40`
                    : "2px solid transparent",
                transition: "all 0.15s",
                userSelect: "none",
                position: "relative",
              }}
            >
              {mot}
              {/* Badge fonction sous le premier mot du groupe */}
              {trouve && i === parseInt(Object.entries(reponsesPhrase).find(([fn, r]) => r.correct && r.debut === i)?.[1]?.debut?.toString() ?? "-1") && (
                <span style={{
                  position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
                  fontSize: "0.5625rem", fontWeight: 800, color: trouve.couleur,
                  whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {trouve.fonction}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Légende des fonctions trouvées */}
      {Object.keys(reponsesPhrase).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {Object.entries(reponsesPhrase).filter(([, r]) => r.correct).map(([fn]) => (
            <span key={fn} style={{
              fontSize: "0.6875rem", fontWeight: 700, padding: "3px 10px",
              borderRadius: 999, background: `${FONCTIONS_COULEURS[fn as FonctionGram]}15`,
              color: FONCTIONS_COULEURS[fn as FonctionGram],
              border: `1px solid ${FONCTIONS_COULEURS[fn as FonctionGram]}30`,
            }}>
              {fn}
            </span>
          ))}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginTop: 16, padding: "0.75rem 1rem", borderRadius: 12, textAlign: "center",
          fontWeight: 700, fontSize: "0.9375rem",
          background: feedbackType === "correct" ? "#DCFCE7" : "#FEE2E2",
          color: feedbackType === "correct" ? "#16A34A" : "#DC2626",
          border: feedbackType === "correct" ? "1px solid #BBF7D0" : "1px solid #FECACA",
        }}>
          {feedbackType === "correct" ? "🎉 " : ""}{feedback}
        </div>
      )}

      {/* Bouton valider */}
      {selection.size > 0 && !feedback && (
        <button
          onClick={validerSelection}
          style={{
            marginTop: 16, width: "100%", padding: "0.875rem",
            borderRadius: 999, border: "none",
            background: etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "var(--primary)",
            color: "white", fontWeight: 700, fontSize: "1rem",
            cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Valider ma sélection
        </button>
      )}
    </div>
  );
}
