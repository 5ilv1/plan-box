"use client";

import { useState } from "react";
import { MotDict, PhraseDict } from "@/types";
import { genereTrous, surlignerMots } from "@/lib/dictee-utils";

interface Props {
  texte: string;
  mots: MotDict[];
  phrases: PhraseDict[];
}

export default function DicteeTranscription({ texte, mots, phrases }: Props) {
  const [mode, setMode] = useState<"complet" | "trous">("complet");

  const texteTrous = genereTrous(texte, mots);
  const texteHighlight = surlignerMots(texte, mots);

  return (
    <div>
      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["complet", "trous"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              fontWeight: mode === m ? 700 : 500,
              background: mode === m ? "var(--primary)" : "white",
              color: mode === m ? "white" : "var(--text-secondary)",
              border: mode === m ? "none" : "1px solid var(--border)",
            }}
          >
            {m === "complet" ? "📄 Texte complet" : "✏️ À trous"}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {mode === "complet" ? (
        <div>
          {phrases.map((p, i) => (
            <p key={p.id} style={{ marginBottom: 10, lineHeight: 1.8, fontSize: 14 }}>
              <span style={{
                fontWeight: 700, color: "var(--text-secondary)", marginRight: 6,
                fontSize: 12, minWidth: 18, display: "inline-block",
              }}>
                {i + 1}.
              </span>
              <span dangerouslySetInnerHTML={{
                __html: surlignerMots(p.texte, mots),
              }} />
            </p>
          ))}
          {/* Légende */}
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <mark style={{ background: "#BFDBFE", borderRadius: 3, padding: "0 4px", fontSize: 11 }}>mot</mark>
            = mot à apprendre
          </div>
        </div>
      ) : (
        <div>
          {phrases.map((p, i) => (
            <p key={p.id} style={{ marginBottom: 10, lineHeight: 1.8, fontSize: 14 }}>
              <span style={{
                fontWeight: 700, color: "var(--text-secondary)", marginRight: 6,
                fontSize: 12, minWidth: 18, display: "inline-block",
              }}>
                {i + 1}.
              </span>
              {genereTrous(p.texte, mots)}
            </p>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-secondary)" }}>
            Les tirets représentent les mots à apprendre.
          </div>
        </div>
      )}

      {/* Suppression du texteHighlight et texteTrous inutilisés */}
      {/* Ils sont utilisés au cas où on affiche le texte complet en bloc */}
      <span style={{ display: "none" }}>{texteHighlight}{texteTrous}{texte}</span>
    </div>
  );
}
