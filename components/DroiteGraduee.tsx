"use client";

/**
 * Droite graduée dessinée en SVG inline.
 *
 * Contrat : docs/ceintures/SPEC-DROITE-GRADUEE.md.
 * Déclarée par une clé optionnelle `droite` sur une question — il n'y a pas de
 * type d'exercice « droite graduée », pour que `creerMiniExercices()` continue
 * de recopier les questions telles quelles et que la droite survive à
 * l'évaluation sans une ligne de code de plus.
 */

export interface PointDroite {
  valeur: number;
  nom: string;
}

export interface ZoneDroite {
  de: number;
  a: number;
}

export interface Droite {
  origine: number;
  pas: number;
  intervalles: number;
  divisions?: number;
  etiquettes?: "toutes" | "bornes" | "aucune" | number[];
  fraction?: { denominateur: number };
  points?: PointDroite[];
  zones?: ZoneDroite[];
}

/** Repère du dessin, en unités du viewBox. */
const L = 1000; // largeur utile
const MARGE = 40; // marge gauche et droite
const Y = 60; // ordonnée de la droite
const H_TRAIT = 14; // demi-hauteur d'un trait d'intervalle
const H_SOUS = 7; // demi-hauteur d'une subdivision
const Y_ETIQ = Y + H_TRAIT + 24; // ordonnée de la ligne d'étiquettes

