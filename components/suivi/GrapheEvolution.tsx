"use client";

import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Infobulle, Legende } from "./Carte";
import { AXE_PROPS, GRILLE_PROPS, SERIES, jourMois, pct } from "./theme-charts";

export interface LigneSemaine {
  lundi: string;
  completionPct: number | null;
  reussitePct: number | null;
}

const C_COMPLETION = SERIES[0];
const C_REUSSITE = SERIES[1];

/**
 * Huit semaines de complétion et de réussite.
 *
 * Les deux séries sont des pourcentages : **un seul axe**. Superposer deux
 * échelles inventerait une corrélation qui n'est pas dans les données.
 */
export default function GrapheEvolution({ donnees }: { donnees: LigneSemaine[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={donnees} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRILLE_PROPS} />
          <XAxis dataKey="lundi" tickFormatter={jourMois} {...AXE_PROPS} axisLine={{ stroke: AXE_PROPS.stroke }} />
          <YAxis {...AXE_PROPS} axisLine={false} domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" width={46} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as LigneSemaine;
              return (
                <Infobulle
                  titre={`Semaine du ${new Date(d.lundi + "T12:00:00").toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long",
                  })}`}
                  lignes={[
                    { libelle: "Complétion", valeur: pct(d.completionPct), couleur: C_COMPLETION },
                    { libelle: "Réussite au 1er essai", valeur: pct(d.reussitePct), couleur: C_REUSSITE },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone" dataKey="completionPct" name="Complétion"
            stroke={C_COMPLETION} strokeWidth={2} strokeLinecap="round"
            dot={{ r: 4, fill: C_COMPLETION, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            connectNulls isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="reussitePct" name="Réussite"
            stroke={C_REUSSITE} strokeWidth={2} strokeLinecap="round"
            dot={{ r: 4, fill: C_REUSSITE, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            connectNulls isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <Legende
        items={[
          { libelle: "Complétion", couleur: C_COMPLETION },
          { libelle: "Réussite au 1er essai", couleur: C_REUSSITE },
        ]}
      />
    </>
  );
}
