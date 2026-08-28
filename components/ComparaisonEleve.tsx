"use client";

import React, { useState } from "react";

export interface PaireComparaison {
  gauche: string;
  droite: string;
  signe: string; // "<" | ">" | "="
}

interface Props {
  titre: string;
  consigne: string;
  paires: PaireComparaison[];
  avecEgalite?: boolean;
  onTermine: (
    score: { bon: number; total: number },
    reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[],
  ) => void;
}

const VERT = "#16A34A";
const ROUGE = "#DC2626";
const BLEU = "#2563EB";

export default function ComparaisonEleve({ titre, consigne, paires, avecEgalite, onTermine }: Props) {
  const signesProposes = avecEgalite || paires.some((p) => p.signe === "=")
    ? ["<", ">", "="]
    : ["<", ">"];

  const [reponses, setReponses] = useState<(string | null)[]>(() => paires.map(() => null));
  const [erreurs, setErreurs] = useState<Set<number>>(new Set());
  const [justes, setJustes] = useState<Set<number>>(new Set());
  const [etat, setEtat] = useState<"saisie" | "termine">("saisie");
  // Score de la première tentative : c'est lui qui dit ce que l'élève savait faire.
  const [premiereTentative, setPremiereTentative] = useState<boolean[] | null>(null);

  const toutRepondu = reponses.every((r) => r !== null);
  const nbRepondu = reponses.filter((r) => r !== null).length;

  function choisir(idx: number, signe: string) {
    if (etat === "termine" || justes.has(idx)) return;
    setReponses((prev) => {
      const next = [...prev];
      next[idx] = signe;
      return next;
    });
    // Retirer le marquage d'erreur dès que l'élève retouche la ligne
    setErreurs((prev) => {
      if (!prev.has(idx)) return prev;
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }

  function valider() {
    if (!toutRepondu) return;

    const correctes = paires.map((p, i) => reponses[i] === p.signe);
    if (premiereTentative === null) setPremiereTentative(correctes);

    const nouvellesErreurs = new Set<number>();
    const nouveauxJustes = new Set<number>(justes);
    correctes.forEach((ok, i) => {
      if (ok) nouveauxJustes.add(i);
      else nouvellesErreurs.add(i);
    });

    setJustes(nouveauxJustes);

    if (nouvellesErreurs.size === 0) {
      setEtat("termine");
      const refs = premiereTentative ?? correctes;
      const log = paires.map((p, i) => ({
        id: i + 1,
        reponse: `${p.gauche} ${reponses[i]} ${p.droite}`,
        correcte: refs[i],
      }));
      onTermine({ bon: paires.length, total: paires.length }, log);
      return;
    }

    setErreurs(nouvellesErreurs);
    // Les lignes fausses repartent à vide pour être retentées
    setReponses((prev) => prev.map((r, i) => (nouvellesErreurs.has(i) ? null : r)));
  }

  const nbJustesPremiere = premiereTentative ? premiereTentative.filter(Boolean).length : null;

  return (
    <div>
      <h2 style={{
        fontSize: 20, fontWeight: 800, marginBottom: 4,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {titre}
      </h2>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 20 }}>
        {consigne}
      </p>

      {etat === "termine" ? (
        <div style={{ textAlign: "center", padding: "32px 24px" }}>
          <span className="ms" style={{ fontSize: 48, color: VERT }}>check_circle</span>
          <p style={{ fontWeight: 800, fontSize: 20, color: VERT, marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Toutes les comparaisons sont justes !
          </p>
          {nbJustesPremiere !== null && (
            <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginTop: 6 }}>
              {nbJustesPremiere}/{paires.length} du premier coup
            </p>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paires.map((p, i) => {
              const juste = justes.has(i);
              const faux = erreurs.has(i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 14,
                    background: juste ? "rgba(22,163,74,0.06)" : faux ? "rgba(220,38,38,0.06)" : "white",
                    border: `1.5px solid ${juste ? "rgba(22,163,74,0.35)" : faux ? "rgba(220,38,38,0.35)" : "var(--pb-outline, rgba(0,0,0,0.12))"}`,
                    opacity: juste ? 0.75 : 1,
                  }}
                >
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)",
                    width: 22, flexShrink: 0,
                  }}>
                    {i + 1}.
                  </span>

                  <span style={{
                    flex: 1, textAlign: "right", fontSize: 20, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 0,
                    overflowWrap: "anywhere",
                  }}>
                    {p.gauche}
                  </span>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {signesProposes.map((s) => {
                      const choisi = reponses[i] === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => choisir(i, s)}
                          disabled={juste}
                          aria-label={s === "<" ? "plus petit que" : s === ">" ? "plus grand que" : "égal à"}
                          style={{
                            width: 46, height: 46, borderRadius: 12,
                            fontSize: 22, fontWeight: 800, lineHeight: 1,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            cursor: juste ? "default" : "pointer",
                            border: `2px solid ${choisi ? (juste ? VERT : BLEU) : "rgba(0,0,0,0.12)"}`,
                            background: choisi ? (juste ? VERT : BLEU) : "white",
                            color: choisi ? "white" : "var(--pb-on-surface)",
                            transition: "all 0.15s",
                          }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>

                  <span style={{
                    flex: 1, textAlign: "left", fontSize: 20, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 0,
                    overflowWrap: "anywhere",
                  }}>
                    {p.droite}
                  </span>

                  {juste && (
                    <span className="ms" style={{ fontSize: 20, color: VERT, flexShrink: 0 }}>check</span>
                  )}
                  {faux && (
                    <span className="ms" style={{ fontSize: 20, color: ROUGE, flexShrink: 0 }}>refresh</span>
                  )}
                </div>
              );
            })}
          </div>

          {erreurs.size > 0 && (
            <p style={{ fontSize: 14, color: ROUGE, fontWeight: 600, marginTop: 14 }}>
              {erreurs.size === 1
                ? "Une comparaison est fausse — réessaie celle-là."
                : `${erreurs.size} comparaisons sont fausses — réessaie celles-là.`}
            </p>
          )}

          <button
            type="button"
            onClick={valider}
            disabled={!toutRepondu}
            className="pb-btn primary"
            style={{
              marginTop: 20, width: "100%", padding: "14px 24px",
              fontSize: 16, fontWeight: 700, borderRadius: 999,
              opacity: toutRepondu ? 1 : 0.5,
              cursor: toutRepondu ? "pointer" : "not-allowed",
            }}
          >
            {toutRepondu ? "Valider" : `Encore ${paires.length - nbRepondu} à compléter`}
          </button>
        </>
      )}
    </div>
  );
}
