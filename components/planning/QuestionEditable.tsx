"use client";

import { useState, type ReactNode } from "react";

// Une question de l'aperçu du Planning, retouchable sur place :
// un crayon pour la modifier, une croix pour la supprimer.
// La forme de la question dépend du type d'activité.

export type QuestionExercice = { id: number; enonce: string; reponse_attendue: string; indice?: string };
export type QuestionQcm = { question: string; options: string[]; reponse_correcte: number; explication?: string };
export type QuestionCalcul = { id: number; enonce: string; reponse: string | number };

type Props =
  | { genre: "exercice"; question: QuestionExercice; children: ReactNode; peutSupprimer: boolean; onSupprimer: () => Promise<void>; onEnregistrer: (q: QuestionExercice) => Promise<void> }
  | { genre: "qcm"; question: QuestionQcm; children: ReactNode; peutSupprimer: boolean; onSupprimer: () => Promise<void>; onEnregistrer: (q: QuestionQcm) => Promise<void> }
  | { genre: "calcul"; question: QuestionCalcul; children: ReactNode; peutSupprimer: boolean; onSupprimer: () => Promise<void>; onEnregistrer: (q: QuestionCalcul) => Promise<void> };

const boutonIcone: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: "1px solid var(--border)",
  background: "white", cursor: "pointer", display: "inline-flex",
  alignItems: "center", justifyContent: "center", padding: 0,
  color: "var(--text-secondary)",
};

export default function QuestionEditable(props: Props) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState<Props["question"]>(props.question);
  const [occupe, setOccupe] = useState(false);

  async function supprimer() {
    if (!props.peutSupprimer) return;
    if (!window.confirm("Supprimer cette question ?")) return;
    setOccupe(true);
    try { await props.onSupprimer(); } finally { setOccupe(false); }
  }

  async function enregistrer() {
    setOccupe(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await props.onEnregistrer(brouillon as any);
      setEdition(false);
    } finally { setOccupe(false); }
  }

  if (edition) {
    const champ = { className: "form-input", style: { fontSize: 13, marginBottom: 6 } };
    return (
      <div style={{ marginBottom: 16, padding: "12px 14px", background: "#EEF0FE", borderRadius: 10, border: "1.5px solid #AAB7FA" }}>
        {props.genre === "exercice" && (() => {
          const q = brouillon as QuestionExercice;
          const maj = (p: Partial<QuestionExercice>) => setBrouillon({ ...q, ...p });
          return (
            <>
              <input {...champ} placeholder="Énoncé" value={q.enonce} onChange={(e) => maj({ enonce: e.target.value })} />
              <input {...champ} placeholder="Réponse attendue" value={q.reponse_attendue} onChange={(e) => maj({ reponse_attendue: e.target.value })} />
              <input {...champ} placeholder="Indice (facultatif)" value={q.indice ?? ""} onChange={(e) => maj({ indice: e.target.value || undefined })} />
            </>
          );
        })()}
        {props.genre === "qcm" && (() => {
          const q = brouillon as QuestionQcm;
          const maj = (p: Partial<QuestionQcm>) => setBrouillon({ ...q, ...p });
          return (
            <>
              <input {...champ} placeholder="Question" value={q.question} onChange={(e) => maj({ question: e.target.value })} />
              {q.options.map((opt, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <input type="radio" checked={q.reponse_correcte === j} onChange={() => maj({ reponse_correcte: j })} title="Bonne réponse" />
                  <input className="form-input" style={{ flex: 1, fontSize: 13 }} placeholder={`Option ${String.fromCharCode(65 + j)}`} value={opt}
                    onChange={(e) => maj({ options: q.options.map((o, k) => (k === j ? e.target.value : o)) })} />
                </div>
              ))}
              <textarea className="form-input" rows={2} style={{ fontSize: 13, marginTop: 4, marginBottom: 6, resize: "vertical" }}
                placeholder="Explication (facultative)" value={q.explication ?? ""} onChange={(e) => maj({ explication: e.target.value })} />
            </>
          );
        })()}
        {props.genre === "calcul" && (() => {
          const q = brouillon as QuestionCalcul;
          const maj = (p: Partial<QuestionCalcul>) => setBrouillon({ ...q, ...p });
          return (
            <div style={{ display: "flex", gap: 8 }}>
              <input {...champ} style={{ ...champ.style, flex: 2 }} placeholder="Calcul" value={q.enonce} onChange={(e) => maj({ enonce: e.target.value })} />
              <input {...champ} style={{ ...champ.style, flex: 1 }} placeholder="Réponse" value={String(q.reponse)} onChange={(e) => maj({ reponse: e.target.value })} />
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 13 }} disabled={occupe} onClick={enregistrer}>
            {occupe ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }} disabled={occupe}
            onClick={() => { setBrouillon(props.question); setEdition(false); }}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {props.children}
      <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4, opacity: occupe ? 0.5 : 1 }}>
        <button type="button" style={boutonIcone} title="Modifier la question" disabled={occupe}
          onClick={() => { setBrouillon(props.question); setEdition(true); }}>
          <span className="ms" style={{ fontSize: 14 }}>edit</span>
        </button>
        <button type="button" style={{ ...boutonIcone, color: props.peutSupprimer ? "var(--error)" : "var(--border)", cursor: props.peutSupprimer ? "pointer" : "not-allowed" }}
          title={props.peutSupprimer ? "Supprimer la question" : "Impossible de supprimer la dernière question"}
          disabled={occupe || !props.peutSupprimer} onClick={supprimer}>
          <span className="ms" style={{ fontSize: 14 }}>close</span>
        </button>
      </div>
    </div>
  );
}
