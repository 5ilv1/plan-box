"use client";

/**
 * Figures dessinées en SVG inline : cadran à aiguilles, angle, polygone sur
 * quadrillage.
 *
 * Contrat : docs/ceintures/SPEC-FIGURES.md.
 * Rendu porté de docs/ceintures/figures-reference.js, déjà validé à l'œil —
 * les proportions, rayons et épaisseurs viennent de là et ne sont pas à
 * réinventer.
 *
 * Déclarée par une clé optionnelle `figure` sur une question — il n'y a pas de
 * type d'exercice « figure », pour que `creerMiniExercices()` continue de
 * recopier les questions telles quelles et que la figure survive à
 * l'évaluation sans une ligne de code de plus. Même patron que DroiteGraduee.
 *
 * Le trait de la figure est en `currentColor`, le codage (aiguille des heures,
 * arc, angle droit, traits d'égalité, points) en `var(--belt)` : l'élève doit
 * voir que la marque n'est pas un trait de la figure.
 */

export interface FigureCadran {
  type: "cadran";
  heures: number;
  minutes?: number;
  /** `false` retire les chiffres et ne laisse que les graduations. */
  chiffres?: boolean;
}

export interface FigureAngle {
  type: "angle";
  degres: number;
  /** Lettre du sommet, écrite à côté. */
  nom?: string;
}

export interface PolygoneFigure {
  /** Coordonnées en cases du quadrillage, dans l'ordre du tracé. */
  sommets: [number, number][];
  /** « ABCD » — une lettre par sommet. */
  nom?: string;
  noms?: string[];
  /** Indices des sommets à marquer du petit carré. */
  angles_droits?: number[];
  /** `[[indice_du_côté, nb_de_traits], …]` — le côté `i` va du sommet `i` au suivant. */
  cotes_egaux?: [number, number][];
  plein?: boolean;
}

export interface SegmentFigure {
  de: [number, number];
  a: [number, number];
  pointille?: boolean;
  nom?: string;
}

export interface PointFigure {
  at: [number, number];
  nom?: string;
}

export interface CercleFigure {
  centre: [number, number];
  rayon: number;
  pointille?: boolean;
  plein?: boolean;
  nom?: string;
}

export interface FigurePolygone {
  type: "polygone";
  /** Omettre la clé retire le quadrillage (papier uni). */
  grille?: { colonnes: number; lignes: number };
  polygones?: PolygoneFigure[];
  segments?: SegmentFigure[];
  points?: PointFigure[];
  cercles?: CercleFigure[];
}

export type Figure = FigureCadran | FigureAngle | FigurePolygone;

/** Couleur du codage. `--belt` suit la ceinture, avec un repli lisible. */
const CODAGE = "var(--belt, #c0392b)";

// ── Cadran ──────────────────────────────────────────────────────────────────

function Cadran({ figure }: { figure: FigureCadran }) {
  const h = Number(figure.heures) % 12;
  const m = Number(figure.minutes ?? 0);
  const R = 96, cx = 110, cy = 110;
  const pt = (ang: number, r: number): [number, number] => [
    cx + r * Math.sin(ang),
    cy - r * Math.cos(ang),
  ];

  const graduations = Array.from({ length: 60 }, (_, i) => {
    const a = (i * Math.PI) / 30;
    const gros = i % 5 === 0;
    const [x1, y1] = pt(a, R - (gros ? 12 : 5));
    const [x2, y2] = pt(a, R - 1);
    return { i, x1, y1, x2, y2, gros };
  });

  // La petite aiguille avance AVEC les minutes : à 3 h 25 elle est aux deux
  // cinquièmes entre 3 et 4, jamais sur le 3. C'est ce qui distingue l'élève
  // qui lit de celui qui devine.
  const aH = ((h + m / 60) * Math.PI) / 6;
  const aM = (m * Math.PI) / 30;
  const [hx, hy] = pt(aH, R * 0.52);
  const [mx, my] = pt(aM, R * 0.78);

  const heureLue = `${figure.heures} h ${String(m).padStart(2, "0")}`;

  return (
    <svg
      viewBox="0 0 220 220"
      width="200"
      height="200"
      role="img"
      aria-label={`Cadran à aiguilles indiquant ${heureLue}`}
      style={{ display: "block" }}
    >
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth="3" />

      {graduations.map((g) => (
        <line
          key={g.i}
          x1={g.x1.toFixed(1)} y1={g.y1.toFixed(1)}
          x2={g.x2.toFixed(1)} y2={g.y2.toFixed(1)}
          stroke="currentColor"
          strokeWidth={g.gros ? 2.5 : 1}
        />
      ))}

      {figure.chiffres !== false &&
        Array.from({ length: 12 }, (_, k) => {
          const i = k + 1;
          const [x, y] = pt((i * Math.PI) / 6, R - 27);
          return (
            <text
              key={i}
              x={x.toFixed(1)} y={(y + 6).toFixed(1)}
              textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor"
            >
              {i}
            </text>
          );
        })}

      {/* Aiguille des heures : courte et épaisse */}
      <line
        x1={cx} y1={cy} x2={hx.toFixed(1)} y2={hy.toFixed(1)}
        stroke={CODAGE} strokeWidth="7" strokeLinecap="round"
      />
      {/* Aiguille des minutes : longue et fine — la longueur est le seul indice */}
      <line
        x1={cx} y1={cy} x2={mx.toFixed(1)} y2={my.toFixed(1)}
        stroke="currentColor" strokeWidth="4" strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="6" fill="currentColor" />
    </svg>
  );
}

