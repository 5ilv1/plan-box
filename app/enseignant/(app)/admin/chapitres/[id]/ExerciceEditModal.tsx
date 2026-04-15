"use client";

import { useState } from "react";

interface Exercice {
  id: string;
  type: string;
  titre: string;
  contenu: Record<string, unknown>;
}

interface Props {
  exercice: Exercice;
  onClose: () => void;
  onSave: (id: string, contenu: Record<string, unknown>) => Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
};
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical" as const };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text-secondary)" };
const cardItemStyle: React.CSSProperties = {
  padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10,
  background: "var(--bg)", marginBottom: 8,
};

export default function ExerciceEditModal({ exercice, onClose, onSave }: Props) {
  const [contenu, setContenu] = useState<any>(() => JSON.parse(JSON.stringify(exercice.contenu)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave(exercice.id, contenu);
    } catch {
      setError("Erreur lors de la sauvegarde");
    }
    setSaving(false);
  }

  const set = (key: string, val: unknown) => setContenu((c: any) => ({ ...c, [key]: val }));

  function updateAt<T>(arr: T[], idx: number, patch: Partial<T>): T[] {
    return arr.map((item, i) => i === idx ? { ...item, ...patch } : item);
  }
  function removeAt<T>(arr: T[], idx: number): T[] {
    return arr.filter((_, i) => i !== idx);
  }

  // ── Rendu par type ──────────────────────────────────────────────────

  function renderExercice() {
    const questions: any[] = contenu.questions ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={2} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Questions ({questions.length})
        </div>

        {questions.map((q: any, i: number) => (
          <div key={i} style={cardItemStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>Q{i + 1}</span>
              <button type="button" onClick={() => set("questions", removeAt(questions, i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
            </div>
            <label style={labelStyle}>Énoncé</label>
            <textarea style={textareaStyle} rows={2} value={q.enonce ?? ""}
              onChange={(e) => set("questions", updateAt(questions, i, { enonce: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Réponse attendue</label>
                <input style={inputStyle} value={q.reponse_attendue ?? ""}
                  onChange={(e) => set("questions", updateAt(questions, i, { reponse_attendue: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Indice</label>
                <input style={inputStyle} value={q.indice ?? ""}
                  onChange={(e) => set("questions", updateAt(questions, i, { indice: e.target.value }))} />
              </div>
            </div>
          </div>
        ))}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set("questions", [...questions, { enonce: "", reponse_attendue: "", indice: "" }])}>
          + Ajouter une question
        </button>
      </>
    );
  }

  function renderQCM() {
    const questions: any[] = contenu.questions ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={2} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Questions ({questions.length})
        </div>

        {questions.map((q: any, i: number) => {
          const options: string[] = q.options ?? [];
          return (
            <div key={i} style={cardItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>Q{i + 1}</span>
                <button type="button" onClick={() => set("questions", removeAt(questions, i))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
              </div>
              <label style={labelStyle}>Question</label>
              <input style={inputStyle} value={q.question ?? ""}
                onChange={(e) => set("questions", updateAt(questions, i, { question: e.target.value }))} />

              <label style={{ ...labelStyle, marginTop: 8 }}>Options</label>
              {options.map((opt: string, j: number) => (
                <div key={j} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                    background: q.reponse_correcte === j ? "#16A34A" : "#F3F4F6",
                    color: q.reponse_correcte === j ? "white" : "var(--text-secondary)",
                    cursor: "pointer",
                  }} title="Marquer comme bonne réponse"
                    onClick={() => set("questions", updateAt(questions, i, { reponse_correcte: j }))}>
                    {q.reponse_correcte === j ? "✓" : String.fromCharCode(65 + j)}
                  </span>
                  <input style={{ ...inputStyle, flex: 1 }} value={opt}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[j] = e.target.value;
                      set("questions", updateAt(questions, i, { options: newOpts }));
                    }} />
                  <button type="button" onClick={() => {
                    const newOpts = options.filter((_: string, k: number) => k !== j);
                    const newCorrect = q.reponse_correcte >= j ? Math.max(0, q.reponse_correcte - 1) : q.reponse_correcte;
                    set("questions", updateAt(questions, i, { options: newOpts, reponse_correcte: newCorrect }));
                  }} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 12 }}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-ghost" style={{ fontSize: 11, marginTop: 2 }}
                onClick={() => set("questions", updateAt(questions, i, { options: [...options, ""] }))}>
                + Option
              </button>

              <div style={{ marginTop: 8 }}>
                <label style={labelStyle}>Explication</label>
                <input style={inputStyle} value={q.explication ?? ""}
                  onChange={(e) => set("questions", updateAt(questions, i, { explication: e.target.value }))} />
              </div>
            </div>
          );
        })}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set("questions", [...questions, { question: "", options: ["", ""], reponse_correcte: 0, explication: "" }])}>
          + Ajouter une question
        </button>
      </>
    );
  }

  function renderTexteATrous() {
    const trous: any[] = contenu.trous ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={2} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <label style={{ ...labelStyle, marginTop: 12 }}>Texte complet</label>
        <textarea style={{ ...textareaStyle, fontFamily: "monospace", fontSize: 12 }} rows={5}
          value={contenu.texte_complet ?? ""}
          onChange={(e) => set("texte_complet", e.target.value)} />

        <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Trous ({trous.length})
        </div>

        {trous.map((t: any, i: number) => (
          <div key={i} style={{ ...cardItemStyle, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", flexShrink: 0 }}>#{i + 1}</span>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Mot</label>
              <input style={inputStyle} value={t.mot ?? ""}
                onChange={(e) => set("trous", updateAt(trous, i, { mot: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Position</label>
              <input style={inputStyle} type="number" value={t.position ?? 0}
                onChange={(e) => set("trous", updateAt(trous, i, { position: parseInt(e.target.value) || 0 }))} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Indice</label>
              <input style={inputStyle} value={t.indice ?? ""}
                onChange={(e) => set("trous", updateAt(trous, i, { indice: e.target.value }))} />
            </div>
            <button type="button" onClick={() => set("trous", removeAt(trous, i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13, marginTop: 18 }}>✕</button>
          </div>
        ))}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set("trous", [...trous, { mot: "", position: 0, indice: "" }])}>
          + Ajouter un trou
        </button>
      </>
    );
  }

  function renderClassement() {
    const categories: string[] = contenu.categories ?? [];
    const items: any[] = contenu.items ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={2} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <label style={{ ...labelStyle, marginTop: 12 }}>Catégories (séparées par des virgules)</label>
        <input style={inputStyle} value={categories.join(", ")}
          onChange={(e) => set("categories", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))} />

        <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Items ({items.length})
        </div>

        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
            <input style={{ ...inputStyle, flex: 2 }} value={item.texte ?? item.mot ?? ""}
              placeholder="Texte de l'item"
              onChange={(e) => set("items", updateAt(items, i, { texte: e.target.value, mot: e.target.value }))} />
            <select style={{ ...inputStyle, flex: 1 }} value={item.categorie ?? ""}
              onChange={(e) => set("items", updateAt(items, i, { categorie: e.target.value }))}>
              <option value="">—</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <button type="button" onClick={() => set("items", removeAt(items, i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
          </div>
        ))}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set("items", [...items, { texte: "", categorie: categories[0] ?? "" }])}>
          + Ajouter un item
        </button>
      </>
    );
  }

  function renderCalculMental() {
    const calculs: any[] = contenu.calculs ?? contenu.questions ?? [];
    const fieldName = contenu.calculs ? "calculs" : "questions";
    return (
      <>
        <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Calculs ({calculs.length})
        </div>

        {calculs.map((c: any, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", flexShrink: 0, width: 20 }}>{i + 1}</span>
            <input style={{ ...inputStyle, flex: 2 }} value={c.enonce ?? c.expression ?? ""}
              placeholder="Expression"
              onChange={(e) => set(fieldName, updateAt(calculs, i, { enonce: e.target.value, expression: e.target.value }))} />
            <input style={{ ...inputStyle, flex: 1 }} value={c.reponse ?? ""}
              placeholder="Réponse"
              onChange={(e) => set(fieldName, updateAt(calculs, i, { reponse: e.target.value }))} />
            <button type="button" onClick={() => set(fieldName, removeAt(calculs, i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
          </div>
        ))}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set(fieldName, [...calculs, { enonce: "", reponse: "" }])}>
          + Ajouter un calcul
        </button>
      </>
    );
  }

  function renderEcritureContrainte() {
    const contraintes: string[] = contenu.contraintes ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={3} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nombre de phrases</label>
            <input style={inputStyle} type="number" value={contenu.nb_phrases ?? 5}
              onChange={(e) => set("nb_phrases", parseInt(e.target.value) || 1)} />
          </div>
        </div>

        <label style={{ ...labelStyle, marginTop: 12 }}>Contraintes</label>
        {contraintes.map((c: string, i: number) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
            <input style={{ ...inputStyle, flex: 1 }} value={c}
              onChange={(e) => {
                const newC = [...contraintes];
                newC[i] = e.target.value;
                set("contraintes", newC);
              }} />
            <button type="button" onClick={() => set("contraintes", removeAt(contraintes, i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost" style={{ fontSize: 11, marginTop: 2 }}
          onClick={() => set("contraintes", [...contraintes, ""])}>
          + Ajouter une contrainte
        </button>

        <label style={{ ...labelStyle, marginTop: 12 }}>Exemple (optionnel)</label>
        <textarea style={textareaStyle} rows={3} value={contenu.exemple ?? ""}
          onChange={(e) => set("exemple", e.target.value)} />
      </>
    );
  }

  function renderAnalysePhrase() {
    const phrases: any[] = contenu.phrases ?? [];
    return (
      <>
        <label style={labelStyle}>Consigne</label>
        <textarea style={textareaStyle} rows={2} value={contenu.consigne ?? ""}
          onChange={(e) => set("consigne", e.target.value)} />

        <div style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
          Phrases ({phrases.length})
        </div>

        {phrases.map((p: any, i: number) => (
          <div key={i} style={cardItemStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>#{i + 1}</span>
              <button type="button" onClick={() => set("phrases", removeAt(phrases, i))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13 }}>✕</button>
            </div>
            <label style={labelStyle}>Phrase</label>
            <input style={inputStyle} value={p.phrase ?? ""}
              onChange={(e) => set("phrases", updateAt(phrases, i, { phrase: e.target.value }))} />
            <label style={{ ...labelStyle, marginTop: 8 }}>Analyse attendue</label>
            <textarea style={{ ...textareaStyle, fontFamily: "monospace", fontSize: 11 }} rows={3}
              value={typeof p.analyse === "string" ? p.analyse : JSON.stringify(p.analyse, null, 2)}
              onChange={(e) => {
                try { set("phrases", updateAt(phrases, i, { analyse: JSON.parse(e.target.value) })); }
                catch { set("phrases", updateAt(phrases, i, { analyse: e.target.value })); }
              }} />
          </div>
        ))}

        <button type="button" className="btn-ghost" style={{ fontSize: 12, marginTop: 4 }}
          onClick={() => set("phrases", [...phrases, { phrase: "", analyse: "" }])}>
          + Ajouter une phrase
        </button>
      </>
    );
  }

  function renderFallbackJSON() {
    return (
      <>
        <label style={labelStyle}>Contenu JSON (édition brute)</label>
        <textarea style={{ ...textareaStyle, fontFamily: "monospace", fontSize: 11 }} rows={20}
          value={JSON.stringify(contenu, null, 2)}
          onChange={(e) => {
            try { setContenu(JSON.parse(e.target.value)); }
            catch { /* ignore invalid JSON while typing */ }
          }} />
      </>
    );
  }

  // ── Rendu principal ─────────────────────────────────────────────────

  const renderers: Record<string, () => React.ReactNode> = {
    exercice: renderExercice,
    qcm: renderQCM,
    texte_a_trous: renderTexteATrous,
    classement: renderClassement,
    calcul_mental: renderCalculMental,
    ecriture_contrainte: renderEcritureContrainte,
    analyse_phrase: renderAnalysePhrase,
  };

  const renderer = renderers[exercice.type] ?? renderFallbackJSON;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 680, maxWidth: "100%", maxHeight: "88vh", overflow: "auto",
          padding: "24px 28px", borderRadius: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>✏️ Modifier l&apos;exercice</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{exercice.titre}</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-secondary)", padding: "4px 8px" }}
          >✕</button>
        </div>

        {/* Formulaire par type */}
        {renderer()}

        {/* Footer */}
        {error && <p style={{ color: "#DC2626", fontSize: 12, marginTop: 12 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 13, padding: "8px 16px" }}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 13, padding: "8px 20px" }}>
            {saving ? "Enregistrement…" : "✓ Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
