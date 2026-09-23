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
    throw new ErreurNotion(res.status, err.message ?? res.statusText);
  }
  return res.json();
}

/**
 * Une panne côté Notion, avec son code.
 *
 * Le `detail` vient de Notion et **ne doit pas atteindre l'écran** : son
 * message de 404 cite l'identifiant de base interrogé. Un identifiant mal
 * saisi peut être un jeton — c'est arrivé, et la configuration s'est affichée
 * en clair dans le panneau de planification. Le détail va aux journaux,
 * `messageErreurNotion()` dit à l'enseignant quoi faire.
 */
export class ErreurNotion extends Error {
  constructor(readonly statut: number, readonly detail: string) {
    super(`Notion ${statut}`);
    this.name = "ErreurNotion";
  }
}

/**
 * Ce qu'on montre à l'enseignant : utile, et sans rien répéter de Notion.
 *
 * Chaque code dit une cause différente et appelle un geste différent — un 404
 * se répare dans la configuration, un 401 dans le partage de la base.
 */
export function messageErreurNotion(e: unknown): string {
  if (!(e instanceof ErreurNotion)) {
    // Erreur de configuration : le message est écrit ici, il ne cite rien.
    return e instanceof Error && e.message
      ? e.message
      : "La programmation n'a pas pu être lue.";
  }
  switch (e.statut) {
    case 400:
    case 404:
      return "La base « Programmation année en cours » est introuvable. " +
        "Vérifiez NOTION_DB_SEANCES, et que la base est bien partagée avec l'intégration.";
    case 401:
    case 403:
      return "Notion refuse l'accès. Vérifiez NOTION_TOKEN, et que la base est partagée " +
        "avec cette intégration.";
    case 429:
      return "Notion limite les appels en ce moment. Réessayez dans un instant.";
    default:
      return `Notion n'a pas répondu (erreur ${e.statut}). Réessayez dans un instant.`;
  }
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

/** L'annonce qui précède le texte étudié. Deux graphies dans la base. */
const ANNONCE_CORPUS = /^(corpus de la semaine|texte de lecture)/i;

/** Les lignes d'intendance de la page : elles ne font pas partie du texte. */
const LIGNE_METADONNEE = /^(discipline|niveaux?|durée|différenciation)\s*:/i;

/**
 * Une note de renvoi vers un document, pas de la prose.
 *
 * Les séances de lecture ouvrent par « Prolongement du corpus « … » - feuille
 * imprimable dans Documents ». Laissée dans le corpus, elle partirait dans le
 * prompt et l'IA fabriquerait des questions sur la feuille imprimable.
 */
const NOTE_DE_RENVOI = /^prolongement\b|feuille imprimable/i;

/**
 * Extrait du corps d'une séance de français les deux choses qui comptent.
 *
 * Deux gabarits coexistent, et c'est **toute la difficulté**.
 *
 * Les séances de langue annoncent le corpus et le donnent en un bloc :
 *
 *   > Corpus de la semaine - « Portrait de Griotte »
 *   > Griotte est la plus jeune sorcière de la forêt. …      ← le texte
 *   Discipline : Grammaire (mardi) · Niveaux : … · Durée : 45 min
 *   Différenciation : ★☆☆ tous · ★★☆ CM1 et CM2 · ★★★ CM2    ← les étoiles
 *
 * Les séances de **lecture** portent un autre titre et étalent le texte sur
 * cinq ou six paragraphes, précédés d'une note de renvoi :
 *
 *   ## Texte de lecture - « Rosalie, l'écuyère »
 *   Prolongement du corpus « … » - feuille imprimable dans Documents  ← à jeter
 *   Sous le grand chapiteau, Rosalie est la reine de la piste. …      ← le texte
 *   … (quatre paragraphes de plus)
 *   ## Dictée flash du jour (5 min)                                   ← on s'arrête
 *
 * ⚠️ Ne chercher que « Corpus de la semaine » revenait à ne **jamais** trouver
 * de texte sur les séances de lecture — les seules pour lesquelles le type
 * `lecture` est refusé sans texte. La fonction qui en avait le plus besoin
 * était la seule à repartir les mains vides.
 *
 * On s'arrête à un titre ou à une ligne d'intendance : sans cette borne, le
 * corpus d'une séance de langue avalerait « Discipline : … » et
 * « Différenciation : … », qui la suivent immédiatement.
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

    if (corpus === null && ANNONCE_CORPUS.test(t)) {
      const morceaux: string[] = [];
      for (let j = i + 1; j < blocs.length; j++) {
        if (blocs[j].type.startsWith("heading_")) break;
        const suite = texteDuBloc(blocs[j]);
        if (!suite) continue;
        if (LIGNE_METADONNEE.test(suite)) break;
        if (NOTE_DE_RENVOI.test(suite)) continue;
        morceaux.push(suite);
      }
      const texte = morceaux.join("\n\n");
      // Un corpus fait une phrase au moins : en deçà, c'est encore du titre.
      if (texte.length > 40) corpus = texte;
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
