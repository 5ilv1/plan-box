/**
 * Paramètres graphiques communs à tous les graphes du suivi.
 *
 * Les couleurs ne sont pas choisies à l'œil : la palette est passée au
 * validateur du guide de visualisation (bande de clarté, plancher de chroma,
 * séparation daltonisme, contraste sur la surface). Les trois teintes de
 * niveaux passent en « toutes paires » sur fond blanc — la surface des cartes
 * de l'application (`--pb-surface-lowest`).
 *
 * Trois teintes sont sous 3:1 sur blanc (aqua, jaune, magenta) : partout où
 * elles servent, **les valeurs sont écrites à côté de la marque**. C'est la
 * contrepartie exigée par le contrôle de contraste — jamais la couleur seule.
 *
 * L'application n'a pas de mode sombre : une seule déclinaison.
 */

/** Identité : CE2 / CM1 / CM2, puis matières. Ordre fixe, jamais recyclé. */
export const SERIES = [
  "#2a78d6", // bleu
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // jaune
  "#e87ba4", // magenta
] as const;

/** Un niveau garde sa couleur quel que soit le filtre : elle suit l'élève, pas son rang. */
export const COULEUR_NIVEAU: Record<string, string> = {
  CE2: SERIES[0],
  CM1: SERIES[1],
  CM2: SERIES[2],
};

export function couleurNiveau(niveau: string): string {
  return COULEUR_NIVEAU[niveau] ?? GRIS_MARQUE;
}

/** Une seule série de magnitude : une seule teinte. */
export const HUE = "#2a78d6";
/** La même teinte, en retrait — pour le second terme d'une comparaison avant/après. */
export const HUE_PALE = "#9ec5f4";
/** La série mise de côté dans un graphe d'emphase. */
export const GRIS_MARQUE = "#c3c2b7";

/** Rampe séquentielle bleue, du clair au foncé (magnitude continue). */
export const RAMPE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281"];

/** États — jamais réutilisés comme couleur de série, toujours accompagnés d'un mot. */
export const ETAT = {
  bon: "#0ca30c",
  attention: "#fab219",
  serieux: "#ec835a",
  critique: "#d03b3b",
} as const;

/** Doit rester aligné sur `NON_CLASSE` de `lib/suivi-metriques.ts`. */
export const NON_CLASSE_LIBELLE = "Non classé";

/** Couleur d'un pourcentage de réussite. Toujours doublée d'un chiffre lisible. */
export function couleurScore(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return GRIS_MARQUE;
  if (pct >= 80) return ETAT.bon;
  if (pct >= 60) return ETAT.attention;
  if (pct >= 40) return ETAT.serieux;
  return ETAT.critique;
}

/* ── Chrome : discret, le tracé est la seule chose qui a le droit d'être fort ── */
export const SURFACE = "#ffffff";
export const ENCRE = "#282b51";        // var(--pb-on-surface)
export const ENCRE_DOUCE = "#555881";  // var(--pb-on-surface-variant)
export const GRILLE = "#EDEEF5";
export const AXE = "#D9DAE8";

export const POLICE = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

/** Ticks d'axe : petits, gris, jamais en gras. */
export const AXE_TICK = { fill: ENCRE_DOUCE, fontSize: 11, fontFamily: POLICE } as const;

/** Valeurs posées directement sur les marques. */
export const LABEL_VALEUR = {
  fill: ENCRE,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: POLICE,
} as const;

/** Grille : trait plein d'un pas au-dessus de la surface, jamais pointillé. */
export const GRILLE_PROPS = { stroke: GRILLE, strokeDasharray: "", vertical: false } as const;

export const AXE_PROPS = {
  stroke: AXE,
  tickLine: false,
  tick: AXE_TICK,
} as const;

/** Une barre ne remplit jamais sa case : le reste est de l'air. */
export const EPAISSEUR_BARRE = 22;
/** Bout arrondi côté valeur, carré sur la ligne de base. */
export const BOUT_BARRE: [number, number, number, number] = [4, 4, 0, 0];
export const BOUT_BARRE_H: [number, number, number, number] = [0, 4, 4, 0];

export const CADRE_INFOBULLE: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${AXE}`,
  borderRadius: 12,
  padding: "8px 12px",
  fontFamily: POLICE,
  fontSize: 12,
  color: ENCRE,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
};

/**
 * Espace **insécable fine** avant le %, comme le veut la typographie française.
 * Une espace ordinaire faisait passer le « % » à la ligne au-dessus des colonnes
 * étroites.
 */
export const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v}\u202f%`;

/** Formateur d'étiquette posée sur une marque. */
export const etiquettePct = (v: unknown) =>
  typeof v === "number" ? `${v}\u202f%` : "";

/** « lun. 14 sept. » — les axes de dates doivent tenir sur une ligne. */
export function jourCourt(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function jourMois(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
