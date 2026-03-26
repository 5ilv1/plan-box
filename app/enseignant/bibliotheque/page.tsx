"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import RepetiboxLink from "@/components/RepetiboxLink";
import EnseignantLayout from "@/components/EnseignantLayout";
import { ExerciceIA, CalcMentalIA, Chapitre } from "@/types";
import AffecterExerciceModal from "@/components/AffecterExerciceModal";

/* ─── Types ─────────────────────────────────────────────── */

interface QuestionExercice {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

interface Exercice {
  id: string;
  type: "exercice" | "calcul_mental";
  matiere: string | null;
  sous_matiere: string | null;
  niveau_id: string | null;
  chapitre_id: string | null;
  titre: string | null;
  contenu: Record<string, unknown>;
  nb_utilisations: number;
  created_at: string;
  niveaux?: { nom: string };
  chapitres?: { titre: string };
}

interface AssignationResume {
  titre: string;
  type: string;
  groupe_label: string | null;
  date_assignation: string;
}

interface QCMQuestion {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
}

interface RessourceBibliotheque {
  id: string;
  titre: string;
  sous_type: string;
  contenu: {
    taches?: { sous_type: string; label?: string; texte?: string; url?: string; reference?: string }[];
    sous_type?: string;
    url?: string;
    texte?: string;
  };
  matiere: string | null;
  tags: string[];
  created_at: string;
}

/* ─── Constantes ─────────────────────────────────────────── */

const COULEURS_TYPE: Record<string, { bg: string; color: string }> = {
  exercice:      { bg: "#DBEAFE", color: "#1E40AF" },
  calcul_mental: { bg: "#D1FAE5", color: "#065F46" },
};

const ICONES_ST: Record<string, string> = {
  video: "play_circle", podcast: "podcasts",
  exercice_en_ligne: "computer", exercice_papier: "description",
};
const LABELS_ST: Record<string, string> = {
  video: "Vidéo", podcast: "Podcast",
  exercice_en_ligne: "Exercice en ligne", exercice_papier: "Exercice papier",
};

type Onglet = "exercices" | "ressources" | "fichier_maths" | "lecon_copier" | "ecriture";

/* ── Types Fichier de maths ─── */
interface SemaineFM {
  id: string;
  dateAssignation: string; // "YYYY-MM-DD"
  pages: Record<string, string>; // groupeId → page saisie (chaîne vide = vide)
}

/* ─── Composant ──────────────────────────────────────────── */

export default function PageBibliotheque() {
  const router   = useRouter();
  const supabase = createClient();

  const [onglet, setOnglet] = useState<Onglet>("exercices");

  /* ── État exercices ── */
  const [exercices, setExercices]       = useState<Exercice[]>([]);
  const [niveaux, setNiveaux]           = useState<{ id: string; nom: string }[]>([]);
  const [chapitres, setChapitres]       = useState<Chapitre[]>([]);
  const [chargementEx, setChargementEx] = useState(true);

  const [filtreType, setFiltreType]             = useState("");
  const [filtreMatiere, setFiltreMatiere]       = useState("");
  const [filtreNiveau, setFiltreNiveau]         = useState("");
  const [filtreChapitreId, setFiltreChapitreId] = useState("");

  const [apercu, setApercu]           = useState<Exercice | null>(null);
  const [aSupprimer, setASupprimer]   = useState<string | null>(null);
  const [enSuppression, setEnSuppression] = useState(false);
  const [enDuplication, setEnDuplication] = useState<Set<string>>(new Set());

  const [aEditer, setAEditer]           = useState<Exercice | null>(null);
  const [editTitre, setEditTitre]       = useState("");
  const [editMatiere, setEditMatiere]   = useState("");
  const [editSousMatiere, setEditSousMatiere] = useState("");
  const [editChapitreId, setEditChapitreId]   = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [enRegeneration, setEnRegeneration] = useState(false);
  const [editQuestionsEx, setEditQuestionsEx] = useState<QuestionExercice[]>([]);
  const [editConsigneEx, setEditConsigneEx] = useState("");
  const [aAffecter, setAAffecter] = useState<Exercice | null>(null);

  /* ── État ressources ── */
  const [ressources, setRessources]         = useState<RessourceBibliotheque[]>([]);
  const [chargementRes, setChargementRes]   = useState(true);
  const [filtreSousType, setFiltreSousType] = useState("tous");
  const [filtreMatRes, setFiltreMatRes]     = useState("toutes");
  const [recherche, setRecherche]           = useState("");
  const [suppression, setSuppression]       = useState<string | null>(null);
  const [messageSucces, setMessageSucces]   = useState("");
  const [aEditerRes, setAEditerRes]         = useState<RessourceBibliotheque | null>(null);
  const [editResTitre, setEditResTitre]     = useState("");
  const [editResSousType, setEditResSousType] = useState("");
  const [editResMatiere, setEditResMatiere] = useState("");
  const [editResUrl, setEditResUrl]         = useState("");
  const [enSauvegardeRes, setEnSauvegardeRes] = useState(false);
  const [apercuRes, setApercuRes] = useState<RessourceBibliotheque | null>(null);
  const [qcmParRessource, setQcmParRessource] = useState<Map<string, QCMQuestion[]>>(new Map());

  /* ── Affectations ── */
  const [affectationsEx,  setAffectationsEx]  = useState<Map<string, AssignationResume[]>>(new Map());
  const [affectationsRes, setAffectationsRes] = useState<Map<string, AssignationResume[]>>(new Map());

  /* ── Fichier de maths ── */
  const [historiqueFM, setHistoriqueFM] = useState<{ date: string; groupe: string; page: number }[]>([]);
  const [semainesFM, setSemainesFM]           = useState<SemaineFM[]>([]);
  const [groupesFM,  setGroupesFM]            = useState<{ id: string; nom: string }[]>([]);
  const [enAffectFM, setEnAffectFM]           = useState(false);
  const [messageFM,  setMessageFM]            = useState("");

  /* ── Thèmes d'écriture ── */
  const [themesEcriture,  setThemesEcriture]  = useState<{ id: string; date: string; sujet: string; contrainte: string; affecte: boolean }[]>([]);
  const [chargementEcr,     setChargementEcr]     = useState(false);
  const [themeJourEcr,      setThemeJourEcr]      = useState<{ id: string; sujet: string; contrainte: string; affecte: boolean; afficher_contrainte: boolean } | null>(null);
  const [avecContrainte,    setAvecContrainte]    = useState(false);
  const [enRegen,           setEnRegen]           = useState(false);
  const [modeEditionEcr,    setModeEditionEcr]    = useState(false);
  const [editSujetEcr,      setEditSujetEcr]      = useState("");
  const [editContrainteEcr, setEditContrainteEcr] = useState("");
  const [enSauvegardeEcr,   setEnSauvegardeEcr]   = useState(false);

  /* ── Leçon à copier ── */
  const [groupesLC,       setGroupesLC]       = useState<{ id: string; nom: string }[]>([]);
  const [lcTitre,         setLcTitre]         = useState("");
  const [lcUrl,           setLcUrl]           = useState("");
  const [lcDate,          setLcDate]          = useState(new Date().toISOString().split("T")[0]);
  const [lcGroupesCoches, setLcGroupesCoches] = useState<Set<string>>(new Set());
  const [enAffectLC,      setEnAffectLC]      = useState(false);
  const [messageLC,       setMessageLC]       = useState("");
  const [historiqueLC,    setHistoriqueLC]    = useState<{ date: string; groupe: string; titre: string; url: string }[]>([]);
  const [lcEdition,       setLcEdition]       = useState<{ date: string; groupe: string; ancienTitre: string; titre: string; url: string } | null>(null);
  const [suppressionLC,   setSuppressionLC]   = useState<string | null>(null); // clé "date__groupe__titre"
  const [enSauvegardeLC,  setEnSauvegardeLC]  = useState(false);
  const [lcFichierNom,    setLcFichierNom]    = useState("");   // nom affiché du fichier uploadé
  const [lcUpload,        setLcUpload]        = useState(false); // spinner upload

  /* ── Chargement initial ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { const r = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null; if (r === "enseignant") return; router.push("/enseignant"); return; }
    });
    supabase.from("niveaux").select("*").order("nom")
      .then(({ data }) => setNiveaux(data ?? []));
    supabase.from("chapitres").select("*").order("matiere").order("titre")
      .then(({ data }) => setChapitres((data ?? []) as Chapitre[]));
  }, []);

  /* ── Charger exercices ── */
  const chargerExercices = useCallback(async () => {
    setChargementEx(true);
    const params = new URLSearchParams();
    if (filtreType)      params.set("type", filtreType);
    if (filtreMatiere)   params.set("matiere", filtreMatiere);
    if (filtreNiveau)    params.set("niveau_id", filtreNiveau);
    if (filtreChapitreId) params.set("chapitre_id", filtreChapitreId);
    const res  = await fetch(`/api/admin/exercices?${params}`);
    const json = await res.json();
    const exs: Exercice[] = json.exercices ?? [];
    setExercices(exs);
    setChargementEx(false);

    // Charger les affectations en batch
    const titres = [...new Set(exs.map((e) => e.titre).filter(Boolean))] as string[];
    if (titres.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("plan_travail")
        .select("titre, type, groupe_label, date_assignation")
        .in("titre", titres)
        .in("type", ["exercice", "calcul_mental"])
        .gte("date_assignation", today)
        .neq("statut", "fait")
        .order("date_assignation");
      const map = new Map<string, AssignationResume[]>();
      (data ?? []).forEach((a) => {
        const key = `${a.titre}___${a.type}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(a as AssignationResume);
      });
      setAffectationsEx(map);
    }
  }, [filtreType, filtreMatiere, filtreNiveau, filtreChapitreId]);

  useEffect(() => { chargerExercices(); }, [chargerExercices]);

  /* ── Charger ressources ── */
  const chargerRessources = useCallback(async () => {
    setChargementRes(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChargementRes(false); return; }
    const res  = await fetch(`/api/bibliotheque-ressources?enseignant_id=${user.id}`);
    const json = await res.json();
    const rss: RessourceBibliotheque[] = json.ressources ?? [];
    setRessources(rss);
    setChargementRes(false);

    // Charger affectations + QCM en batch
    const titres = [...new Set(rss.map((r) => r.titre).filter(Boolean))] as string[];
    if (titres.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("plan_travail")
        .select("titre, type, groupe_label, date_assignation, contenu")
        .in("titre", titres)
        .gte("date_assignation", today)
        .neq("statut", "fait")
        .order("date_assignation");

      const mapAff = new Map<string, AssignationResume[]>();
      const mapQcm = new Map<string, QCMQuestion[]>();
      (data ?? []).forEach((a) => {
        // Affectations
        if (!mapAff.has(a.titre)) mapAff.set(a.titre, []);
        mapAff.get(a.titre)!.push(a as AssignationResume);
        // QCM : prendre le premier trouvé par titre
        if (!mapQcm.has(a.titre) && Array.isArray(a.contenu?.qcm) && a.contenu.qcm.length > 0) {
          mapQcm.set(a.titre, a.contenu.qcm as QCMQuestion[]);
        }
      });
      setAffectationsRes(mapAff);
      setQcmParRessource(mapQcm);
    }
  }, []);

  useEffect(() => { chargerRessources(); }, [chargerRessources]);

  /* ── Charger thèmes d'écriture ── */
  async function chargerThemesEcriture() {
    setChargementEcr(true);
    // Thème du jour
    try {
      const res = await fetch("/api/generer-theme-ecriture");
      const data = await res.json();
      if (data?.id) {
        setThemeJourEcr(data);
        setAvecContrainte(data.afficher_contrainte ?? true);
      }
    } catch { /* silencieux */ }
    // Historique depuis banque_ressources
    const { data } = await supabase
      .from("banque_ressources")
      .select("id, titre, sous_type, contenu, created_at")
      .eq("sous_type", "ecriture")
      .order("created_at", { ascending: false })
      .limit(100);
    setThemesEcriture(
      (data ?? []).map((r: { id: string; titre: string; contenu: Record<string, unknown>; created_at: string }) => ({
        id: r.id,
        date: (r.contenu?.date as string) ?? r.created_at.split("T")[0],
        sujet: (r.contenu?.sujet as string) ?? r.titre,
        contrainte: (r.contenu?.contrainte as string) ?? "",
        affecte: true,
      }))
    );
    setChargementEcr(false);
  }

  async function regenThemeEcriture() {
    setEnRegen(true);
    try {
      const res = await fetch("/api/reinitialiser-theme-ecriture", { method: "POST" });
      const data = await res.json();
      console.log("[regen]", data);
      if (data?.ok && data.theme) {
        // Mise à jour directe depuis la réponse API
        setThemeJourEcr({ ...data.theme, affecte: true });
        setAvecContrainte(data.theme.afficher_contrainte ?? true);
        // Recharge uniquement l'historique (banque_ressources)
        const { data: historique } = await supabase
          .from("banque_ressources")
          .select("id, titre, contenu, created_at")
          .eq("sous_type", "ecriture")
          .order("created_at", { ascending: false })
          .limit(100);
        setThemesEcriture(
          (historique ?? []).map((r: { id: string; titre: string; contenu: Record<string, unknown>; created_at: string }) => ({
            id: r.id,
            date: (r.contenu?.date as string) ?? r.created_at.split("T")[0],
            sujet: (r.contenu?.sujet as string) ?? r.titre,
            contrainte: (r.contenu?.contrainte as string) ?? "",
            affecte: true,
          }))
        );
      }
    } finally {
      setEnRegen(false);
    }
  }

  /* ── Actions exercices ── */
  function ouvrirEdition(ex: Exercice) {
    setAEditer(ex);
    setEditTitre(ex.titre ?? "");
    setEditMatiere(ex.matiere ?? "");
    setEditSousMatiere(ex.sous_matiere ?? "");
    setEditChapitreId(ex.chapitre_id ?? "");
    const c = ex.contenu as Record<string, unknown>;
    setEditConsigneEx((c.consigne as string) ?? "");
    setEditQuestionsEx((c.questions as QuestionExercice[]) ?? []);
    setEnRegeneration(false);
  }

  async function sauvegarderEdition() {
    if (!aEditer) return;
    setEnSauvegarde(true);
    try {
      const chapitreSelectionne = editChapitreId
        ? chapitres.find((c) => c.id === editChapitreId)
        : null;

      // Contenu mis à jour (questions/calculs)
      const ancienContenu = aEditer.contenu as Record<string, unknown>;
      const nouveauContenu = aEditer.type === "exercice"
        ? { ...ancienContenu, consigne: editConsigneEx, questions: editQuestionsEx }
        : ancienContenu; // calcul_mental géré via Regénérer

      await fetch("/api/admin/exercices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: aEditer.id,
          titre: editTitre || null,
          matiere: editMatiere || null,
          sous_matiere: editSousMatiere || null,
          chapitre_id: editChapitreId || null,
          niveau_id: chapitreSelectionne?.niveau_id ?? aEditer.niveau_id ?? null,
          contenu: nouveauContenu,
        }),
      });
      setAEditer(null);
      await chargerExercices();
    } finally {
      setEnSauvegarde(false);
    }
  }

  async function regenererContenu() {
    if (!aEditer) return;
    setEnRegeneration(true);
    try {
      const contenu = aEditer.contenu as Record<string, unknown>;
      const nbElements = aEditer.type === "exercice"
        ? ((contenu.questions as unknown[])?.length ?? 10)
        : ((contenu.calculs as unknown[])?.length ?? 10);

      const res = await fetch("/api/regenerer-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: aEditer.type,
          titre: editTitre || aEditer.titre,
          consigne: editConsigneEx || ((contenu.consigne as string) ?? ""),
          nbElements,
          matiere: editMatiere || aEditer.matiere,
          niveau: aEditer.niveaux?.nom ?? "CM",
        }),
      });
      const json = await res.json();
      if (json.resultat) {
        if (aEditer.type === "exercice" && json.resultat.questions) {
          setEditConsigneEx(json.resultat.consigne ?? editConsigneEx);
          setEditQuestionsEx(json.resultat.questions);
        } else if (aEditer.type === "calcul_mental" && json.resultat.calculs) {
          const nouveauContenu = { ...contenu, calculs: json.resultat.calculs };
          await fetch("/api/admin/exercices", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: aEditer.id, titre: editTitre || aEditer.titre, contenu: nouveauContenu }),
          });
          setAEditer(null);
          await chargerExercices();
        }
      }
    } finally {
      setEnRegeneration(false);
    }
  }

  async function dupliquer(ex: Exercice) {
    setEnDuplication((prev) => new Set([...prev, ex.id]));
    try {
      await fetch("/api/admin/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: ex.type, matiere: ex.matiere, niveau_id: ex.niveau_id,
          chapitre_id: ex.chapitre_id,
          titre: ex.titre ? `${ex.titre} (copie)` : null,
          contenu: ex.contenu, nb_utilisations: 0,
        }),
      });
      await chargerExercices();
    } finally {
      setEnDuplication((prev) => { const n = new Set(prev); n.delete(ex.id); return n; });
    }
  }

  async function supprimerEx(id: string) {
    setEnSuppression(true);
    const res = await fetch(`/api/admin/exercices?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`Erreur : ${json.erreur ?? "inconnue"}`);
    }
    setASupprimer(null);
    setEnSuppression(false);
    await chargerExercices();
  }

  /* ── Actions ressources ── */
  function ouvrirEditionRes(r: RessourceBibliotheque) {
    setAEditerRes(r);
    setEditResTitre(r.titre);
    setEditResSousType(r.sous_type);
    setEditResMatiere(r.matiere ?? "");
    // URL principale : première tâche ou contenu direct
    const taches = r.contenu?.taches;
    const url = taches?.[0]?.url ?? r.contenu?.url ?? "";
    setEditResUrl(url);
  }

  async function sauvegarderEditionRes() {
    if (!aEditerRes) return;
    setEnSauvegardeRes(true);
    try {
      // Mettre à jour l'URL dans le contenu existant
      let contenuMaj = { ...aEditerRes.contenu };
      if (contenuMaj.taches && Array.isArray(contenuMaj.taches) && contenuMaj.taches.length > 0) {
        contenuMaj = { ...contenuMaj, taches: contenuMaj.taches.map((t, i) => i === 0 ? { ...t, url: editResUrl } : t) };
      } else if ("url" in contenuMaj) {
        contenuMaj = { ...contenuMaj, url: editResUrl };
      }
      const res = await fetch(`/api/bibliotheque-ressources/${aEditerRes.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: editResTitre, sous_type: editResSousType, matiere: editResMatiere || null, contenu: contenuMaj }),
      });
      if (res.ok) {
        setMessageSucces("Ressource mise à jour.");
        setTimeout(() => setMessageSucces(""), 3000);
        setAEditerRes(null);
        await chargerRessources();
      }
    } finally {
      setEnSauvegardeRes(false);
    }
  }

  async function supprimerRes(id: string) {
    const res = await fetch(`/api/bibliotheque-ressources/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRessources((prev) => prev.filter((r) => r.id !== id));
      setMessageSucces("Ressource supprimée.");
      setTimeout(() => setMessageSucces(""), 3000);
    }
    setSuppression(null);
  }

  /* ── Fichier de maths : helpers ── */
  function jourDe(offsetJours: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetJours);
    return d.toISOString().split("T")[0];
  }

  function nouveauJourFM(dateAssignation: string, grps?: { id: string; nom: string }[]): SemaineFM {
    const pages: Record<string, string> = {};
    (grps ?? groupesFM).forEach((g) => { pages[g.id] = ""; });
    return { id: crypto.randomUUID(), dateAssignation, pages };
  }

  function ajouterSemaineFM() {
    setSemainesFM((prev) => {
      const dernier = prev[prev.length - 1];
      const prochainJour = dernier
        ? (() => {
            const d = new Date(dernier.dateAssignation);
            d.setDate(d.getDate() + 1);
            return d.toISOString().split("T")[0];
          })()
        : jourDe(0);
      return [...prev, nouveauJourFM(prochainJour)];
    });
  }

  async function initSemainesFM() {
    // Charge les groupes + historique en parallèle si pas encore fait
    const [resGroupes, resHisto] = await Promise.all([
      groupesFM.length === 0 ? fetch("/api/admin/groupes") : Promise.resolve(null),
      fetch("/api/affecter-fichier-maths"),
    ]);

    let grps = groupesFM;
    if (resGroupes) {
      const json = await resGroupes.json();
      grps = (json.groupes ?? []).map((g: { id: string; nom: string }) => ({ id: g.id, nom: g.nom }));
      setGroupesFM(grps);
    }

    if (resHisto.ok) {
      const json = await resHisto.json();
      setHistoriqueFM(json.historique ?? []);
    }

    if (semainesFM.length === 0) {
      setSemainesFM([
        nouveauJourFM(jourDe(0), grps),
        nouveauJourFM(jourDe(1), grps),
        nouveauJourFM(jourDe(2), grps),
      ]);
    }
  }

  async function affecterFichierMaths() {
    const jours = semainesFM.map((s) => ({
      dateAssignation: s.dateAssignation,
      groupes: groupesFM.map((g) => ({
        groupeId: g.id,
        groupeNom: g.nom,
        page: s.pages[g.id] ? parseInt(s.pages[g.id], 10) : null,
      })),
    }));

    setEnAffectFM(true);
    setMessageFM("");
    try {
      const res = await fetch("/api/affecter-fichier-maths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jours }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessageFM(` Erreur : ${json.erreur}`);
      } else if (json.nb === 0) {
        setMessageFM("Aucun bloc créé. Vérifie que les niveaux ont des élèves.");
      } else {
        setMessageFM(`${json.nb} bloc(s) affectés avec succès !`);
        setSemainesFM([]);
        // Rafraîchir l'historique
        fetch("/api/affecter-fichier-maths").then(r => r.json()).then(j => setHistoriqueFM(j.historique ?? []));
      }
    } catch {
      setMessageFM("❌ Erreur réseau.");
    } finally {
      setEnAffectFM(false);
    }
  }

  /* ── Leçon à copier : init + affectation ── */
  async function initLeconCopier() {
    const [resGroupes, resHisto] = await Promise.all([
      groupesLC.length === 0 ? fetch("/api/admin/groupes") : Promise.resolve(null),
      fetch("/api/affecter-lecon-copier"),
    ]);

    if (resGroupes) {
      const json = await resGroupes.json();
      const grps = (json.groupes ?? []).map((g: { id: string; nom: string }) => ({ id: g.id, nom: g.nom }));
      setGroupesLC(grps);
      setLcGroupesCoches(new Set()); // décochés par défaut
    }

    if (resHisto.ok) {
      const json = await resHisto.json();
      setHistoriqueLC(json.historique ?? []);
    }
  }

  async function uploadFichierLC(file: File) {
    setLcUpload(true);
    setMessageLC("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/upload-lecon", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setMessageLC(` Upload échoué : ${json.error}`); return; }
      setLcUrl(json.url);
      setLcFichierNom(json.nom ?? file.name);
    } finally {
      setLcUpload(false);
    }
  }

  async function affecterLeconCopier() {
    if (!lcTitre.trim()) { setMessageLC(" Saisis un titre de leçon."); return; }
    if (!lcUrl.trim())   { setMessageLC(" Sélectionne un fichier PDF."); return; }
    if (lcGroupesCoches.size === 0) { setMessageLC(" Sélectionne au moins un groupe."); return; }

    const groupesSel = groupesLC
      .filter((g) => lcGroupesCoches.has(g.id))
      .map((g) => ({ groupeId: g.id, groupeNom: g.nom }));

    setEnAffectLC(true);
    setMessageLC("");
    try {
      const res = await fetch("/api/affecter-lecon-copier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre: lcTitre, url: lcUrl, dateAssignation: lcDate, groupes: groupesSel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessageLC(` Erreur : ${json.erreur}`);
      } else if (json.nb === 0) {
        setMessageLC("Aucun bloc créé. Vérifie que les groupes ont des élèves.");
      } else {
        setMessageLC(`${json.nb} bloc(s) affectés avec succès !`);
        setLcTitre("");
        setLcUrl("");
        fetch("/api/affecter-lecon-copier").then(r => r.json()).then(j => setHistoriqueLC(j.historique ?? []));
      }
    } catch {
      setMessageLC(" Erreur réseau.");
    } finally {
      setEnAffectLC(false);
    }
  }

  async function sauvegarderLecon() {
    if (!lcEdition) return;
    if (!lcEdition.titre.trim()) return;
    if (!lcEdition.url.trim()) return;
    setEnSauvegardeLC(true);
    try {
      const res = await fetch("/api/affecter-lecon-copier", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: lcEdition.date,
          groupe: lcEdition.groupe,
          ancienTitre: lcEdition.ancienTitre,
          titre: lcEdition.titre,
          url: lcEdition.url,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Erreur : ${json.erreur}`);
      } else {
        setLcEdition(null);
        fetch("/api/affecter-lecon-copier").then(r => r.json()).then(j => setHistoriqueLC(j.historique ?? []));
      }
    } finally {
      setEnSauvegardeLC(false);
    }
  }

  /* ── Calculs ── */
  const matieresDispo = Array.from(
    new Set(chapitres.map((c) => c.matiere).filter(Boolean))
  ).sort();

  const sousMatieresDispo = Array.from(
    new Set(
      chapitres
        .filter((c) => !editMatiere || c.matiere === editMatiere)
        .map((c) => c.sous_matiere)
        .filter(Boolean) as string[]
    )
  ).sort();

  const matieresRes = [...new Set(ressources.map((r) => r.matiere).filter(Boolean))] as string[];

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  }

  function ChipsAffectation({ items }: { items: AssignationResume[] }) {
    // Dédupliquer par (groupe_label, date) et afficher max 3
    const uniques = items.filter((a, i, arr) =>
      arr.findIndex(b => b.groupe_label === a.groupe_label && b.date_assignation === a.date_assignation) === i
    );
    if (uniques.length === 0) return null;
    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
        {uniques.slice(0, 4).map((a, i) => (
          <span key={i} style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600, whiteSpace: "nowrap",
          }}>
            {a.groupe_label ? `👥 ${a.groupe_label}` : "👤 Individuel"} · {fmtDate(a.date_assignation)}
          </span>
        ))}
        {uniques.length > 4 && (
          <span style={{ fontSize: 10, color: "var(--text-secondary)", alignSelf: "center" }}>
            +{uniques.length - 4}
          </span>
        )}
      </div>
    );
  }

  /* ── Helpers aperçu ressource ── */
  function getEmbedUrl(url: string): string | null {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return null;
  }
  function isAudioUrl(url: string): boolean {
    return /\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(url);
  }

  function TacheApercu({ tache, numero, total }: {
    tache: { sous_type?: string; texte?: string; url?: string; reference?: string; label?: string };
    numero?: number; total?: number;
  }) {
    const embedUrl = tache.url ? getEmbedUrl(tache.url) : null;
    const audio = tache.url ? isAudioUrl(tache.url) : false;
    const isLien = !!tache.url && !embedUrl && !audio && tache.sous_type !== "exercice_en_ligne";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {numero !== undefined && total !== undefined && total > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", color: "white", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {numero}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {tache.label || (tache.sous_type === "video" ? "Vidéo" : tache.sous_type === "podcast" ? "Podcast" : tache.sous_type === "exercice_en_ligne" ? "Exercice en ligne" : tache.sous_type === "exercice_papier" ? "Exercice papier" : "Ressource")}
            </span>
          </div>
        )}
        {tache.texte && (
          <div style={{ padding: "12px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, fontSize: 14, lineHeight: 1.6 }}>
            {tache.texte}
          </div>
        )}
        {tache.reference && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>
            <span style={{ fontSize: 22 }}>📄</span>{tache.reference}
          </div>
        )}
        {embedUrl && (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
            <iframe src={embedUrl} allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} title={tache.texte ?? "Vidéo"} />
          </div>
        )}
        {audio && tache.url && (
          <audio controls src={tache.url} style={{ width: "100%", borderRadius: 8 }} />
        )}
        {tache.sous_type === "exercice_en_ligne" && tache.url && !embedUrl && !audio && (
          <iframe src={tache.url} style={{ width: "100%", height: 500, border: "1px solid var(--border)", borderRadius: 10 }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={tache.label ?? "Exercice en ligne"} />
        )}
        {isLien && tache.url && (
          <a href={tache.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "var(--text)" }}>
            <div style={{ display: "flex", alignItems: "center", borderRadius: 12, overflow: "hidden", border: "1.5px solid var(--border)", background: "white", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
              <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{tache.sous_type === "podcast" ? <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>podcasts</span> Écouter le podcast</> : <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>open_in_new</span> Ouvrir la ressource</>}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tache.url}</div>
              </div>
              <div style={{ width: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", fontSize: 28, alignSelf: "stretch" }}>
                <span className="ms" style={{ fontSize: 16 }}>{tache.sous_type === "podcast" ? "podcasts" : "open_in_new"}</span>
              </div>
            </div>
          </a>
        )}
      </div>
    );
  }

  const ressourcesFiltrees = ressources.filter((r) => {
    if (filtreSousType !== "tous" && r.sous_type !== filtreSousType) return false;
    if (filtreMatRes !== "toutes" && r.matiere !== filtreMatRes) return false;
    if (recherche.trim() && !r.titre.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  const exApercu = apercu?.type === "exercice"      ? (apercu.contenu as unknown as ExerciceIA)    : null;
  const cmApercu = apercu?.type === "calcul_mental" ? (apercu.contenu as unknown as CalcMentalIA) : null;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  /* ── Rendu ── */
  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ maxWidth: 820 }}>

          {/* En-tête */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}><span className="ms" style={{ fontSize: 22, verticalAlign: "middle" }}>library_books</span> Bibliothèque</h1>
            {onglet === "exercices" ? (
              <Link href="/enseignant/generer" className="btn-primary">+ Générer →</Link>
            ) : (
              <Link href="/enseignant/generer?type=ressource" className="btn-primary">+ Nouvelle ressource</Link>
            )}
          </div>

          {/* Onglets */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 0, flexWrap: "wrap" }}>
            {([
              { id: "exercices",     label: "🗂️ Banque d'exercices" },
              { id: "ressources",   label: "Ressources" },
              { id: "fichier_maths", label: "Fichier de maths" },
              { id: "lecon_copier",  label: "Leçon à copier" },
              { id: "ecriture",      label: "Écriture" },
            ] as { id: Onglet; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setOnglet(id);
                  if (id === "fichier_maths") initSemainesFM();
                  if (id === "lecon_copier") initLeconCopier();
                  if (id === "ecriture") chargerThemesEcriture();
                }}
                style={{
                  padding: "8px 18px",
                  fontSize: 14,
                  fontWeight: onglet === id ? 700 : 500,
                  border: "none",
                  borderBottom: onglet === id ? "2px solid var(--primary)" : "2px solid transparent",
                  marginBottom: -2,
                  background: "none",
                  cursor: "pointer",
                  color: onglet === id ? "var(--primary)" : "var(--text-secondary)",
                  transition: "color 0.15s",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ════════════════ ONGLET EXERCICES ════════════════ */}
          {onglet === "exercices" && (
            <>
              {/* Filtres */}
              <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <select className="form-input" value={filtreType} onChange={(e) => setFiltreType(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 140 }}>
                  <option value="">Tous les types</option>
                  <option value="exercice">Exercice</option>
                  <option value="calcul_mental">Calcul mental</option>
                </select>
                <select className="form-input" value={filtreMatiere} onChange={(e) => setFiltreMatiere(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 140 }}>
                  <option value="">Toutes les matières</option>
                  <option value="maths">Maths</option>
                  <option value="français">Français</option>
                </select>
                <select className="form-input" value={filtreNiveau} onChange={(e) => setFiltreNiveau(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 120 }}>
                  <option value="">Tous les niveaux</option>
                  {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <select className="form-input" value={filtreChapitreId} onChange={(e) => setFiltreChapitreId(e.target.value)} style={{ fontSize: 13, width: "100%" }}>
                  <option value="">Tous les chapitres</option>
                  {chapitres.map((c) => (
                    <option key={c.id} value={c.id}>{c.matiere} — {c.titre}</option>
                  ))}
                </select>
              </div>

              {chargementEx ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
              ) : exercices.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
                  <p>Aucun exercice dans la banque.</p>
                  <Link href="/enseignant/generer" className="btn-primary" style={{ display: "inline-block", marginTop: 16 }}>
                    Générer un exercice
                  </Link>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                    {exercices.length} exercice{exercices.length > 1 ? "s" : ""}
                  </div>
                  {exercices.map((ex) => {
                    const conf = COULEURS_TYPE[ex.type] ?? { bg: "#F3F4F6", color: "#374151" };
                    const affEx = ex.titre ? (affectationsEx.get(`${ex.titre}___${ex.type}`) ?? []) : [];
                    return (
                      <div key={ex.id} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: conf.bg, color: conf.color, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {ex.type === "exercice" ? "Exercice" : "Calcul mental"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ex.titre ?? (ex.type === "calcul_mental" ? "Calcul mental" : "Sans titre")}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                            {ex.matiere     && <span className="badge badge-primary" style={{ fontSize: 10 }}>{ex.matiere}</span>}
                            {ex.sous_matiere && <span className="badge" style={{ fontSize: 10, background: "#F3F4F6", color: "#374151" }}>{ex.sous_matiere}</span>}
                            {ex.niveaux?.nom && <span className="badge" style={{ fontSize: 10 }}>{ex.niveaux.nom}</span>}
                            {ex.chapitres?.titre && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ex.chapitres.titre}</span>}
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ex.nb_utilisations} utilisation{ex.nb_utilisations > 1 ? "s" : ""}</span>
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatDate(ex.created_at)}</span>
                          </div>
                          <ChipsAffectation items={affEx} />
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button className="btn-secondary" onClick={() => setApercu(ex)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>Aperçu</button>
                          <button className="btn-secondary" onClick={() => ouvrirEdition(ex)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>Modifier</button>
                          <button className="btn-secondary" onClick={() => dupliquer(ex)} disabled={enDuplication.has(ex.id)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>
                            {enDuplication.has(ex.id) ? "…" : "Dupliquer"}
                          </button>
                          <button className="btn-primary" onClick={() => setAAffecter(ex)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>Affecter</button>
                          {aSupprimer === ex.id ? (
                            <>
                              <button onClick={() => supprimerEx(ex.id)} disabled={enSuppression} style={{ padding: "4px 10px", fontSize: 13, background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                                {enSuppression ? "…" : "Confirmer"}
                              </button>
                              <button className="btn-ghost" onClick={() => setASupprimer(null)} style={{ padding: "4px 8px", fontSize: 13 }}>✕</button>
                            </>
                          ) : (
                            <button className="btn-ghost" onClick={() => setASupprimer(ex.id)} style={{ padding: "4px 10px", fontSize: 13, color: "var(--text-secondary)" }}><span className="ms" style={{ fontSize: 16 }}>delete</span></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ════════════════ ONGLET RESSOURCES ════════════════ */}
          {onglet === "ressources" && (
            <>
              {messageSucces && (
                <div style={{ background: "#D1FAE5", color: "#065F46", padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontWeight: 600 }}>
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>check_circle</span> {messageSucces}
                </div>
              )}

              {/* Filtres */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="🔍 Rechercher…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  style={{ maxWidth: 200, marginBottom: 0, fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["tous", "podcast", "video", "exercice_en_ligne", "exercice_papier"].map((st) => (
                    <button
                      key={st}
                      onClick={() => setFiltreSousType(st)}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontWeight: 600,
                        background: filtreSousType === st ? "var(--primary)" : "white",
                        color:      filtreSousType === st ? "white" : "var(--text-secondary)",
                        border:     filtreSousType === st ? "none" : "1px solid var(--border)",
                        fontFamily: "inherit",
                      }}
                    >
                      {st === "tous" ? "Tous" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>{ICONES_ST[st]}</span> {LABELS_ST[st]}</>}
                    </button>
                  ))}
                </div>
                {matieresRes.length > 0 && (
                  <select className="form-input" value={filtreMatRes} onChange={(e) => setFiltreMatRes(e.target.value)} style={{ maxWidth: 160, marginBottom: 0, fontSize: 13 }}>
                    <option value="toutes">Toutes matières</option>
                    {matieresRes.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
              <div style={{ marginBottom: 20 }} />

              {chargementRes ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>Chargement…</div>
              ) : ressourcesFiltrees.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                    {ressources.length === 0 ? "Aucune ressource sauvegardée." : "Aucune ressource correspondant aux filtres."}
                  </div>
                  {ressources.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
                      Lors de la création d'une ressource, cliquez sur «&nbsp;Enregistrer dans la bibliothèque&nbsp;» pour la retrouver ici.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                    {ressourcesFiltrees.length} ressource{ressourcesFiltrees.length > 1 ? "s" : ""}
                  </div>
                  {ressourcesFiltrees.map((r) => {
                    const taches = r.contenu?.taches ?? [{ sous_type: r.sous_type, url: r.contenu?.url, texte: r.contenu?.texte }];
                    const affRes = affectationsRes.get(r.titre) ?? [];
                    return (
                      <div key={r.id} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "#F3F4F6", color: "#374151", flexShrink: 0, whiteSpace: "nowrap" }}>
                          <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>{ICONES_ST[r.sous_type] ?? "link"}</span> {LABELS_ST[r.sous_type] ?? r.sous_type}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titre}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                            {r.matiere && <span className="badge badge-primary" style={{ fontSize: 10 }}>{r.matiere}</span>}
                            {taches.length > 1 && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{taches.length} étapes</span>}
                            {taches[0]?.url && <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}><span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>link</span> {taches[0].url}</span>}
                            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                          </div>
                          <ChipsAffectation items={affRes} />
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button className="btn-secondary" onClick={() => setApercuRes(r)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>Aperçu</button>
                          <Link href={`/enseignant/generer?type=ressource&biblio=${r.id}`} className="btn-secondary" style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6, textDecoration: "none" }}>Réutiliser</Link>
                          <button className="btn-secondary" onClick={() => ouvrirEditionRes(r)} style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}>Modifier</button>
                          {suppression === r.id ? (
                            <>
                              <button onClick={() => supprimerRes(r.id)} style={{ padding: "4px 10px", fontSize: 13, background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>Confirmer</button>
                              <button className="btn-ghost" onClick={() => setSuppression(null)} style={{ padding: "4px 8px", fontSize: 13 }}>✕</button>
                            </>
                          ) : (
                            <button className="btn-ghost" onClick={() => setSuppression(r.id)} style={{ padding: "4px 10px", fontSize: 13, color: "var(--text-secondary)" }}><span className="ms" style={{ fontSize: 16 }}>delete</span></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ════════════════ ONGLET FICHIER DE MATHS ════════════════ */}
          {onglet === "fichier_maths" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                Planifiez les pages du fichier de maths par niveau sur plusieurs semaines.
                Laissez une case vide pour ne pas affecter ce niveau cette semaine-là.
              </p>

              {/* En-tête colonnes niveaux */}
              {groupesFM.length > 0 && semainesFM.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, borderBottom: "2px solid var(--border)", minWidth: 140 }}>
                          Date
                        </th>
                        {groupesFM.map((g) => (
                          <th key={g.id} style={{ textAlign: "center", padding: "8px 12px", fontWeight: 700, borderBottom: "2px solid var(--border)", minWidth: 100 }}>
                            {g.nom}
                          </th>
                        ))}
                        <th style={{ width: 40, borderBottom: "2px solid var(--border)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {semainesFM.map((sem, idx) => (
                        <tr key={sem.id} style={{ background: idx % 2 === 0 ? "white" : "var(--primary-pale)" }}>
                          {/* Date */}
                          <td style={{ padding: "8px 12px" }}>
                            <input
                              type="date"
                              className="form-input"
                              value={sem.dateAssignation}
                              onChange={(e) =>
                                setSemainesFM((prev) =>
                                  prev.map((s) => s.id === sem.id ? { ...s, dateAssignation: e.target.value } : s)
                                )
                              }
                              style={{ fontSize: 13, marginBottom: 0, padding: "4px 8px" }}
                            />
                          </td>
                          {/* Page par groupe */}
                          {groupesFM.map((g) => (
                            <td key={g.id} style={{ padding: "8px 12px", textAlign: "center" }}>
                              <input
                                type="number"
                                min={1}
                                max={999}
                                className="form-input"
                                placeholder="—"
                                value={sem.pages[g.id] ?? ""}
                                onChange={(e) =>
                                  setSemainesFM((prev) =>
                                    prev.map((s) =>
                                      s.id === sem.id
                                        ? { ...s, pages: { ...s.pages, [g.id]: e.target.value } }
                                        : s
                                    )
                                  )
                                }
                                style={{ fontSize: 14, textAlign: "center", marginBottom: 0, padding: "4px 8px", width: 72 }}
                              />
                            </td>
                          ))}
                          {/* Supprimer ligne */}
                          <td style={{ padding: "8px 6px", textAlign: "center" }}>
                            <button
                              className="btn-ghost"
                              onClick={() => setSemainesFM((prev) => prev.filter((s) => s.id !== sem.id))}
                              style={{ padding: "2px 8px", fontSize: 13, color: "var(--text-secondary)" }}
                              title="Supprimer cette semaine"
                            >
                              <span className="ms" style={{ fontSize: 16 }}>delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Boutons action */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 12 }}>
                <button
                  className="btn-secondary"
                  onClick={ajouterSemaineFM}
                  style={{ fontSize: 14 }}
                >
                  + Ajouter un jour
                </button>

                {semainesFM.length > 0 && (
                  <button
                    className="btn-primary"
                    onClick={affecterFichierMaths}
                    disabled={enAffectFM}
                    style={{ fontSize: 14 }}
                  >
                    {enAffectFM ? "Affectation en cours…" : <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>straighten</span> Affecter le fichier de maths</>}
                  </button>
                )}
              </div>

              {/* Message retour */}
              {messageFM && (
                <div style={{
                  marginTop: 12, padding: "10px 16px", borderRadius: 8, fontSize: 14,
                  background: messageFM.includes("succès") ? "#D1FAE5" : messageFM.includes("Aucun bloc") ? "#FEF9C3" : "#FEE2E2",
                  color: messageFM.includes("succès") ? "#065F46" : messageFM.includes("Aucun bloc") ? "#713F12" : "#991B1B",
                }}>
                  {messageFM}
                </div>
              )}

              {groupesFM.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                  Aucun groupe configuré. Créez d&apos;abord des groupes dans la section Admin.
                </div>
              )}

              {/* ── Historique des affectations ── */}
              {historiqueFM.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
                    <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>assignment</span> Historique des affectations
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 700, color: "var(--text-secondary)" }}>Date</th>
                          <th style={{ textAlign: "left", padding: "6px 12px", fontWeight: 700, color: "var(--text-secondary)" }}>Groupe</th>
                          <th style={{ textAlign: "center", padding: "6px 12px", fontWeight: 700, color: "var(--text-secondary)" }}>Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historiqueFM.map((h, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "white" : "var(--primary-pale)" }}>
                            <td style={{ padding: "6px 12px", color: "var(--text)" }}>
                              {new Date(h.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
                            </td>
                            <td style={{ padding: "6px 12px", color: "var(--text)" }}>
                              <span style={{ fontWeight: 600 }}>{h.groupe}</span>
                            </td>
                            <td style={{ padding: "6px 12px", textAlign: "center" }}>
                              <span style={{ background: "var(--primary)", color: "white", fontWeight: 700, fontSize: 12, padding: "2px 10px", borderRadius: 999 }}>
                                p. {h.page}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ ONGLET LEÇON À COPIER ════════════════ */}
          {onglet === "lecon_copier" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
                Charge un PDF depuis ton ordinateur et assigne-le aux élèves comme leçon à copier.
              </p>

              {/* Formulaire */}
              <div style={{ background: "var(--primary-pale)", borderRadius: 12, padding: "20px 18px", marginBottom: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Titre */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Titre de la leçon
                    </label>
                    <input
                      className="form-input"
                      value={lcTitre}
                      onChange={(e) => setLcTitre(e.target.value)}
                      placeholder="Ex : Les fractions, La photosynthèse…"
                      style={{ width: "100%", fontSize: 14 }}
                    />
                  </div>

                  {/* Fichier PDF */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Fichier PDF
                    </label>
                    <label style={{
                      display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                      border: `2px dashed ${lcUrl ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: 10, padding: "14px 18px",
                      background: lcUrl ? "var(--primary-pale)" : "white",
                      transition: "all 0.2s",
                    }}>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFichierLC(f); }}
                      />
                      {lcUpload ? (
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>⏳ Upload en cours…</span>
                      ) : lcUrl ? (
                        <>
                          <span style={{ fontSize: 20 }}>📄</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lcFichierNom || "Fichier chargé"}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>Changer →</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 20 }}>📁</span>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Clique pour choisir un PDF…</span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* Date + Groupes */}
                  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "start" }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Date
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        value={lcDate}
                        onChange={(e) => setLcDate(e.target.value)}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Groupes
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {groupesLC.map((g) => {
                          const coche = lcGroupesCoches.has(g.id);
                          return (
                            <button
                              key={g.id}
                              onClick={() => setLcGroupesCoches((prev) => {
                                const next = new Set(prev);
                                if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                                return next;
                              })}
                              style={{
                                padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
                                border: `2px solid ${coche ? "var(--primary)" : "var(--border)"}`,
                                background: coche ? "var(--primary)" : "white",
                                color: coche ? "white" : "var(--text-secondary)",
                                cursor: "pointer", transition: "all 0.15s",
                              }}
                            >
                              {g.nom}
                            </button>
                          );
                        })}
                        {groupesLC.length === 0 && (
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Chargement des groupes…</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Message + bouton */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
                    {messageLC && (
                      <span style={{ fontSize: 13, color: messageLC.includes("affecté") ? "var(--success)" : "var(--danger)" }}>
                        {messageLC}
                      </span>
                    )}
                    <div style={{ marginLeft: "auto" }}>
                      <button
                        className="btn-primary"
                        onClick={affecterLeconCopier}
                        disabled={enAffectLC}
                        style={{ fontSize: 14 }}
                      >
                        {enAffectLC ? "Affectation…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>menu_book</span> Affecter la leçon</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Historique ── */}
              {historiqueLC.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
                    <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>assignment</span> Historique des leçons affectées
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--border)" }}>
                          <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>Date</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>Groupe</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>Titre</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700 }}>Lien</th>
                          <th style={{ padding: "8px 12px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historiqueLC.map((h, i) => {
                          const cleLC = `${h.date}__${h.groupe}__${h.titre}`;
                          const enSuppLC = suppressionLC === cleLC;
                          return (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "white" : "var(--primary-pale)", opacity: enSuppLC ? 0.5 : 1, transition: "opacity 0.15s" }}>
                            <td style={{ padding: "6px 12px", color: "var(--text)" }}>
                              {new Date(h.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <span style={{ fontWeight: 600 }}>{h.groupe}</span>
                            </td>
                            <td style={{ padding: "6px 12px" }}>{h.titre}</td>
                            <td style={{ padding: "6px 12px" }}>
                              <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "underline", fontSize: 12 }}>
                                Voir →
                              </a>
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button
                                  className="btn-ghost"
                                  onClick={() => setLcEdition({ date: h.date, groupe: h.groupe, ancienTitre: h.titre, titre: h.titre, url: h.url })}
                                  style={{ fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
                                  disabled={enSuppLC}
                                >
                                  <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier
                                </button>
                                <button
                                  title="Supprimer et désaffecter"
                                  disabled={enSuppLC}
                                  onClick={async () => {
                                    setSuppressionLC(cleLC);
                                    try {
                                      await fetch("/api/affecter-lecon-copier", {
                                        method: "DELETE",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ date: h.date, groupe: h.groupe, titre: h.titre }),
                                      });
                                      setHistoriqueLC((prev) => prev.filter((r) => `${r.date}__${r.groupe}__${r.titre}` !== cleLC));
                                    } finally {
                                      setSuppressionLC(null);
                                    }
                                  }}
                                  style={{
                                    width: 24, height: 24, borderRadius: "50%",
                                    background: "#FEE2E2", border: "none",
                                    color: "#DC2626", fontSize: 14, lineHeight: 1,
                                    cursor: "pointer", display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    fontWeight: 700, transition: "background 0.15s",
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "#DC2626"; e.currentTarget.style.color = "white"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#DC2626"; }}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════ ONGLET ÉCRITURE ════════════════ */}
          {onglet === "ecriture" && (
            <div>
              {/* ── Thème du jour ── */}
              <div style={{ background: "linear-gradient(135deg,#7C3AED08,#7C3AED18)", border: "1.5px solid rgba(124,58,237,0.2)", borderRadius: 14, padding: "18px 20px", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C3AED" }}><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Thème du jour</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {!modeEditionEcr && (
                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                        <div
                          onClick={async () => {
                            const newVal = !avecContrainte;
                            setAvecContrainte(newVal);
                            if (themeJourEcr) {
                              setThemeJourEcr(prev => prev ? { ...prev, afficher_contrainte: newVal } : prev);
                              await fetch("/api/affecter-theme-ecriture", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ theme_id: themeJourEcr.id, afficher_contrainte: newVal }),
                              });
                            }
                          }}
                          style={{ width: 36, height: 20, borderRadius: 999, cursor: "pointer", background: avecContrainte ? "#7C3AED" : "#D1D5DB", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                        >
                          <div style={{ position: "absolute", top: 2, left: avecContrainte ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                        </div>
                        Avec contrainte
                      </label>
                    )}
                    {themeJourEcr && !modeEditionEcr && (
                      <button
                        onClick={() => { setEditSujetEcr(themeJourEcr.sujet); setEditContrainteEcr(themeJourEcr.contrainte); setModeEditionEcr(true); }}
                        style={{ background: "white", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "inherit" }}
                      >
                        <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier
                      </button>
                    )}
                    {!modeEditionEcr && (
                      <button onClick={regenThemeEcriture} disabled={enRegen} style={{ background: "white", border: "1.5px solid rgba(124,58,237,0.3)", borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#7C3AED", fontFamily: "inherit", opacity: enRegen ? 0.6 : 1 }}>
                        {enRegen ? "Génération…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>refresh</span> Régénérer</>}
                      </button>
                    )}
                  </div>
                </div>

                {modeEditionEcr ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4, display: "block" }}>Sujet</label>
                      <input
                        type="text"
                        value={editSujetEcr}
                        onChange={e => setEditSujetEcr(e.target.value)}
                        className="form-input"
                        style={{ fontSize: 14, marginBottom: 0 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4, display: "block" }}>Contrainte</label>
                      <input
                        type="text"
                        value={editContrainteEcr}
                        onChange={e => setEditContrainteEcr(e.target.value)}
                        className="form-input"
                        style={{ fontSize: 14, marginBottom: 0 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={enSauvegardeEcr}
                        onClick={async () => {
                          if (!themeJourEcr) return;
                          setEnSauvegardeEcr(true);
                          try {
                            const res = await fetch("/api/affecter-theme-ecriture", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ theme_id: themeJourEcr.id, sujet: editSujetEcr, contrainte: editContrainteEcr }),
                            });
                            const data = await res.json();
                            if (data?.ok) {
                              setThemeJourEcr(prev => prev ? { ...prev, sujet: editSujetEcr, contrainte: editContrainteEcr } : prev);
                              setModeEditionEcr(false);
                            }
                          } finally {
                            setEnSauvegardeEcr(false);
                          }
                        }}
                        style={{ background: "#7C3AED", color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: enSauvegardeEcr ? 0.6 : 1 }}
                      >
                        {enSauvegardeEcr ? "Enregistrement…" : "Enregistrer"}
                      </button>
                      <button
                        onClick={() => setModeEditionEcr(false)}
                        style={{ background: "white", color: "#6B7280", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : themeJourEcr ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>{themeJourEcr.sujet}</div>
                    {avecContrainte && themeJourEcr.contrainte && (
                      <div style={{ fontSize: 13, color: "#5B21B6", fontStyle: "italic" }}>📌 {themeJourEcr.contrainte}</div>
                    )}
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                      {themeJourEcr.affecte ? (
                        <span style={{ fontSize: 12, fontWeight: 700, background: "#D1FAE5", color: "#065F46", padding: "3px 10px", borderRadius: 999 }}><span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check_circle</span> Affecté aux élèves</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 12, fontWeight: 700, background: "#FEF3C7", color: "#92400E", padding: "3px 10px", borderRadius: 999 }}>⏳ Pas encore affecté</span>
                          <button
                            onClick={async () => {
                              const res = await fetch("/api/affecter-theme-ecriture", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ theme_id: themeJourEcr!.id }),
                              });
                              const data = await res.json();
                              if (data?.ok) setThemeJourEcr(prev => prev ? { ...prev, affecte: true } : prev);
                            }}
                            style={{ background: "#7C3AED", color: "white", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Affecter maintenant
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : chargementEcr ? (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Chargement…</div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Aucun thème généré aujourd&apos;hui.</div>
                )}
              </div>

              {/* ── Historique ── */}
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Historique</div>
              {chargementEcr ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>Chargement…</div>
              ) : themesEcriture.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}><span className="ms" style={{ fontSize: 40 }}>edit</span></div>
                  <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Aucun thème archivé.</div>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>Les thèmes apparaissent ici après avoir été affectés aux élèves.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{themesEcriture.length} thème{themesEcriture.length > 1 ? "s" : ""}</div>
                  {themesEcriture.map((t) => (
                    <div key={t.id} className="card" style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ padding: "2px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "rgba(124,58,237,0.1)", color: "#7C3AED" }}>✍️ Écriture</span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {new Date(t.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{t.sujet}</div>
                      {avecContrainte && t.contrainte && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>📌 {t.contrainte}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modal édition leçon à copier ── */}
      {lcEdition && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}
          onClick={() => setLcEdition(null)}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520, padding: "28px 24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier la leçon</h3>
              <button className="btn-ghost" onClick={() => setLcEdition(null)} style={{ padding: "4px 10px" }}>✕</button>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
              {new Date(lcEdition.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
              {lcEdition.groupe ? ` · ${lcEdition.groupe}` : ""}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Titre de la leçon
                </label>
                <input
                  className="form-input"
                  value={lcEdition.titre}
                  onChange={(e) => setLcEdition({ ...lcEdition, titre: e.target.value })}
                  style={{ width: "100%", fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Fichier PDF
                </label>
                <label style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  border: `2px dashed ${lcEdition.url ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: 10, padding: "12px 16px",
                  background: lcEdition.url ? "var(--primary-pale)" : "white",
                }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const fd = new FormData();
                      fd.append("file", f);
                      const res  = await fetch("/api/upload-lecon", { method: "POST", body: fd });
                      const json = await res.json();
                      if (!res.ok) { alert(`Upload échoué : ${json.error}`); return; }
                      setLcEdition({ ...lcEdition, url: json.url });
                    }}
                  />
                  <span style={{ fontSize: 18 }}>📄</span>
                  <span style={{ fontSize: 13, color: lcEdition.url ? "var(--primary)" : "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lcEdition.url ? "Fichier chargé — cliquer pour remplacer" : "Choisir un nouveau PDF…"}
                  </span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn-ghost" onClick={() => setLcEdition(null)} style={{ fontSize: 13 }}>
                  Annuler
                </button>
                <button
                  className="btn-primary"
                  onClick={sauvegarderLecon}
                  disabled={enSauvegardeLC}
                  style={{ fontSize: 13 }}
                >
                  {enSauvegardeLC ? "Enregistrement…" : "✓ Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ── Modal édition exercice ── */}
      {aEditer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }} onClick={() => setAEditer(null)}>
          <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "24px 22px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Modifier l&apos;exercice</h3>
              <button className="btn-ghost" onClick={() => setAEditer(null)} style={{ padding: "4px 10px" }}>✕</button>
            </div>

            {/* Métadonnées */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Titre</label>
                <input className="form-input" value={editTitre} onChange={(e) => setEditTitre(e.target.value)} placeholder="Titre de l'exercice" style={{ width: "100%", fontSize: 14 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Matière</label>
                  <input className="form-input" list="edit-matieres-list" value={editMatiere} onChange={(e) => { setEditMatiere(e.target.value); setEditSousMatiere(""); }} placeholder="Ex : Maths…" style={{ fontSize: 13 }} />
                  <datalist id="edit-matieres-list">{matieresDispo.map((m) => <option key={m} value={m} />)}</datalist>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Sous-matière</label>
                  <input className="form-input" list="edit-sous-matieres-list" value={editSousMatiere} onChange={(e) => setEditSousMatiere(e.target.value)} placeholder="Ex : Calcul…" style={{ fontSize: 13 }} />
                  <datalist id="edit-sous-matieres-list">{sousMatieresDispo.map((sm) => <option key={sm} value={sm} />)}</datalist>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  Chapitre <span style={{ fontWeight: 400 }}>(optionnel)</span>
                </label>
                <select className="form-input" value={editChapitreId} onChange={(e) => { setEditChapitreId(e.target.value); const c = chapitres.find((c) => c.id === e.target.value); if (c?.matiere) setEditMatiere(c.matiere); }} style={{ width: "100%", fontSize: 13 }}>
                  <option value="">— Aucun chapitre —</option>
                  {chapitres.map((c) => (
                    <option key={c.id} value={c.id}>{c.matiere}{c.sous_matiere ? ` · ${c.sous_matiere}` : ""} — {c.titre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Éditeur de questions (exercice uniquement) */}
            {aEditer.type === "exercice" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 14 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Consigne</label>
                  <input className="form-input" value={editConsigneEx} onChange={(e) => setEditConsigneEx(e.target.value)} placeholder="Consigne générale…" style={{ width: "100%", fontSize: 13 }} />
                </div>

                <button
                  className="btn-secondary"
                  onClick={regenererContenu}
                  disabled={enRegeneration || enSauvegarde}
                  style={{ fontSize: 12, padding: "5px 12px", width: "100%", marginBottom: 12 }}
                >
                  {enRegeneration ? "Génération en cours…" : "Regénérer les questions avec l'IA"}
                </button>

                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: "var(--text)" }}>Questions</div>
                {editQuestionsEx.map((q, qi) => (
                  <div key={q.id} style={{ marginBottom: 8, padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700, paddingTop: 8, minWidth: 24 }}>Q{qi + 1}</span>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                      <input
                        type="text" className="form-input" value={q.enonce} placeholder="Énoncé"
                        onChange={(e) => setEditQuestionsEx((prev) => prev.map((qq, i) => i === qi ? { ...qq, enonce: e.target.value } : qq))}
                        style={{ fontSize: 12 }}
                      />
                      <input
                        type="text" className="form-input" value={q.reponse_attendue} placeholder="Réponse attendue"
                        onChange={(e) => setEditQuestionsEx((prev) => prev.map((qq, i) => i === qi ? { ...qq, reponse_attendue: e.target.value } : qq))}
                        style={{ fontSize: 12, borderColor: "var(--success)" }}
                      />
                      <input
                        type="text" className="form-input" value={q.indice ?? ""} placeholder="💡 Indice (optionnel)"
                        onChange={(e) => setEditQuestionsEx((prev) => prev.map((qq, i) => i === qi ? { ...qq, indice: e.target.value } : qq))}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                    <button onClick={() => setEditQuestionsEx((prev) => prev.filter((_, i) => i !== qi))} style={{ padding: "4px 8px", fontSize: 13, background: "none", border: "none", color: "var(--error)", cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                <button
                  className="btn-ghost"
                  onClick={() => setEditQuestionsEx((prev) => [...prev, { id: (prev[prev.length - 1]?.id ?? 0) + 1, enonce: "", reponse_attendue: "", indice: "" }])}
                  style={{ fontSize: 12, width: "100%", marginBottom: 4 }}
                >
                  + Ajouter une question
                </button>
              </div>
            )}

            {/* Regénérer pour calcul_mental */}
            {aEditer.type === "calcul_mental" && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 14 }}>
                <button
                  className="btn-secondary"
                  onClick={regenererContenu}
                  disabled={enRegeneration || enSauvegarde}
                  style={{ fontSize: 12, padding: "5px 12px", width: "100%" }}
                >
                  {enRegeneration ? "Génération en cours…" : "Regénérer les calculs avec l'IA"}
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setAEditer(null)} style={{ fontSize: 14 }}>Annuler</button>
              <button className="btn-primary" onClick={sauvegarderEdition} disabled={enSauvegarde || enRegeneration} style={{ fontSize: 14 }}>
                {enSauvegarde ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal aperçu exercice ── */}
      {apercu && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }} onClick={() => setApercu(null)}>
          <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", padding: "24px 22px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                  {apercu.type === "exercice" ? "📝" : "🔢"} {apercu.titre ?? "Aperçu"}
                </h3>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {apercu.matiere     && <span className="badge badge-primary" style={{ fontSize: 11 }}>{apercu.matiere}</span>}
                  {apercu.niveaux?.nom && <span className="badge" style={{ fontSize: 11 }}>{apercu.niveaux.nom}</span>}
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setApercu(null)} style={{ padding: "4px 10px" }}>✕</button>
            </div>
            {exApercu && (
              <div>
                <p style={{ fontWeight: 600, marginBottom: 14 }}>{exApercu.consigne}</p>
                {exApercu.questions.map((q, i) => (
                  <div key={q.id} style={{ marginBottom: 10, padding: "10px 14px", background: "var(--primary-pale)", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{i + 1}. {q.enonce}</div>
                    <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 4 }}>→ {q.reponse_attendue}</div>
                    {q.indice && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>💡 {q.indice}</div>}
                  </div>
                ))}
              </div>
            )}
            {cmApercu && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cmApercu.modeles ? (
                  <div style={{ padding: "8px 14px", background: "#EDE9FE", borderRadius: 8, fontSize: 13, color: "#5B21B6", fontWeight: 600 }}>
                    🎲 {cmApercu.nb_calculs} calculs aléatoires · opérations : {cmApercu.operations?.join(", ")}
                  </div>
                ) : (cmApercu.calculs ?? []).map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{i + 1}. {c.enonce}</span>
                    <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 700 }}>= {c.reponse}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal édition ressource ── */}
      {aEditerRes && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }} onClick={() => setAEditerRes(null)}>
          <div className="card" style={{ width: "100%", maxWidth: 480, padding: "24px 22px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier la ressource</h3>
              <button className="btn-ghost" onClick={() => setAEditerRes(null)} style={{ padding: "4px 10px" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Titre</label>
                <input className="form-input" value={editResTitre} onChange={(e) => setEditResTitre(e.target.value)} placeholder="Titre de la ressource" style={{ width: "100%", fontSize: 14 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Type</label>
                <select className="form-input" value={editResSousType} onChange={(e) => setEditResSousType(e.target.value)} style={{ width: "100%", fontSize: 14 }}>
                  <option value="video">🎬 Vidéo</option>
                  <option value="podcast">🎙️ Podcast</option>
                  <option value="exercice_en_ligne">💻 Exercice en ligne</option>
                  <option value="exercice_papier">📄 Exercice papier</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>Matière <span style={{ fontWeight: 400 }}>(optionnel)</span></label>
                <input className="form-input" value={editResMatiere} onChange={(e) => setEditResMatiere(e.target.value)} placeholder="Ex : Maths, Français…" style={{ width: "100%", fontSize: 14 }} />
              </div>

              {(aEditerRes.contenu?.url || aEditerRes.contenu?.taches?.[0]?.url) && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>URL principale</label>
                  <input className="form-input" value={editResUrl} onChange={(e) => setEditResUrl(e.target.value)} placeholder="https://…" style={{ width: "100%", fontSize: 14 }} />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setAEditerRes(null)} style={{ fontSize: 14 }}>Annuler</button>
              <button className="btn-primary" onClick={sauvegarderEditionRes} disabled={enSauvegardeRes || !editResTitre.trim()} style={{ fontSize: 14 }}>
                {enSauvegardeRes ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal affectation exercice ── */}
      {aAffecter && (
        <AffecterExerciceModal
          exercice={{ id: aAffecter.id, type: aAffecter.type, titre: aAffecter.titre, contenu: aAffecter.contenu as Record<string, unknown>, chapitre_id: aAffecter.chapitre_id }}
          onClose={() => setAAffecter(null)}
        />
      )}

      {/* ── Modale aperçu ressource (vue élève) ── */}
      {apercuRes && (() => {
        const taches = apercuRes.contenu?.taches
          ?? [{ sous_type: apercuRes.sous_type, url: apercuRes.contenu?.url, texte: apercuRes.contenu?.texte }];
        return (
          <div
            onClick={() => setApercuRes(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "var(--white)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.20)", width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              {/* En-tête modale */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Vue élève — {LABELS_ST[apercuRes.sous_type] ?? apercuRes.sous_type}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{apercuRes.titre}</div>
                </div>
                <button onClick={() => setApercuRes(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-secondary)", padding: "4px 8px" }}>✕</button>
              </div>

              {/* Corps scrollable */}
              <div style={{ padding: "20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
                {taches.map((t, i) => (
                  <TacheApercu
                    key={i}
                    tache={t}
                    numero={taches.length > 1 ? i + 1 : undefined}
                    total={taches.length}
                  />
                ))}

                {/* QCM si disponible */}
                {(() => {
                  const qcm = qcmParRessource.get(apercuRes.titre);
                  if (!qcm || qcm.length === 0) return null;
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                        🎯 Questionnaire ({qcm.length} question{qcm.length > 1 ? "s" : ""})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {qcm.map((q, qi) => (
                          <div key={qi} className="card" style={{ padding: "14px 16px" }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                              {qi + 1}. {q.question}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {q.options.map((opt, oi) => (
                                <div key={oi} style={{
                                  padding: "8px 12px", borderRadius: 8, fontSize: 13,
                                  background: oi === q.reponse_correcte ? "#D1FAE5" : "var(--bg)",
                                  border: `1px solid ${oi === q.reponse_correcte ? "#6EE7B7" : "var(--border)"}`,
                                  color: oi === q.reponse_correcte ? "#065F46" : "var(--text-primary)",
                                  fontWeight: oi === q.reponse_correcte ? 600 : 400,
                                  display: "flex", alignItems: "center", gap: 8,
                                }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                    {oi === q.reponse_correcte ? "✓" : String.fromCharCode(65 + oi)}
                                  </span>
                                  {opt}
                                </div>
                              ))}
                            </div>
                            {q.explication && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: "#FEF9C3", borderRadius: 6, fontSize: 12, color: "#713F12" }}>
                                💡 {q.explication}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Pied de modale */}
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
                <button className="btn-secondary" onClick={() => setApercuRes(null)} style={{ padding: "6px 16px", fontSize: 13, borderRadius: 6 }}>Fermer</button>
                <Link href={`/enseignant/generer?type=ressource&biblio=${apercuRes.id}`} className="btn-primary" style={{ padding: "6px 16px", fontSize: 13, borderRadius: 6, textDecoration: "none" }}>Réutiliser</Link>
              </div>
            </div>
          </div>
        );
      })()}
    </EnseignantLayout>
  );
}
