"use client";

import { useState } from "react";
import { ProblemeMaths } from "@/types";

interface Props {
  titre: string;
  theme: string;
  consigne: string;
  problemes: ProblemeMaths[];
  onTermine: (
    score: { bon: number; total: number },
    reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[]
  ) => void;
}

function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?«»""''()]/g, "")
    .trim();
}

function normaliserResultat(s: string): string {
  return normaliser(s)
    .replace(/\bheures?\b/g, "h")
    .replace(/\bminutes?\b/g, "min")
    .replace(/\bmin(?=\d| |$)/g, "min")
    .replace(/\beuros?\b/g, "eur")
    .replace(/€/g, "eur")
    .replace(/\bmetres?\b/g, "m")
    .replace(/\bcentimetres?\b/g, "cm")
    .replace(/\bkilos?\b|\bkilogrammes?\b/g, "kg")
    .replace(/\bgrammes?\b/g, "g")
    .replace(/\s+/g, " ")
    .trim();
}

function resultatCorrect(saisi: string, attendu: string): boolean {
  const a = normaliserResultat(saisi);
  const b = normaliserResultat(attendu);
  if (!a) return false;
  if (a === b) return true;
  // Comparer en retirant tous les espaces (ex: "2h35min" = "2 h 35 min")
  if (a.replace(/\s/g, "") === b.replace(/\s/g, "")) return true;
  return false;
}

