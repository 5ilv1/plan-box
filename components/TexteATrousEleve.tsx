"use client";

import React, { useState, useRef, useEffect } from "react";

interface Trou {
  position: number;
  mot: string;
  indice?: string;
  prefixe?: string;
}

// Détecte l'élision française (j', l', n', d', s', c', qu', m', t') et sépare préfixe / mot
function separerElision(mot: string): { prefixe: string; motSansElision: string } {
  const match = mot.match(/^([jlndsctm][''']|qu['''])(.+)$/i);
  if (match) {
    return { prefixe: match[1].replace(/['']/g, "'") + "", motSansElision: match[2] };
  }
  return { prefixe: "", motSansElision: mot };
}

// Détecte si un mot est un verbe du 1er groupe (-er/-é/-ée/-és/-ées)
// et génère les deux options (infinitif + participe passé)
function genererOptionsVerbe(mot: string): [string, string] | null {
  const m = mot.replace(/[.,;:!?'"()]/g, "");
  // Infinitif → participe passé
  if (/er$/i.test(m) && m.length >= 4) {
    const radical = m.slice(0, -2);
    return [m, radical + "é"];
  }
  // Participe passé → infinitif
  if (/ées$/i.test(m)) {
    return [m.slice(0, -3) + "er", m];
  }
  if (/és$/i.test(m)) {
    return [m.slice(0, -2) + "er", m];
  }
  if (/ée$/i.test(m)) {
    return [m.slice(0, -2) + "er", m];
  }
  if (/é$/i.test(m) && m.length >= 4) {
    return [m.slice(0, -1) + "er", m];
  }
  return null;
}

// Détecte si un mot est un homophone (est/et, ou/où, sont/son, a/à, ce/se, on/ont)
// et génère les deux options
function genererOptionsHomophone(mot: string, indice?: string): [string, string] | null {
  const m = mot.replace(/[.,;:!?'"()]/g, "").toLowerCase();
  const paires: [string, string][] = [
    ["est", "et"], ["ou", "où"], ["sont", "son"],
    ["a", "à"], ["ce", "se"], ["on", "ont"],
  ];
  for (const [a, b] of paires) {
    if (m === a) return [a, b];
    if (m === b) return [a, b];
  }
  return null;
}

// Détecte si un mot est un pluriel lié à une règle de pluriel (-ou/-oux, -al/-aux, -ail/-aux)
// et génère les deux options (forme régulière + forme exception)
function genererOptionsPluriel(mot: string, indice?: string): [string, string] | null {
  const m = mot.replace(/[.,;:!?'"()]/g, "");

  // Pluriels en -oux vs -ous
  if (/oux$/i.test(m)) {
    return [m, m.slice(0, -1) + "s"];
  }
  if (/ous$/i.test(m) && indice && /ou|régulier|général/i.test(indice)) {
    return [m.slice(0, -1) + "x", m];
  }

  // Pluriels en -aux vs -als
  if (/aux$/i.test(m) && m.length >= 4) {
    if (indice && /al|aux|exception|défaut/i.test(indice)) {
      return [m, m.slice(0, -3) + "als"];
    }
  }
  if (/als$/i.test(m) && m.length >= 4) {
    if (indice && /al|als|exception|défaut|fête|régulier|général/i.test(indice)) {
      return [m.slice(0, -3) + "aux", m];
    }
  }

  // Pluriels en -ails vs -aux (règle -ail)
  if (/ails$/i.test(m)) {
    if (indice && /ail|défaut|régulier|général/i.test(indice)) {
      return [m.slice(0, -4) + "aux", m];
    }
  }

  return null;
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
      .replace(/['']/g, "'")
      .replace(/\s+/g, " ");
  }

  function verifier() {
    const res: Record<number, boolean> = {};
    let bonnes = 0;

    for (const trou of trous) {
      const reponse = reponses[trou.position] ?? "";
      const motBrut = trou.mot.replace(/[.,;:!?'"()]/g, "");
      // Si le mot contient une élision (j'aurai, l'école…), accepter avec ou sans le préfixe
      const { prefixe, motSansElision } = separerElision(motBrut);
      const motAttendu = prefixe ? motSansElision : motBrut;
      // Accepter la réponse avec ou sans préfixe élidé
      const repNorm = normaliser(reponse);
      const correct = repNorm === normaliser(motAttendu) || (!!prefixe && repNorm === normaliser(motBrut));
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
            // Séparer l'élision : j'aurai → préfixe "j'" + mot "aurai"
            const motBrut = trou.mot.replace(/[.,;:!?'"()]/g, "");
            const { prefixe: elision, motSansElision } = separerElision(motBrut);
            const motAffiche = elision ? motSansElision : motBrut;
            const largeur = Math.max(motAffiche.length * 12, 60);
            const optionsVerbe = genererOptionsVerbe(motBrut) ?? genererOptionsHomophone(motBrut, trou.indice) ?? genererOptionsPluriel(motBrut, trou.indice);

            return (
              <React.Fragment key={i}>
              <span style={{ display: "inline-block", verticalAlign: "baseline", margin: "0 3px" }}>
                {elision && <span style={{ fontSize: "1.125rem" }}>{elision}</span>}
                {termine || estCorrect ? (
                  // Mot correct : affiché en vert
                  <span style={{
                    fontWeight: 700, color: "#16A34A",
                    borderBottom: "2px solid #16A34A",
                    padding: "0 4px",
                  }}>
                    {motAffiche}
                  </span>
                ) : optionsVerbe ? (
                  // Menu déroulant pour les verbes -er/-é
                  <span style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle" }}>
                    <select
                      value={val}
                      onChange={(e) => {
                        setReponses((prev) => ({ ...prev, [i]: e.target.value }));
                        if (verifie) { setVerifie(false); setResultats({}); }
                      }}
                      disabled={termine}
                      style={{
                        padding: "4px 24px 4px 8px",
                        border: `2px ${estIncorrect ? "solid #EF4444" : "solid #0E7490"}`,
                        borderRadius: 8,
                        fontSize: "1rem",
                        fontWeight: 600,
                        textAlign: "center",
                        outline: "none",
                        background: estIncorrect ? "#FEF2F2" : "rgba(14,116,144,0.04)",
                        color: val ? (estIncorrect ? "#DC2626" : "var(--text)") : "#9CA3AF",
                        cursor: "pointer",
                        fontFamily: "var(--font)",
                        appearance: "none",
                        WebkitAppearance: "none",
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%230E7490' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 6px center",
                      }}
                    >
                      <option value="">choisir</option>
                      {optionsVerbe.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {/* Aide après erreur */}
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
                ) : (
                  // Input texte classique (homophones, etc.)
                  <span style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle" }}>
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
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
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
                    {/* Indice visible sous le trou */}
                    {trou.indice && !estCorrect && (
                      <span style={{
                        fontSize: "0.6rem", color: "#0E7490", fontStyle: "italic",
                        marginTop: 1, lineHeight: 1, whiteSpace: "nowrap",
                        opacity: 0.8,
                      }}>
                        {trou.indice}
                      </span>
                    )}
                    {/* Aide supplémentaire après erreur */}
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
