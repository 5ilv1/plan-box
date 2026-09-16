"use client";

import { ENCRE, ENCRE_DOUCE, ETAT, GRIS_MARQUE, HUE, POLICE } from "./theme-charts";

/**
 * Un chiffre et son évolution. Pas un graphique à une barre : quand la donnée
 * est un nombre, le nombre est la visualisation.
 */
export function KpiTuile({
  libelle,
  valeur,
  unite = "%",
  detail,
  delta,
  serie,
  sensBon = "haut",
}: {
  libelle: string;
  valeur: number | null;
  unite?: string;
  detail?: string;
  /** Écart avec la période précédente, en points. */
  delta?: number | null;
  /** Suite de valeurs pour la courbe de rappel. */
  serie?: Array<number | null>;
  sensBon?: "haut" | "bas";
}) {
  const bon = delta == null ? null : sensBon === "haut" ? delta > 0 : delta < 0;
  const couleurDelta = delta == null || delta === 0 ? ENCRE_DOUCE : bon ? ETAT.bon : ETAT.critique;

  return (
    <div
      style={{
        background: "var(--pb-surface-lowest)",
        border: "1px solid var(--pb-outline-variant)",
        borderRadius: 20,
        padding: "16px 18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: ENCRE_DOUCE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {libelle}
      </p>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 40 }}>
        <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: ENCRE, fontFamily: POLICE }}>
          {valeur === null ? "—" : valeur}
          {valeur !== null && <span style={{ fontSize: 16, fontWeight: 700, color: ENCRE_DOUCE }}>{unite}</span>}
        </span>
        {serie && serie.some((v) => v !== null) && <Courbe serie={serie} />}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: ENCRE_DOUCE, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {detail && <span>{detail}</span>}
        {delta != null && delta !== 0 && (
          <span style={{ color: couleurDelta, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {/* L'icône double la couleur : le signe reste lisible sans elle. */}
            <span className="ms" style={{ fontSize: 14 }} aria-hidden>
              {delta > 0 ? "arrow_upward" : "arrow_downward"}
            </span>
            {delta > 0 ? "+" : ""}{delta} pt
          </span>
        )}
      </p>
    </div>
  );
}

/** Courbe de rappel : la forme, pas les valeurs — aucun axe, aucune étiquette. */
function Courbe({ serie }: { serie: Array<number | null> }) {
  const points = serie.map((v, i) => ({ i, v }));
  const valeurs = points.filter((p) => p.v !== null) as Array<{ i: number; v: number }>;
  if (valeurs.length < 2) return null;

  const l = 68, h = 24;
  const min = Math.min(...valeurs.map((p) => p.v));
  const max = Math.max(...valeurs.map((p) => p.v));
  const etendue = max - min || 1;
  const x = (i: number) => (i / Math.max(1, serie.length - 1)) * l;
  const y = (v: number) => h - ((v - min) / etendue) * (h - 4) - 2;

  const d = valeurs.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dernier = valeurs[valeurs.length - 1];

  return (
    <svg width={l} height={h} style={{ marginBottom: 4, flexShrink: 0 }} aria-hidden>
      <path d={d} fill="none" stroke={GRIS_MARQUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(dernier.i)} cy={y(dernier.v)} r={3.5} fill={HUE} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
