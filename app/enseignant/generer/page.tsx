"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  ParamsGeneration,
  ParamsCalcMental,
  ParamsRessource,
  ParamsDictee,
  ExerciceIA,
  CalcMentalIA,
  RessourceIA,
  DicteeIAGroupee,
  DicteeContenu,
  MotsContenu,
  BanqueExercice,
} from "@/types";
import { genererCarteCalcul, TemplateCalcul, Operation } from "@/lib/calcul";
import { resoudreAssignation } from "@/lib/resoudre-assignation";
import { niveauNomToEtoiles } from "@/lib/dictee-utils";
import GenererExerciceForm from "@/components/GenererExerciceForm";
import GenererCalcMentalForm from "@/components/GenererCalcMentalForm";
import GenererRessourceForm from "@/components/GenererRessourceForm";
import GenererDicteeForm from "@/components/GenererDicteeForm";
import GenererTexteATrousForm from "@/components/GenererTexteATrousForm";
import GenererAnalysePhraseForm from "@/components/GenererAnalysePhraseForm";
import GenererClassementForm from "@/components/GenererClassementForm";
import GenererLectureForm from "@/components/GenererLectureForm";
import ExercicePreview from "@/components/ExercicePreview";
import DicteePreview from "@/components/DicteePreview";
import BanqueExercices from "@/components/BanqueExercices";
import RepetiboxLink from "@/components/RepetiboxLink";
import EnseignantLayout from "@/components/EnseignantLayout";

type TypeBloc = "exercice" | "calcul_mental" | "ressource" | "dictee" | "texte_a_trous" | "analyse_phrase" | "classement" | "lecture";
type Etape = "formulaire" | "chargement" | "apercu" | "sauvegarde";

interface TexteATrousData {
  titre: string;
  consigne: string;
  texte_complet: string;
  trous: { position: number; mot: string; indice?: string }[];
}

interface AnalysePhraseData {
  titre: string;
  consigne: string;
  phrases: { texte: string; groupes: { mots: string; fonction: string; debut: number; fin: number }[] }[];
}

interface ClassementData {
  titre: string;
  consigne: string;
  categories: string[];
  items: { texte: string; categorie: string }[];
}

interface LectureData {
  titre: string;
  texte: string;
  questions: { id: number; question: string; choix: string[]; reponse: number }[];
}

type ContenuPreview =
  | { type: "exercice"; data: ExerciceIA }
  | { type: "calcul_mental"; data: CalcMentalIA }
  | { type: "ressource"; data: RessourceIA }
  | { type: "texte_a_trous"; data: TexteATrousData }
  | { type: "analyse_phrase"; data: AnalysePhraseData }
  | { type: "classement"; data: ClassementData }
  | { type: "lecture"; data: LectureData };

// ─── Mapping symboles → opérations ───────────────────────────────────────
const SYMBOLE_VERS_OP: Record<string, Operation> = {
  "+": "addition",
  "-": "soustraction",
  "×": "multiplication",
  "÷": "division",
};

const PLAGES_DIFFICULTE: Record<
  "facile" | "moyen" | "difficile",
  { aMin: number; aMax: number; bMin: number; bMax: number }
> = {
  facile:    { aMin: 1, aMax: 20,  bMin: 1, bMax: 10 },
  moyen:     { aMin: 1, aMax: 50,  bMin: 1, bMax: 12 },
  difficile: { aMin: 10, aMax: 100, bMin: 2, bMax: 15 },
};

/** Construit les TemplateCalcul à partir des paramètres du formulaire */
function buildModeles(
  params: ParamsCalcMental
): { modeles: TemplateCalcul[]; nbCalculs: number } {
  const { aMin, aMax, bMin, bMax } = PLAGES_DIFFICULTE[params.difficulte];
  const tableNum = params.table
    ? parseInt(params.table.replace(/[^0-9]/g, "")) || null
    : null;

  const modeles: TemplateCalcul[] = params.operations.map((sym) => ({
    operation: SYMBOLE_VERS_OP[sym] ?? "addition",
    variables: {
      a: { min: aMin, max: aMax },
      b: tableNum ? { min: tableNum, max: tableNum } : { min: bMin, max: bMax },
    },
  }));

  return { modeles, nbCalculs: params.nbCalculs };
}

/** Génère des calculs concrets depuis des modèles (pour l'aperçu) */
function genererDepuisModeles(
  modeles: TemplateCalcul[],
  nb: number
): { id: number; enonce: string; reponse: string }[] {
  return Array.from({ length: nb }, (_, i) => {
    const tmpl = modeles[i % modeles.length];
    const carte = genererCarteCalcul(tmpl);
    return { id: i + 1, enonce: carte.recto, reponse: carte.bonneReponse };
  });
}

// ─── Jours ouvrés (sans mercredi ni week-end) ─────────────────────────────────

/** Retourne true si le jour est travaillé (lun, mar, jeu, ven) */
function estJourTravaille(date: Date): boolean {
  const j = date.getDay(); // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
  return j !== 0 && j !== 3 && j !== 6;
}

