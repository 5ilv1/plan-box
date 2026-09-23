/**
 * D'une séance de la programmation à un appel de génération.
 *
 * Chaque route `/api/generer-*` a son propre contrat — des champs obligatoires
 * différents, un nom de niveau qui change (`niveau` ici, `niveauNom` là), une
 * réponse tantôt enveloppée dans `resultat`, tantôt non. Ce module concentre
 * ces irrégularités en un seul endroit, et se teste sans réseau.
 *
 * Il ne fait **pas** d'appel : il dit quoi appeler et avec quoi.
 */

import { FONCTIONS_DEFAUT } from "@/types";
import type { SeanceTraduite } from "./seances-traduction";

export interface AppelGeneration {
  endpoint: string;
  body: Record<string, unknown>;
  /** La réponse est enveloppée dans `resultat`, sauf pour le calcul mental. */
  enveloppe: "resultat" | "racine";
}

/** Pourquoi un type ne peut pas être engendré depuis cette séance-là. */
export type Empechement = string | null;

const NB_QUESTIONS = 8;

/**
 * Ce que le modèle doit savoir de la séance, en une consigne.
 *
 * Les objectifs de la programmation sont la matière première : précis et
 * opérationnels en maths (« Décomposer et recomposer un nombre entier jusqu'aux
 * centaines de millions »), plus maigres en français — d'où le titre en renfort.
 */
export function consigneDepuisSeance(s: SeanceTraduite): string {
  const morceaux = [`Séance : ${s.titre}`];
  if (s.objectifs && s.objectifs.trim() !== s.titre.trim()) {
    morceaux.push(`Objectifs travaillés en classe : ${s.objectifs}`);
  }
  morceaux.push(
    `L'exercice doit porter exactement sur ces objectifs, en ${s.matiere.toLowerCase()} · ${s.sousMatiere.toLowerCase()}.`
  );
  return morceaux.join("\n");
}

/**
 * Le type est-il pilotable depuis cette séance ? Renvoie la raison, ou `null`.
 *
 * Mieux vaut le dire à l'écran que de laisser partir un appel qui reviendra en
 * 400 après quinze secondes d'attente.
 */
export function empechement(s: SeanceTraduite, type: string): Empechement {
  if (type === "lecture" && !s.corpus) {
    return "Pas de corpus dans la séance : la lecture a besoin d'un texte.";
  }
  if (type === "classement") {
    return "Le classement demande des catégories, que la programmation ne donne pas.";
  }
  if (type === "ecriture") {
    return "L'atelier d'écriture tire son sujet d'un générateur de thèmes, pas de la séance.";
  }
  return null;
}

/**
 * Construit l'appel de génération pour une séance et un type choisi.
 *
 * Lève si le type est empêché — l'écran doit avoir filtré avant.
 */
export function appelPourSeance(s: SeanceTraduite, type: string): AppelGeneration {
  const bloquant = empechement(s, type);
  if (bloquant) throw new Error(bloquant);

  const consigne = consigneDepuisSeance(s);
  const corpus = s.corpus ?? undefined;

  switch (type) {
    // `eval` emprunte le moteur des exercices : c'est un exercice noté.
    case "exercice":
    case "eval":
      return {
        endpoint: "/api/generer-exercice",
        enveloppe: "resultat",
        body: {
          type: "exercice",
          matiere: s.matiere,
          sousMatiere: s.sousMatiere,
          niveauNom: s.niveau,
          chapitreId: null,
          chapitreTitre: s.titre,
          nbQuestions: NB_QUESTIONS,
          difficulte: s.difficulte,
          contexte: "",
          consigneDetaillee: consigne,
          corpus,
          modele: "",
          assignation: { groupeIds: [], eleveUids: [], groupeNoms: [] },
          dateAssignation: s.date,
          dateLimite: "",
        },
      };

    case "qcm":
      return {
        endpoint: "/api/generer-qcm-theme",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          matiere: s.matiere,
          sous_matiere: s.sousMatiere,
          theme: s.titre,
          consigne,
          titre: s.titre,
          nbQuestions: 10,
        },
      };

    case "texte_a_trous":
      return {
        endpoint: "/api/generer-texte-a-trous",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          objectif: s.objectifs || s.titre,
          description: consigne,
          theme: s.titre,
          corpus,
        },
      };

    case "analyse_phrase":
      return {
        endpoint: "/api/generer-analyse-phrase",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          nbPhrases: 5,
          description: consigne,
          // Obligatoire : sans elle la route échoue en 500. Le référentiel
          // donne les fonctions attendues à chaque niveau.
          fonctionsActives: FONCTIONS_DEFAUT[s.niveau] ?? FONCTIONS_DEFAUT.CM1,
          corpus,
        },
      };

    case "lecture":
      return {
        endpoint: "/api/generer-lecture",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          // La seule route qui prend nativement un texte : le corpus y va
          // directement, pas dans une consigne.
          texte: s.corpus,
          titre: s.titre,
          description: consigne,
          adaptatif: true,
        },
      };

    case "calcul_mental":
      return {
        endpoint: "/api/generer-calcul-mental-ia",
        enveloppe: "racine", // renvoie { calculs }, sans enveloppe
        body: {
          niveauNom: s.niveau,
          // Les calculs de la classe servent de gabarit, pas de réponse : un
          // élève qui les a faits le matin les retrouverait tels quels.
          consignes: s.calculsModeles?.length
            ? `${consigne}\nProduis des calculs NOUVEAUX, de même procédure et de même difficulté que ceux faits en classe ; n'en recopie aucun.`
            : consigne,
          nbCalculs: 10,
        },
      };

    case "probleme_maths":
      return {
        endpoint: "/api/generer-probleme-maths",
        enveloppe: "resultat",
        body: { niveau: s.niveau, theme: s.titre, description: consigne },
      };

    case "comparaison":
      return {
        endpoint: "/api/generer-comparaison",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          nbPaires: 10,
          typeNombres: "entiers",
          avecEgalite: false,
          description: consigne,
        },
      };

    case "rangement":
      return {
        endpoint: "/api/generer-rangement",
        enveloppe: "resultat",
        body: {
          niveau: s.niveau,
          critere: s.matiere === "Mathématiques" ? "croissant" : "alphabetique",
          nbSeries: 4,
          nbElements: 5,
          description: consigne,
        },
      };

    default:
      throw new Error(`Type non pris en charge depuis la programmation : ${type}`);
  }
}

