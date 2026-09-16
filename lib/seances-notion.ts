/**
 * Lecture de la programmation hebdomadaire dans Notion.
 *
 * La base « Programmation année en cours » est la source de vérité de
 * l'enseignant : il y décrit ses séances semaine après semaine, et l'application
 * `vue-classe` les affiche au tableau. PlanBox vient y puiser de quoi engendrer
 * les exercices, plutôt que de lui faire ressaisir matière, domaine et objectif.
 *
 * Ce module ne fait que **lire et extraire** ; la traduction du vocabulaire vit
 * dans `lib/seances-traduction.ts`, qui se teste sans réseau.
 *
 * Serveur uniquement : `NOTION_TOKEN` ne doit jamais atteindre le navigateur.
 */

import type { SeanceNotion } from "./seances-traduction";

const NOTION_VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

/**
 * Valeurs de « Matière » interrogées.
 *
 * Volontairement restreint aux maths et au français : les autres séances
 * (histoire, sciences, arts…) ne se transforment pas en exercice auto-corrigé.
 * Filtrer ici plutôt qu'après coup évite de rapatrier la moitié de l'année.
 */
const MATIERES_INTERROGEES = [
  "Maths", "Maths CM", "Problème",
  "EDL", "lecture CE2", "Lecture CM", "lecture CM1", "lecture cm2",
];

function config() {
  const token = process.env.NOTION_TOKEN;
  const db = process.env.NOTION_DB_SEANCES;
  if (!token || !db) {
    throw new Error(
      "Programmation Notion non configurée : NOTION_TOKEN et NOTION_DB_SEANCES manquants."
    );
  }
  return { token, db };
}

async function notionFetch(chemin: string, init?: RequestInit) {
  const { token } = config();
  const res = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // La programmation d'une semaine bouge peu : 5 min de cache suffisent à
    // absorber les allers-retours de l'enseignant sur l'écran.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${res.status} : ${err.message ?? res.statusText}`);
  }
  return res.json();
}

/* ── Lecteurs de propriétés ─────────────────────────────────────────────── */

type Props = Record<string, unknown>;
const lireTitre = (p: unknown) =>
  ((p as { title?: Array<{ plain_text: string }> })?.title ?? [])
    .map((t) => t.plain_text).join("").trim();
const lireTexte = (p: unknown) =>
  ((p as { rich_text?: Array<{ plain_text: string }> })?.rich_text ?? [])
    .map((t) => t.plain_text).join("").trim();
const lireMulti = (p: unknown) =>
  ((p as { multi_select?: Array<{ name: string }> })?.multi_select ?? []).map((o) => o.name);
const lireDate = (p: unknown) =>
  (p as { date?: { start?: string } })?.date?.start ?? "";

/* ── Corps de page : corpus et différenciation ──────────────────────────── */

interface BlocNotion {
  type: string;
  [k: string]: unknown;
}

function texteDuBloc(b: BlocNotion): string {
  const contenu = b[b.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
  return (contenu?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
}

/**
 * Extrait du corps d'une séance de français les deux choses qui comptent.
 *
 * Le gabarit est constant sur les pages sondées :
 *
 *   > Corpus de la semaine - « Portrait de Griotte »
 *   > Griotte est la plus jeune sorcière de la forêt. …      ← le texte
 *   Discipline : Grammaire (mardi) · Niveaux : … · Durée : 45 min
 *   Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2    ← les étoiles
 *
 * Le corpus est le bloc qui **suit** l'annonce « Corpus de la semaine » : c'est
 * l'annonce qui porte le titre du texte, et le bloc suivant qui porte le texte.
 * Prendre le bloc d'annonce donnerait un titre en guise de corpus.
 */
export function extraireDuCorps(blocs: BlocNotion[]): {
  corpus: string | null;
  differenciation: string | null;
} {
  let corpus: string | null = null;
  let differenciation: string | null = null;

  for (let i = 0; i < blocs.length; i++) {
    const t = texteDuBloc(blocs[i]);
    if (!t) continue;

    if (corpus === null && /^corpus de la semaine/i.test(t)) {
      const suivant = texteDuBloc(blocs[i + 1] ?? { type: "paragraph" });
      // Un corpus fait une phrase au moins : en deçà, c'est encore du titre.
      if (suivant.length > 40) corpus = suivant;
    }
    if (differenciation === null && /^différenciation\s*:/i.test(t)) {
      differenciation = t;
    }
    if (corpus && differenciation) break;
  }

  return { corpus, differenciation };
}

async function lireCorpsDePage(pageId: string): Promise<BlocNotion[]> {
  const data = await notionFetch(`/blocks/${pageId}/children?page_size=40`);
  return (data.results ?? []) as BlocNotion[];
}

/* ── Chargement d'une semaine ───────────────────────────────────────────── */

function decalerJours(date: string, n: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * Les séances de maths et de français d'une semaine, du lundi au vendredi.
 *
 * Un appel pour la liste, puis un par séance de français pour en tirer le
 * corpus et la différenciation — trois ou quatre par semaine, très en-dessous
 * des trois requêtes par seconde que tolère Notion. Les corps sont lus en
 * série pour ne pas s'en approcher.
 */
export async function chargerSeancesSemaine(lundi: string): Promise<SeanceNotion[]> {
  const { db } = config();
  const vendredi = decalerJours(lundi, 4);

  const data = await notionFetch(`/databases/${db}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 100,
      filter: {
        and: [
          { property: "Date", date: { on_or_after: lundi } },
          { property: "Date", date: { on_or_before: vendredi } },
          { or: MATIERES_INTERROGEES.map((m) => ({
              property: "Matière",
              multi_select: { contains: m },
            })) },
        ],
      },
      sorts: [{ property: "Date", direction: "ascending" }],
    }),
  });

  const lignes = (data.results ?? []) as Array<{ id: string; properties: Props }>;
  const seances: SeanceNotion[] = [];

  for (const ligne of lignes) {
    const p = ligne.properties;
    const matieresNotion = lireMulti(p["Matière"]);
    const estFrancais = matieresNotion.some((m) => /^(edl|lecture)/i.test(m.trim()));

    let corpus: string | null = null;
    let differenciationBrute: string | null = null;

    if (estFrancais) {
      // Le corps ne porte rien d'utile pour les maths : on s'épargne l'appel.
      // Un échec de lecture ne doit pas emporter la séance — elle reste
      // exploitable sans corpus, l'écran le signalera.
      try {
        const extrait = extraireDuCorps(await lireCorpsDePage(ligne.id));
        corpus = extrait.corpus;
        differenciationBrute = extrait.differenciation;
      } catch (e) {
        console.warn(`[seances-notion] corps illisible pour ${ligne.id} :`, e);
      }
    }

    seances.push({
      id: ligne.id,
      date: lireDate(p["Date"]),
      titre: lireTitre(p["Nom de la séance"]) || "Sans titre",
      // La propriété existe en deux graphies dans la base — l'une avec une
      // espace finale, séquelle d'un renommage.
      objectifs: lireTexte(p["Objectifs"]) || lireTexte(p["Objectifs "]),
      matieresNotion,
      disciplines: lireMulti(p["Discipline"]),
      niveaux: lireMulti(p["Niveau"]),
      corpus,
      differenciationBrute,
    });
  }

  return seances;
}
