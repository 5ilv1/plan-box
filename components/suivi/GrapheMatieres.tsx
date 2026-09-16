"use client";

import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Infobulle, Legende } from "./Carte";
import {
  AXE_PROPS, BOUT_BARRE_H, ENCRE_DOUCE, ETAT, GRILLE_PROPS, HUE, HUE_PALE, NON_CLASSE_LIBELLE,
  etiquettePct, pct,
} from "./theme-charts";

export interface LigneMatiere {
  matiere: string;
  sousDomaine: string;
  nbBlocs: number;
  pctPremier: number | null;
  pctFinal: number | null;
  secondesParQuestion: number | null;
  nbBacles: number;
}

/**
 * Réussite par sous-domaine : premier essai contre score final.
 *
 * Deux nuances d'une même teinte plutôt que deux couleurs : ce n'est pas une
 * comparaison d'identités, c'est un avant/après sur la même chose.
 *
 * **Le premier essai est la valeur qui compte.** Après correction tout le monde
 * finit haut ; c'est la première tentative qui dit si la leçon est passée. Un
 * écart large entre les deux barres signale un élève qui corrige au jugé.
 */
export default function GrapheMatieres({ donnees }: { donnees: LigneMatiere[] }) {
  const retenues = donnees.filter((d) => d.pctPremier !== null || d.pctFinal !== null);

  // « Exercices » peut exister en français ET en maths : on préfixe par la
  // matière les seuls sous-domaines qui apparaissent plusieurs fois, sinon
  // deux lignes de l'axe porteraient le même nom.
  const occurrences = new Map<string, number>();
  for (const d of retenues) occurrences.set(d.sousDomaine, (occurrences.get(d.sousDomaine) ?? 0) + 1);

  const lignes = retenues
    .map((d) => ({
      ...d,
      libelle: (occurrences.get(d.sousDomaine) ?? 0) > 1
        ? `${d.matiere} · ${d.sousDomaine}`
        : d.sousDomaine,
    }))
    .sort((a, b) => (a.pctPremier ?? 101) - (b.pctPremier ?? 101));

  if (lignes.length === 0) {
    return (
      <p style={{ padding: "24px 8px", textAlign: "center", fontSize: 13, color: ENCRE_DOUCE }}>
        Aucun travail noté sur cette période.
      </p>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(180, lignes.length * 46 + 30)}>
        <BarChart data={lignes} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }}>
          <CartesianGrid {...GRILLE_PROPS} horizontal={false} vertical />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]} unit=" %" {...AXE_PROPS} axisLine={false} />
          <YAxis type="category" dataKey="libelle" width={128} {...AXE_PROPS} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as LigneMatiere;
              return (
                <Infobulle
                  titre={`${d.matiere} · ${d.sousDomaine}`}
                  lignes={[
                    { libelle: "1er essai", valeur: pct(d.pctPremier), couleur: HUE },
                    { libelle: "Après correction", valeur: pct(d.pctFinal), couleur: HUE_PALE },
                    { libelle: "Travaux", valeur: String(d.nbBlocs) },
                    ...(d.secondesParQuestion !== null
                      ? [{ libelle: "Rythme", valeur: `${d.secondesParQuestion} s / question` }]
                      : []),
                    ...(d.nbBacles > 0
                      ? [{ libelle: "Travaux expédiés", valeur: String(d.nbBacles) }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="pctPremier" fill={HUE} radius={BOUT_BARRE_H} barSize={13} isAnimationActive={false}>
            <LabelList
              dataKey="pctPremier"
              position="right"
              offset={8}
              formatter={etiquettePct}
              style={{ fill: "#282b51", fontSize: 11, fontWeight: 700 }}
            />
          </Bar>
          <Bar dataKey="pctFinal" fill={HUE_PALE} radius={BOUT_BARRE_H} barSize={13} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>

      <Legende
        items={[
          { libelle: "Réussite au 1er essai", couleur: HUE },
          { libelle: "Après correction", couleur: HUE_PALE },
        ]}
      />

      <TableauRythme lignes={lignes} />
    </>
  );
}

/**
 * Le rythme, en toutes lettres.
 *
 * Le seul indicateur de travail expédié qui tienne : un rythme éclair **et** un
 * score bas. Une durée courte seule ne prouve rien — un bon élève va vite.
 */
function TableauRythme({ lignes }: { lignes: LigneMatiere[] }) {
  const chronometrees = lignes.filter((l) => l.secondesParQuestion !== null);
  if (chronometrees.length === 0) {
    return (
      <p style={{ margin: "14px 0 0", fontSize: 12, color: ENCRE_DOUCE }}>
        Le rythme de travail apparaîtra ici dès que les élèves auront fait des exercices
        depuis la mise en place du chronomètre.
      </p>
    );
  }

  const suspectes = chronometrees.filter((l) => l.nbBacles > 0);
  if (suspectes.length === 0) {
    return (
      <p style={{ margin: "14px 0 0", fontSize: 12, color: ENCRE_DOUCE, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="ms" style={{ fontSize: 16, color: ETAT.bon }} aria-hidden>check_circle</span>
        Aucun travail expédié repéré sur cette période.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
      {suspectes.map((l) => (
        <p
          key={`${l.matiere}|${l.sousDomaine}`}
          style={{ margin: 0, fontSize: 12, color: "var(--pb-on-surface)", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span className="ms" style={{ fontSize: 16, color: ETAT.serieux }} aria-hidden>bolt</span>
          <strong>{l.sousDomaine === NON_CLASSE_LIBELLE ? "Non classé" : l.sousDomaine}</strong>
          <span style={{ color: ENCRE_DOUCE }}>
            {l.nbBacles} {l.nbBacles > 1 ? "travaux expédiés" : "travail expédié"} ·{" "}
            {l.secondesParQuestion} s par question en moyenne
          </span>
        </p>
      ))}
    </div>
  );
}
