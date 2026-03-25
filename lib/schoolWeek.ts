import ICAL from "ical.js";

const ZONE_A_ICS_URL =
  "https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-A.ics";

// Mapping semaine scolaire → { periode, semaine }
const WEEK_MAPPING: Record<number, { periode: string; semaine: string }> = {};
for (let w = 1; w <= 30; w++) {
  const periodIndex = Math.ceil(w / 6);
  const weekInPeriod = ((w - 1) % 6) + 2;
  const isFirstPeriod = periodIndex === 1;
  WEEK_MAPPING[w] = {
    periode: `P${periodIndex}`,
    semaine: `S${isFirstPeriod ? weekInPeriod : weekInPeriod - 1}`,
  };
}

// ─── Jours fériés fixes ────────────────────────────────────────────────────────
function getJoursFeriesFixes(year: number): Date[] {
  return [
    new Date(year, 0, 1),   // Jour de l'An
    new Date(year, 4, 1),   // Fête du Travail
    new Date(year, 4, 8),   // Victoire 1945
    new Date(year, 6, 14),  // Fête nationale
    new Date(year, 7, 15),  // Assomption
    new Date(year, 10, 1),  // Toussaint
    new Date(year, 10, 11), // Armistice
    new Date(year, 11, 25), // Noël
  ];
}

// ─── Calcul de Pâques (Meeus/Jones/Butcher) ────────────────────────────────────
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getJoursFeriesVariables(year: number): Date[] {
  const easter = getEasterDate(year);
  const lundiPaques = new Date(easter);
  lundiPaques.setDate(easter.getDate() + 1);
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);
  const lundiPentecote = new Date(easter);
  lundiPentecote.setDate(easter.getDate() + 50);
  return [lundiPaques, ascension, lundiPentecote];
}

function getAllJoursFeries(year: number): Set<string> {
  const dates = [...getJoursFeriesFixes(year), ...getJoursFeriesVariables(year)];
  return new Set(dates.map((d) => toDateStr(d)));
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ─── Vacances scolaires via iCal ────────────────────────────────────────────────
interface VacationPeriod { start: Date; end: Date }

async function fetchVacances(): Promise<VacationPeriod[]> {
  try {
    const response = await fetch(ZONE_A_ICS_URL, { next: { revalidate: 86400 } });
    if (!response.ok) { console.error(`Erreur fetch iCal: ${response.status}`); return []; }
    const icalText = await response.text();
    const jcalData = ICAL.parse(icalText);
    const comp = new ICAL.Component(jcalData);
    const events = comp.getAllSubcomponents("vevent");

    const vacances: VacationPeriod[] = [];
    for (const event of events) {
      const summary = event.getFirstPropertyValue("summary") ?? "";
      if (typeof summary === "string" && summary.toLowerCase().includes("vacances")) {
        const dtstart = event.getFirstPropertyValue("dtstart");
        const dtend = event.getFirstPropertyValue("dtend");
        if (dtstart && dtend) {
          vacances.push({
            start: (dtstart as ICAL.Time).toJSDate(),
            end: (dtend as ICAL.Time).toJSDate(),
          });
        }
      }
    }
    return vacances;
  } catch (err) {
    console.error("Erreur parsing iCal:", err);
    return [];
  }
}

function isInVacances(date: Date, vacances: VacationPeriod[]): boolean {
  const dateTs = date.getTime();
  return vacances.some((v) => dateTs >= v.start.getTime() && dateTs < v.end.getTime());
}

function getPremierLundiSeptembre(year: number): Date {
  const sept1 = new Date(year, 8, 1);
  const day = sept1.getDay();
  const daysToAdd = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  return new Date(year, 8, 1 + daysToAdd);
}

function weekContainsVacation(mondayDate: Date, vacances: VacationPeriod[]): boolean {
  for (let d = 0; d < 5; d++) {
    const day = new Date(mondayDate);
    day.setDate(mondayDate.getDate() + d);
    if (isInVacances(day, vacances)) return true;
  }
  return false;
}

// ─── Fonction principale ────────────────────────────────────────────────────────
export async function getCurrentSchoolWeek(): Promise<{ periode: string; semaine: string } | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;

  const joursFeries = getAllJoursFeries(today.getFullYear());
  if (joursFeries.has(toDateStr(today))) return null;

  const vacances = await fetchVacances();
  if (isInVacances(today, vacances)) return null;

  const month = today.getMonth();
  const schoolYear = month >= 8 ? today.getFullYear() : today.getFullYear() - 1;

  const premierLundi = getPremierLundiSeptembre(schoolYear);
  const finAnnee = new Date(schoolYear + 1, 5, 30, 23, 59, 59, 999);

  if (today < premierLundi || today > finAnnee) return null;

  let schoolWeekNum = 0;
  const currentMonday = new Date(today);
  const todayDay = currentMonday.getDay();
  const diffToMonday = todayDay === 0 ? -6 : 1 - todayDay;
  currentMonday.setDate(currentMonday.getDate() + diffToMonday);

  const iterMonday = new Date(premierLundi);
  while (iterMonday <= currentMonday) {
    if (!weekContainsVacation(iterMonday, vacances)) schoolWeekNum++;
    if (isSameDate(iterMonday, currentMonday)) break;
    iterMonday.setDate(iterMonday.getDate() + 7);
  }

  if (schoolWeekNum < 1 || schoolWeekNum > 30) return null;
  return WEEK_MAPPING[schoolWeekNum] ?? null;
}
