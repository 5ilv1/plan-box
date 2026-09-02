// ── Motus de la classe — logique partagée ───────────────────────────────────
//
// Un mot par jour, le même pour toute la classe, y compris hors jours d'école :
// aucune vérification de calendrier scolaire ici, le mot est tiré à la demande
// pour n'importe quelle date.
//
// Le mot secret ne quitte JAMAIS le serveur avant la fin de la partie : c'est
// l'API qui évalue chaque proposition et ne renvoie que des couleurs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { THEMES_ROTATION, libelleTheme, themeSaisonnier } from "@/lib/motus-themes";

export const ESSAIS_MAX = 6;
export const LONGUEUR_MIN = 4;
export const LONGUEUR_MAX = 10;

export type Marque = "correct" | "present" | "absent";

/** MAJUSCULES sans accents, sans espace. Renvoie "" si le mot est invalide. */
export function normaliserMot(mot: string): string {
  const brut = (mot ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  return /^[A-Z]+$/.test(brut) ? brut : "";
}

/** Mot utilisable comme mot du jour ? (lettres seules, bonne longueur) */
export function motValide(motNormalise: string): boolean {
  return (
    motNormalise.length >= LONGUEUR_MIN && motNormalise.length <= LONGUEUR_MAX
  );
}

/**
 * Date du jour à Paris, au format YYYY-MM-DD.
 *
 * `new Date().toISOString()` donne la date UTC : entre minuit et 2 h du matin
 * en France, elle est encore la veille — le mot du jour changerait à 2 h.
 */
export function dateDuJour(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Couleurs d'une proposition, règle Motus/Wordle : les lettres bien placées
 * sont comptées d'abord, les doublons restants deviennent « présent » dans la
 * limite du nombre d'occurrences réellement présentes dans le mot secret.
 */
export function evaluerEssai(essai: string, secret: string): Marque[] {
  const n = secret.length;
  const marques: Marque[] = new Array(n).fill("absent");
  const restant: Record<string, number> = {};

  for (const l of secret) restant[l] = (restant[l] ?? 0) + 1;

  for (let i = 0; i < n; i++) {
    if (essai[i] === secret[i]) {
      marques[i] = "correct";
      restant[essai[i]]--;
    }
  }
  for (let i = 0; i < n; i++) {
    if (marques[i] === "correct") continue;
    const l = essai[i];
    if ((restant[l] ?? 0) > 0) {
      marques[i] = "present";
      restant[l]--;
    }
  }
  return marques;
}

/** Entier stable tiré d'une chaîne — sert à choisir le mot sans aléatoire. */
function hachage(cle: string): number {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return h;
}

/** Lundi de la semaine contenant `date` (YYYY-MM-DD), calculé en UTC. */
export function lundiDe(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - jour);
  return d.toISOString().split("T")[0];
}

/**
 * Le thème de la semaine du `lundi` donné, fixé si besoin.
 *
 * Priorité : le choix de l'enseignant, puis le calendrier (Noël en décembre,
 * Halloween fin octobre…), puis la rotation — les thèmes jamais sortis
 * d'abord, ensuite les moins récents, le hachage du lundi départageant.
 */
export async function assurerThemeSemaine(
  admin: SupabaseClient,
  lundi: string,
): Promise<string> {
  const { data: existant } = await admin
    .from("motus_semaine")
    .select("theme")
    .eq("lundi", lundi)
    .maybeSingle();
  if (existant) return existant.theme as string;

  const saison = themeSaisonnier(lundi);
  let theme = saison;

  if (!theme) {
    const { data: passees } = await admin
      .from("motus_semaine")
      .select("lundi, theme")
      .order("lundi", { ascending: false })
      .limit(60);

    const vu = new Map<string, string>();
    for (const s of passees ?? []) {
      const t = s.theme as string;
      const l = s.lundi as string;
      if (!vu.has(t) || l > (vu.get(t) as string)) vu.set(t, l);
    }

    const classes = THEMES_ROTATION.map((code) => ({ code, vu: vu.get(code) ?? "" }))
      .sort((a, b) => (a.vu < b.vu ? -1 : a.vu > b.vu ? 1 : 0));
    const seuil = classes[0].vu;
    const exAequo = classes.filter((c) => c.vu === seuil);
    theme = exAequo[hachage(lundi) % exAequo.length].code;
  }

  const { error } = await admin
    .from("motus_semaine")
    .insert({ lundi, theme, impose: false });

  // Course entre deux élèves : la clé primaire tranche, on relit le gagnant.
  if (error) {
    const { data: relu } = await admin
      .from("motus_semaine")
      .select("theme")
      .eq("lundi", lundi)
      .maybeSingle();
    if (relu) return relu.theme as string;
  }
  return theme;
}

export interface MotDuJour {
  date: string;
  mot: string;
  motId: string | null;
  /** Thème de la semaine — l'indice affiché sous la grille. */
  theme: string | null;
}

/**
 * Le mot du jour pour `date`, tiré si besoin.
 *
 * Le mot est pris dans le thème de la semaine — c'est ce qui rend l'indice
 * honnête. Parmi les mots actifs de ce thème, ceux qui n'ont jamais servi
 * passent d'abord, puis les moins récemment servis ; le hachage de la date
 * départage. Si le thème est vide (aucun mot actif), on se rabat sur toute la
 * liste plutôt que de priver la classe de son mot du jour.
 *
 * Renvoie `null` si la liste ne contient aucun mot actif utilisable.
 */
export async function assurerMotDuJour(
  admin: SupabaseClient,
  date: string,
): Promise<MotDuJour | null> {
  const { data: existant } = await admin
    .from("motus_jour")
    .select("date, mot, mot_id, theme")
    .eq("date", date)
    .maybeSingle();

  if (existant) {
    return {
      date,
      mot: existant.mot as string,
      motId: (existant.mot_id as string) ?? null,
      theme: (existant.theme as string) ?? null,
    };
  }

  const theme = await assurerThemeSemaine(admin, lundiDe(date));

  // Filtrer sur le thème dans la requête, pas en mémoire : PostgREST plafonne
  // une lecture à 1000 lignes, et la liste dépasse ce seuil — un filtre côté
  // client pouvait donc ne jamais voir les mots d'un thème entier, et servir
  // un mot hors sujet.
  const [{ data: duTheme }, { data: journal }] = await Promise.all([
    admin.from("motus_mot").select("id, mot_normalise, theme").eq("actif", true).eq("theme", theme),
    admin.from("motus_jour").select("mot, date").order("date", { ascending: false }).limit(1000),
  ]);

  let candidats = (duTheme ?? []).filter((m) => motValide(m.mot_normalise as string));

  // Thème vide : plutôt que de priver la classe de son mot du jour, on prend
  // n'importe quel mot actif. L'indice sera alors moins juste, mais le jeu
  // reste jouable — et la page enseignant signale les thèmes sans mot.
  if (candidats.length === 0) {
    const { data: tous } = await admin
      .from("motus_mot")
      .select("id, mot_normalise, theme")
      .eq("actif", true)
      .limit(1000);
    candidats = (tous ?? []).filter((m) => motValide(m.mot_normalise as string));
  }
  if (candidats.length === 0) return null;

  // Dernier passage repéré par le mot lui-même, pas par son id : le même mot
  // peut exister dans deux thèmes, il ne doit pas ressortir pour autant.
  const dernierUsage = new Map<string, string>();
  for (const j of journal ?? []) {
    const mot = j.mot as string;
    const d = j.date as string;
    if (!dernierUsage.has(mot) || d > (dernierUsage.get(mot) as string)) {
      dernierUsage.set(mot, d);
    }
  }

  // "" trie avant toute date ISO : les mots jamais servis passent en tête.
  const plusAncien = candidats
    .map((m) => ({ m, vu: dernierUsage.get(m.mot_normalise as string) ?? "" }))
    .sort((a, b) => (a.vu < b.vu ? -1 : a.vu > b.vu ? 1 : 0));
  const seuil = plusAncien[0].vu;
  const exAequo = plusAncien.filter((c) => c.vu === seuil);
  const choisi = exAequo[hachage(date) % exAequo.length].m;

  const { error } = await admin.from("motus_jour").insert({
    date,
    mot_id: choisi.id,
    mot: choisi.mot_normalise,
    theme,
  });

  // Course entre deux élèves qui ouvrent la page à la même seconde : la
  // contrainte de clé primaire tranche, on relit la ligne gagnante.
  if (error) {
    const { data: relu } = await admin
      .from("motus_jour")
      .select("date, mot, mot_id, theme")
      .eq("date", date)
      .maybeSingle();
    if (relu) {
      return {
        date,
        mot: relu.mot as string,
        motId: (relu.mot_id as string) ?? null,
        theme: (relu.theme as string) ?? null,
      };
    }
    return null;
  }

  return {
    date,
    mot: choisi.mot_normalise as string,
    motId: choisi.id as string,
    theme,
  };
}

/**
 * Le mot est-il un mot français acceptable comme proposition ?
 *
 * `motus_lexique` contient ~182 000 formes de 4 à 10 lettres, normalisées et
 * fléchies (pluriels et conjugaisons compris) : « chevaux » ou « mangeaient »
 * passent. Le mot du jour, lui, est toujours accepté même s'il manque à cette
 * liste — l'enseignant reste maître de ce qu'il fait deviner.
 */
export async function motExiste(
  admin: SupabaseClient,
  motNormalise: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("motus_lexique")
    .select("mot")
    .eq("mot", motNormalise)
    .maybeSingle();

  // Dictionnaire injoignable : on accepte plutôt que de bloquer la partie.
  // Un refus injuste est plus pénalisant qu'une proposition farfelue acceptée.
  if (error) return true;
  return data != null;
}

export interface EleveCourant {
  eleveId: string | null;
  rbEleveId: number | null;
  prenom: string;
}

/**
 * L'élève derrière la session, sans rien accepter du client : un identifiant
 * envoyé par le navigateur permettrait de jouer à la place d'un camarade.
 */
export async function resoudreEleveCourant(
  admin: SupabaseClient,
  userId: string,
): Promise<EleveCourant | null> {
  const { data: pb } = await admin
    .from("eleves")
    .select("id, prenom")
    .eq("id", userId)
    .maybeSingle();
  if (pb) {
    return { eleveId: pb.id as string, rbEleveId: null, prenom: pb.prenom as string };
  }

  const { data: rb } = await admin
    .from("eleve")
    .select("id, prenom")
    .eq("auth_id", userId)
    .maybeSingle();
  if (rb) {
    return { eleveId: null, rbEleveId: Number(rb.id), prenom: (rb.prenom as string) ?? "" };
  }

  return null;
}

/** Colonne et valeur du filtre élève, quelle que soit la source. */
export function filtreEleve(e: EleveCourant): [string, string | number] {
  return e.eleveId ? ["eleve_id", e.eleveId] : ["rb_eleve_id", e.rbEleveId as number];
}

export interface EtatPartie {
  date: string;
  longueur: number;
  /** Code du thème de la semaine, et son libellé prêt à afficher. */
  theme: string | null;
  theme_libelle: string;
  premiere_lettre: string;
  essais_max: number;
  essais: { mot: string; marques: Marque[] }[];
  trouve: boolean;
  termine: boolean;
  /** Le mot n'est révélé qu'une fois la partie terminée. */
  mot: string | null;
}

/** Vue client d'une partie : tout sauf le mot secret, tant qu'elle est en cours. */
export function etatPartie(
  date: string,
  secret: string,
  essais: string[],
  theme: string | null = null,
): EtatPartie {
  const trouve = essais.includes(secret);
  const termine = trouve || essais.length >= ESSAIS_MAX;
  return {
    date,
    longueur: secret.length,
    theme,
    theme_libelle: libelleTheme(theme),
    premiere_lettre: secret[0],
    essais_max: ESSAIS_MAX,
    essais: essais.map((mot) => ({ mot, marques: evaluerEssai(mot, secret) })),
    trouve,
    termine,
    mot: termine ? secret : null,
  };
}
