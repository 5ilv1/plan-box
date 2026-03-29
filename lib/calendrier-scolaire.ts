/**
 * Utilitaire calendrier scolaire français
 * Calcule le prochain jour d'école en sautant :
 *  - Les week-ends (sam, dim)
 *  - Le mercredi (pas de classe en primaire)
 *  - Les jours fériés nationaux
 *  - Les vacances scolaires (API ministère, zone A/B/C)
 *  - Les exceptions manuelles (table jours_sans_ecole)
 */

// Cache en mémoire pour les vacances scolaires (durée de vie 1h)
let cacheVacances: { zone: string; data: VacancePeriod[]; ts: number } | null = null;
const CACHE_TTL = 3_600_000; // 1 heure

interface VacancePeriod {
  debut: string; // YYYY-MM-DD
  fin: string;   // YYYY-MM-DD
}

/** Jours fériés nationaux français (liste statique, valide pour 2024-2027) */
function getJoursFeries(annee: number): string[] {
  const a = annee;
  // Calcul Pâques (algorithme de Gauss)
  const G = a % 19;
  const C = Math.floor(a / 100);
  const H = (C - Math.floor(C / 4) - Math.floor((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - Math.floor(H / 28) * (1 - Math.floor(29 / (H + 1)) * Math.floor((21 - G) / 11));
  const J = (a + Math.floor(a / 4) + I + 2 - C + Math.floor(C / 4)) % 7;
  const L = I - J;
  const moisPaques = 3 + Math.floor((L + 40) / 44);
  const jourPaques = L + 28 - 31 * Math.floor(moisPaques / 4);
  const paques = new Date(Date.UTC(a, moisPaques - 1, jourPaques));

  const ajouter = (d: Date, jours: number) => {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + jours);
    return r;
  };
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  return [
    `${a}-01-01`, // Jour de l'an
    fmt(ajouter(paques, 1)),   // Lundi de Pâques
    `${a}-05-01`, // Fête du Travail
    `${a}-05-08`, // Victoire 1945
    fmt(ajouter(paques, 39)),  // Ascension
    fmt(ajouter(paques, 50)),  // Lundi de Pentecôte
    `${a}-07-14`, // Fête Nationale
    `${a}-08-15`, // Assomption
    `${a}-11-01`, // Toussaint
    `${a}-11-11`, // Armistice
    `${a}-12-25`, // Noël
  ];
}

/** Récupère les périodes de vacances depuis l'API du ministère de l'Éducation */
async function fetchVacances(zone: string): Promise<VacancePeriod[]> {
  const now = Date.now();
  if (cacheVacances && cacheVacances.zone === zone && now - cacheVacances.ts < CACHE_TTL) {
    return cacheVacances.data;
  }

  try {
    const anneeMin = new Date().getUTCFullYear() - 1;
    const anneeMax = new Date().getUTCFullYear() + 2;
    const zoneLabel = encodeURIComponent(`Zone ${zone}`);
    const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=zones%20like%20%22${zoneLabel}%22&limit=100&select=start_date%2Cend_date&refine=annee_scolaire%3A${anneeMin}-${anneeMin+1}&refine=annee_scolaire%3A${anneeMax-1}-${anneeMax}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("API unavailable");

    const json = await res.json();
    const data: VacancePeriod[] = (json.results ?? []).map((r: { start_date: string; end_date: string }) => ({
      debut: r.start_date.split("T")[0],
      fin: r.end_date.split("T")[0],
    }));

    cacheVacances = { zone, data, ts: now };
    return data;
  } catch {
    // En cas d'erreur réseau, retourner tableau vide (on ignore les vacances)
    return cacheVacances?.data ?? [];
  }
}

function estDansIntervalle(dateStr: string, debut: string, fin: string): boolean {
  return dateStr >= debut && dateStr <= fin;
}

/**
 * Retourne le prochain jour d'école à partir de `dateDepart` (non inclus).
 * @param dateDepart - date ISO (YYYY-MM-DD) de référence
 * @param joursException - périodes d'exception manuelles
 * @param zone - zone scolaire A, B ou C (défaut "A")
 */
export async function prochainJourEcole(
  dateDepart: string,
  joursException: { date_debut: string; date_fin: string }[] = [],
  zone: string = "A",
): Promise<string> {
  const vacances = await fetchVacances(zone);

  const candidat = new Date(dateDepart + "T12:00:00Z");
  // Avancer d'au moins 1 jour
  candidat.setUTCDate(candidat.getUTCDate() + 1);

  const MAX_ITER = 60; // éviter une boucle infinie
  for (let i = 0; i < MAX_ITER; i++) {
    const jourSemaine = candidat.getUTCDay(); // 0=dim, 1=lun, ..., 6=sam
    const dateStr = candidat.toISOString().split("T")[0];
    const annee = candidat.getUTCFullYear();
    const feries = getJoursFeries(annee);

    const estWeekend = jourSemaine === 0 || jourSemaine === 6;
    const estMercredi = jourSemaine === 3;
    const estFerie = feries.includes(dateStr);
    const estVacance = vacances.some(v => estDansIntervalle(dateStr, v.debut, v.fin));
    const estException = joursException.some(j => estDansIntervalle(dateStr, j.date_debut, j.date_fin));

    if (!estWeekend && !estMercredi && !estFerie && !estVacance && !estException) {
      return dateStr;
    }

    candidat.setUTCDate(candidat.getUTCDate() + 1);
  }

  // Fallback (ne devrait jamais arriver)
  return candidat.toISOString().split("T")[0];
}
