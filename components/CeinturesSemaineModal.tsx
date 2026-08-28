"use client";

import React, { useState } from "react";

export interface DomaineChoisissable {
  code: string;
  slug: string;
  nom: string;
  matiere: string;
  description: string;
  icone: string;
  commence: boolean;
  couleurCourante: { nom: string; hex: string; hexFond: string } | null;
}

interface Props {
  disponibles: DomaineChoisissable[];
  /** Choix déjà enregistré, si l'élève rouvre la fenêtre pour le modifier. */
  dejaChoisis?: string[];
  onValider: (codes: string[]) => Promise<void> | void;
  onFermer: () => void;
}

const MAX = 2;

export default function CeinturesSemaineModal({ disponibles, dejaChoisis, onValider, onFermer }: Props) {
  const [selection, setSelection] = useState<string[]>(dejaChoisis ?? []);
  const [envoi, setEnvoi] = useState(false);

  function basculer(code: string) {
    setSelection((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX) return [prev[1], code]; // le plus ancien cède sa place
      return [...prev, code];
    });
  }

  async function valider() {
    if (selection.length === 0 || envoi) return;
    setEnvoi(true);
    try {
      await onValider(selection);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choisis tes ceintures de la semaine"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="pb-card"
        style={{
          width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto",
          padding: "26px 28px", background: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span className="ms" style={{ fontSize: 30, color: "#7CB342" }}>workspace_premium</span>
          <h2 style={{
            fontSize: 21, fontWeight: 800, margin: 0,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            Tes ceintures de la semaine
          </h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 20 }}>
          Choisis les <strong>deux domaines</strong> que tu veux travailler cette semaine. Ce sont
          les seuls qui s&apos;afficheront sur ton tableau de bord — tu pourras en changer la
          semaine prochaine.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
          {disponibles.map((d) => {
            const choisi = selection.includes(d.code);
            const teinte = d.couleurCourante?.hex ?? "#7CB342";
            return (
              <button
                key={d.code}
                type="button"
                onClick={() => basculer(d.code)}
                aria-pressed={choisi}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 16px", borderRadius: 14, textAlign: "left",
                  border: `2px solid ${choisi ? teinte : "rgba(0,0,0,0.12)"}`,
                  background: choisi ? (d.couleurCourante?.hexFond ?? "#F1F8E9") : "white",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span className="ms" style={{ fontSize: 24, color: teinte, flexShrink: 0 }}>{d.icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontWeight: 800, fontSize: 15,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      {d.nom}
                    </span>
                    {!d.commence && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999,
                        background: "rgba(0,0,0,0.06)", color: "var(--pb-on-surface-variant)",
                      }}>
                        Nouveau
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>
                    {d.description}
                  </div>
                  {d.couleurCourante && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: "50%", background: teinte,
                      }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: teinte }}>
                        Ceinture {d.couleurCourante.nom.toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>
                {choisi && (
                  <span className="ms" style={{ fontSize: 20, color: teinte, flexShrink: 0 }}>check_circle</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <button
            type="button"
            onClick={onFermer}
            className="pb-btn"
            style={{ padding: "12px 20px", fontSize: 14, borderRadius: 999 }}
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={selection.length === 0 || envoi}
            className="pb-btn primary"
            style={{
              flex: 1, padding: "12px 24px", fontSize: 15, fontWeight: 700, borderRadius: 999,
              opacity: selection.length === 0 || envoi ? 0.5 : 1,
              cursor: selection.length === 0 || envoi ? "not-allowed" : "pointer",
            }}
          >
            {envoi
              ? "Enregistrement…"
              : selection.length < MAX
              ? `Choisis encore ${MAX - selection.length} domaine${MAX - selection.length > 1 ? "s" : ""}`
              : "C'est parti !"}
          </button>
        </div>
      </div>
    </div>
  );
}
