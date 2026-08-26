"use client";

import DroiteGraduee, { type Droite } from "@/components/DroiteGraduee";

/**
 * Banc d'essai des droites graduées — les cinq cas de contrôle de
 * docs/ceintures/SPEC-DROITE-GRADUEE.md, à vérifier à l'œil une fois, sur
 * mobile comme sur grand écran.
 *
 * Page enseignant, hors du parcours élève.
 */

const CAS: { titre: string; reglages: string; droite: Droite }[] = [
  {
    titre: "Entiers, repères tous les 10",
    reglages: 'origine 0, pas 10, intervalles 10, etiquettes "bornes"',
    droite: { origine: 0, pas: 10, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 70, nom: "A" }] },
  },
  {
    titre: "Dizaines avec subdivisions",
    reglages: "origine 0, pas 10, intervalles 5, divisions 10",
    droite: { origine: 0, pas: 10, intervalles: 5, divisions: 10 },
  },
  {
    titre: "Fractions quarts",
    reglages: "origine 0, pas 1, intervalles 2, divisions 4, fraction { denominateur: 4 }",
    droite: {
      origine: 0, pas: 1, intervalles: 2, divisions: 4,
      fraction: { denominateur: 4 },
      etiquettes: "toutes",
      points: [{ valeur: 1.25, nom: "?" }],
    },
  },
  {
    titre: "Décimaux au dixième",
    reglages: 'origine 3, pas 0.1, intervalles 10, etiquettes "bornes"',
    droite: { origine: 3, pas: 0.1, intervalles: 10, etiquettes: "bornes", points: [{ valeur: 3.4, nom: "B" }] },
  },
  {
    titre: "Encadrement",
    reglages: "origine 0, pas 100, intervalles 10, zones [{ de: 300, a: 400 }]",
    droite: { origine: 0, pas: 100, intervalles: 10, etiquettes: "bornes", zones: [{ de: 300, a: 400 }] },
  },
];

export default function BancDroitesPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <h1 style={{
        fontSize: 24, fontWeight: 800, margin: "0 0 6px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        Droites graduées — banc d&apos;essai
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 28px" }}>
        Les cinq cas de contrôle de <code>SPEC-DROITE-GRADUEE.md</code>. Réduis la
        fenêtre pour vérifier le rendu sur mobile.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {CAS.map((cas, i) => (
          <div key={i} className="pb-card" style={{ padding: "18px 20px" }}>
            <div style={{
              fontSize: 15, fontWeight: 800, marginBottom: 2,
              fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
            }}>
              {cas.titre}
            </div>
            <div style={{
              fontSize: 12, color: "var(--pb-on-surface-variant)",
              marginBottom: 14, fontFamily: "monospace",
            }}>
              {cas.reglages}
            </div>
            <DroiteGraduee droite={cas.droite} />
          </div>
        ))}
      </div>
    </div>
  );
}
