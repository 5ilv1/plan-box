"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

type PeriodeSem = 4 | 8 | 12;

interface Kpis {
  nbExercices: number;
  tauxReussite: number;
  scoreMoyen: number;
  nbPremierCoup: number;
  nbMultiTentatives: number;
}

interface ScoreMatiere {
  matiere: string;
  score: number;
  nbExercices: number;
}

interface BilanData {
  kpis: Kpis;
  progressionHebdo: Record<string, number | null | string>[];
  matieres: string[];
  semaines: string[];
  scoreParMatiere: ScoreMatiere[];
  pointsForts: ScoreMatiere[];
  pointsFaibles: ScoreMatiere[];
}

const MATIERE_COLORS = [
  "#2563EB", "#7C3AED", "#0891B2", "#059669",
  "#D97706", "#DC2626", "#9333EA", "#065F46",
];

const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";

export default function PageBilanEleve() {
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();
  const [periodes, setPeriodes] = useState<PeriodeSem>(8);
  const [data, setData] = useState<BilanData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }
    charger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, periodes]);

  async function charger() {
    setChargement(true);
    setErreur("");
    try {
      const params = new URLSearchParams({ semaines: String(periodes) });
      if (session!.source === "planbox") params.set("eleveId", session!.id);
      else params.set("eleveRbId", session!.id);

      const res = await fetch(`/api/mon-bilan?${params}`);
      if (!res.ok) throw new Error("Erreur serveur");
      const json = await res.json();
      setData(json);
    } catch {
      setErreur("Impossible de charger ton bilan.");
    }
    setChargement(false);
  }

  // ── SVG line chart ──
  const chartData = useMemo(() => {
    if (!data || !data.progressionHebdo.length) return null;
    const W = 620;
    const H = 160;
    const n = data.semaines.length;
    const xStep = n > 1 ? W / (n - 1) : W;

    return data.matieres.map((m, mi) => {
      const color = MATIERE_COLORS[mi % MATIERE_COLORS.length];
      const points = data.progressionHebdo.map((row, i) => {
        const val = row[m] as number | null;
        const x = n > 1 ? (i / (n - 1)) * W : W / 2;
        const y = val !== null ? H - (val / 100) * H : null;
        return { x, y, val };
      });

      // Polyline points (skip nulls)
      const validPoints = points.filter(p => p.y !== null);
      if (validPoints.length < 2) return null;

      const polylinePoints = validPoints.map(p => `${p.x.toFixed(1)},${p.y!.toFixed(1)}`).join(" ");
      const polygonPoints = [
        ...validPoints.map(p => `${p.x.toFixed(1)},${p.y!.toFixed(1)}`),
        `${validPoints[validPoints.length - 1].x.toFixed(1)},${H}`,
        `${validPoints[0].x.toFixed(1)},${H}`,
      ].join(" ");

      return { m, color, points, polylinePoints, polygonPoints, validPoints };
    }).filter(Boolean);
  }, [data]);

  const prenom = session?.prenom ?? "toi";

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "1rem",
    padding: "20px 22px",
    border: "1px solid var(--pb-surface-container)",
    boxShadow: "0 1px 3px rgba(0,0,212,0.05)",
  };

  return (
    <div className="eleve-page">
      {/* Nav */}
      <nav className="eleve-nav">
        <div className="eleve-nav-inner">
          <Link href="/eleve/dashboard" className="eleve-nav-logo" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
            Plan Box
          </Link>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)" }}>Mon bilan</span>
          <div />
        </div>
      </nav>

      <main className="eleve-main" style={{ maxWidth: 900, margin: "0 auto", padding: "88px 16px 120px" }}>

        {chargement ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--pb-on-surface-variant)" }}>Chargement…</div>
        ) : erreur ? (
          <div style={{ textAlign: "center", padding: 40, color: "#DC2626" }}>{erreur}</div>
        ) : data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* ── Hero banner ── */}
            <div style={{
              borderRadius: "1.5rem",
              padding: "28px 32px",
              background: "linear-gradient(135deg, #0050D4 0%, #7C3AED 100%)",
              color: "white",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 24,
              alignItems: "center",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Déco */}
              <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.07)", top: -100, right: 220 }} />
              <div style={{ position: "absolute", width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.07)", bottom: -60, right: 100 }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {data.kpis.tauxReussite >= 80 ? `Bravo ${prenom} ! 🎉` : `Continue comme ça ${prenom} ! 💪`}
                </h2>
                <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 20 }}>
                  Voici tes résultats des {periodes} dernières semaines.
                </p>
                <div style={{ display: "flex", gap: 24 }}>
                  {[
                    { val: data.kpis.nbExercices, label: "exercices faits" },
                    { val: `${data.kpis.tauxReussite}%`, label: "taux de réussite" },
                    { val: data.kpis.nbPremierCoup, label: "réussis du 1er coup" },
                  ].map(k => (
                    <div key={k.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{k.val}</div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sélecteur de période */}
              <div style={{
                position: "relative", zIndex: 1,
                background: "rgba(255,255,255,0.12)",
                borderRadius: "1.25rem",
                padding: "18px 24px",
                textAlign: "center",
                minWidth: 140,
                backdropFilter: "blur(4px)",
              }}>
                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8, fontWeight: 600 }}>Période</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {([4, 8, 12] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriodes(p)}
                      style={{
                        padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: `1.5px solid ${periodes === p ? "white" : "rgba(255,255,255,0.3)"}`,
                        background: periodes === p ? "white" : "transparent",
                        color: periodes === p ? "#0050D4" : "white",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {p} sem.
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Graphique progression ── */}
            {data.progressionHebdo.length >= 2 && chartData && chartData.length > 0 && (
              <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="ms" style={{ fontSize: 18, color: "var(--pb-primary)" }}>trending_up</span>
                      Progression par matière
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>Score moyen sur {periodes} semaines</div>
                  </div>
                </div>

                {/* Légende */}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                  {data.matieres.map((m, mi) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface-variant)" }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: MATIERE_COLORS[mi % MATIERE_COLORS.length], flexShrink: 0 }} />
                      {m}
                    </div>
                  ))}
                </div>

                {/* SVG Chart */}
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", width: 24 }}>
                    {["100", "75", "50", "25", "0"].map(l => (
                      <span key={l} style={{ fontSize: 10, color: "#ccc", textAlign: "right", paddingRight: 4 }}>{l}</span>
                    ))}
                  </div>
                  <div style={{ marginLeft: 28 }}>
                    <svg viewBox="0 0 620 160" style={{ width: "100%", height: 160, display: "block" }}>
                      {/* Grille */}
                      {[0, 40, 80, 120, 160].map(y => (
                        <line key={y} x1="0" y1={y} x2="620" y2={y} stroke="#F3F4F6" strokeWidth="1" />
                      ))}
                      {/* Seuil 80% */}
                      <line x1="0" y1="32" x2="620" y2="32" stroke="#DCFCE7" strokeWidth="1.5" strokeDasharray="4 3" />
                      <text x="2" y="29" fontSize="8" fill="#16A34A" fontFamily="'Plus Jakarta Sans',sans-serif">80%</text>

                      {/* Courbes */}
                      {chartData.map(c => c && (
                        <g key={c.m}>
                          <polygon points={c.polygonPoints} fill={c.color} opacity="0.06" />
                          <polyline points={c.polylinePoints} fill="none" stroke={c.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          {c.validPoints.map((p, pi) => (
                            <circle
                              key={pi}
                              cx={p.x}
                              cy={p.y!}
                              r={pi === c.validPoints.length - 1 ? 5 : 4}
                              fill={pi === c.validPoints.length - 1 ? c.color : "white"}
                              stroke={c.color}
                              strokeWidth="2.5"
                            />
                          ))}
                        </g>
                      ))}
                    </svg>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginLeft: 28, marginTop: 4 }}>
                    {data.semaines.map(s => (
                      <span key={s} style={{ fontSize: 10, color: "var(--pb-on-surface-variant)", textAlign: "center", flex: 1 }}>
                        {s.replace(/\d{4}-W/, "S")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Ligne 2 : Scores par matière + Donut ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Scores par matière */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="ms" style={{ fontSize: 18, color: "#F59E0B" }}>school</span>
                  Score par matière
                </div>
                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 18 }}>Sur les {periodes} dernières semaines</div>
                {data.scoreParMatiere.length === 0 ? (
                  <p style={{ color: "var(--pb-on-surface-variant)", fontSize: 13 }}>Pas encore de données.</p>
                ) : data.scoreParMatiere.map((m, mi) => (
                  <div key={m.matiere} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface)", width: 86, flexShrink: 0 }}>{m.matiere}</div>
                    <div style={{ flex: 1, height: 8, background: "var(--pb-surface-container)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 999, width: `${m.score}%`, background: `linear-gradient(90deg, ${MATIERE_COLORS[(mi + 1) % MATIERE_COLORS.length]}88, ${MATIERE_COLORS[mi % MATIERE_COLORS.length]})` }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor(m.score), width: 32, textAlign: "right" }}>{m.score}%</div>
                  </div>
                ))}
              </div>

              {/* Donut 1er coup vs plusieurs */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="ms" style={{ fontSize: 18, color: "var(--pb-secondary)" }}>donut_large</span>
                  Réussite du 1er coup
                </div>
                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 18 }}>
                  {data.kpis.nbPremierCoup} exercices réussis du premier coup
                </div>
                {data.kpis.nbExercices === 0 ? (
                  <p style={{ color: "var(--pb-on-surface-variant)", fontSize: 13 }}>Pas encore de données.</p>
                ) : (() => {
                  const total = data.kpis.nbExercices;
                  const premier = data.kpis.nbPremierCoup;
                  const multi = data.kpis.nbMultiTentatives;
                  const nonReussi = total - premier - multi;
                  const pctPremier = Math.round((premier / total) * 100);
                  const pctMulti = Math.round((multi / total) * 100);

                  // SVG Donut
                  const R = 52;
                  const cx = 60;
                  const cy = 60;
                  const circ = 2 * Math.PI * R;
                  const segments = [
                    { pct: pctPremier, color: "#16A34A" },
                    { pct: pctMulti, color: "#D97706" },
                    { pct: Math.max(0, 100 - pctPremier - pctMulti), color: "#E5E7EB" },
                  ];

                  let offset = 0;
                  const paths = segments.map((s, i) => {
                    const dashArray = `${(s.pct / 100) * circ} ${circ}`;
                    const dashOffset = -offset * circ / 100;
                    offset += s.pct;
                    return { ...s, dashArray, dashOffset };
                  });

                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        {paths.map((p, i) => (
                          <circle
                            key={i}
                            cx={cx} cy={cy} r={R}
                            fill="none"
                            stroke={p.color}
                            strokeWidth="16"
                            strokeDasharray={p.dashArray}
                            strokeDashoffset={p.dashOffset}
                            transform="rotate(-90 60 60)"
                          />
                        ))}
                        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fontWeight="900" fill="#111" fontFamily="'Plus Jakarta Sans',sans-serif">{pctPremier}%</text>
                        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#6B7280" fontFamily="'Plus Jakarta Sans',sans-serif">1er coup</text>
                      </svg>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                        {[
                          { label: "Réussi du 1er coup", count: premier, color: "#16A34A" },
                          { label: "Après plusieurs essais", count: multi, color: "#D97706" },
                          { label: "Non encore réussi", count: nonReussi, color: "#E5E7EB" },
                        ].map(l => (
                          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface)", flex: 1 }}>{l.label}</span>
                            <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontWeight: 700 }}>{l.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Points forts / à travailler ── */}
            {(data.pointsForts.length > 0 || data.pointsFaibles.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Points forts */}
                <div style={{ borderRadius: "0.875rem", padding: 16, background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span className="ms" style={{ fontSize: 16 }}>star</span>
                    Mes points forts
                  </div>
                  {data.pointsForts.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Continue à pratiquer !</div>
                  ) : data.pointsForts.map(m => (
                    <div key={m.matiere} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "0.625rem", marginBottom: 6, background: "#DCFCE7", color: "#15803D" }}>
                      <span className="ms" style={{ fontSize: 16 }}>check_circle</span>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{m.matiere}</span>
                      <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 700 }}>{m.score}%</span>
                    </div>
                  ))}
                </div>

                {/* Points à travailler */}
                <div style={{ borderRadius: "0.875rem", padding: 16, background: "#FFFBEB", border: "1.5px solid #FDE68A" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span className="ms" style={{ fontSize: 16 }}>fitness_center</span>
                    À travailler
                  </div>
                  {data.pointsFaibles.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Rien à signaler !</div>
                  ) : data.pointsFaibles.map(m => (
                    <div key={m.matiere} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "0.625rem", marginBottom: 6, background: "#FEF3C7", color: "#92400E" }}>
                      <span className="ms" style={{ fontSize: 16 }}>trending_up</span>
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{m.matiere}</span>
                      <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 700 }}>{m.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA retour tableau de bord */}
            <Link href="/eleve/dashboard" className="pb-btn primary" style={{ alignSelf: "center", padding: "12px 32px" }}>
              <span className="ms" style={{ fontSize: 18 }}>home</span>
              Retour au tableau de bord
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