/** Évite les 0.30000000000000004 dans les étiquettes. */
function arrondir(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Étiquette d'une valeur : en fraction si `fraction` est donné, sinon en
 * décimal à la française (virgule).
 */
function etiquetteDe(valeur: number, droite: Droite): string {
  const v = arrondir(valeur);

  if (droite.fraction?.denominateur) {
    const d = droite.fraction.denominateur;
    const num = Math.round(v * d);
    // Non simplifiées, conformément au contrat : on veut lire 0, 1/4, 2/4,
    // 3/4, 1 — c'est la suite des quarts que l'élève doit voir, pas 1/2 au
    // milieu. Seuls les entiers s'écrivent en entier.
    if (num % d === 0) return String(num / d);
    return `${num}/${d}`;
  }

  return String(v).replace(".", ",");
}

interface Props {
  droite: Droite;
  /** Texte de rechange pour les lecteurs d'écran. */
  description?: string;
}

export default function DroiteGraduee({ droite, description }: Props) {
  const { origine, pas, intervalles } = droite;
  const divisions = Math.max(1, Math.min(droite.divisions ?? 1, 10));
  const etiquettes = droite.etiquettes ?? "toutes";

  const valeurMin = origine;
  const valeurMax = origine + pas * intervalles;
  const etendue = valeurMax - valeurMin || 1;

  /** Valeur → abscisse dans le viewBox. */
  const x = (valeur: number) => MARGE + ((valeur - valeurMin) / etendue) * L;

  // Repères principaux et subdivisions.
  const principaux = Array.from({ length: intervalles + 1 }, (_, i) =>
    arrondir(valeurMin + i * pas),
  );

  const sous: number[] = [];
  if (divisions > 1) {
    for (let i = 0; i < intervalles; i++) {
      for (let j = 1; j < divisions; j++) {
        sous.push(arrondir(valeurMin + i * pas + (j * pas) / divisions));
      }
    }
  }

  /** La valeur est-elle explicitement demandée par une liste `etiquettes` ? */
  const estListee = (valeur: number): boolean =>
    Array.isArray(etiquettes) && etiquettes.some((e) => Math.abs(e - valeur) < 1e-9);

  // Par défaut, seules les graduations principales sont étiquetées. En mode
  // fraction, les sous-graduations le sont aussi : sans elles, une droite en
  // quarts n'afficherait que 0, 1 et 2 et l'item perdrait son sens.
  const etiqueterSousParDefaut =
    !!droite.fraction?.denominateur &&
    etiquettes !== "aucune" &&
    etiquettes !== "bornes" &&
    !Array.isArray(etiquettes) &&
    principaux.length + sous.length <= 14;

  /** Les repères principaux dont la valeur est écrite sous la droite. */
  const doitEtiqueter = (valeur: number, index: number): boolean => {
    if (etiquettes === "aucune") return false;
    if (etiquettes === "bornes") return index === 0 || index === intervalles;
    if (Array.isArray(etiquettes)) return estListee(valeur);
    // "toutes" : au-delà de 12 étiquettes, elles se chevaucheraient — on
    // retombe alors sur les bornes, comme le demande le contrat.
    if (intervalles + 1 > 12) return index === 0 || index === intervalles;
    return true;
  };

  /**
   * Les sous-graduations étiquetées : celles du mode fraction, et celles qu'une
   * liste `etiquettes` réclame nommément — c'est à cela que sert la liste, et
   * elle prime donc sur la règle « seules les principales sont étiquetées ».
   */
  const doitEtiqueterSous = (valeur: number): boolean => {
    if (etiquettes === "aucune") return false;
    if (estListee(valeur)) return true;
    return etiqueterSousParDefaut;
  };

  // Étiquettes et flèches vivent toutes deux sous la droite : si les deux sont
  // présentes, les flèches descendent d'un cran pour ne pas les chevaucher.
  const yEtiquettes =
    principaux.some((v, i) => doitEtiqueter(v, i)) || sous.some((v) => doitEtiqueterSous(v));
  const decalagePoints = yEtiquettes ? 34 : 4;
  const yFleche = Y + H_TRAIT + decalagePoints;
  const hauteur = (droite.points?.length ?? 0) > 0 ? yFleche + 58 : Y_ETIQ + 18;

  const resume =
    description ??
    `Droite graduée de ${etiquetteDe(valeurMin, droite)} à ${etiquetteDe(valeurMax, droite)}, ` +
      `graduée tous les ${etiquetteDe(pas, droite)}` +
      (droite.points?.length
        ? `. Points repérés : ${droite.points.map((p) => p.nom).join(", ")}.`
        : ".");

  return (
    <div style={{ width: "100%", margin: "0 0 18px" }}>
      <svg
        viewBox={`0 0 ${L + MARGE * 2} ${hauteur}`}
        width="100%"
        role="img"
        aria-label={resume}
        style={{ display: "block", overflow: "visible", color: "var(--pb-on-surface, #1a1a1a)" }}
      >
        {/* Zones surlignées, dessinées en premier pour rester derrière */}
        {(droite.zones ?? []).map((z, i) => (
          <rect
            key={`z${i}`}
            x={x(Math.min(z.de, z.a))}
            y={Y - H_TRAIT - 6}
            width={Math.abs(x(z.a) - x(z.de))}
            height={(H_TRAIT + 6) * 2}
            fill="rgba(59,130,246,0.15)"
            stroke="rgba(59,130,246,0.5)"
            strokeWidth="2"
            rx="4"
          />
        ))}

        {/* La droite, terminée par une pointe de flèche comme au tableau */}
        <line
          x1={MARGE - 18}
          y1={Y}
          x2={L + MARGE + 12}
          y2={Y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <polygon
          points={`${L + MARGE + 26},${Y} ${L + MARGE + 8},${Y - 7} ${L + MARGE + 8},${Y + 7}`}
          fill="currentColor"
        />

        {/* Subdivisions : moitié moins hautes que les repères principaux */}
        {sous.map((v, i) => (
          <g key={`s${i}`}>
            <line
              x1={x(v)}
              y1={Y - H_SOUS}
              x2={x(v)}
              y2={Y + H_SOUS}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.55"
            />
            {doitEtiqueterSous(v) && (
              <text
                x={x(v)}
                y={Y_ETIQ}
                textAnchor="middle"
                fontSize="17"
                fontWeight="500"
                fill="currentColor"
                opacity="0.8"
              >
                {etiquetteDe(v, droite)}
              </text>
            )}
          </g>
        ))}

        {/* Repères principaux et leurs étiquettes */}
        {principaux.map((v, i) => (
          <g key={`p${i}`}>
            <line
              x1={x(v)}
              y1={Y - H_TRAIT}
              x2={x(v)}
              y2={Y + H_TRAIT}
              stroke="currentColor"
              strokeWidth="2.5"
            />
            {doitEtiqueter(v, i) && (
              <text
                x={x(v)}
                y={Y_ETIQ}
                textAnchor="middle"
                fontSize="20"
                fontWeight="600"
                fill="currentColor"
              >
                {etiquetteDe(v, droite)}
              </text>
            )}
          </g>
        ))}

        {/* Points : flèche sous la droite, pointe vers le haut, nom au-dessus */}
        {(droite.points ?? []).map((p, i) => (
          <g key={`pt${i}`}>
            <polygon
              points={`${x(p.valeur)},${yFleche} ${x(p.valeur) - 8},${yFleche + 16} ${x(p.valeur) + 8},${yFleche + 16}`}
              fill="#DC2626"
            />
            <line
              x1={x(p.valeur)}
              y1={yFleche + 16}
              x2={x(p.valeur)}
              y2={yFleche + 32}
              stroke="#DC2626"
              strokeWidth="2.5"
            />
            <text
              x={x(p.valeur)}
              y={yFleche + 50}
              textAnchor="middle"
              fontSize="22"
              fontWeight="800"
              fill="#DC2626"
            >
              {p.nom}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
