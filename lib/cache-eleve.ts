/**
 * Mémoire courte des réponses du tableau de bord élève (sessionStorage).
 *
 * L'élève revient sur son tableau de bord après chaque activité, ~25 fois par
 * séance, et chaque retour relançait une douzaine d'appels dont la plupart
 * rendent la même chose qu'il y a cinq minutes. Chaque appel est une fonction
 * Vercel, sur un quota gratuit qui a failli être épuisé fin septembre 2026.
 *
 * Une réponse est gardée 15 min, et son GROUPE est effacé dès que l'élève
 * passe par une page qui peut la changer (`invaliderSelonPage()`, appelée par
 * le layout élève) : un élève qui vient de gagner une ceinture la voit en
 * revenant. Ce qui change à chaque activité — le plan de travail, le problème
 * et le calcul du jour — n'est jamais gardé ici.
 */

export type GroupeCache = "avatar" | "bibliotheque" | "ceintures" | "chapitres" | "revisions";

const PREFIXE = "pb_frais:";
const TTL_DEFAUT = 15 * 60 * 1000;

function cle(groupe: GroupeCache, url: string) {
  return `${PREFIXE}${groupe}:${url}`;
}

export function lireFrais<T = unknown>(groupe: GroupeCache, url: string, ttl = TTL_DEFAUT): T | null {
  try {
    const brut = sessionStorage.getItem(cle(groupe, url));
    if (!brut) return null;
    const { t, v } = JSON.parse(brut) as { t: number; v: T };
    if (Date.now() - t > ttl) return null;
    return v;
  } catch {
    return null;
  }
}

export function ecrireFrais(groupe: GroupeCache, url: string, valeur: unknown) {
  try {
    sessionStorage.setItem(cle(groupe, url), JSON.stringify({ t: Date.now(), v: valeur }));
  } catch { /* stockage plein ou bloqué : on s'en passe */ }
}

export function invaliderGroupes(groupes: GroupeCache[] | "tout") {
  try {
    const aRetirer: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k?.startsWith(PREFIXE)) continue;
      if (groupes === "tout" || groupes.some((g) => k.startsWith(`${PREFIXE}${g}:`))) aRetirer.push(k);
    }
    aRetirer.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* rien à faire */ }
}

/** Les pages qui changent ce que le tableau de bord garde en mémoire. */
export function groupesTouchesPar(chemin: string): GroupeCache[] {
  const g: GroupeCache[] = [];
  if (chemin.startsWith("/eleve/ceintures") || chemin === "/eleve/activite/ceinture") g.push("ceintures", "chapitres");
  // Une ceinture est un chapitre : son évaluation passe par /eleve/chapitre.
  if (chemin.startsWith("/eleve/chapitre")) g.push("chapitres", "ceintures");
  if (chemin.startsWith("/eleve/bibliotheque")) g.push("bibliotheque");
  if (chemin.startsWith("/eleve/avatar")) g.push("avatar");
  return g;
}

/**
 * GET JSON avec mémoire : rend la réponse gardée si elle est fraîche, sinon
 * interroge le serveur et garde une réponse 2xx. `null` si l'appel échoue.
 * `reparer` : sur 401, rafraîchit la session et retente une fois.
 */
export async function jsonFrais<T = unknown>(
  groupe: GroupeCache,
  url: string,
  init?: RequestInit,
  reparer?: () => Promise<boolean>,
  ttl = TTL_DEFAUT,
  valide?: (v: T) => boolean,
): Promise<T | null> {
  // `valide` : une valeur gardée qui n'a pas la forme attendue (écrite par une
  // autre version du code, par exemple) est ignorée, et redemandée.
  const garde = lireFrais<T>(groupe, url, ttl);
  if (garde !== null && (!valide || valide(garde))) return garde;
  let r = await fetch(url, init);
  if (r.status === 401 && reparer) {
    if (!(await reparer())) return null;
    r = await fetch(url, init);
  }
  if (!r.ok) return null;
  const json = (await r.json()) as T;
  // Une réponse d'erreur en 200 ne se garde pas : on la redemandera.
  const o = json as Record<string, unknown> | null;
  if (o && typeof o === "object" && ("erreur" in o || "error" in o)) return json;
  if (valide && !valide(json)) return json;
  ecrireFrais(groupe, url, json);
  return json;
}
