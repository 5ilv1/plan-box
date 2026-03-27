"use client";

import { useState } from "react";
import { NiveauDict, PhraseDict } from "@/types";
import { phrasesCommunes } from "@/lib/dictee-utils";

const LABELS: Record<number, string> = { 1: "⭐ CE2", 2: "⭐⭐ CM1", 3: "⭐⭐⭐ CM2", 4: "⭐⭐⭐⭐ CM2+" };

interface Props {
  niveaux: NiveauDict[];
  chargement: boolean;
  onValider: () => void;
  onRegenerer: () => void;
  onModifierNiveaux?: (niveaux: NiveauDict[]) => void;
}

export default function DicteePreview({ niveaux, chargement, onValider, onRegenerer, onModifierNiveaux }: Props) {
  const [onglet, setOnglet] = useState<1 | 2 | 3 | 4>(1);
  // id de la phrase en cours d'édition (null = aucune)
  const [phraseEnEdition, setPhraseEnEdition] = useState<{ etoiles: number; id: number } | null>(null);
  const [texteEdite, setTexteEdite] = useState("");

  const niveauActif = niveaux.find((n) => n.etoiles === onglet) ?? niveaux[0];
  const niveauInferieur = niveaux.find((n) => n.etoiles === onglet - 1);
  const communsIds = niveauInferieur
    ? phrasesCommunes(niveauActif.phrases, niveauInferieur.phrases)
    : new Set<number>();
  const motsNiveauInferieur = new Set(niveauInferieur?.mots.map((m) => m.mot) ?? []);

  function commencerEdition(etoiles: number, phrase: PhraseDict) {
    setPhraseEnEdition({ etoiles, id: phrase.id });
    setTexteEdite(phrase.texte);
  }

  function confirmerEdition() {
    if (!phraseEnEdition || !onModifierNiveaux) { setPhraseEnEdition(null); return; }
    const nouveauxNiveaux = niveaux.map((n) => {
      if (n.etoiles !== phraseEnEdition.etoiles) return n;
      const nouvellesPhrases = n.phrases.map((p) =>
        p.id === phraseEnEdition.id ? { ...p, texte: texteEdite.trim() } : p
      );
      // Reconstruire le texte complet à partir des phrases modifiées
      const nouveauTexte = nouvellesPhrases.map((p) => p.texte).join(" ");
      return { ...n, phrases: nouvellesPhrases, texte: nouveauTexte };
    });
    onModifierNiveaux(nouveauxNiveaux);
    setPhraseEnEdition(null);
  }

  function annulerEdition() {
    setPhraseEnEdition(null);
  }

  const enEditionIci = (etoiles: number, id: number) =>
    phraseEnEdition?.etoiles === etoiles && phraseEnEdition?.id === id;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🎧 Aperçu des dictées</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={onRegenerer} disabled={chargement} style={{ fontSize: 13 }}>
            🔄 Régénérer
          </button>
          <button
            className="btn-primary"
            onClick={onValider}
            disabled={chargement}
            style={{ fontSize: 13 }}
          >
            {chargement ? "⏳ Planification…" : "✅ Valider et planifier"}
          </button>
        </div>
      </div>

      {/* Onglets niveaux */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
        {niveaux.map((n) => (
          <button
            key={n.etoiles}
            type="button"
            onClick={() => setOnglet(n.etoiles as 1 | 2 | 3 | 4)}
            style={{
              padding: "8px 16px", fontSize: 13, cursor: "pointer",
              fontWeight: onglet === n.etoiles ? 700 : 500,
              background: "none", border: "none",
              borderBottom: onglet === n.etoiles ? "2px solid var(--primary)" : "2px solid transparent",
              color: onglet === n.etoiles ? "var(--primary)" : "var(--text-secondary)",
              marginBottom: -2,
            }}
          >
            {LABELS[n.etoiles]}
          </button>
        ))}
      </div>

      {/* Contenu du niveau actif */}
      {niveauActif && (
        <div>
          {/* Phrases */}
          <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              TEXTE DE LA DICTÉE
              {onglet > 1 && (
                <span style={{ fontSize: 11, fontWeight: 400 }}>
                  — <span style={{ background: "#D1FAE5", padding: "1px 6px", borderRadius: 4 }}>Fond vert</span> = phrases identiques au niveau inférieur
                </span>
              )}
              {onModifierNiveaux && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-secondary)", marginLeft: "auto" }}>
                  ✏️ Cliquez sur une phrase pour la modifier
                </span>
              )}
            </div>
            {niveauActif.phrases.map((p) => {
              const commune = communsIds.has(p.id);
              const enEdition = enEditionIci(onglet, p.id);
              return (
                <div key={p.id} style={{ marginBottom: 6 }}>
                  {enEdition ? (
                    /* ── Mode édition ── */
                    <div style={{ border: "2px solid var(--primary)", borderRadius: 8, overflow: "hidden" }}>
                      <textarea
                        autoFocus
                        value={texteEdite}
                        onChange={(e) => setTexteEdite(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmerEdition(); } if (e.key === "Escape") annulerEdition(); }}
                        rows={2}
                        style={{
                          width: "100%", padding: "8px 12px", fontSize: 14, lineHeight: 1.6,
                          border: "none", outline: "none", resize: "vertical",
                          fontFamily: "inherit", background: "#EFF6FF",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, padding: "6px 10px", background: "#EFF6FF", borderTop: "1px solid #BFDBFE" }}>
                        <button
                          onClick={confirmerEdition}
                          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, background: "var(--primary)", color: "white", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          ✓ Confirmer
                        </button>
                        <button
                          onClick={annulerEdition}
                          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, background: "none", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer" }}
                        >
                          Annuler
                        </button>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", alignSelf: "center", marginLeft: 4 }}>Entrée pour valider · Échap pour annuler</span>
                      </div>
                    </div>
                  ) : (
                    /* ── Mode lecture ── */
                    <div
                      onClick={() => onModifierNiveaux && commencerEdition(onglet, p)}
                      style={{
                        padding: "8px 12px", borderRadius: 6, fontSize: 14, lineHeight: 1.6,
                        background: commune ? "#D1FAE5" : "var(--bg)",
                        border: `1px solid ${commune ? "#6EE7B7" : "var(--border)"}`,
                        cursor: onModifierNiveaux ? "text" : "default",
                        display: "flex", alignItems: "baseline", gap: 6,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { if (onModifierNiveaux) (e.currentTarget as HTMLDivElement).style.background = commune ? "#A7F3D0" : "#F0F9FF"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = commune ? "#D1FAE5" : "var(--bg)"; }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 12, flexShrink: 0 }}>{p.id}.</span>
                      <span style={{ flex: 1 }}>{p.texte}</span>
                      {commune && (
                        <span style={{ fontSize: 10, color: "#065F46", fontWeight: 700, flexShrink: 0 }}>= niveau inférieur</span>
                      )}
                      {onModifierNiveaux && (
                        <span style={{ fontSize: 11, color: "#93C5FD", flexShrink: 0 }}>✏️</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mots à apprendre */}
          <div className="card" style={{ marginBottom: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
              MOTS À APPRENDRE ({niveauActif.mots.length} mots)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {niveauActif.mots.map((m) => {
                const nouveau = !motsNiveauInferieur.has(m.mot);
                return (
                  <div key={m.mot} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    {nouveau && onglet > 1 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, background: "#FEF3C7", color: "#92400E",
                        padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      }}>
                        nouveau ✦
                      </span>
                    )}
                    <span style={{ fontWeight: 700 }}>{m.mot}</span>
                    <span style={{ color: "var(--text-secondary)" }}>— {m.definition}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Points travaillés */}
          {(niveauActif.points_travailles ?? []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(niveauActif.points_travailles ?? []).map((pt) => (
                <span key={pt} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 20,
                  background: "#EDE9FE", color: "#5B21B6", fontWeight: 600,
                }}>
                  {pt}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
