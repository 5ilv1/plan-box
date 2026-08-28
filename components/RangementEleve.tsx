"use client";

import React, { useState } from "react";

export interface SerieRangement {
  elements: string[]; // dans le bon ordre
}

interface Props {
  titre: string;
  consigne: string;
  series: SerieRangement[];
  onTermine: (
    score: { bon: number; total: number },
    reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[],
  ) => void;
}

const VERT = "#16A34A";
const ROUGE = "#DC2626";
const BLEU = "#2563EB";

/** Mélange en garantissant un ordre différent de l'original (sinon l'exercice est déjà fait). */
function melanger(elements: string[]): number[] {
  const idx = elements.map((_, i) => i);
  if (idx.length < 2) return idx;
  for (let essai = 0; essai < 20; essai++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    if (idx.some((v, i) => v !== i)) return idx;
  }
  return idx.reverse();
}

interface EtatSerie {
  /** Index (dans `elements`) restant dans la réserve, dans l'ordre mélangé. */
  reserve: number[];
  /** Index posés de gauche à droite. */
  places: number[];
  statut: "saisie" | "faux" | "juste";
}

export default function RangementEleve({ titre, consigne, series, onTermine }: Props) {
  const [etats, setEtats] = useState<EtatSerie[]>(() =>
    series.map((s) => ({ reserve: melanger(s.elements), places: [], statut: "saisie" as const })),
  );
  const [premiereTentative, setPremiereTentative] = useState<(boolean | null)[]>(
    () => series.map(() => null),
  );
  const [dragIdx, setDragIdx] = useState<{ serie: number; pos: number } | null>(null);

  const toutesJustes = etats.every((e) => e.statut === "juste");

  function majSerie(i: number, maj: (e: EtatSerie) => EtatSerie) {
    setEtats((prev) => prev.map((e, k) => (k === i ? maj(e) : e)));
  }

  /** Réserve → dernière position libre */
  function poser(serie: number, element: number) {
    majSerie(serie, (e) => ({
      ...e,
      reserve: e.reserve.filter((x) => x !== element),
      places: [...e.places, element],
      statut: "saisie",
    }));
  }

  /** Étiquette posée → retour à la réserve */
  function retirer(serie: number, pos: number) {
    majSerie(serie, (e) => {
      const element = e.places[pos];
      return {
        ...e,
        places: e.places.filter((_, k) => k !== pos),
        reserve: [...e.reserve, element],
        statut: "saisie",
      };
    });
  }

  /** Déplacement d'une étiquette posée vers une autre position */
  function deplacer(serie: number, de: number, vers: number) {
    if (de === vers) return;
    majSerie(serie, (e) => {
      const places = [...e.places];
      const [element] = places.splice(de, 1);
      places.splice(vers, 0, element);
      return { ...e, places, statut: "saisie" };
    });
  }

  function validerSerie(i: number) {
    const etat = etats[i];
    if (etat.places.length !== series[i].elements.length) return;

    const juste = etat.places.every((element, pos) => element === pos);

    setPremiereTentative((prev) =>
      prev.map((v, k) => (k === i && v === null ? juste : v)),
    );

    if (juste) {
      const nouveaux = etats.map((e, k) => (k === i ? { ...e, statut: "juste" as const } : e));
      setEtats(nouveaux);

      if (nouveaux.every((e) => e.statut === "juste")) {
        const refs = premiereTentative.map((v, k) => (k === i && v === null ? juste : v));
        const log = series.map((s, k) => ({
          id: k + 1,
          reponse: s.elements.join(" → "),
          correcte: refs[k] ?? true,
        }));
        onTermine({ bon: series.length, total: series.length }, log);
      }
      return;
    }

    // Faux : on garde le rangement de l'élève pour qu'il le corrige plutôt que
    // de tout recommencer — il peut déplacer ou reprendre les étiquettes.
    majSerie(i, (e) => ({ ...e, statut: "faux" }));
  }

  const nbJustesPremiere = premiereTentative.filter((v) => v === true).length;

  return (
    <div>
      <h2 style={{
        fontSize: 20, fontWeight: 800, marginBottom: 4,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {titre}
      </h2>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 6 }}>
        {consigne}
      </p>
      <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 20, opacity: 0.8 }}>
        Touche une étiquette pour la poser, touche-la à nouveau pour la reprendre. À la souris, tu peux aussi les glisser pour les réordonner.
      </p>

      {toutesJustes ? (
        <div style={{ textAlign: "center", padding: "32px 24px" }}>
          <span className="ms" style={{ fontSize: 48, color: VERT }}>check_circle</span>
          <p style={{ fontWeight: 800, fontSize: 20, color: VERT, marginTop: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Tout est bien rangé !
          </p>
          <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginTop: 6 }}>
            {nbJustesPremiere}/{series.length} du premier coup
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {series.map((serie, i) => {
            const etat = etats[i];
            const complet = etat.places.length === serie.elements.length;
            const fini = etat.statut === "juste";
            return (
              <div
                key={i}
                style={{
                  padding: "16px 18px", borderRadius: 16,
                  background: fini ? "rgba(22,163,74,0.06)" : "white",
                  border: `1.5px solid ${fini ? "rgba(22,163,74,0.35)" : etat.statut === "faux" ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.12)"}`,
                  opacity: fini ? 0.8 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)" }}>
                    Série {i + 1}
                  </span>
                  {fini && <span className="ms" style={{ fontSize: 18, color: VERT }}>check</span>}
                  {etat.statut === "faux" && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: ROUGE }}>
                      Pas tout à fait — reprends la série
                    </span>
                  )}
                </div>

                {/* Ligne de rangement : gauche → droite */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  minHeight: 56, padding: "8px 10px", borderRadius: 12,
                  background: "rgba(0,0,0,0.03)",
                  border: "1.5px dashed rgba(0,0,0,0.12)",
                  marginBottom: 12,
                }}>
                  {etat.places.length === 0 && (
                    <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", opacity: 0.7 }}>
                      Pose ici les étiquettes, de gauche à droite
                    </span>
                  )}
                  {etat.places.map((element, pos) => (
                    <button
                      key={`${element}-${pos}`}
                      type="button"
                      draggable={!fini}
                      onDragStart={() => setDragIdx({ serie: i, pos })}
                      onDragOver={(e) => { if (dragIdx?.serie === i) e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx?.serie === i) deplacer(i, dragIdx.pos, pos);
                        setDragIdx(null);
                      }}
                      onDragEnd={() => setDragIdx(null)}
                      onClick={() => !fini && retirer(i, pos)}
                      disabled={fini}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "10px 14px", borderRadius: 10,
                        border: `2px solid ${fini ? VERT : BLEU}`,
                        background: fini ? "rgba(22,163,74,0.1)" : "rgba(37,99,235,0.08)",
                        color: fini ? VERT : BLEU,
                        fontSize: 15, fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        cursor: fini ? "default" : "grab",
                      }}
                    >
                      <span style={{ fontSize: 11, opacity: 0.6 }}>{pos + 1}</span>
                      {serie.elements[element]}
                    </button>
                  ))}
                </div>

                {/* Réserve d'étiquettes mélangées */}
                {etat.reserve.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {etat.reserve.map((element) => (
                      <button
                        key={element}
                        type="button"
                        onClick={() => poser(i, element)}
                        style={{
                          padding: "10px 14px", borderRadius: 10,
                          border: "2px solid rgba(0,0,0,0.15)", background: "white",
                          fontSize: 15, fontWeight: 700,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          color: "var(--pb-on-surface)", cursor: "pointer",
                        }}
                      >
                        {serie.elements[element]}
                      </button>
                    ))}
                  </div>
                )}

                {!fini && (
                  <button
                    type="button"
                    onClick={() => validerSerie(i)}
                    disabled={!complet}
                    className="pb-btn primary"
                    style={{
                      width: "100%", padding: "12px 20px", fontSize: 15,
                      fontWeight: 700, borderRadius: 999,
                      opacity: complet ? 1 : 0.5,
                      cursor: complet ? "pointer" : "not-allowed",
                    }}
                  >
                    {complet ? "Vérifier cette série" : "Place toutes les étiquettes"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