function phraseCorrecte(saisie: string, motsCles: string[]): boolean {
  const n = normaliser(saisie);
  if (n.split(/\s+/).filter(Boolean).length < 3) return false; // au moins 3 mots
  return motsCles.every((mc) => {
    const mn = normaliser(mc);
    if (!mn) return true;
    // Match mot entier (évite "4" matchant "14")
    const re = new RegExp(`(^|\\s)${mn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
    return re.test(n);
  });
}

export default function ProblemeMathsEleve({ titre, theme, consigne, problemes, onTermine }: Props) {
  const [index, setIndex] = useState(0);
  const [resultat, setResultat] = useState("");
  const [phrase, setPhrase] = useState("");
  const [indiceVisible, setIndiceVisible] = useState(false);
  const [feedback, setFeedback] = useState<{ resultatOk: boolean; phraseOk: boolean; afficher: boolean }>({
    resultatOk: false, phraseOk: false, afficher: false,
  });
  const [reponses, setReponses] = useState<{ id: number; reponse: string; correcte: boolean | null }[]>([]);
  const [scoreTotal, setScoreTotal] = useState({ bon: 0, total: 0 });
  const [termine, setTermine] = useState(false);

  const problemeCourant = problemes[index];
  if (!problemeCourant) return null;

  const couleur = "#0F766E";

  function valider() {
    if (!problemeCourant) return;
    const rOk = resultatCorrect(resultat, problemeCourant.resultat_attendu);
    const pOk = phraseCorrecte(phrase, problemeCourant.mots_cles);
    setFeedback({ resultatOk: rOk, phraseOk: pOk, afficher: true });
  }

  function passerSuivant() {
    if (!problemeCourant) return;
    const rOk = feedback.resultatOk;
    const pOk = feedback.phraseOk;
    const globalOk = rOk && pOk;

    const nouvelleRep = {
      id: problemeCourant.id,
      reponse: `${resultat} — ${phrase}`,
      correcte: globalOk,
    };
    const nouvellesReponses = [...reponses, nouvelleRep];
    const nouveauScore = {
      bon: scoreTotal.bon + (globalOk ? 1 : 0),
      total: scoreTotal.total + 1,
    };
    setReponses(nouvellesReponses);
    setScoreTotal(nouveauScore);

    if (index + 1 < problemes.length) {
      setIndex(index + 1);
      setResultat("");
      setPhrase("");
      setIndiceVisible(false);
      setFeedback({ resultatOk: false, phraseOk: false, afficher: false });
    } else {
      setTermine(true);
      onTermine(nouveauScore, nouvellesReponses);
    }
  }

  if (termine) {
    const pct = scoreTotal.total > 0 ? Math.round((scoreTotal.bon / scoreTotal.total) * 100) : 0;
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: pct >= 80 ? "#16A34A" : "#D97706" }}>
          {pct >= 80 ? "emoji_events" : "sentiment_neutral"}
        </span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 12 }}>
          Problèmes terminés !
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
          Problème {index + 1} / {problemes.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {problemes.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < index ? "#16A34A" : i === index ? couleur : "var(--border)",
            }} />
          ))}
        </div>
      </div>

      {/* Titre + consigne */}
      {index === 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            {theme}
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            {consigne}
          </p>
        </div>
      )}

      {/* Énoncé */}
      <div style={{
        background: `${couleur}10`,
        border: `1.5px solid ${couleur}30`,
        borderRadius: 14,
        padding: "1rem 1.25rem",
        marginBottom: 16,
        fontSize: "1rem",
        lineHeight: 1.6,
        color: "var(--text)",
      }}>
        {problemeCourant.enonce}
      </div>

      {/* Bouton indice */}
      <div style={{ marginBottom: 16 }}>
        {!indiceVisible ? (
          <button
            type="button"
            onClick={() => setIndiceVisible(true)}
            style={{
              padding: "8px 14px", borderRadius: 999,
              border: `1.5px dashed ${couleur}`, background: "white",
              color: couleur, fontWeight: 700, fontSize: "0.8125rem",
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>lightbulb</span>
            Voir un indice
          </button>
        ) : (
          <div style={{
            background: "#FEF3C7", border: "1.5px solid #FCD34D",
            borderRadius: 12, padding: "10px 14px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span className="ms" style={{ fontSize: 18, color: "#B45309", flexShrink: 0, marginTop: 2 }}>lightbulb</span>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#78350F", lineHeight: 1.5 }}>
              {problemeCourant.indice}
            </p>
          </div>
        )}
      </div>

      {/* Champs de réponse */}
      <div className="form-group">
        <label className="form-label" style={{ fontSize: "0.8125rem" }}>Résultat</label>
        <input
          type="text"
          className="form-input"
          value={resultat}
          onChange={(e) => setResultat(e.target.value)}
          placeholder="Ex : 2 h 35 min"
          disabled={feedback.afficher}
          style={{
            borderColor: feedback.afficher ? (feedback.resultatOk ? "#16A34A" : "#DC2626") : undefined,
            background: feedback.afficher ? (feedback.resultatOk ? "#DCFCE7" : "#FEE2E2") : undefined,
          }}
        />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: "0.8125rem" }}>Phrase réponse</label>
        <textarea
          className="form-input"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="Écris une phrase complète pour répondre au problème."
          rows={2}
          disabled={feedback.afficher}
          style={{
            resize: "vertical",
            borderColor: feedback.afficher ? (feedback.phraseOk ? "#16A34A" : "#DC2626") : undefined,
            background: feedback.afficher ? (feedback.phraseOk ? "#DCFCE7" : "#FEE2E2") : undefined,
          }}
        />
      </div>

      {/* Feedback correction */}
      {feedback.afficher && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: feedback.resultatOk && feedback.phraseOk ? "#DCFCE7" : "#FEF3C7",
          border: `1.5px solid ${feedback.resultatOk && feedback.phraseOk ? "#86EFAC" : "#FCD34D"}`,
          marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: "0.875rem", color: feedback.resultatOk && feedback.phraseOk ? "#166534" : "#78350F" }}>
            {feedback.resultatOk && feedback.phraseOk ? "🎉 Bravo !" : "Presque !"}
          </p>
          {!feedback.resultatOk && (
            <p style={{ margin: "4px 0", fontSize: "0.8125rem", color: "#78350F" }}>
              Résultat attendu : <strong>{problemeCourant.resultat_attendu}</strong>
            </p>
          )}
          {!feedback.phraseOk && (
            <p style={{ margin: "4px 0", fontSize: "0.8125rem", color: "#78350F" }}>
              Exemple de phrase : <em>« {problemeCourant.phrase_reponse_attendue} »</em>
            </p>
          )}
        </div>
      )}

      {/* Boutons d'action */}
      {!feedback.afficher ? (
        <button
          onClick={valider}
          disabled={!resultat.trim() || !phrase.trim()}
          style={{
            width: "100%", padding: "0.875rem",
            borderRadius: 999, border: "none",
            background: !resultat.trim() || !phrase.trim() ? "var(--border)" : couleur,
            color: "white", fontWeight: 700, fontSize: "1rem",
            cursor: !resultat.trim() || !phrase.trim() ? "not-allowed" : "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Valider ma réponse
        </button>
      ) : (
        <button
          onClick={passerSuivant}
          style={{
            width: "100%", padding: "0.875rem",
            borderRadius: 999, border: "none",
            background: couleur, color: "white",
            fontWeight: 700, fontSize: "1rem", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {index + 1 < problemes.length ? "Problème suivant →" : "Terminer"}
        </button>
      )}
    </div>
  );
}
