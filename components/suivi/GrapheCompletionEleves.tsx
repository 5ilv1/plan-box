"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Infobulle } from "./Carte";
import {
  AXE_PROPS, BOUT_BARRE_H, GRILLE_PROPS, POLICE, couleurNiveau, etiquettePct, pct,
} from "./theme-charts";

export interface LigneEleve {
  uid: string;
  prenom: string;
  nom: string;
  niveau: string;
  jour: { faits: number; total: number; pct: number | null };
  semaine: { faits: number; total: number; pct: number | null };
  periode: { faits: number; total: number; pct: number | null };
  retards: number;
  reussite: number | null;
  baclages: number;
}

/**
 * Complétion par élève, du plus en retard au plus avancé.
 *
 * Trié à l'envers exprès : ceux qu'il faut regarder sont en haut. La couleur
 * porte le **niveau**, pas la performance — un élève garde sa teinte quel que
 * soit son score, sinon on relirait la longueur de la barre deux fois.
 *
 * Un clic sur une barre bascule la page sur cet élève.
 */
export default function GrapheCompletionEleves({
  donnees,
  cle = "periode",
  onSelection,
}: {
  donnees: LigneEleve[];
  cle?: "jour" | "semaine" | "periode";
  onSelection?: (uid: string) => void;
}) {
  const lignes = donnees
    .filter((e) => e[cle].total > 0)
    .map((e) => ({ ...e, valeur: e[cle].pct ?? 0 }))
    .sort((a, b) => a.valeur - b.valeur || a.prenom.localeCompare(b.prenom, "fr"));

  if (lignes.length === 0) {
    return (
      <p style={{ padding: "24px 8px", textAlign: "center", fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
        Aucun travail donné sur cette période.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, lignes.length * 28 + 40)}>
      <BarChart data={lignes} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
        <CartesianGrid {...GRILLE_PROPS} horizontal={false} vertical />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" {...AXE_PROPS} axisLine={false} />
        <YAxis
          type="category"
          dataKey="prenom"
          width={92}
          {...AXE_PROPS}
          axisLine={false}
          tick={{ ...AXE_PROPS.tick, fontFamily: POLICE }}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.03)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as LigneEleve & { valeur: number };
            return (
              <Infobulle
                titre={`${d.prenom} ${d.nom} · ${d.niveau}`}
                lignes={[
                  { libelle: "Complétion", valeur: pct(d[cle].pct), couleur: couleurNiveau(d.niveau) },
                  { libelle: "Travaux faits", valeur: `${d[cle].faits} / ${d[cle].total}` },
                  { libelle: "Réussite au 1er essai", valeur: pct(d.reussite) },
                  ...(d.retards > 0 ? [{ libelle: "En retard", valeur: String(d.retards) }] : []),
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="valeur"
          radius={BOUT_BARRE_H}
          barSize={16}
          isAnimationActive={false}
          minPointSize={2}
          background={{ fill: "#F4F5FA", radius: 4 }}
          cursor={onSelection ? "pointer" : undefined}
          onClick={(d: unknown) => onSelection?.((d as { uid: string }).uid)}
        >
          {lignes.map((e) => (
            <Cell key={e.uid} fill={couleurNiveau(e.niveau)} />
          ))}
          <LabelList
            dataKey="valeur"
            position="right"
            offset={8}
            formatter={etiquettePct}
            style={{ fill: "#282b51", fontSize: 11, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
