"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LigneGlobale {
  prenom: string;
  nom: string;
  score_total: number;
  questions_total: number;
  nb_qcm: number;
  pct: number;
}

const MEDAILLES = ["🥇", "🥈", "🥉"];
const COULEURS_PODIUM = ["#F59E0B", "#94A3B8", "#D97706"];
const BG_PODIUM = ["#FEF3C7", "#F1F5F9", "#FEF9F0"];

export default function PageClassementGlobal() {
  const [classement, setClassement] = useState<LigneGlobale[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    fetch("/api/qcm-reponse?global=true")
      .then((r) => r.json())
      .then((json) => {
        if (json.erreur) setErreur(json.erreur);
        else setClassement(json.classement ?? []);
      })
      .catch(() => setErreur("Impossible de charger le classement."))
      .finally(() => setChargement(false));
  }, []);

  // Rafraîchir toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/qcm-reponse?global=true")
        .then((r) => r.json())
        .then((json) => { if (!json.erreur) setClassement(json.classement ?? []); })
        .catch(() => null);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Header */}
      <header className="header">
        <Link href="/eleve/dashboard" className="btn-ghost" style={{ padding: "6px 10px" }}>←</Link>
        <span className="header-logo">🏆 Classement général</span>
        <div />
      </header>

      <div className="page">
        <div className="container" style={{ maxWidth: 600 }}>

          {/* Titre */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", marginBottom: 4 }}>
              Classement général
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Scores cumulés sur tous les podcasts depuis le début
            </p>
          </div>

          {chargement && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--primary-mid)", borderTopColor: "var(--primary)", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              Chargement…
            </div>
          )}

          {erreur && (
            <div style={{ padding: "14px 16px", background: "#FEE2E2", borderRadius: 10, color: "#DC2626", fontWeight: 600 }}>
              {erreur}
            </div>
          )}

          {!chargement && !erreur && classement.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
              <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Pas encore de réponses
              </p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Réponds à un podcast pour apparaître dans le classement !
              </p>
            </div>
          )}

          {!chargement && classement.length > 0 && (
            <>
              {/* Podium (top 3) */}
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 10,
                marginBottom: 24,
              }}>
                {/* 2ème */}
                {classement[1] && (
                  <PodiumCase
                    rang={2}
                    nom={classement[1].prenom}
                    score={classement[1].score_total}
                    total={classement[1].questions_total}
                    nbQcm={classement[1].nb_qcm}
                    pct={classement[1].pct}
                    hauteur={90}
                    medaille={MEDAILLES[1]}
                    couleur={COULEURS_PODIUM[1]}
                    bg={BG_PODIUM[1]}
                  />
                )}
                {/* 1er */}
                <PodiumCase
                  rang={1}
                  nom={classement[0].prenom}
                  score={classement[0].score_total}
                  total={classement[0].questions_total}
                  nbQcm={classement[0].nb_qcm}
                  pct={classement[0].pct}
                  hauteur={120}
                  medaille={MEDAILLES[0]}
                  couleur={COULEURS_PODIUM[0]}
                  bg={BG_PODIUM[0]}
                />
                {/* 3ème */}
                {classement[2] && (
                  <PodiumCase
                    rang={3}
                    nom={classement[2].prenom}
                    score={classement[2].score_total}
                    total={classement[2].questions_total}
                    nbQcm={classement[2].nb_qcm}
                    pct={classement[2].pct}
                    hauteur={70}
                    medaille={MEDAILLES[2]}
                    couleur={COULEURS_PODIUM[2]}
                    bg={BG_PODIUM[2]}
                  />
                )}
              </div>

              {/* Liste complète */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {classement.map((ligne, i) => {
                  const podium = i < 3;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderRadius: 12,
                        background: podium ? BG_PODIUM[i] : "white",
                        border: `1.5px solid ${podium ? COULEURS_PODIUM[i] + "55" : "var(--border)"}`,
                        boxShadow: podium ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      {/* Rang */}
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: podium ? COULEURS_PODIUM[i] : "var(--bg)",
                        fontSize: podium ? 18 : 13,
                        fontWeight: 800,
                        color: podium ? "white" : "var(--text-secondary)",
                      }}>
                        {podium ? MEDAILLES[i] : i + 1}
                      </div>

                      {/* Nom + barre */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                          {ligne.prenom} {ligne.nom}
                        </div>
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 999, marginTop: 5, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${ligne.pct}%`,
                            background: ligne.pct === 100 ? "#16A34A" : ligne.pct >= 70 ? "#2563EB" : "#F59E0B",
                            borderRadius: 999,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                          {ligne.nb_qcm} podcast{ligne.nb_qcm > 1 ? "s" : ""} · {ligne.score_total}/{ligne.questions_total} questions
                        </div>
                      </div>

                      {/* Score */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color: podium ? COULEURS_PODIUM[i] : "var(--text)",
                        }}>
                          {ligne.pct}%
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                          {ligne.score_total} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", marginTop: 16 }}>
                🔄 Mis à jour automatiquement toutes les 30 secondes
              </p>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <Link href="/eleve/dashboard" className="btn-ghost" style={{ fontSize: 13 }}>
              ← Retour au tableau de bord
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PodiumCase({
  nom, score, total, nbQcm, pct, hauteur, medaille, couleur, bg,
}: {
  rang: number; nom: string; score: number; total: number; nbQcm: number; pct: number;
  hauteur: number; medaille: string; couleur: string; bg: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ fontSize: 26 }}>{medaille}</div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: "var(--text)",
        textAlign: "center", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {nom}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: couleur }}>{score} pts</div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{nbQcm} podcast{nbQcm > 1 ? "s" : ""}</div>
      <div style={{
        width: "100%", height: hauteur,
        background: bg, border: `2px solid ${couleur}55`,
        borderRadius: "8px 8px 0 0",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: couleur,
      }}>
        {pct}%
      </div>
    </div>
  );
}
