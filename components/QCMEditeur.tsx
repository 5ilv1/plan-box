"use client";

import FigureGeo, { type Figure } from "@/components/FigureGeo";

export interface QCMData {
  titre?: string;
  questions: {
    question: string;
    options: string[];
    reponse_correcte: number;
    explication?: string;
    /** Dessin sous l'énoncé — fraction en images. Voir SPEC-FIGURES.md. */
    figure?: Figure;
    /** Sens inverse : une fraction dans l'énoncé, un dessin par option. */
    options_figures?: Figure[];
  }[];
}

/**
 * L'aperçu d'un QCM, éditable en place : titre, questions, options, bonne
 * réponse, explication — et suppression d'une question qui ne convient pas.
 *
 * Partagé par « Nouvel exercice » et par la relecture de la semaine engendrée
 * depuis la programmation : un seul écran de relecture pour les deux chemins.
 */
export default function QCMEditeur({
  data,
  onChange,
  enEdition = true,
}: {
  data: QCMData;
  onChange: (d: QCMData) => void;
  enEdition?: boolean;
}) {
  function majQuestions(questions: QCMData["questions"]) {
    onChange({ ...data, questions });
  }
  function updateQuestionField(idx: number, field: "question" | "explication", value: string) {
    majQuestions(data.questions.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  }
  function updateOption(qIdx: number, optIdx: number, value: string) {
    majQuestions(data.questions.map((q, i) =>
      i !== qIdx ? q : { ...q, options: q.options.map((o, j) => (j === optIdx ? value : o)) }
    ));
  }
  function setReponseCorrecte(qIdx: number, optIdx: number) {
    majQuestions(data.questions.map((q, i) => (i === qIdx ? { ...q, reponse_correcte: optIdx } : q)));
  }
  function supprimerQuestion(idx: number) {
    majQuestions(data.questions.filter((_, i) => i !== idx));
  }

  const inputBase: React.CSSProperties = {
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "4px 6px",
    background: enEdition ? "#FAFAFA" : "transparent",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
  };
  const focus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
  };
  const blur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "transparent";
  };

  return (
    <>
      <input
        value={data.titre ?? ""}
        onChange={(e) => onChange({ ...data, titre: e.target.value })}
        disabled={!enEdition}
        placeholder="Titre du QCM"
        style={{ ...inputBase, fontWeight: 700, fontSize: "1.125rem", marginBottom: 8 }}
        onFocus={focus}
        onBlur={blur}
      />
      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 12 }}>
        {data.questions.length} question{data.questions.length > 1 ? "s" : ""}
        {enEdition && <span style={{ marginLeft: 8, fontWeight: 500, fontStyle: "italic" }}>· clique sur le rond vert pour changer la bonne réponse</span>}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.questions.map((q, i) => (
          <div key={i} style={{ padding: "10px 14px", background: "white", borderRadius: 10, border: "1px solid var(--border)", fontSize: "0.8125rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
              <span style={{ color: "#92400E", fontWeight: 700, flexShrink: 0, paddingTop: 4 }}>Q{i + 1}.</span>
              <textarea
                value={q.question}
                onChange={(e) => updateQuestionField(i, "question", e.target.value)}
                disabled={!enEdition}
                rows={2}
                style={{ ...inputBase, fontWeight: 700, fontSize: "0.8125rem", resize: "vertical", minHeight: 36 }}
                onFocus={focus}
                onBlur={blur}
              />
              {/* Un QCM sans question ne se pose pas : la dernière reste. */}
              {enEdition && data.questions.length > 1 && (
                <BoutonSupprimer onClick={() => supprimerQuestion(i)} />
              )}
            </div>
            {/* Le dessin dont parle l'énoncé : sans lui, on valide
                une question qu'on n'a pas pu relire. */}
            {q.figure && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <FigureGeo figure={q.figure} />
              </div>
            )}
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
              {q.options.map((opt, j) => {
                const correct = j === q.reponse_correcte;
                return (
                  <li key={j} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => enEdition && setReponseCorrecte(i, j)}
                      disabled={!enEdition}
                      title={correct ? "Bonne réponse" : "Marquer comme bonne réponse"}
                      style={{
                        width: 20, height: 20, borderRadius: "50%",
                        border: correct ? "2px solid #16A34A" : "1.5px solid var(--border)",
                        background: correct ? "#16A34A" : "white",
                        color: "white",
                        cursor: enEdition ? "pointer" : "default",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, flexShrink: 0, padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      {correct ? "✓" : ""}
                    </button>
                    <span style={{ color: correct ? "#16A34A" : "var(--text-secondary)", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0, width: 18 }}>
                      {String.fromCharCode(65 + j)}.
                    </span>
                    {q.options_figures?.[j] ? (
                      // L'option EST le dessin : son libellé n'est
                      // qu'une étiquette de position, rien à corriger.
                      <FigureGeo figure={q.options_figures[j]} compact />
                    ) : (
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, j, e.target.value)}
                        disabled={!enEdition}
                        style={{
                          ...inputBase,
                          fontSize: "0.8125rem",
                          color: correct ? "#16A34A" : "var(--text)",
                          fontWeight: correct ? 700 : 400,
                        }}
                        onFocus={focus}
                        onBlur={blur}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 4 }}>
              <span style={{ fontSize: "0.75rem", flexShrink: 0, lineHeight: 1.8 }}>💡</span>
              <input
                value={q.explication ?? ""}
                onChange={(e) => updateQuestionField(i, "explication", e.target.value)}
                disabled={!enEdition}
                placeholder="Explication (optionnelle)"
                style={{ ...inputBase, fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}
                onFocus={focus}
                onBlur={blur}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** La corbeille d'une question : partagée par les écrans de relecture. */
export function BoutonSupprimer({ onClick, titre = "Supprimer cette question" }: { onClick: () => void; titre?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 8,
        border: "1px solid transparent", background: "transparent",
        color: "var(--error)", cursor: "pointer", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#fff5f5"; e.currentTarget.style.borderColor = "#f0b8b8"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
    >
      <span className="ms" style={{ fontSize: 18 }}>delete</span>
    </button>
  );
}