/** Avance de `n` jours travaillés à partir de `depart` (inclus si travaillé) */
function ajouterJoursTravailles(depart: Date, n: number): Date {
  const d = new Date(depart);
  // Si le jour de départ n'est pas travaillé, avancer jusqu'au premier jour travaillé
  while (!estJourTravaille(d)) d.setDate(d.getDate() + 1);
  // Puis avancer de n jours travaillés supplémentaires
  for (let i = 0; i < n; i++) {
    d.setDate(d.getDate() + 1);
    while (!estJourTravaille(d)) d.setDate(d.getDate() + 1);
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

function PageGenererInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultChapitreId = searchParams.get("chapitre") ?? undefined;
  const supabase = createClient();

  const TYPES_VALIDES: TypeBloc[] = ["exercice", "calcul_mental", "ressource", "dictee", "texte_a_trous", "analyse_phrase", "classement", "lecture"];
  const [typeBloc, setTypeBloc] = useState<TypeBloc>("exercice");

  // Synchronise le type avec le paramètre URL ?type=... au montage et à chaque changement d'URL
  useEffect(() => {
    const type = searchParams.get("type") as TypeBloc | null;
    if (type && TYPES_VALIDES.includes(type)) {
      setTypeBloc(type);
    }
  }, [searchParams]);
  const [etape, setEtape] = useState<Etape>("formulaire");
  const [contenu, setContenu] = useState<ContenuPreview | null>(null);
  const [paramsEnCours, setParamsEnCours] = useState<ParamsGeneration | Record<string, any> | null>(null);
  const [erreur, setErreur] = useState("");
  const [banqueOuverte, setBanqueOuverte] = useState(false);
  const [messageSucces, setMessageSucces] = useState("");
  const [enregistrementBiblio, setEnregistrementBiblio] = useState(false);
  // Ressource pré-chargée depuis la bibliothèque (?biblio=<id>)
  const [ressourceBiblio, setRessourceBiblio] = useState<{ titre: string; sous_type: string; contenu: Record<string, unknown>; matiere: string | null } | null>(null);

  // Charger la ressource bibliothèque si param ?biblio=<id>
  useEffect(() => {
    const biblioId = searchParams.get("biblio");
    if (!biblioId) return;
    fetch(`/api/bibliotheque-ressources/${biblioId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ressource) setRessourceBiblio(json.ressource);
      })
      .catch(() => null);
  }, [searchParams]);

  // États spécifiques aux dictées
  const [dicteeResultats, setDicteeResultats] = useState<DicteeIAGroupee[]>([]);
  const [dicteePreviewIdx, setDicteePreviewIdx] = useState(0);
  const [chargementDictee, setChargementDictee] = useState(false);
  const [progressDictee, setProgressDictee] = useState({ fait: 0, total: 0 });
  const [generationAudioEnCours, setGenerationAudioEnCours] = useState(false);
  const [progressAudio, setProgressAudio] = useState<{ label: string; fait: boolean }[]>([]);

  async function generer(params: ParamsGeneration | Record<string, any>) {
    setParamsEnCours(params);
    setEtape("chargement");
    setErreur("");

    // ── Ressource : pas d'IA, passage direct à l'aperçu ────────────────
    if (params.type === "ressource") {
      const p = params as ParamsRessource;
      setContenu({ type: "ressource", data: p.contenu });
      setEtape("apercu");
      return;
    }

    // ── Calcul mental : génération locale, sans IA ──────────────────────
    if (params.type === "calcul_mental") {
      const { modeles, nbCalculs } = buildModeles(params as ParamsCalcMental);
      const aperçuCalculs = genererDepuisModeles(modeles, nbCalculs);
      const c: ContenuPreview = {
        type: "calcul_mental",
        data: {
          calculs: aperçuCalculs,
          modeles: modeles as unknown as Record<string, unknown>[],
          nb_calculs: nbCalculs,
          operations: (params as any).operations,
        },
      };
      setContenu(c);
      setEtape("apercu");
      return;
    }

    // ── Dictée : N appels IA pour N dictées différentes ─────────────────
    if (params.type === "dictee") {
      const p = params as ParamsDictee;
      const nb = p.nbDictees ?? 1;
      setProgressDictee({ fait: 0, total: nb });
      const resultats: DicteeIAGroupee[] = [];

      for (let i = 0; i < nb; i++) {
        // À partir de la 2ème dictée, imposer les mots de la 1ère
        // pour que toute la semaine travaille le même vocabulaire
        const motsImposer = i > 0
          ? Object.fromEntries(
              resultats[0].niveaux.map((n) => [n.etoiles, n.mots])
            )
          : undefined;

        const res = await fetch("/api/generer-dictee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, ...(motsImposer ? { motsImposer } : {}) }),
        });
        const json = await res.json();
        if (!res.ok || json.erreur) {
          setErreur(json.erreur ?? "Erreur lors de la génération de la dictée.");
          setEtape("formulaire");
          return;
        }
        resultats.push(json.resultat as DicteeIAGroupee);
        setProgressDictee({ fait: i + 1, total: nb });
      }

      setDicteeResultats(resultats);
      setDicteePreviewIdx(0);
      setEtape("apercu");
      return;
    }

    // ── Texte à trous ──────────────────────────────────────────────────
    if (params.type === "texte_a_trous") {
      const p = params as any;

      // Mode manuel : parser les [mot] du texte
      if (p.mode === "manuel" && p.texteManuel) {
        const regex = /\[([^\]]+)\]/g;
        const texteComplet = p.texteManuel.replace(regex, "$1");
        const mots = texteComplet.split(/\s+/);
        const trous: { position: number; mot: string }[] = [];

        // Re-parser pour trouver les positions
        let motIdx = 0;
        const parts = p.texteManuel.split(/(\[[^\]]+\])/);
        for (const part of parts) {
          if (part.startsWith("[") && part.endsWith("]")) {
            const mot = part.slice(1, -1);
            trous.push({ position: motIdx, mot });
            motIdx++;
          } else {
            const words = part.trim().split(/\s+/).filter(Boolean);
            motIdx += words.length;
          }
        }

        setContenu({
          type: "texte_a_trous",
          data: { titre: "Texte à trous", consigne: "Complète les mots manquants.", texte_complet: texteComplet, trous },
        });
        setEtape("apercu");
        return;
      }

      // Mode IA
      const res = await fetch("/api/generer-texte-a-trous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok || json.erreur) {
        setErreur(json.erreur ?? "Erreur lors de la génération.");
        setEtape("formulaire");
        return;
      }
      setContenu({ type: "texte_a_trous", data: json.resultat as TexteATrousData });
      setEtape("apercu");
      return;
    }

    // ── Analyse de phrase ────────────────────────────────────────────────
    if (params.type === "analyse_phrase") {
      const p = params as any;

      // Mode manuel : parser les [groupe|Fonction] ou envoyer à l'IA
      if (p.mode === "manuel" && p.texteManuel) {
        const lignes = p.texteManuel.split("\n").filter((l: string) => l.trim());
        const phrases = lignes.map((ligne: string) => {
          const regex = /\[([^|]+)\|([^\]]+)\]/g;
          const groupes: { mots: string; fonction: string; debut: number; fin: number }[] = [];
          let texteComplet = ligne.replace(regex, "$1");
          const mots = texteComplet.split(/\s+/);
          let match;
          const regexCopy = /\[([^|]+)\|([^\]]+)\]/g;
          while ((match = regexCopy.exec(ligne)) !== null) {
            const motsDuGroupe = match[1].trim();
            const fonction = match[2].trim();
            const debut = mots.findIndex((m: string, i: number) => mots.slice(i, i + motsDuGroupe.split(/\s+/).length).join(" ").replace(/[.,;:!?]/g, "") === motsDuGroupe.replace(/[.,;:!?]/g, ""));
            if (debut >= 0) {
              groupes.push({ mots: motsDuGroupe, fonction, debut, fin: debut + motsDuGroupe.split(/\s+/).length - 1 });
            }
          }
          return { texte: texteComplet, groupes };
        });

        // Si aucune annotation trouvée, envoyer à l'IA pour analyser
        if (phrases.every((ph: any) => ph.groupes.length === 0)) {
          // Fallback: envoyer les phrases brutes à l'IA
          const res = await fetch("/api/generer-analyse-phrase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, description: `Analyse ces phrases : ${p.texteManuel}` }),
          });
          const json = await res.json();
          if (!res.ok || json.erreur) {
            setErreur(json.erreur ?? "Erreur lors de la génération.");
            setEtape("formulaire");
            return;
          }
          setContenu({ type: "analyse_phrase", data: json.resultat as AnalysePhraseData });
          setEtape("apercu");
          return;
        }

        setContenu({
          type: "analyse_phrase",
          data: { titre: "Analyse grammaticale", consigne: "Identifie les fonctions des groupes de mots.", phrases },
        });
        setEtape("apercu");
        return;
      }

      // Mode IA
      const res = await fetch("/api/generer-analyse-phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok || json.erreur) {
        setErreur(json.erreur ?? "Erreur lors de la génération.");
        setEtape("formulaire");
        return;
      }
      setContenu({ type: "analyse_phrase", data: json.resultat as AnalysePhraseData });
      setEtape("apercu");
      return;
    }

    // ── Lecture ────────────────────────────────────────────────────────
    if (params.type === "lecture") {
      const p = params as any;
      const res = await fetch("/api/generer-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok || json.erreur) {
        setErreur(json.erreur ?? "Erreur lors de la génération.");
        setEtape("formulaire");
        return;
      }
      setContenu({ type: "lecture", data: json.resultat as LectureData });
      setEtape("apercu");
      return;
    }

    // ── Classement ────────────────────────────────────────────────────
    if (params.type === "classement") {
      const p = params as any;

      // Mode manuel
      if (p.mode === "manuel" && p.texteManuel) {
        const lignes = p.texteManuel.split("\n").filter((l: string) => l.trim());
        const itemsManuels = lignes.map((l: string) => {
          const [texte, categorie] = l.split("|").map((s: string) => s.trim());
          return { texte: texte || l.trim(), categorie: categorie || "" };
        }).filter((i: any) => i.texte && i.categorie);

        if (itemsManuels.length === 0) {
          setErreur("Format invalide. Utilise : élément | catégorie");
          setEtape("formulaire");
          return;
        }

        setContenu({
          type: "classement",
          data: { titre: "Classement", consigne: "Classe chaque élément dans la bonne catégorie.", categories: p.categories, items: itemsManuels },
        });
        setEtape("apercu");
        return;
      }

      // Mode IA
      const res = await fetch("/api/generer-classement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok || json.erreur) {
        setErreur(json.erreur ?? "Erreur lors de la génération.");
        setEtape("formulaire");
        return;
      }
      setContenu({ type: "classement", data: json.resultat as ClassementData });
      setEtape("apercu");
      return;
    }

    // ── Exercice : appel IA ──────────────────────────────────────────────
    const res = await fetch("/api/generer-exercice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok || json.erreur) {
      setErreur(json.erreur ?? "Erreur lors de la génération.");
      setEtape("formulaire");
      return;
    }

    const c: ContenuPreview = { type: "exercice", data: json.resultat as ExerciceIA };
    setContenu(c);
    setEtape("apercu");
  }

  function regenerer() {
    if (paramsEnCours) generer(paramsEnCours);
  }

  async function enregistrerDansBibliotheque() {
    if (!contenu || contenu.type !== "ressource" || !paramsEnCours) return;
    setEnregistrementBiblio(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setEnregistrementBiblio(false); return; }

    const p = paramsEnCours as ParamsRessource;
    const taches = (p.contenu.taches ?? []);
    const premierSousType = taches[0]?.sous_type ?? "ressource";

    const res = await fetch("/api/bibliotheque-ressources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enseignant_id: user.id,
        titre: p.titre,
        sous_type: premierSousType,
        contenu: p.contenu,
        matiere: (p.contenu as { matiere?: string }).matiere ?? null,
      }),
    });

    setEnregistrementBiblio(false);
    if (res.ok) {
      setMessageSucces("✅ Ressource enregistrée dans la bibliothèque !");
      setTimeout(() => setMessageSucces(""), 4000);
    }
  }

  async function valider(contenuFinal: ContenuPreview) {
    if (!paramsEnCours) return;
    setEtape("sauvegarde");

    // ── Construire le JSONB à stocker ────────────────────────────────────
    let contenuJsonb: Record<string, unknown>;

    if (contenuFinal.type === "ressource") {
      // Ressource : stocker le contenu tel quel
      contenuJsonb = { ...contenuFinal.data };

      // Générer un QCM si une tâche podcast a une transcription
      const taches = (contenuFinal.data.taches ?? []) as Array<{ sous_type?: string; transcription?: string }>;
      const tacheAvecTranscription = taches.find(
        (t) => t.sous_type === "podcast" && t.transcription && t.transcription.trim().length >= 50
      );
      if (tacheAvecTranscription?.transcription) {
        try {
          const qcmRes = await fetch("/api/generer-qcm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: tacheAvecTranscription.transcription,
              titre: (paramsEnCours as ParamsRessource).titre,
              nbQuestions: 10,
            }),
          });
          const qcmJson = await qcmRes.json();
          if (qcmRes.ok && qcmJson.questions) {
            contenuJsonb = {
              ...contenuJsonb,
              qcm: qcmJson.questions,
              qcm_id: qcmJson.qcm_id,
            };
          } else {
            console.warn("[valider] QCM non généré :", qcmJson.erreur);
          }
        } catch (err) {
          console.warn("[valider] Erreur génération QCM :", err);
          // On ne bloque pas la validation si le QCM échoue
        }
      }
    } else if (contenuFinal.type === "exercice") {
      contenuJsonb = {
        matiere: (paramsEnCours as { matiere?: string }).matiere,
        ...contenuFinal.data,
        genere_par_ia: true,
        modele_utilise: "claude-haiku-4-5-20251001",
      };
    } else if (contenuFinal.type === "texte_a_trous") {
      contenuJsonb = {
        ...contenuFinal.data,
        genere_par_ia: (paramsEnCours as any).mode === "ia",
      };
    } else if (contenuFinal.type === "analyse_phrase") {
      contenuJsonb = {
        ...contenuFinal.data,
        fonctionsActives: (paramsEnCours as any).fonctionsActives,
        genere_par_ia: (paramsEnCours as any).mode === "ia",
      };
    } else if (contenuFinal.type === "classement") {
      contenuJsonb = {
        ...contenuFinal.data,
        genere_par_ia: (paramsEnCours as any).mode === "ia",
      };
    } else if (contenuFinal.type === "lecture") {
      contenuJsonb = {
        ...contenuFinal.data,
        genere_par_ia: true,
      };
    } else if ((contenuFinal.data as any).modeles) {
      // Nouveau format aléatoire — on stocke les modèles, pas les calculs
      contenuJsonb = {
        modeles: (contenuFinal.data as any).modeles,
        nb_calculs: (contenuFinal.data as any).nb_calculs,
        operations: (contenuFinal.data as any).operations ?? (paramsEnCours as any).operations,
      };
    } else {
      // Ancien format IA — on stocke les calculs fixes
      contenuJsonb = {
        ...contenuFinal.data,
        nb_calculs: (contenuFinal.data.calculs ?? []).length,
        operations: (paramsEnCours as { operations?: string[] }).operations,
        genere_par_ia: true,
      };
    }

    const titre =
      contenuFinal.type === "ressource"
        ? (paramsEnCours as ParamsRessource).titre
        : contenuFinal.type === "exercice"
        ? (contenuFinal.data as ExerciceIA).titre
        : contenuFinal.type === "texte_a_trous"
        ? (contenuFinal.data as TexteATrousData).titre
        : contenuFinal.type === "analyse_phrase"
        ? (contenuFinal.data as AnalysePhraseData).titre
        : contenuFinal.type === "classement"
        ? (contenuFinal.data as ClassementData).titre
        : contenuFinal.type === "lecture"
        ? (contenuFinal.data as LectureData).titre
        : `Calcul mental — ${(paramsEnCours as { operations?: string[] }).operations?.join(", ")}`;

    const chapitreId = (paramsEnCours as { chapitreId?: string | null }).chapitreId ?? null;

    // Label du groupe/classe (stocké sur chaque ligne pour l'affichage dashboard)
    const assignation = paramsEnCours.assignation;
    const groupeLabel: string | null = (() => {
      if (assignation.touteClasse) return "Toute la classe";
      const parts: string[] = [];
      if (assignation.groupeNoms.length > 0) parts.push(assignation.groupeNoms.join(", "));
      if (assignation.eleveUids.length > 0 && assignation.groupeIds.length === 0) return null; // individuels
      return parts.length > 0 ? parts.join(" + ") : null;
    })();

    // 1. Résoudre l'assignation → liste d'élèves (côté serveur pour bypass RLS)
    let elevesResolus: { uid: string; eleve_id: string | null; repetibox_eleve_id: number | null }[];
    try {
      const resAssign = await fetch("/api/resoudre-assignation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignation }),
      });
      const jsonAssign = await resAssign.json();
      elevesResolus = jsonAssign.eleves ?? [];
    } catch (err) {
      console.error("[resoudreAssignation] erreur :", err);
      setErreur("Impossible de résoudre la liste d'élèves.");
      setEtape("apercu");
      return;
    }

    if (elevesResolus.length === 0) {
      setErreur("Aucun élève trouvé pour cette assignation.");
      setEtape("apercu");
      return;
    }

    // 2. Insérer via API serveur (bypass RLS)
    try {
      const resInsert = await fetch("/api/affecter-plan-travail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elevesResolus,
          titre,
          type: contenuFinal.type,
          contenu: contenuJsonb,
          dateAssignation: paramsEnCours.dateAssignation,
          dateLimite: paramsEnCours.dateLimite || null,
          periodicite: (paramsEnCours as { periodicite?: string }).periodicite ?? "jour",
          chapitreId,
          groupeLabel,
        }),
      });
      const jsonInsert = await resInsert.json();
      if (!resInsert.ok || jsonInsert.error) {
        setErreur(`Erreur lors de l'assignation : ${jsonInsert.error ?? "Erreur inconnue"}`);
        setEtape("apercu");
        return;
      }
      console.log(`[plan_travail] ${jsonInsert.nb} lignes insérées`);
    } catch (err) {
      console.error("[plan_travail] erreur :", err);
      setErreur("Erreur lors de l'assignation.");
      setEtape("apercu");
      return;
    }

    // 3. Sauvegarde dans banque_exercices (exercice et calcul_mental uniquement)
    const dateFr = new Date(paramsEnCours.dateAssignation + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    if (contenuFinal.type === "ressource") {
      const n = elevesResolus.length;
      setMessageSucces(
        `« ${titre} » affecté à ${n} élève${n > 1 ? "s" : ""} (${groupeLabel ?? "individuel"}) pour le ${dateFr}`
      );
      setContenu(null);
      setParamsEnCours(null);
      setEtape("formulaire");
      setTimeout(() => setMessageSucces(""), 6000);
      return;
    }

    const resB = await fetch("/api/admin/exercices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: contenuFinal.type,
        matiere: (paramsEnCours as { matiere?: string }).matiere ?? null,
        niveau_id: null,
        chapitre_id: chapitreId,
        titre: contenuFinal.type === "exercice" ? titre : null,
        contenu: contenuJsonb,
        nb_utilisations: elevesResolus.length,
      }),
    });
    const jsonB = await resB.json();
    if (!resB.ok) {
      console.error("[banque_exercices] INSERT erreur :", jsonB.erreur);
      setErreur("Exercice planifié, mais erreur banque : " + jsonB.erreur);
    } else {
      console.log("[banque_exercices] INSERT OK — id:", jsonB.id);
    }

    const n = elevesResolus.length;
    setMessageSucces(
      `« ${titre} » affecté à ${n} élève${n > 1 ? "s" : ""} (${groupeLabel ?? "individuel"}) pour le ${dateFr}`
    );
    setContenu(null);
    setParamsEnCours(null);
    setEtape("formulaire");
    setTimeout(() => setMessageSucces(""), 6000);
  }

  // ── Validation dictée : sauvegarde + plan_travail ─────────────────────
  async function validerDictee() {
    if (dicteeResultats.length === 0 || !paramsEnCours || paramsEnCours.type !== "dictee") return;
    const params = paramsEnCours as ParamsDictee;

    setChargementDictee(true);
    setErreur("");

    // a) Résoudre les élèves une seule fois
    let elevesResolus;
    try {
      elevesResolus = await resoudreAssignation(supabase, params.assignation);
    } catch (err) {
      console.error("[validerDictee] résolution élèves :", err);
      setErreur("Impossible de résoudre la liste d'élèves.");
      setChargementDictee(false);
      return;
    }

    // Résoudre le niveau étoiles de chaque élève
    // Plan Box : niveau_etoiles si défini, sinon déduction depuis la classe
    const eleveIds = elevesResolus.filter((e) => e.eleve_id).map((e) => e.eleve_id!);
    const rbIds = elevesResolus.filter((e) => e.repetibox_eleve_id).map((e) => e.repetibox_eleve_id!);

    const [pbRes, rbMetaRes] = await Promise.all([
      eleveIds.length > 0
        ? supabase.from("eleves").select("id, niveau_etoiles, niveaux(nom)").in("id", eleveIds)
        : Promise.resolve({ data: [] }),
      rbIds.length > 0
        ? supabase.from("eleves_planbox_meta").select("repetibox_eleve_id, niveau_etoiles").in("repetibox_eleve_id", rbIds)
        : Promise.resolve({ data: [] }),
    ]);

    const niveauParEleve: Record<string, 1 | 2 | 3 | 4> = {};
    for (const e of (pbRes.data ?? []) as { id: string; niveau_etoiles: number | null; niveaux: { nom?: string } | null }[]) {
      if (e.niveau_etoiles) {
        niveauParEleve[e.id] = e.niveau_etoiles as 1 | 2 | 3 | 4;
      } else {
        const nomNiveau = e.niveaux?.nom ?? "";
        niveauParEleve[e.id] = niveauNomToEtoiles(nomNiveau);
      }
    }

    const rbNiveauMap = new Map<number, 1 | 2 | 3 | 4>(
      ((rbMetaRes.data ?? []) as { repetibox_eleve_id: number; niveau_etoiles: number | null }[])
        .filter((m) => m.niveau_etoiles)
        .map((m) => [m.repetibox_eleve_id, m.niveau_etoiles as 1 | 2 | 3 | 4])
    );

    // b) Pour chaque dictée générée : sauvegarder + créer plan_travail
    // Un batchId unique regroupe toutes les dictées de la semaine
    const batchId = crypto.randomUUID();

    // Label groupe/classe pour les dictées
    const groupeLabelDictee: string | null = (() => {
      if (params.assignation.touteClasse) return "Toute la classe";
      const parts: string[] = [];
      if (params.assignation.groupeNoms.length > 0) parts.push(params.assignation.groupeNoms.join(", "));
      if (params.assignation.eleveUids.length > 0 && params.assignation.groupeIds.length === 0) return null;
      return parts.length > 0 ? parts.join(" + ") : null;
    })();

    // Pré-calculer les IDs séparés une fois (réutilisé dans la boucle)
    const pbEleveIds = elevesResolus.filter((e) => e.eleve_id).map((e) => e.eleve_id!);
    const rbEleveIds2 = elevesResolus.filter((e) => e.repetibox_eleve_id != null).map((e) => e.repetibox_eleve_id!);

    for (let d = 0; d < dicteeResultats.length; d++) {
      const dicteeResultat = dicteeResultats[d];
      const dateD = ajouterJoursTravailles(new Date(params.dateAssignation), d)
        .toISOString().split("T")[0];

      // ── 1. Sauvegarder les 4 niveaux dans `dictees` en un seul INSERT batch ──
      const parentId = crypto.randomUUID();
      const lignesDictees = dicteeResultat.niveaux.map((niv) => ({
        batch_id: batchId,
        dictee_parent_id: parentId,
        titre: dicteeResultat.titre,
        theme: params.theme,
        texte: niv.texte,
        phrases: niv.phrases,
        mots: niv.mots,
        points_travailles: niv.points_travailles,
        temps_verbaux: params.tempsVerbaux,
        niveau_etoiles: niv.etoiles,
        created_at: new Date().toISOString(),
      }));
      const { error: eDictee } = await supabase.from("dictees").insert(lignesDictees).select("id, niveau_etoiles");
      if (eDictee) {
        console.error(`[dictees] INSERT batch dictée ${d + 1} :`, eDictee.message);
        setErreur(`Erreur sauvegarde dictée ${d + 1} : ${eDictee.message}`);
        setChargementDictee(false);
        return;
      }

      // ── 2. Vérifier les doublons en 2 requêtes parallèles ──────────────────
      const [{ data: dejaPbD }, { data: dejaRbD }] = await Promise.all([
        pbEleveIds.length > 0
          ? supabase
              .from("plan_travail")
              .select("eleve_id")
              .in("eleve_id", pbEleveIds)
              .eq("titre", dicteeResultat.titre)
              .eq("type", "dictee")
              .eq("date_assignation", dateD)
          : Promise.resolve({ data: [] as { eleve_id: string }[] }),
        rbEleveIds2.length > 0
          ? supabase
              .from("plan_travail")
              .select("repetibox_eleve_id")
              .in("repetibox_eleve_id", rbEleveIds2)
              .eq("titre", dicteeResultat.titre)
              .eq("type", "dictee")
              .eq("date_assignation", dateD)
          : Promise.resolve({ data: [] as { repetibox_eleve_id: number }[] }),
      ]);

      const dejaEleveIdsD = new Set((dejaPbD ?? []).map((r) => r.eleve_id));
      const dejaRbIdsD = new Set((dejaRbD ?? []).map((r) => r.repetibox_eleve_id));

      // ── 3. Construire toutes les lignes plan_travail à insérer ─────────────
      const lignesPlanTravail: Record<string, unknown>[] = [];

      for (const eleve of elevesResolus) {
        const dejaAssignee = eleve.eleve_id
          ? dejaEleveIdsD.has(eleve.eleve_id)
          : eleve.repetibox_eleve_id != null
          ? dejaRbIdsD.has(eleve.repetibox_eleve_id)
          : true;

        if (dejaAssignee) {
          console.log("[plan_travail] SKIP dictée (déjà assignée) — élève:", eleve.uid, "date:", dateD);
          continue;
        }

        const etoiles: 1 | 2 | 3 | 4 =
          eleve.eleve_id
            ? (niveauParEleve[eleve.eleve_id] ?? 2)
            : eleve.repetibox_eleve_id
            ? (rbNiveauMap.get(eleve.repetibox_eleve_id) ?? 2)
            : 2;
        const niv = dicteeResultat.niveaux.find((n) => n.etoiles === etoiles) ?? dicteeResultat.niveaux[0];

        const contenuDictee: DicteeContenu = {
          niveau_etoiles: niv.etoiles as 1 | 2 | 3 | 4,
          titre: dicteeResultat.titre,
          texte: niv.texte,
          phrases: niv.phrases,
          mots: niv.mots,
          dictee_parent_id: parentId,
        };
        const contenuMots: MotsContenu = {
          mots: niv.mots,
          titre_dictee: dicteeResultat.titre,
        };

        lignesPlanTravail.push(
          {
            eleve_id: eleve.eleve_id,
            repetibox_eleve_id: eleve.repetibox_eleve_id,
            titre: dicteeResultat.titre,
            type: "dictee",
            contenu: contenuDictee,
            date_assignation: dateD,
            date_limite: params.dateLimite || null,
            periodicite: params.periodicite ?? "jour",
            statut: "a_faire",
            chapitre_id: null,
            groupe_label: groupeLabelDictee,
          },
          {
            eleve_id: eleve.eleve_id,
            repetibox_eleve_id: eleve.repetibox_eleve_id,
            titre: `Mots — ${dicteeResultat.titre}`,
            type: "mots",
            contenu: contenuMots,
            date_assignation: dateD,
            date_limite: params.dateLimite || null,
            periodicite: params.periodicite ?? "jour",
            statut: "a_faire",
            chapitre_id: null,
            groupe_label: groupeLabelDictee,
          }
        );
      }

      // ── 4. INSERT groupé pour tous les élèves ──────────────────────────────
      if (lignesPlanTravail.length > 0) {
        const { error: ePt } = await supabase.from("plan_travail").insert(lignesPlanTravail);
        if (ePt) {
          console.error(`[plan_travail] INSERT batch dictée ${d + 1} :`, ePt.message);
          setErreur(`Erreur assignation dictée ${d + 1} : ${ePt.message}`);
          setChargementDictee(false);
          return;
        }
        console.log(`[plan_travail] INSERT batch OK — dictée ${d + 1}, ${lignesPlanTravail.length} lignes`);
      }
    } // fin boucle dicteeResultats

    // ── Génération audio TTS (après sauvegarde BDD) ──────────────────────────
    setGenerationAudioEnCours(true);
    // Re-fetch les IDs par batch_id
    const { data: dicteesGenerees } = await supabase
      .from("dictees")
      .select("id, niveau_etoiles, texte, phrases, dictee_parent_id")
      .eq("batch_id", batchId);

    if (dicteesGenerees && dicteesGenerees.length > 0) {
      const labelsNiveaux: Record<number, string> = { 1: "⭐ CE2", 2: "⭐⭐ CM1", 3: "⭐⭐⭐ CM2", 4: "⭐⭐⭐⭐ CM2+" };
      setProgressAudio(dicteesGenerees.map((dg) => ({ label: `${labelsNiveaux[dg.niveau_etoiles] ?? `Niveau ${dg.niveau_etoiles}`}`, fait: false })));

      for (let i = 0; i < dicteesGenerees.length; i++) {
        const dg = dicteesGenerees[i];
        await fetch("/api/tts/generer-dictee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dictee_id: dg.id,
            niveau_etoiles: dg.niveau_etoiles,
            texte_complet: dg.texte,
            phrases: dg.phrases,
          }),
        });
        setProgressAudio((prev) => prev.map((p, idx) => idx === i ? { ...p, fait: true } : p));
      }
    }
    setGenerationAudioEnCours(false);

    setChargementDictee(false);
    // Redirection vers la bibliothèque dictées
    router.push("/enseignant/dictees");
  }

  function utiliserDepuisBanque(ex: BanqueExercice) {
    setBanqueOuverte(false);
    const c: ContenuPreview =
      ex.type === "exercice"
        ? { type: "exercice", data: ex.contenu as unknown as ExerciceIA }
        : { type: "calcul_mental", data: ex.contenu as unknown as CalcMentalIA };
    setContenu(c);
    setEtape("apercu");
  }

  const chargementEnCours = etape === "chargement" || etape === "sauvegarde";

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 720 }}>

          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            ✨ Générer un exercice
          </h1>
          <p className="text-secondary text-sm" style={{ marginBottom: 24 }}>
            L'exercice sera relu et validé avant envoi à l'élève.
          </p>

          {/* Message succès */}
          {messageSucces && (
            <div
              style={{
                background: "linear-gradient(135deg, #D1FAE5, #ECFDF5)",
                color: "#065F46",
                padding: "16px 20px",
                borderRadius: 16,
                marginBottom: 20,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1.5px solid #86EFAC",
                boxShadow: "0 4px 16px rgba(22,163,74,0.12)",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <span className="ms" style={{ fontSize: 24, color: "#16A34A", flexShrink: 0 }}>check_circle</span>
              {messageSucces}
            </div>
          )}

          {/* Message erreur */}
          {erreur && (
            <div
              style={{
                background: "#FEE2E2",
                color: "#DC2626",
                padding: "12px 16px",
                borderRadius: 10,
                marginBottom: 20,
                fontSize: 13,
              }}
            >
              {erreur}
            </div>
          )}

          {/* Onglets type de bloc */}
          {etape === "formulaire" && (
            <>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button
                  className={`tab${typeBloc === "exercice" || typeBloc === "texte_a_trous" || typeBloc === "analyse_phrase" || typeBloc === "classement" || typeBloc === "lecture" ? " active" : ""}`}
                  onClick={() => { if (typeBloc !== "exercice" && typeBloc !== "texte_a_trous" && typeBloc !== "analyse_phrase" && typeBloc !== "classement" && typeBloc !== "lecture") setTypeBloc("exercice"); }}
                >
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>edit_note</span> Exercice
                </button>
                <button
                  className={`tab${typeBloc === "calcul_mental" ? " active" : ""}`}
                  onClick={() => setTypeBloc("calcul_mental")}
                >
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>calculate</span> Calcul mental
                </button>
                <button
                  className={`tab${typeBloc === "ressource" ? " active" : ""}`}
                  onClick={() => setTypeBloc("ressource")}
                >
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>open_in_new</span> Ressource
                </button>
                <Link
                  href="/enseignant/dictees"
                  className="tab"
                  style={{ textDecoration: "none" }}
                >
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>headphones</span> Dictée
                </Link>
              </div>

              {/* Sous-sélecteur pour les exercices */}
              {(typeBloc === "exercice" || typeBloc === "texte_a_trous" || typeBloc === "analyse_phrase" || typeBloc === "classement" || typeBloc === "lecture") && (
                <div style={{
                  display: "flex", gap: 10, padding: "16px 0 8px",
                  marginBottom: 16,
                }}>
                  <button
                    onClick={() => setTypeBloc("exercice")}
                    style={{
                      flex: 1, padding: "14px 16px", borderRadius: 14,
                      border: typeBloc === "exercice" ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: typeBloc === "exercice" ? "var(--blue-50)" : "white",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 22, color: typeBloc === "exercice" ? "var(--primary)" : "var(--text-secondary)" }}>quiz</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: typeBloc === "exercice" ? "var(--primary)" : "var(--text)" }}>
                        Questions-Réponses
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      Questions avec réponses attendues, corrigées automatiquement
                    </p>
                  </button>
                  <button
                    onClick={() => setTypeBloc("texte_a_trous")}
                    style={{
                      flex: 1, padding: "14px 16px", borderRadius: 14,
                      border: typeBloc === "texte_a_trous" ? "2px solid #0E7490" : "1px solid var(--border)",
                      background: typeBloc === "texte_a_trous" ? "rgba(14,116,144,0.06)" : "white",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 22, color: typeBloc === "texte_a_trous" ? "#0E7490" : "var(--text-secondary)" }}>text_fields</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: typeBloc === "texte_a_trous" ? "#0E7490" : "var(--text)" }}>
                        Texte à trous
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      Texte avec mots manquants à compléter par l&apos;élève
                    </p>
                  </button>
                  <button
                    onClick={() => setTypeBloc("analyse_phrase")}
                    style={{
                      flex: 1, padding: "14px 16px", borderRadius: 14,
                      border: typeBloc === "analyse_phrase" ? "2px solid #6D28D9" : "1px solid var(--border)",
                      background: typeBloc === "analyse_phrase" ? "rgba(109,40,217,0.06)" : "white",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 22, color: typeBloc === "analyse_phrase" ? "#6D28D9" : "var(--text-secondary)" }}>schema</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: typeBloc === "analyse_phrase" ? "#6D28D9" : "var(--text)" }}>
                        Analyse de phrase
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      Identifier sujet, verbe, compléments dans une phrase
                    </p>
                  </button>
                  <button
                    onClick={() => setTypeBloc("classement")}
                    style={{
                      flex: 1, padding: "14px 16px", borderRadius: 14,
                      border: typeBloc === "classement" ? "2px solid #0369A1" : "1px solid var(--border)",
                      background: typeBloc === "classement" ? "rgba(3,105,161,0.06)" : "white",
                      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 22, color: typeBloc === "classement" ? "#0369A1" : "var(--text-secondary)" }}>category</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: typeBloc === "classement" ? "#0369A1" : "var(--text)" }}>Classement</span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      Trier des éléments dans les bonnes catégories
                    </p>
                  </button>
                  <button
                    onClick={() => setTypeBloc("lecture")}
                    style={{
                      flex: 1, padding: "14px 16px", borderRadius: 14,
                      border: typeBloc === "lecture" ? "2px solid #7C3AED" : "1px solid var(--border)",
                      background: typeBloc === "lecture" ? "rgba(124,58,237,0.06)" : "white",
                      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 22, color: typeBloc === "lecture" ? "#7C3AED" : "var(--text-secondary)" }}>auto_stories</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: typeBloc === "lecture" ? "#7C3AED" : "var(--text)" }}>Lecture</span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      Texte de lecture + questions QCM
                    </p>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Contenu principal */}
          <div className="card">
            {/* Chargement (seulement pour exercice IA) */}
            {etape === "chargement" && (
              <div style={{ textAlign: "center", padding: "48px 20px" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    border: "4px solid var(--primary-mid)",
                    borderTopColor: "var(--primary)",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 16px",
                  }}
                />
                <p style={{ fontWeight: 600, color: "var(--text)" }}>
                  {typeBloc === "dictee" && progressDictee.total > 1
                    ? `Claude génère la dictée ${progressDictee.fait + 1} / ${progressDictee.total}…`
                    : "Claude génère l'exercice…"
                  }
                </p>
                <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
                  {typeBloc === "dictee" && progressDictee.total > 1
                    ? `${progressDictee.fait} / ${progressDictee.total} dictées générées`
                    : "Quelques secondes"
                  }
                </p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Formulaire */}
            {etape === "formulaire" && typeBloc === "exercice" && (
              <GenererExerciceForm
                onGenerer={generer}
                onPiocherBanque={() => setBanqueOuverte(true)}
                chargement={chargementEnCours}
                defaultChapitreId={defaultChapitreId}
                defaultValues={paramsEnCours?.type === "exercice" ? paramsEnCours as any : undefined}
              />
            )}

            {etape === "formulaire" && typeBloc === "calcul_mental" && (
              <GenererCalcMentalForm
                onGenerer={generer}
                onPiocherBanque={() => setBanqueOuverte(true)}
                chargement={chargementEnCours}
              />
            )}

            {etape === "formulaire" && typeBloc === "ressource" && (
              <GenererRessourceForm
                onGenerer={generer}
                onPiocherBanque={() => setBanqueOuverte(true)}
                chargement={chargementEnCours}
                ressourceInitiale={ressourceBiblio ?? undefined}
              />
            )}

            {etape === "formulaire" && typeBloc === "dictee" && (
              <GenererDicteeForm
                onGenerer={generer}
                chargement={chargementEnCours}
              />
            )}

            {etape === "formulaire" && typeBloc === "texte_a_trous" && (
              <GenererTexteATrousForm
                onGenerer={generer}
                chargement={chargementEnCours}
                defaultValues={paramsEnCours?.type === "texte_a_trous" ? paramsEnCours : undefined}
              />
            )}

            {/* Aperçu texte à trous */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc === "texte_a_trous" && contenu?.type === "texte_a_trous" && (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: 8 }}>{contenu.data.titre}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 16 }}>{contenu.data.consigne}</p>
                <div style={{
                  background: "var(--blue-50)", borderRadius: 12, padding: "1.25rem 1.5rem",
                  fontSize: "1rem", lineHeight: 2, border: "1px solid var(--blue-100)",
                }}>
                  {contenu.data.texte_complet.split(/\s+/).map((mot, i) => {
                    const trou = contenu.data.trous.find(t => t.position === i);
                    if (trou) {
                      return (
                        <span key={i}>
                          <span style={{
                            display: "inline-block", minWidth: 80, padding: "2px 8px",
                            background: "white", border: "2px dashed #0E7490",
                            borderRadius: 6, textAlign: "center", fontWeight: 700, color: "#0E7490",
                          }}>
                            {trou.mot}
                          </span>{" "}
                        </span>
                      );
                    }
                    return <span key={i}>{mot}{" "}</span>;
                  })}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 12 }}>
                  {contenu.data.trous.length} trou{contenu.data.trous.length > 1 ? "s" : ""} à compléter
                </p>

                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  <button
                    className="btn-ghost"
                    onClick={() => { setEtape("formulaire"); }}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => contenu && valider(contenu)}
                    disabled={etape === "sauvegarde" || !contenu}
                    style={{ flex: 1 }}
                  >
                    {etape === "sauvegarde" ? "Enregistrement..." : "Valider et affecter"}
                  </button>
                </div>
              </div>
            )}

            {/* Formulaire analyse de phrase */}
            {etape === "formulaire" && typeBloc === "analyse_phrase" && (
              <GenererAnalysePhraseForm
                onGenerer={generer}
                chargement={chargementEnCours}
                defaultValues={paramsEnCours?.type === "analyse_phrase" ? paramsEnCours : undefined}
              />
            )}

            {/* Formulaire classement */}
            {etape === "formulaire" && typeBloc === "classement" && (
              <GenererClassementForm
                onGenerer={generer}
                chargement={chargementEnCours}
                defaultValues={paramsEnCours?.type === "classement" ? paramsEnCours as any : undefined}
              />
            )}

            {/* Formulaire lecture */}
            {etape === "formulaire" && typeBloc === "lecture" && (
              <GenererLectureForm
                onGenerer={generer}
                chargement={chargementEnCours}
                defaultValues={paramsEnCours?.type === "lecture" ? paramsEnCours as any : undefined}
              />
            )}

            {/* Aperçu analyse de phrase */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc === "analyse_phrase" && contenu?.type === "analyse_phrase" && (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: 8 }}>{contenu.data.titre}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 16 }}>{contenu.data.consigne}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {contenu.data.phrases.map((phrase, pi) => (
                    <div key={pi} style={{ background: "var(--blue-50)", borderRadius: 12, padding: "1rem 1.25rem", border: "1px solid var(--blue-100)" }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Phrase {pi + 1}</p>
                      <p style={{ fontSize: "1rem", lineHeight: 2, margin: 0 }}>
                        {phrase.texte.split(/\s+/).map((mot, mi) => {
                          const grp = phrase.groupes.find(g => mi >= g.debut && mi <= g.fin);
                          if (grp && mi === grp.debut) {
                            const couleur = ({"Sujet":"#2563EB","Verbe":"#DC2626","COD":"#D97706","COI":"#D97706","CC Lieu":"#16A34A","CC Temps":"#16A34A","CC Manière":"#16A34A","Attribut":"#7C3AED"} as Record<string,string>)[grp.fonction] ?? "#888";
                            return (
                              <span key={mi} style={{ display: "inline-block", background: `${couleur}15`, border: `1.5px solid ${couleur}40`, borderRadius: 6, padding: "2px 6px", margin: "1px 2px" }}>
                                <span style={{ fontWeight: 600, color: couleur }}>{grp.mots}</span>
                                <span style={{ fontSize: "0.625rem", fontWeight: 700, color: couleur, marginLeft: 4, textTransform: "uppercase" }}>{grp.fonction}</span>
                              </span>
                            );
                          }
                          if (grp) return null; // mots suivants du groupe, déjà rendus
                          return <span key={mi}>{mot}{" "}</span>;
                        })}
                      </p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 12 }}>
                  {contenu.data.phrases.length} phrase{contenu.data.phrases.length > 1 ? "s" : ""} à analyser
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  <button className="btn-ghost" onClick={() => { setEtape("formulaire"); }}>Annuler</button>
                  <button
                    className="btn-primary"
                    onClick={() => contenu && valider(contenu)}
                    disabled={etape === "sauvegarde" || !contenu}
                    style={{ flex: 1 }}
                  >
                    {etape === "sauvegarde" ? "Enregistrement..." : "Valider et affecter"}
                  </button>
                </div>
              </div>
            )}

            {/* Aperçu classement */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc === "classement" && contenu?.type === "classement" && (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: 8 }}>{contenu.data.titre}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 16 }}>{contenu.data.consigne}</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  {contenu.data.categories.map((cat, i) => {
                    const itemsCat = contenu.data.items.filter(it => it.categorie === cat);
                    return (
                      <div key={cat} style={{ flex: "1 1 200px", background: "var(--blue-50)", borderRadius: 12, padding: "12px 16px", border: "1px solid var(--blue-100)" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--primary)", marginBottom: 8, textTransform: "uppercase" }}>{cat}</div>
                        {itemsCat.map((it, j) => (
                          <div key={j} style={{ fontSize: "0.875rem", padding: "4px 0", borderBottom: "1px solid var(--blue-100)" }}>{it.texte}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {contenu.data.items.length} éléments à classer dans {contenu.data.categories.length} catégories
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  <button className="btn-ghost" onClick={() => setEtape("formulaire")}>Annuler</button>
                  <button className="btn-primary" onClick={() => contenu && valider(contenu)} disabled={etape === "sauvegarde" || !contenu} style={{ flex: 1 }}>
                    {etape === "sauvegarde" ? "Enregistrement..." : "Valider et affecter"}
                  </button>
                </div>
              </div>
            )}

            {/* Aperçu lecture */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc === "lecture" && contenu?.type === "lecture" && (
              <div style={{ padding: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: 8 }}>{contenu.data.titre}</h3>
                <div style={{ background: "var(--blue-50)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, maxHeight: 200, overflowY: "auto", fontSize: "0.875rem", lineHeight: 1.8, whiteSpace: "pre-wrap", border: "1px solid var(--blue-100)" }}>
                  {contenu.data.texte.substring(0, 500)}{contenu.data.texte.length > 500 ? "..." : ""}
                </div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 12 }}>
                  {contenu.data.questions.length} questions QCM
                </p>
                {contenu.data.questions.map((q: any, i: number) => (
                  <div key={i} style={{ padding: "8px 12px", marginBottom: 6, background: "white", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.8125rem" }}>
                    <strong>Q{q.id}.</strong> {q.question}
                    <span style={{ color: "#16A34A", marginLeft: 8, fontSize: "0.75rem" }}>{"\u2192"} {q.choix[q.reponse]}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  <button className="btn-ghost" onClick={() => setEtape("formulaire")}>Annuler</button>
                  <button className="btn-primary" onClick={() => contenu && valider(contenu)} disabled={etape === "sauvegarde" || !contenu} style={{ flex: 1 }}>
                    {etape === "sauvegarde" ? "Enregistrement..." : "Valider et affecter"}
                  </button>
                </div>
              </div>
            )}

            {/* Aperçu dictée — navigation si plusieurs */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc === "dictee" && dicteeResultats.length > 0 && (
              <div>
                {/* Navigation entre dictées */}
                {dicteeResultats.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
                    <button
                      className="btn-ghost"
                      onClick={() => setDicteePreviewIdx((i) => Math.max(0, i - 1))}
                      disabled={dicteePreviewIdx === 0}
                      style={{ fontSize: 13, padding: "6px 12px" }}
                    >
                      ← Précédente
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                      Dictée {dicteePreviewIdx + 1} / {dicteeResultats.length}
                    </span>
                    <button
                      className="btn-ghost"
                      onClick={() => setDicteePreviewIdx((i) => Math.min(dicteeResultats.length - 1, i + 1))}
                      disabled={dicteePreviewIdx === dicteeResultats.length - 1}
                      style={{ fontSize: 13, padding: "6px 12px" }}
                    >
                      Suivante →
                    </button>
                  </div>
                )}
                <DicteePreview
                  niveaux={dicteeResultats[dicteePreviewIdx].niveaux}
                  chargement={chargementDictee}
                  onValider={validerDictee}
                  onRegenerer={() => { if (paramsEnCours) generer(paramsEnCours); }}
                  onModifierNiveaux={(niveauxEdites) => {
                    setDicteeResultats((prev) => prev.map((r, i) =>
                      i === dicteePreviewIdx ? { ...r, niveaux: niveauxEdites } : r
                    ));
                  }}
                />
                {generationAudioEnCours && (
                  <div style={{ textAlign: "center", padding: "24px 20px", background: "#F0FDF4", borderRadius: 12, marginTop: 16 }}>
                    <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>🎙️ Génération des audios en cours…</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start", margin: "0 auto", width: "fit-content" }}>
                      {progressAudio.map((p, i) => (
                        <span key={i} style={{ fontSize: 13, color: p.fait ? "#065F46" : "var(--text-secondary)" }}>
                          {p.label} {p.fait ? "✅" : "⏳"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aperçu exercice/calcul/ressource */}
            {(etape === "apercu" || etape === "sauvegarde") && typeBloc !== "dictee" && typeBloc !== "texte_a_trous" && typeBloc !== "analyse_phrase" && typeBloc !== "classement" && typeBloc !== "lecture" && contenu && (
              <div>
                <ExercicePreview
                  contenu={contenu as any}
                  onValider={valider as any}
                  onRegenerer={regenerer}
                  onAnnuler={() => {
                    setContenu(null);
                    setEtape("formulaire");
                  }}
                  chargement={etape === "sauvegarde"}
                />
                {/* Bouton bibliothèque pour les ressources */}
                {contenu.type === "ressource" && etape === "apercu" && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <button
                      onClick={enregistrerDansBibliotheque}
                      disabled={enregistrementBiblio}
                      style={{
                        width: "100%", padding: "10px 16px", borderRadius: 8, cursor: "pointer",
                        background: "var(--primary-pale)", color: "var(--primary)",
                        border: "1.5px dashed var(--primary)", fontWeight: 600, fontSize: 13,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}
                    >
                      {enregistrementBiblio ? "Enregistrement…" : "📚 Enregistrer dans la bibliothèque (sans assigner)"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modale banque */}
      {banqueOuverte && (
        <BanqueExercices
          filtreType={typeBloc === "dictee" ? undefined : typeBloc as any}
          onSelectionner={utiliserDepuisBanque}
          onFermer={() => setBanqueOuverte(false)}
        />
      )}
    </EnseignantLayout>
  );
}

export default function PageGenerer() {
  return (
    <Suspense>
      <PageGenererInner />
    </Suspense>
  );
}
