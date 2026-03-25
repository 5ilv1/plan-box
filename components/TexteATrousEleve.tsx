"use client";

import React, { useState, useRef, useEffect } from "react";

interface Trou {
  position: number;
  mot: string;
  indice?: string;
}

interface Props {
  titre: string;
  consigne: string;
  texteComplet: string;
  trous: Trou[];
  onTermine: (score: { bon: number; total: number }, reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[]) => void;
}

export default function TexteATrousEleve({ titre, consigne, texteComplet, trous, onTermine }: Props) {
  const mots = texteComplet.split(/\s+/);
  const [reponses, setReponses] = useState<Record<number, string>>({});
  const [resultats, setResultats] = useState<Record<number, boolean | null>>({});
  const [verifie, setVerifie] = useState(false);
  const [termine, setTermine] = useState(false);
  const [tentative, setTentative] = useState(0);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Focus sur le premier trou au montage
  useEffect(() => {
    const premierTrou = trous[0];
    if (premierTrou) {
      setTimeout(() => inputRefs.current[premierTrou.position]?.focus(), 100);
    }
  }, [trous]);

  function normaliser(s: string): string {
    return s.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/['']/g, "'")
      .replace(/\s+/g, " ");
  }

  function verifier() {
    const res: Record<number, boolean> = {};
    let bonnes = 0;

    for (const trou of trous) {
      const reponse = reponses[trou.position] ?? "";
      const motAttendu = trou.mot.replace(/[.,;:!?'"()]/g, "");
      const correct = normaliser(reponse) === normaliser(motAttendu);
      res[trou.position] = correct;
      if (correct) bonnes++;
    }

    setResultats(res);
    setVerifie(true);
    setTentative((t) => t + 1);

    if (bonnes === trous.length) {
      setTermine(true);
      onTermine({ bon: trous.length, total: trous.length }, buildReponsesEleve());
    }
  }

  function reessayer() {
    // Garder les bonnes réponses, effacer les mauvaises
    const newReponses = { ...reponses };
    for (const trou of trous) {
      if (resultats[trou.position] === false) {
        delete newReponses[trou.position];
      }
    }
    setReponses(newReponses);
    setResultats({});
    setVerifie(false);

    // Focus sur le premier trou incorrect
    const premierIncorrect = trous.find((t) => resultats[t.position] === false);
    if (premierIncorrect) {
      setTimeout(() => inputRefs.current[premierIncorrect.position]?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, position: number) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      // Trouver le trou suivant
      const currentIdx = trous.findIndex((t) => t.position === position);
      if (currentIdx < trous.length - 1) {
        const next = trous[currentIdx + 1];
        inputRefs.current[next.position]?.focus();
      } else if (e.key === "Enter" && !verifie) {
        verifier();
      }
    }
  }

  function buildReponsesEleve() {
    return trous.map((t, i) => ({
      id: i + 1,
      reponse: reponses[t.position] ?? "",
      correcte: resultats[t.position] ?? null,
    }));
  }

  const bonnesReponses = Object.values(resultats).filter((r) => r === true).length;

  return (
    <div style={{ padding: "1.5rem 0" }}>
      {/* Consigne */}
      <div style={{
        background: "rgba(14, 116, 144, 0.06)",
        border: "1px solid rgba(14, 116, 144, 0.15)",
        borderRadius: 14, padding: "1rem 1.25rem", marginBottom: 24,
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <span className="ms" style={{ fontSize: 20, color: "#0E7490", flexShrink: 0, marginTop: 2 }}>info</span>
        <p style={{ fontSize: "0.9375rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>{consigne}</p>
      </div>

      {/* Texte avec trous */}
      <div style={{
        background: "white", borderRadius: 16, padding: "1.75rem 2rem",
        lineHeight: 2.4, fontSize: "1.125rem", color: "var(--text)",
        border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        {mots.map((mot, i) => {
          const trou = trous.find((t) => t.position === i);
          const finDePhrase = /[.!?]$/.test(mot) && i < mots.length - 1;

          if (trou) {
            const val = reponses[i] ?? "";
            const resultat = resultats[i];
            const estCorrect = resultat === true;
            const estIncorrect = resultat === false;
            const largeur = Math.max(trou.mot.length * 12, 60);

            return (
              <React.Fragment key={i}>
              <span style={{ display: "inline-block", verticalAlign: "baseline", margin: "0 3px" }}>
                {termine || estCorrect ? (
                  // Mot correct : affiché en vert
                  <span style={{
                    fontWeight: 700, color: "#16A34A",
                    borderBottom: "2px solid #16A34A",
                    padding: "0 4px",
                  }}>
                    {trou.mot}
                  </span>
                ) : (
                  <span style={{ position: "relative", display: "inline-block" }}>
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      value={val}
                      onChange={(e) => {
                        setReponses((prev) => ({ ...prev, [i]: e.target.value }));
                        if (verifie) { setVerifie(false); setResultats({}); }
                      }}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      disabled={termine}
                      placeholder="..."
                      style={{
                        width: largeur,
                        padding: "4px 8px",
                        border: `2px ${estIncorrect ? "solid #EF4444" : "dashed #0E7490"}`,
                        borderRadius: 8,
                        fontSize: "1rem",
                        fontWeight: 600,
                        textAlign: "center",
                        outline: "none",
                        background: estIncorrect ? "#FEF2F2" : "rgba(14,116,144,0.04)",
                        color: estIncorrect ? "#DC2626" : "var(--text)",
                        transition: "border-color 0.2s, background 0.2s",
                        fontFamily: "var(--font)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#0E7490"; e.currentTarget.style.borderStyle = "solid"; }}
                      onBlur={(e) => {
                        if (!estIncorrect) { e.currentTarget.style.borderStyle = "dashed"; }
                      }}
                    />
                    {/* Indice pour les mots incorrects */}
                    {estIncorrect && trou.indice && tentative <= 2 && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
                        background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8,
                        padding: "4px 10px", fontSize: "0.6875rem", color: "#92400E",
                        whiteSpace: "nowrap", zIndex: 10, fontWeight: 500,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      }}>
                        💡 {trou.indice}
                      </div>
                    )}
                    {/* Afficher la réponse après 3 tentatives */}
                    {estIncorrect && tentative >= 3 && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
                        background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: 8,
                        padding: "4px 10px", fontSize: "0.6875rem", color: "#166534",
                        whiteSpace: "nowrap", zIndex: 10, fontWeight: 700,
                      }}>
                        → {trou.mot}
                      </div>
                    )}
                  </span>
                )}{" "}
              </span>
              {finDePhrase && <br />}
            </React.Fragment>
            );
          }

          return <span key={i}>{mot}{" "}{finDePhrase && <br />}</span>;
        })}
      </div>

      {/* Barre de résultat */}
      {verifie && !termine && (
        <div style={{
          marginTop: 16, padding: "0.75rem 1rem", borderRadius: 12,
          background: "#FEF2F2", border: "1px solid #FECACA",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#DC2626" }}>
            {bonnesReponses} / {trous.length} correct{bonnesReponses > 1 ? "s" : ""}
            {tentative <= 2 ? " — Corrige les mots en rouge et réessaie" : " — Les réponses sont affichées ci-dessus"}
          </span>
          <button
            onClick={tentative >= 3 ? () => {
              // Forcer terminer après 3 tentatives
              setTermine(true);
              onTermine({ bon: bonnesReponses, total: trous.length }, buildReponsesEleve());
            } : reessayer}
            style={{
              padding: "0.5rem 1rem", borderRadius: 999, border: "none",
              background: "#DC2626", color: "white", fontWeight: 700,
              fontSize: "0.8125rem", cursor: "pointer",
            }}
          >
            {tentative >= 3 ? "Terminer" : "Réessayer"}
          </button>
        </div>
      )}

      {/* Succès */}
      {termine && bonnesReponses === trous.length && (
        <div style={{
          marginTop: 16, padding: "1rem", borderRadius: 12,
          background: "#DCFCE7", border: "1px solid #BBF7D0", textAlign: "center",
        }}>
          <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#16A34A" }}>
            🎉 Bravo, tout est correct !
          </span>
        </div>
      )}

      {termine && bonnesReponses < trous.length && (
        <div style={{
          marginTop: 16, padding: "1rem", borderRadius: 12,
          background: "#FEF3C7", border: "1px solid #FDE68A", textAlign: "center",
        }}>
          <span style={{ fontSize: "1rem", fontWeight: 700, color: "#92400E" }}>
            Score : {bonnesReponses} / {trous.length}
          </span>
        </div>
      )}

      {/* Bouton vérifier */}
      {!verifie && !termine && (
        <button
          onClick={verifier}
          disabled={Object.keys(reponses).length === 0}
          style={{
            marginTop: 20, width: "100%", padding: "1rem",
            borderRadius: 999, border: "none",
            background: Object.keys(reponses).length > 0 ? "#0E7490" : "#ccc",
            color: "white", fontWeight: 700, fontSize: "1rem",
            cursor: Object.keys(reponses).length > 0 ? "pointer" : "default",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "background 0.2s",
          }}
        >
          Vérifier mes réponses
        </button>
      )}
    </div>
  );
}