/**
 * Un titre lisible pour le bloc engendré.
 *
 * Le titre de séance porte des repères d'emploi du temps inutiles à l'élève
 * (« Maths CM2 - S3 Jeudi - … (G1 · fiche 91) ») : on ne garde que la notion.
 */
export function titreDuBloc(s: SeanceTraduite): string {
  let t = s.titre;
  t = t.replace(/^\s*(Maths|Français|Lecture|Grammaire|Orthographe|Conjugaison|Vocabulaire|Production d['’]écrits)\s+\w*\s*-\s*/i, "");
  t = t.replace(/^\s*S\d+\s+\w+\s*-\s*/i, "");          // « S3 Jeudi - »
  t = t.replace(/\s*\([A-Z]\d+[^)]*\)\s*$/, "");         // « (G1 · fiche 91) »
  return t.trim() || s.titre;
}

/* ── Reprendre un exercice à l'unité, dans le formulaire complet ────────── */

/** Les types proposés quand on reprend une ligne dans un formulaire. */
export const TYPES_FORMULAIRE = [
  "exercice", "qcm", "texte_a_trous", "analyse_phrase", "lecture",
  "calcul_mental", "probleme_maths", "comparaison", "rangement", "classement",
] as const;

/**
 * Les valeurs de départ d'un formulaire de « Nouvel exercice », tirées de la
 * séance.
 *
 * Le panneau engendre d'un seul geste ; parfois l'enseignant veut reprendre un
 * exercice : changer son type, préciser la consigne, fixer des catégories. On
 * lui ouvre alors **le même formulaire que la page « Nouvel exercice »**, déjà
 * rempli pour la notion — pas un second formulaire qui divergerait du premier.
 *
 * Les noms de champs sont ceux que chaque formulaire lit dans `defaultValues`.
 * Le **groupe** est celui du niveau de la ligne : le formulaire d'exercice en
 * déduit le niveau donné au modèle (`niveauNom`), sans lui il écrirait
 * « École primaire ».
 *
 * `classement` et `lecture` sans corpus, refusés au panneau faute de
 * catégories ou de texte, deviennent possibles ici : le formulaire permet de
 * les saisir.
 */
export function valeursFormulaire(
  s: SeanceTraduite,
  type: string,
  groupe: { id: string; nom: string } | null,
): Record<string, unknown> {
  const consigne = consigneDepuisSeance(s);
  const commun = {
    type,
    matiere: s.matiere,
    sousMatiere: s.sousMatiere,
    niveau: s.niveau,
    chapitreId: "",
    chapitreTitre: "",
    assignation: groupe
      ? { groupeIds: [groupe.id], eleveUids: [], groupeNoms: [groupe.nom] }
      : { groupeIds: [], eleveUids: [], groupeNoms: [] },
    dateAssignation: s.date,
    periodicite: "jour",
  };

  switch (type) {
    case "exercice":
    case "eval":
      return { ...commun, type: "exercice", consigneDetaillee: consigne, difficulte: s.difficulte, nbQuestions: NB_QUESTIONS, contexte: "" };
    case "qcm":
      return { ...commun, sous_matiere: s.sousMatiere, theme: s.titre, consigne, titre: titreDuBloc(s), nbQuestions: 10 };
    case "texte_a_trous":
      return { ...commun, mode: "ia", objectif: s.objectifs || s.titre, description: consigne, theme: s.titre };
    case "analyse_phrase":
      return {
        ...commun, mode: "ia", description: consigne, nbPhrases: 5,
        fonctionsActives: FONCTIONS_DEFAUT[s.niveau] ?? FONCTIONS_DEFAUT.CM1,
      };
    case "lecture":
      return { ...commun, mode: "texte", texte: s.corpus ?? "", titre: s.titre, description: consigne };
    case "calcul_mental":
      return {
        ...commun,
        consignesSpeciales: s.calculsModeles?.length
          ? `${consigne}\nProduis des calculs NOUVEAUX, de même procédure et de même difficulté que ceux faits en classe ; n'en recopie aucun.`
          : consigne,
        nbCalculs: 10,
        titrePersonnalise: titreDuBloc(s),
      };
    case "probleme_maths":
      return { ...commun, theme: s.titre, description: consigne };
    case "comparaison":
      return { ...commun, nbPaires: 10, typeNombres: "entiers", avecEgalite: false, description: consigne };
    case "rangement":
      return {
        ...commun, critere: s.matiere === "Mathématiques" ? "croissant" : "alphabetique",
        nbSeries: 4, nbElements: 5, description: consigne,
      };
    case "classement":
      return { ...commun, mode: "ia", theme: s.titre, description: consigne };
    default:
      return commun;
  }
}
