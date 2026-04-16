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

const PODIUM_CONFIG = [
  { rang: 2, hauteurSocle: 80,  couleur: "#94A3B8", bg: "linear-gradient(160deg,#CBD5E1,#94A3B8)", label: "2ème", emoji: "🥈", taille: 60 },
  { rang: 1, hauteurSocle: 130, couleur: "#F59E0B", bg: "linear-gradient(160deg,#FDE68A,#F59E0B)", label: "1er",  emoji: "🥇", taille: 76 },
  { rang: 3, hauteurSocle: 56,  couleur: "#D97706", bg: "linear-gradient(160deg,#FDE68A,#D97706)", label: "3ème", emoji: "🥉", taille: 54 },
];

function initiales(prenom: string) {
  return prenom ? prenom.slice(0, 2).toUpperCase() : "?";
}

function Avatar({ prenom, size, couleur }: { prenom: string; size: number; couleur: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: couleur,
      border: "4px solid white",
      boxShadow: `0 4px 16px ${couleur}88`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 900, color: "white",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      flexShrink: 0,
    }}>
      {initiales(prenom)}
    </div>
  );
}

export default function PageClassementGlobal() {
  const [classement, setClassement] = useState<LigneGlobale[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = () =>
    fetch("/api/qcm-reponse?global=true")
      .then((r) => r.json())
      .then((json) => { setClassement(json.classement ?? []); setChargement(false); })
      .catch(() => setChargement(false));

  useEffect(() => { charger(); }, []);

  useEffect(() => {
    const t = setInterval(charger, 30_000);
    return () => clearInterval(t);
  }, []);

  // Ordre podium : 2 - 1 - 3
  const podiumEleves = [classement[1], classement[0], classement[2]];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #1E1B4B 0%, #312E81 40%, #1E1B4B 100%)" }}>
      <style>{`
        @keyframes floatUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        .podium-item { animation: floatUp 0.6s ease both; }
        .podium-item:nth-child(1) { animation-delay: 0.1s; }
        .podium-item:nth-child(2) { animation-delay: 0s; }
        .podium-item:nth-child(3) { animation-delay: 0.2s; }
        .classement-item { animation: floatUp 0.4s ease both; }
        .star { animation: shimmer 2s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px",
      }}>
        <Link href="/eleve/dashboard" style={{
          display: "flex", alignItems: "center", gap: 6,
          color: "rgba(255,255,255,0.7)", textDecoration: "none",
          fontSize: 14, fontWeight: 600,
        }}>
          <span style={{ fontSize: 20 }}>←</span>
          Retour
        </Link>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
          🔄 Mis à jour en direct
        </div>
      </header>

      {/* Titre */}
      <div style={{ textAlign: "center", padding: "8px 20px 0", animation: "floatUp 0.5s ease" }}>
        <div style={{ fontSize: 52, marginBottom: 4 }}>🏆</div>
        <h1 style={{
          fontSize: 28, fontWeight: 900, color: "white",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
          marginBottom: 4,
        }}>
          Classement Podcasts
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
          Scores cumulés sur tous les podcasts
        </p>
      </div>

      {chargement && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.2)", borderTopColor: "#F59E0B", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Chargement…</p>
        </div>
      )}

      {!chargement && classement.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <p style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Pas encore de résultats</p>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Réponds à un podcast pour apparaître ici !</p>
        </div>
      )}

      {!chargement && classement.length > 0 && (
        <>
          {/* ══ PODIUM ══ */}
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 0,
            padding: "32px 16px 0",
            maxWidth: 480,
            margin: "0 auto",
          }}>
            {PODIUM_CONFIG.map((cfg, idx) => {
              const eleve = podiumEleves[idx];
              if (!eleve && cfg.rang > classement.length) return (
                <div key={cfg.rang} style={{ flex: 1 }} />
              );

              return (
                <div
                  key={cfg.rang}
                  className="podium-item"
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {/* Avatar + infos au-dessus du socle */}
                  {eleve && (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 4, marginBottom: 10, paddingBottom: 4,
                    }}>
                      <div style={{ fontSize: cfg.rang === 1 ? 36 : 28, lineHeight: 1, marginBottom: 4, animation: cfg.rang === 1 ? "pulse 2s ease infinite" : "none" }}>
                        {cfg.emoji}
                      </div>
                      <Avatar prenom={eleve.prenom} size={cfg.taille} couleur={cfg.couleur} />
                      <div style={{
                        fontSize: cfg.rang === 1 ? 15 : 13,
                        fontWeight: 800, color: "white",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        textAlign: "center",
                        maxWidth: 90,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textShadow: "0 1px 6px rgba(0,0,0,0.4)",
                        marginTop: 2,
                      }}>
                        {eleve.prenom}
                      </div>
                      <div style={{
                        fontSize: cfg.rang === 1 ? 20 : 16,
                        fontWeight: 900,
                        color: cfg.couleur,
                        textShadow: `0 2px 8px ${cfg.couleur}88`,
                      }}>
                        {eleve.pct}%
                      </div>
                    </div>
                  )}

                  {/* Socle du podium */}
                  <div style={{
                    width: "100%",
                    height: cfg.hauteurSocle,
                    background: cfg.bg,
                    borderRadius: cfg.rang === 1 ? "16px 16px 0 0" : cfg.rang === 2 ? "12px 12px 0 0" : "10px 10px 0 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    boxShadow: `0 -4px 20px ${cfg.couleur}55, inset 0 2px 0 rgba(255,255,255,0.3)`,
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Reflet */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, height: "40%",
                      background: "rgba(255,255,255,0.15)",
                      borderRadius: "inherit",
                    }} />
                    <span style={{ fontSize: cfg.rang === 1 ? 28 : 22, fontWeight: 900, color: "white", textShadow: "0 2px 4px rgba(0,0,0,0.3)", zIndex: 1 }}>
                      {cfg.rang}
                    </span>
                    {eleve && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)", zIndex: 1 }}>
                        {eleve.score_total} pts
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ligne de base du podium */}
          <div style={{
            height: 8,
            background: "linear-gradient(90deg, #1E1B4B, #4338CA, #7C3AED, #4338CA, #1E1B4B)",
            maxWidth: 480,
            margin: "0 auto",
            boxShadow: "0 4px 20px rgba(99,60,219,0.5)",
          }} />

          {/* ══ LISTE COMPLÈTE ══ */}
          {classement.length > 3 && (
            <div style={{ padding: "32px 16px 40px", maxWidth: 480, margin: "0 auto" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, textAlign: "center" }}>
                Classement complet
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {classement.slice(3).map((ligne, i) => {
                  const rang = i + 4;
                  return (
                    <div
                      key={i}
                      className="classement-item"
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 16px",
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        animationDelay: `${i * 0.05}s`,
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(255,255,255,0.1)",
                        fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)",
                      }}>
                        {rang}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "white" }}>
                          {ligne.prenom} {ligne.nom}
                        </div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 999, marginTop: 5, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${ligne.pct}%`,
                            background: ligne.pct >= 70 ? "#34D399" : "#F59E0B",
                            borderRadius: 999,
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                          {ligne.nb_qcm} podcast{ligne.nb_qcm > 1 ? "s" : ""} · {ligne.score_total} pts
                        </div>
                      </div>

                      <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.8)" }}>
                        {ligne.pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {classement.length <= 3 && (
            <div style={{ height: 40 }} />
          )}
        </>
      )}
    </div>
  );
}
