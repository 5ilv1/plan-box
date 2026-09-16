"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Infobulle } from "./Carte";
import {
  AXE_PROPS, BOUT_BARRE, ENCRE_DOUCE, EPAISSEUR_BARRE, GRILLE_PROPS, GRIS_MARQUE, HUE,
  couleurNiveau, etiquettePct, jourCourt, pct,
} from "./theme-charts";

interface LigneNiveau { niveau: string; faits: number; total: number; pct: number | null }
interface LigneJour { date: string; faits: number; total: number; pct: number | null; aVenir: boolean }

/**
 * Complétion par niveau.
 *
 * Trois colonnes, une par niveau, chacune avec sa teinte fixe. La valeur est
 * écrite sur la colonne : deux des trois teintes passent sous 3:1 sur fond
 * blanc, et le contrôle de contraste impose alors une étiquette visible.
 */
export function GrapheNiveaux({ donnees }: { donnees: LigneNiveau[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={donnees} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRILLE_PROPS} />
        <XAxis dataKey="niveau" {...AXE_PROPS} axisLine={{ stroke: AXE_PROPS.stroke }} />
        <YAxis {...AXE_PROPS} axisLine={false} domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" width={46} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as LigneNiveau;
            return (
              <Infobulle
                titre={d.niveau}
                lignes={[
                  { libelle: "Complétion", valeur: pct(d.pct), couleur: couleurNiveau(d.niveau) },
                  { libelle: "Travaux faits", valeur: `${d.faits} / ${d.total}` },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="pct"
          radius={BOUT_BARRE}
          maxBarSize={EPAISSEUR_BARRE}
          isAnimationActive={false}
          minPointSize={2}
        >
          {donnees.map((d) => (
            <Cell key={d.niveau} fill={couleurNiveau(d.niveau)} />
          ))}
          <LabelList
            dataKey="pct"
            position="top"
            offset={8}
            formatter={etiquettePct}
            style={{ fill: "#282b51", fontSize: 11, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Complétion jour par jour sur la période.
 *
 * Une seule série, donc une seule teinte : la hauteur dit déjà la grandeur,
 * teinter chaque colonne selon sa valeur gaspillerait le seul canal libre.
 *
 * Trois cas à ne pas confondre, et c'est le piège de ce graphe : une journée
 * **sans travail donné** (grise), une journée **encore à venir** (pâle, le
 * travail n'est pas dû), et une journée **à 0 %** (travail donné, rien fait).
 * Le fond de piste rend cette dernière visible malgré sa hauteur nulle.
 */
export function GrapheParJour({ donnees }: { donnees: LigneJour[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={donnees} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRILLE_PROPS} />
        <XAxis dataKey="date" tickFormatter={jourCourt} {...AXE_PROPS} axisLine={{ stroke: AXE_PROPS.stroke }} />
        <YAxis {...AXE_PROPS} axisLine={false} domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" width={46} />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as LigneJour;
            return (
              <Infobulle
                titre={new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
                lignes={
                  d.total === 0
                    ? [{ libelle: "Aucun travail donné", valeur: "—" }]
                    : [
                        { libelle: d.aVenir ? "Pas encore dû" : "Complétion", valeur: pct(d.pct), couleur: d.aVenir ? GRIS_MARQUE : HUE },
                        { libelle: "Travaux faits", valeur: `${d.faits} / ${d.total}` },
                      ]
                }
              />
            );
          }}
        />
        <Bar
          dataKey="pct"
          radius={BOUT_BARRE}
          maxBarSize={EPAISSEUR_BARRE}
          isAnimationActive={false}
          minPointSize={2}
          background={{ fill: "#F4F5FA", radius: 4 }}
        >
          {donnees.map((d) => (
            <Cell key={d.date} fill={d.total === 0 || d.aVenir ? GRIS_MARQUE : HUE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
