"use client";

import { useState, useCallback } from "react";
import { MotDict } from "@/types";

interface Props {
  mots: MotDict[];
  theme: string;
  onTermine: () => void;
}

function lireMot(mot: string, pronom?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const texteALire = pronom ? `${pronom} ${mot}` : mot;
  const u = new SpeechSynthesisUtterance(texteALire);
  u.lang = "fr-FR";
  u.rate = 0.8;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export default function DicteeMotsEleve({ mots, theme, onTermine }: Props) {
  const [phase, setPhase] = useState<"lecture" | "dictee" | "termine">("lecture");
  const [indexMot, setIndexMot] = useState(0);
  const [lu, setLu] = useState(false); // l'élève a-t-il écouté le mot courant ?

  const motCourant = mots[indexMot];
  const total = mots.length;
  const estDernier = indexMot === total - 1;

  const passerSuivant = useCallback(() => {
    if (estDernier) {
      setPhase("termine");
      onTermine();
    } else {
      setIndexMot((i) => i + 1);
      setLu(false);
    }
  }, [estDernier, onTermine]);

  // ── Phase : terminé ──────────────────────────────────────────────────────────
  if (phase === "termine") {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Dictée terminée !
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Tu as écouté et écrit les {total} mots de la semaine. Bravo !
        </p>
      </div>
    );
  }

  // ── Phase 2 : dictée vocale ──────────────────────────────────────────────────
  if (phase === "dictee") {
    return (
      <div style={{ padding: "4px 0" }}>
        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span className="ms" style={{ fontSize: 22, color: "#7C3AED" }}>record_voice_over</span>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Dictée des mots
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, marginTop: 2 }}>
              Écoute chaque mot et écris-le dans ton cahier
            </p>
          </div>
        </div>

        {/* Barre de progression */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            <span>Mot {indexMot + 1} sur {total}</span>
            <span>{indexMot}/{total} écrits</span>
          </div>
          <div style={{ height: 6, background: "var(--border, #E5E7EB)", borderRadius: 999 }}>
            <div style={{
              height: "100%", borderRadius: 999, background: "#7C3AED",
              width: `${(indexMot / total) * 100}%`, transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Carte du mot (masquée) */}
        <div style={{
          background: "#F5F3FF",
          border: "2px solid #DDD6FE",
          borderRadius: 20,
          padding: "40px 24px",
          textAlign: "center",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, color: "#7C3AED", fontWeight: 700, marginBottom: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Mot {indexMot + 1}
          </div>

          {/* Bouton écouter */}
          <button
            onClick={() => { lireMot(motCourant.mot, motCourant.pronom); setLu(true); }}
            style={{
              width: 88, height: 88, borderRadius: "50%",
              background: lu ? "#7C3AED" : "white",
              border: `3px solid ${lu ? "#7C3AED" : "#DDD6FE"}`,
              cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: lu ? "0 4px 20px rgba(124,58,237,0.35)" : "0 2px 8px rgba(0,0,0,0.08)",
              transition: "all 0.2s",
              marginBottom: 12,
            }}
            title="Écouter le mot"
          >
            <span className="ms" style={{ fontSize: 40, color: lu ? "white" : "#7C3AED" }}>
              {lu ? "volume_up" : "play_circle"}
            </span>
          </button>

          <div style={{ fontSize: 13, color: lu ? "#7C3AED" : "var(--text-secondary)", fontWeight: 600 }}>
            {lu ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <span className="ms" style={{ fontSize: 14 }}>replay</span>
                Réécouter
              </span>
            ) : "Appuie pour écouter le mot"}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={passerSuivant}
            disabled={!lu}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: lu ? "#7C3AED" : "var(--border, #E5E7EB)",
              color: lu ? "white" : "var(--text-secondary)",
              border: "none", cursor: lu ? "pointer" : "default",
              fontWeight: 700, fontSize: 15,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>
              {estDernier ? "check_circle" : "arrow_forward"}
            </span>
            {estDernier ? "J'ai écrit le dernier mot !" : "J'ai écrit ce mot →"}
          </button>

          {lu && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "#F0FDF4", border: "1px solid #BBF7D0",
              fontSize: 12, color: "#166534", textAlign: "center",
            }}>
              💡 Indice : {motCourant.definition}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase 1 : lecture des mots ───────────────────────────────────────────────
  return (
    <div style={{ padding: "4px 0" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="ms" style={{ fontSize: 22, color: "#D97706" }}>spellcheck</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Mots de la semaine
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          Lis attentivement chaque mot et sa définition. Essaie de les retenir !
        </p>
      </div>

      {/* Compteur */}
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="ms" style={{ fontSize: 16 }}>format_list_numbered</span>
        <span><strong>{mots.length}</strong> mot{mots.length > 1 ? "s" : ""} à apprendre</span>
      </div>

      {/* Grille de mots */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12, marginBottom: 28,
      }}>
        {mots.map((m, i) => (
          <div key={i} style={{
            background: "white", border: "1px solid var(--border, #E5E7EB)",
            borderRadius: 12, padding: "16px 18px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: 0.5, lineHeight: 1.3 }}>
              {m.pronom && (
                <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 16, marginRight: 4 }}>
                  {m.pronom}
                </span>
              )}
              {m.mot}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, fontStyle: "italic" }}>
              {m.definition}
            </div>
          </div>
        ))}
      </div>

      {/* Bouton passer à la dictée */}
      <div style={{ textAlign: "center" }}>
        <button
          className="btn-primary"
          onClick={() => { setPhase("dictee"); setIndexMot(0); setLu(false); }}
          style={{
            fontSize: 15, padding: "12px 28px", borderRadius: 10,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>record_voice_over</span>
          Je connais les mots → Passer à la dictée
        </button>
      </div>
    </div>
  );
}
