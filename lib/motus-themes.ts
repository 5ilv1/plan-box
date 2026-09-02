// ── Motus — les thèmes de la semaine ────────────────────────────────────────
//
// Chaque semaine a un thème, affiché sous la grille : c'est l'indice donné aux
// élèves. Certains thèmes sont calés sur le calendrier (Noël en décembre,
// Halloween fin octobre…) et prennent la main sur les autres ; le reste tourne
// en évitant ce qui vient de sortir.
//
// Aucun accès base ici : ce module est aussi importé par les composants.

export interface Theme {
  code: string;
  /** Ce que lisent les élèves sous la grille. */
  libelle: string;
}

export const THEMES: Theme[] = [
  { code: "animaux", libelle: "Les animaux" },
  { code: "nature", libelle: "La nature et les paysages" },
  { code: "plantes", libelle: "Les plantes et le jardin" },
  { code: "alimentation", libelle: "La nourriture" },
  { code: "ecole", libelle: "L'école" },
  { code: "arts", libelle: "La musique et les arts" },
  { code: "vetements", libelle: "Les vêtements" },
  { code: "maison", libelle: "La maison et les objets" },
  { code: "ville", libelle: "La ville et les métiers" },
  { code: "transports", libelle: "Les transports et les voyages" },
  { code: "corps", libelle: "Le corps et la santé" },
  { code: "sports", libelle: "Le sport et les jeux" },
  { code: "temps", libelle: "Le temps qui passe" },
  { code: "emotions", libelle: "Les émotions" },
  { code: "langage", libelle: "Les mots et les nombres" },
  { code: "actions", libelle: "Les actions" },
  { code: "sciences", libelle: "Les outils et les sciences" },
  { code: "imaginaire", libelle: "Contes et imaginaire" },
  // Thèmes de saison — jamais tirés au hasard, seulement à leur période.
  { code: "halloween", libelle: "Halloween" },
  { code: "noel", libelle: "Noël" },
  { code: "hiver", libelle: "L'hiver et la neige" },
  { code: "carnaval", libelle: "Le carnaval" },
  { code: "printemps", libelle: "Le printemps" },
  { code: "paques", libelle: "Pâques" },
  { code: "ete", libelle: "L'été et les vacances" },
];

const PAR_CODE = new Map(THEMES.map((t) => [t.code, t]));

export function libelleTheme(code: string | null | undefined): string {
  if (!code) return "";
  return PAR_CODE.get(code)?.libelle ?? code;
}

export function themeExiste(code: string): boolean {
  return PAR_CODE.has(code);
}

/**
 * Dimanche de Pâques (algorithme de Meeus/Jones/Butcher), en UTC.
 * Pâques est mobile : sans ce calcul, le thème tomberait à côté une année sur
 * deux.
 */
export function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** "MM-JJ" d'une date UTC. */
function jourAnnee(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Fenêtres fixes, dans l'ordre de priorité (la première qui matche gagne).
 *
 * Elles sont volontairement courtes : une fenêtre longue occupe la place de
 * plusieurs semaines et épuise son thème — cinq semaines de Noël d'affilée
 * demanderaient 35 mots de Noël, et priveraient l'année d'autant de thèmes
 * ordinaires. Chaque fenêtre couvre 2 à 4 semaines, pour lesquelles le thème
 * compte assez de mots (le script d'import affiche le compte par thème).
 */
const FENETRES: { code: string; debut: string; fin: string }[] = [
  { code: "ecole", debut: "09-01", fin: "09-14" },      // la rentrée
  { code: "halloween", debut: "10-22", fin: "11-01" },
  { code: "noel", debut: "12-08", fin: "12-25" },
  { code: "hiver", debut: "01-05", fin: "01-17" },      // galette et neige
  { code: "carnaval", debut: "02-08", fin: "02-21" },
  { code: "printemps", debut: "03-20", fin: "04-04" },
  { code: "ete", debut: "06-15", fin: "07-10" },
];

/**
 * Le thème imposé par le calendrier pour la semaine du `lundi` donné, ou null
 * si la semaine n'est pas une semaine de saison.
 *
 * Une semaine compte comme « de saison » dès qu'un de ses sept jours tombe
 * dans la fenêtre : la semaine à cheval sur le 1er décembre est déjà Noël.
 */
export function themeSaisonnier(lundi: string): string | null {
  const debutSemaine = new Date(`${lundi}T00:00:00Z`);
  const jours: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(debutSemaine);
    d.setUTCDate(d.getUTCDate() + i);
    jours.push(d);
  }

  // Pâques d'abord : mobile, et prioritaire sur « printemps » qui l'englobe.
  for (const d of jours) {
    const p = paques(d.getUTCFullYear());
    const debut = new Date(p);
    debut.setUTCDate(debut.getUTCDate() - 13);
    const fin = new Date(p);
    fin.setUTCDate(fin.getUTCDate() + 7);
    if (d >= debut && d <= fin) return "paques";
  }

  for (const f of FENETRES) {
    for (const d of jours) {
      const jj = jourAnnee(d);
      if (jj >= f.debut && jj <= f.fin) return f.code;
    }
  }
  return null;
}

/**
 * Thèmes réservés à leur période : jamais tirés en rotation.
 *
 * « ecole » n'en fait pas partie bien qu'il ait une fenêtre (la rentrée) :
 * c'est aussi un thème ordinaire, qui peut revenir n'importe quand.
 */
export const THEMES_SAISONNIERS = [
  "halloween", "noel", "hiver", "carnaval", "printemps", "paques", "ete",
];

/** Thèmes qui entrent dans la rotation ordinaire (hors saison). */
export const THEMES_ROTATION = THEMES.filter(
  (t) => !THEMES_SAISONNIERS.includes(t.code),
).map((t) => t.code);
