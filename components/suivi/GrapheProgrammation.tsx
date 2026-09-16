"use client";

import { TYPE_BLOC_CONFIG } from "@/types";
import type { TypeBloc } from "@/types";
import { ENCRE, ENCRE_DOUCE, SERIES, SURFACE } from "./theme-charts";

export interface Part { cle: string; nb: number; pct: number }

/**
 * Ce que l'enseignant a donné, et en quelle proportion.
 *
 * Une stat sur soi, pas sur les élèves : est-ce que je donne trop de maths et
 * pas assez d'écriture ? Barre empilée horizontale plutôt qu'un camembert —
 * des parts voisines s'y comparent, dans un disque non.
 *
 * Un écart de 2 px en couleur de surface sépare les segments ; aucun contour
 * n'est dessiné, le blanc fait la séparation.
 */
export default function GrapheProgrammation({
  matieres,
  types,
}: {
  matieres: Part[];
  types: Part[];
}) {
  if (matieres.length === 0) {
    return (
      <p style={{ padding: "24px 8px", textAlign: "center", fontSize: 13, color: ENCRE_DOUCE }}>
        Aucun travail donné sur cette période.
      </p>
    );
  }

  // Au-delà de cinq matières, la queue part dans « Autres » : jamais une
  // sixième teinte inventée.
  const visibles = matieres.slice(0, 5);
  const reste = matieres.slice(5);
  const parts = reste.length
    ? [...visibles, {
        cle: "Autres",
        nb: reste.reduce((s, m) => s + m.nb, 0),
        pct: reste.reduce((s, m) => s + m.pct, 0),
      }]
    : visibles;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ display: "flex", gap: 2, height: 22, borderRadius: 6, overflow: "hidden", background: SURFACE }}>
          {parts.map((p, i) => (
            <div
              key={p.cle}
              title={`${p.cle} — ${p.nb} travaux (${p.pct} %)`}
              style={{ width: `${p.pct}%`, background: SERIES[i % SERIES.length], minWidth: 2 }}
            />
          ))}
        </div>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
          {parts.map((p, i) => (
            <li key={p.cle} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES[i % SERIES.length], flexShrink: 0 }} />
              <span style={{ color: ENCRE }}>{p.cle}</span>
              <span style={{ marginLeft: "auto", color: ENCRE_DOUCE, fontVariantNumeric: "tabular-nums" }}>
                {p.nb} {p.nb > 1 ? "travaux" : "travail"} · <strong style={{ color: ENCRE }}>{p.pct} %</strong>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: ENCRE_DOUCE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Par type d&apos;activité
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {types.slice(0, 8).map((t) => {
            const conf = TYPE_BLOC_CONFIG[t.cle as TypeBloc];
            return (
              <li key={t.cle} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span className="ms" style={{ fontSize: 16, color: ENCRE_DOUCE, flexShrink: 0 }} aria-hidden>
                  {conf?.icone ?? "task"}
                </span>
                <span style={{ color: ENCRE, minWidth: 0, flexShrink: 0 }}>{conf?.libelle ?? t.cle}</span>
                <span style={{ flex: 1, height: 6, background: "var(--pb-surface-container)", borderRadius: 999, minWidth: 30 }}>
                  <span style={{ display: "block", width: `${t.pct}%`, height: "100%", background: SERIES[0], borderRadius: 999 }} />
                </span>
                <span style={{ color: ENCRE_DOUCE, fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>
                  {t.nb}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
