"use client";

import FigureGeo, { type Figure } from "@/components/FigureGeo";

/**
 * Banc d'essai des figures — les douze cas de contrôle de
 * docs/ceintures/SPEC-FIGURES.md, à vérifier à l'œil une fois, sur mobile
 * comme sur grand écran, en clair comme en sombre.
 *
 * Trois points sur lesquels un rendu se rate, et qui se voient ici :
 *  • à 3 h 25 la petite aiguille est aux deux cinquièmes entre 3 et 4 ;
 *  • les 60 graduations sont présentes, les cinq-minutes plus longues ;
 *  • l'origine du polygone est en bas à gauche, l'axe des y monte.
 */

const CAS: { titre: string; note: string; figure: Figure }[] = [
  // ── Cadrans ───────────────────────────────────────────────────────────
  {
    titre: "3 h 25",
    note: "la petite aiguille est aux deux cinquièmes entre 3 et 4, pas sur le 3",
    figure: { type: "cadran", heures: 3, minutes: 25 },
  },
  {
    titre: "8 h 45, sans chiffres",
    note: "cas des ceintures hautes : seules les graduations guident",
    figure: { type: "cadran", heures: 8, minutes: 45, chiffres: false },
  },
  {
    titre: "12 h 10",
    note: "la petite aiguille a quitté le 12 d'un sixième d'intervalle",
    figure: { type: "cadran", heures: 12, minutes: 10 },
  },
  {
    titre: "6 h 00",
    note: "aiguilles alignées : la courte est pile sur le 6",
    figure: { type: "cadran", heures: 6, minutes: 0 },
  },
  // ── Angles ────────────────────────────────────────────────────────────
  {
    titre: "Angle droit",
    note: "petit carré, jamais un arc",
    figure: { type: "angle", degres: 90, nom: "A" },
  },
  {
    titre: "Angle aigu, 40°",
    note: "arc, et la mesure n'est pas écrite",
    figure: { type: "angle", degres: 40, nom: "B" },
  },
  {
    titre: "Angle obtus, 130°",
    note: "arc, sommet en bas à gauche, un côté horizontal",
    figure: { type: "angle", degres: 130, nom: "C" },
  },
  // ── Polygones ─────────────────────────────────────────────────────────
  {
    titre: "Carré codé sur quadrillage",
    note: "quatre angles droits, quatre côtés à un trait",
    figure: {
      type: "polygone",
      grille: { colonnes: 8, lignes: 6 },
      polygones: [{
        sommets: [[1, 1], [5, 1], [5, 5], [1, 5]],
        nom: "ABCD",
        angles_droits: [0, 1, 2, 3],
        cotes_egaux: [[0, 1], [1, 1], [2, 1], [3, 1]],
      }],
    },
  },
  {
    titre: "Rectangle, deux paires de côtés égaux",
    note: "un trait pour la longueur, deux pour la largeur",
    figure: {
      type: "polygone",
      grille: { colonnes: 9, lignes: 6 },
      polygones: [{
        sommets: [[1, 1], [7, 1], [7, 4], [1, 4]],
        nom: "EFGH",
        angles_droits: [0, 1, 2, 3],
        cotes_egaux: [[0, 1], [2, 1], [1, 2], [3, 2]],
      }],
    },
  },
  {
    titre: "Triangle rectangle, sans quadrillage",
    note: "papier uni : la clé grille est absente",
    figure: {
      type: "polygone",
      polygones: [{
        sommets: [[1, 1], [6, 1], [1, 5]],
        nom: "IJK",
        angles_droits: [0],
      }],
    },
  },
  {
    titre: "Pentagone quelconque",
    note: "aucun codage, tracé seul",
    figure: {
      type: "polygone",
      grille: { colonnes: 8, lignes: 7 },
      polygones: [{ sommets: [[1, 1], [6, 2], [7, 5], [4, 6], [1, 4]], nom: "LMNOP" }],
    },
  },
  {
    titre: "Deux droites parallèles et un point",
    note: "segments libres, point nommé, origine en bas à gauche",
    figure: {
      type: "polygone",
      grille: { colonnes: 9, lignes: 6 },
      segments: [
        { de: [0, 1], a: [8, 3], nom: "d1" },
        { de: [0, 3], a: [8, 5], nom: "d2" },
      ],
      points: [{ at: [5, 2], nom: "M" }],
    },
  },
  {
    titre: "Axe de symétrie sur quadrillage",
    note: "l'axe est en pointillé, la figure n'est pas remplie",
    figure: {
      type: "polygone",
      grille: { colonnes: 9, lignes: 7 },
      polygones: [{ sommets: [[1, 1], [4, 1], [4, 5], [1, 5]], plein: false }],
      segments: [{ de: [2.5, 0], a: [2.5, 6], pointille: true, nom: "a" }],
    },
  },
];

export default function BancFiguresPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <h1 style={{
        fontSize: 24, fontWeight: 800, margin: "0 0 6px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        Figures — banc d&apos;essai
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 8px" }}>
        Les douze cas de contrôle de <code>SPEC-FIGURES.md</code>. Réduis la
        fenêtre pour vérifier le rendu sur mobile.
      </p>
      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: "0 0 28px" }}>
        À regarder en premier : la petite aiguille de <strong>3 h 25</strong>, les
        60 graduations de <strong>8 h 45 sans chiffres</strong>, et l&apos;origine
        en bas à gauche des polygones.
      </p>

      <div style={{
        display: "grid", gap: 20,
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      }}>
        {CAS.map((cas, i) => (
          <div key={i} className="pb-card" style={{ padding: "16px 18px" }}>
            <div style={{
              fontSize: 15, fontWeight: 800, marginBottom: 2,
              fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
            }}>
              {cas.titre}
            </div>
            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 10 }}>
              {cas.note}
            </div>
            <FigureGeo figure={cas.figure} />
          </div>
        ))}
      </div>
    </div>
  );
}
