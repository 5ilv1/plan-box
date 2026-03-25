"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface LigneClassement {
  prenom: string;
  nom: string;
  score: number;
  total: number;
  created_at: string;
}

const MEDAILLES = ["🥇", "🥈", "🥉"];
const COULEURS_PODIUM = ["#F59E0B", "#94A3B8", "#D97706"];
const BG_PODIUM = ["#FEF3C7", "#F1F5F9", "#FEF9F0"];

export default function PageQCMClassement() {
  const { qcm_id } = useParams<{ qcm_id: string }>();
  const [classement, setClassement] = useState<LigneClassement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    fetch(`/api/qcm-reponse?qcm_id=${qcm_id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.erreur) setErreur(json.erreur);
        else setClassement(json.classement ?? []);
      })
      .catch(() => setErreur("Impossible de charger le classement."))
      .finally(() => setChargement(false));
  }, [qcm_id]);

  // Rafraîchir toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/qcm-reponse?qcm_id=${qcm_id}`)
        .then((r) => r.json())
        .then((json) => { if (!json.erreur) setClassement(json.classement ?? []); })
        .catch(() => null);
    }, 30_000);
    return () => clearInterval(interval);
  }, [qcm_id]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
      {/* Header */}
      <header className="header">
        <Link href="/eleve/dashboard" className="btn-ghost" style={{ padding: "6px 10px" }}>←</Link>
        <span className="header-logo">🏆 Classement</span>
        <div />
      </header>

      <div className="page">
        <div className="container" style={{ maxWidth: 560 }}>

          {/* Titre */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", marginBottom: 4 }}>
              Classement du quiz
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Qui a le mieux compris le podcast ?
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
                Sois le premier à répondre au quiz !
              </p>
            </div>
          )}

          {!chargement && classement.length > 0 && (
            <>
              {/* Podium (top 3) */}
              {classement.length >= 1 && (
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
                      score={classement[1].score}
                      total={classement[1].total}
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
                    score={classement[0].score}
                    total={classement[0].total}
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
                      score={classement[2].score}
                      total={classement[2].total}
                      hauteur={70}
                      medaille={MEDAILLES[2]}
                      couleur={COULEURS_PODIUM[2]}
                      bg={BG_PODIUM[2]}
                    />
                  )}
                </div>
              )}

              {/* Liste complète */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {classement.map((ligne, i) => {
                  const pct = ligne.total > 0 ? Math.round((ligne.score / ligne.total) * 100) : 0;
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

                      {/* Nom */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                          {ligne.prenom} {ligne.nom}
                        </div>
                        {/* Barre de progression */}
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 999, marginTop: 5, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: pct === 100 ? "#16A34A" : pct >= 70 ? "#2563EB" : "#F59E0B",
                            borderRadius: 999,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                      </div>

                      {/* Score */}
                      <div style={{
                        textAlign: "right",
                        flexShrink: 0,
                      }}>
                        <div style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: podium ? COULEURS_PODIUM[i] : "var(--text)",
                        }}>
                          {ligne.score}/{ligne.total}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                          {pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Note mise à jour */}
              <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", marginTop: 16 }}>
                🔄 Mis à jour automatiquement toutes les 30 secondes
              </p>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 24 }}>
            <Link
              href="/eleve/qcm-classement/global"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                borderRadius: 8,
                background: "#FEF3C7",
                color: "#92400E",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                border: "1.5px solid #FCD34D",
              }}
            >
              🏅 Voir le classement général
            </Link>
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
  rang, nom, score, total, hauteur, medaille, couleur, bg,
}: {
  rang: number; nom: string; score: number; total: number; hauteur: number;
  medaille: string; couleur: string; bg: string;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Badge médaille */}
      <div style={{ fontSize: 26 }}>{medaille}</div>
      {/* Nom */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: "var(--text)",
        textAlign: "center", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {nom}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: couleur }}>{score}/{total}</div>
      {/* Colonne podium */}
      <div style={{
        width: "100%",
        height: hauteur,
        background: bg,
        border: `2px solid ${couleur}55`,
        borderRadius: "8px 8px 0 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        fontWeight: 900,
        color: couleur,
      }}>
        {pct}%
      </div>
    </div>
  );
}