// ── Angle ───────────────────────────────────────────────────────────────────

function Angle({ figure }: { figure: FigureAngle }) {
  const d = Number(figure.degres);
  const L = 150, ox = 30, oy = 160;
  const rad = (d * Math.PI) / 180;
  const bx = ox + L, by = oy;
  const ax = ox + L * Math.cos(rad);
  const ay = oy - L * Math.sin(rad);
  const droit = Math.abs(d - 90) < 0.5;
  const r = 40;
  const ex = ox + r * Math.cos(rad);
  const ey = oy - r * Math.sin(rad);

  // La mesure n'est JAMAIS écrite sur la figure : c'est ce qu'on demande de
  // reconnaître. Le texte de rechange reste volontairement vague.
  const description = droit ? "Angle droit" : d < 90 ? "Angle aigu" : "Angle obtus";

  return (
    <svg
      viewBox="0 0 200 180"
      width="100%"
      role="img"
      aria-label={description}
      style={{ display: "block", maxWidth: 280 }}
    >
      <line x1={ox} y1={oy} x2={bx} y2={by} stroke="currentColor" strokeWidth="3" />
      <line x1={ox} y1={oy} x2={ax.toFixed(1)} y2={ay.toFixed(1)} stroke="currentColor" strokeWidth="3" />

      {droit ? (
        // Le petit carré, jamais un arc : c'est le codage à reconnaître.
        <path d={`M${ox + 26} ${oy} v-26 h-26`} fill="none" stroke={CODAGE} strokeWidth="2.5" />
      ) : (
        <path
          d={`M${ox + r} ${oy} A ${r} ${r} 0 0 0 ${ex.toFixed(1)} ${ey.toFixed(1)}`}
          fill="none" stroke={CODAGE} strokeWidth="2.5"
        />
      )}

      {figure.nom && (
        <text x={ox - 6} y={oy + 20} fontSize="17" fontWeight="800" fill="currentColor" textAnchor="middle">
          {figure.nom}
        </text>
      )}
    </svg>
  );
}

// ── Polygone sur quadrillage ────────────────────────────────────────────────

