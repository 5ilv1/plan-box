/**
 * Conversions entre le format des `<input type="week">` ("YYYY-Www", semaines ISO 8601)
 * et les dates "YYYY-MM-DD" stockées dans `plan_travail.date_assignation`.
 *
 * Tout est calculé en UTC : construire la date en heure locale puis la sérialiser avec
 * `toISOString()` décale le résultat d'un jour en France (UTC+1/+2), ce qui plaçait les
 * blocs en périodicité « semaine » sur le dimanche précédent.
 */

const MS_PAR_SEMAINE = 7 * 24 * 3600 * 1000;

/** Lundi de la semaine ISO contenant `d`, en UTC */
function lundiUTC(d: Date): Date {
  const jour = (d.getUTCDay() + 6) % 7; // 0 = lundi
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - jour));
}

/** Lundi de la semaine ISO 1 de `anneeISO` (celle qui contient le 4 janvier) */
function lundiSemaine1(anneeISO: number): Date {
  return lundiUTC(new Date(Date.UTC(anneeISO, 0, 4)));
}

/** Convertit "YYYY-Www" en date "YYYY-MM-DD" du lundi de cette semaine */
export function lundiDeSemaine(semaine: string): string {
  const [annee, w] = semaine.split("-W");
  const lundi = lundiSemaine1(parseInt(annee, 10));
  lundi.setUTCDate(lundi.getUTCDate() + (parseInt(w, 10) - 1) * 7);
  return lundi.toISOString().split("T")[0];
}

/**
 * Semaine ISO au format "YYYY-Www" attendu par `<input type="week">`.
 * Accepte une date "YYYY-MM-DD", un `Date`, ou rien pour la semaine courante.
 */
export function semaineISO(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : date;
  // Le jeudi de la semaine détermine son année ISO (une semaine à cheval sur deux
  // années appartient à celle où tombe son jeudi).
  const jour = (d.getDay() + 6) % 7;
  const jeudi = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - jour + 3));
  const anneeISO = jeudi.getUTCFullYear();
  const numSemaine =
    Math.round((jeudi.getTime() - lundiSemaine1(anneeISO).getTime()) / MS_PAR_SEMAINE) + 1;
  return `${anneeISO}-W${String(numSemaine).padStart(2, "0")}`;
}