function Polygone({ figure }: { figure: FigurePolygone }) {
  const G = figure.grille;
  const pol = figure.polygones ?? [];
  const seg = figure.segments ?? [];
  const pts = figure.points ?? [];
  const cer = figure.cercles ?? [];

  let maxX = G ? G.colonnes : 10;
  let maxY = G ? G.lignes : 8;
  const tous: [number, number][] = [
    ...pol.flatMap((p) => p.sommets),
    ...seg.flatMap((s) => [s.de, s.a]),
    ...pts.map((p) => p.at),
    ...cer.flatMap((c): [number, number][] => [
      [c.centre[0] - c.rayon, c.centre[1] - c.rayon],
      [c.centre[0] + c.rayon, c.centre[1] + c.rayon],
    ]),
  ];
  for (const [x, y] of tous) {
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
  }

  const U = 34, M = 22;
  const W = maxX * U + 2 * M;
  const H = maxY * U + 2 * M;
  // L'origine est en bas à gauche et l'axe des y monte : c'est le repère du
  // cahier. À l'envers, tous les items de repérage seraient faux.
  const X = (x: number) => M + x * U;
  const Y = (y: number) => H - M - y * U;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Figure géométrique"
      style={{ display: "block", maxWidth: Math.min(W, 420) }}
    >
      {G && (
        <g>
          {Array.from({ length: maxX + 1 }, (_, i) => (
            <line key={`c${i}`} x1={X(i)} y1={Y(0)} x2={X(i)} y2={Y(maxY)}
              stroke="currentColor" strokeWidth="1" opacity="0.22" />
          ))}
          {Array.from({ length: maxY + 1 }, (_, j) => (
            <line key={`l${j}`} x1={X(0)} y1={Y(j)} x2={X(maxX)} y2={Y(j)}
              stroke="currentColor" strokeWidth="1" opacity="0.22" />
          ))}
        </g>
      )}

      {cer.map((c, i) => (
        <g key={`cer${i}`}>
          <circle
            cx={X(c.centre[0])} cy={Y(c.centre[1])} r={c.rayon * U}
            fill={CODAGE} fillOpacity={c.plein === false ? 0 : 0.1}
            stroke="currentColor" strokeWidth="2.8"
            strokeDasharray={c.pointille ? "7 5" : undefined}
          />
          <circle cx={X(c.centre[0])} cy={Y(c.centre[1])} r="3.5" fill="currentColor" />
          {c.nom && (
            <text x={X(c.centre[0])} y={Y(c.centre[1]) - 9} textAnchor="middle"
              fontSize="15" fontWeight="700" fill="currentColor">{c.nom}</text>
          )}
        </g>
      ))}

      {seg.map((s, i) => (
        <g key={`seg${i}`}>
          <line
            x1={X(s.de[0])} y1={Y(s.de[1])} x2={X(s.a[0])} y2={Y(s.a[1])}
            stroke="currentColor" strokeWidth="2.5"
            strokeDasharray={s.pointille ? "7 5" : undefined}
          />
          {s.nom && (
            <text x={X(s.a[0]) + 8} y={Y(s.a[1]) - 6} fontSize="15" fontWeight="700" fill="currentColor">
              {s.nom}
            </text>
          )}
        </g>
      ))}

      {pol.map((p, pi) => {
        const S = p.sommets;
        const d = S.map(([x, y], i) => `${i ? "L" : "M"}${X(x)} ${Y(y)}`).join(" ") + " Z";
        const centre = S.reduce<[number, number]>(
          (a, [x, y]) => [a[0] + x / S.length, a[1] + y / S.length], [0, 0],
        );
        const noms = p.noms ?? (p.nom ? p.nom.split("") : []);

        return (
          <g key={`pol${pi}`}>
            <path d={d} fill={CODAGE} fillOpacity={p.plein === false ? 0 : 0.12}
              stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />

            {/* Angle droit : petit carré au sommet, jamais un arc */}
            {(p.angles_droits ?? []).map((i) => {
              const n = S.length;
              const [ax, ay] = S[i];
              const [px, py] = S[(i - 1 + n) % n];
              const [nx, ny] = S[(i + 1) % n];
              const u = (a: number, b: number): [number, number] => {
                const l = Math.hypot(a, b) || 1;
                return [a / l, b / l];
              };
              const [u1x, u1y] = u(px - ax, py - ay);
              const [u2x, u2y] = u(nx - ax, ny - ay);
              const t = 13 / U;
              const P = (dx: number, dy: number) => `${X(ax + dx)} ${Y(ay + dy)}`;
              return (
                <path
                  key={`ad${i}`}
                  d={`M${P(u1x * t, u1y * t)} L${P((u1x + u2x) * t, (u1y + u2y) * t)} L${P(u2x * t, u2y * t)}`}
                  fill="none" stroke={CODAGE} strokeWidth="2.2"
                />
              );
            })}

            {/* Égalités : n petits traits au milieu du côté, perpendiculaires */}
            {(p.cotes_egaux ?? []).map(([i, nb], k) => {
              const n = S.length;
              const [ax, ay] = S[i];
              const [bx, by] = S[(i + 1) % n];
              const mx = (X(ax) + X(bx)) / 2, my = (Y(ay) + Y(by)) / 2;
              const dx = X(bx) - X(ax), dy = Y(by) - Y(ay);
              const l = Math.hypot(dx, dy) || 1;
              const nxp = (-dy / l) * 7, nyp = (dx / l) * 7;
              const combien = nb || 1;
              return Array.from({ length: combien }, (_, j) => {
                const o = (j - (combien - 1) / 2) * 5;
                return (
                  <line
                    key={`ce${k}-${j}`}
                    x1={mx + (o * dx) / l - nxp} y1={my + (o * dy) / l - nyp}
                    x2={mx + (o * dx) / l + nxp} y2={my + (o * dy) / l + nyp}
                    stroke={CODAGE} strokeWidth="2.2"
                  />
                );
              });
            })}

            {/* Noms des sommets, poussés vers l'extérieur de la figure */}
            {noms.map((nom, i) => {
              if (!S[i]) return null;
              const dx = S[i][0] - centre[0], dy = S[i][1] - centre[1];
              const l = Math.hypot(dx, dy) || 1;
              return (
                <text
                  key={`n${i}`}
                  x={X(S[i][0] + (dx / l) * 0.42)}
                  y={Y(S[i][1] + (dy / l) * 0.42) + 5}
                  textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor"
                >
                  {nom}
                </text>
              );
            })}
          </g>
        );
      })}

      {pts.map((p, i) => (
        <g key={`pt${i}`}>
          <circle cx={X(p.at[0])} cy={Y(p.at[1])} r="4.5" fill={CODAGE} />
          {p.nom && (
            <text x={X(p.at[0])} y={Y(p.at[1]) - 10} textAnchor="middle"
              fontSize="15" fontWeight="700" fill="currentColor">{p.nom}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Point d'entrée ──────────────────────────────────────────────────────────

export default function FigureGeo({ figure }: { figure: Figure }) {
  if (!figure?.type) return null;

  const corps =
    figure.type === "cadran" ? <Cadran figure={figure} />
    : figure.type === "angle" ? <Angle figure={figure} />
    : figure.type === "polygone" ? <Polygone figure={figure} />
    : null;

  if (!corps) return null;

  return <div style={{ margin: "14px 0 16px" }}>{corps}</div>;
}
